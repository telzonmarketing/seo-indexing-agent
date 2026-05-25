"""
Brain Learning Tasks — Celery tasks for the autonomous SEO learning schedule.

Schedule:
  Every 2 hours: check for new SEO articles + algorithm updates
  Daily 1 AM: deep process all pending articles + update vector memory
  Weekly (Monday 4AM): retrain ranking patterns + recalculate weights
"""
from celery import shared_task
from datetime import datetime, timezone
import asyncio


def run_async(coro):
    """Run an async coroutine from a Celery task (sync context)."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@shared_task(name="app.tasks.brain_tasks.check_new_seo_articles", bind=True, max_retries=3)
def check_new_seo_articles(self):
    """
    Every 2 hours: Check all RSS feeds for new SEO articles.
    Quick pass — only finds new articles, processes up to 3 immediately.
    """
    from app.database import AsyncSessionLocal
    from app.agents.seo_brain_agent import run_learning_session

    async def _run():
        async with AsyncSessionLocal() as db:
            result = await run_learning_session(db, session_type="hourly_check")
            print(f"🧠 [2h Brain] New: {result.get('articles_new', 0)} | Processed: {result.get('articles_processed', 0)} | Knowledge: {result.get('knowledge_extracted', 0)}")
            return result

    try:
        return run_async(_run())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=300)


@shared_task(name="app.tasks.brain_tasks.daily_deep_learning", bind=True, max_retries=2)
def daily_deep_learning(self):
    """
    Daily 1 AM: Deep learning session.
    Process all pending articles, update vector memory, update ranking logic.
    """
    from app.database import AsyncSessionLocal
    from app.agents.seo_brain_agent import run_learning_session
    from app.services.vector_memory import get_collection_stats

    async def _run():
        async with AsyncSessionLocal() as db:
            result = await run_learning_session(db, session_type="daily_learn")
            stats = get_collection_stats()
            print(f"🧠 [Daily Brain] Articles: {result.get('articles_processed', 0)} | Knowledge: {result.get('knowledge_extracted', 0)} | Vectors: {stats.get('total_vectors', 0)}")
            return result

    try:
        return run_async(_run())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=600)


@shared_task(name="app.tasks.brain_tasks.weekly_retrain", bind=True, max_retries=1)
def weekly_retrain(self):
    """
    Weekly (Monday 4 AM): Retrain internal patterns.
    Recalculate ranking weights from accumulated knowledge.
    Update SEO strategy templates based on what's been learned.
    """
    from app.database import AsyncSessionLocal
    from app.models.seo_knowledge import SEOKnowledgeEntry, SEOBrainState, BrainLearningSession
    from app.models.seo_knowledge import KnowledgeCategory
    from sqlalchemy import select, func

    async def _run():
        async with AsyncSessionLocal() as db:
            session = BrainLearningSession(session_type="weekly_retrain", status="running")
            db.add(session)
            await db.commit()

            # Calculate top knowledge categories
            cat_result = await db.execute(
                select(SEOKnowledgeEntry.category, func.count(SEOKnowledgeEntry.id).label("cnt"))
                .group_by(SEOKnowledgeEntry.category)
                .order_by(func.count(SEOKnowledgeEntry.id).desc())
            )
            categories = {(c.value if hasattr(c, "value") else str(c)): cnt for c, cnt in cat_result}

            # Get high-confidence entries for each category
            top_insights = {}
            for cat in KnowledgeCategory:
                cat_entries = await db.execute(
                    select(SEOKnowledgeEntry)
                    .where(SEOKnowledgeEntry.category == cat)
                    .order_by(SEOKnowledgeEntry.confidence.desc(), SEOKnowledgeEntry.usage_count.desc())
                    .limit(10)
                )
                entries = cat_entries.scalars().all()
                if entries:
                    top_insights[cat.value] = [e.content for e in entries]

            # Update brain state with retrained knowledge
            state = await db.scalar(select(SEOBrainState).where(SEOBrainState.id == 1))
            if state:
                state.brain_generation = (state.brain_generation or 1) + 1
                state.knowledge_by_category = categories
                state.updated_at = datetime.now(timezone.utc)

            session.status = "completed"
            session.completed_at = datetime.now(timezone.utc)
            session.knowledge_extracted = sum(len(v) for v in top_insights.values())
            await db.commit()

            print(f"🧠 [Weekly Brain] Retrained generation {state.brain_generation if state else 2} | Categories: {len(categories)}")
            return {
                "status": "completed",
                "brain_generation": state.brain_generation if state else 2,
                "categories_retrained": len(categories),
                "top_insights": top_insights,
            }

    try:
        return run_async(_run())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=1800)


@shared_task(name="app.tasks.brain_tasks.process_single_article")
def process_single_article(article_id: str):
    """Process a single article by ID (triggered manually or from API)."""
    from app.database import AsyncSessionLocal
    from app.models.seo_knowledge import SEOArticle, SEOKnowledgeEntry, ArticleStatus, KnowledgeCategory
    from app.services.knowledge_scraper import fetch_article_content
    from app.services.knowledge_extractor import extract_seo_knowledge
    from app.services.vector_memory import store_knowledge
    from sqlalchemy import select

    async def _run():
        async with AsyncSessionLocal() as db:
            article = await db.scalar(select(SEOArticle).where(SEOArticle.id == article_id))
            if not article:
                return {"error": "Article not found"}

            article.status = ArticleStatus.processing
            await db.commit()

            content = await fetch_article_content(article.url)
            if not content:
                article.status = ArticleStatus.failed
                article.error_message = "Could not fetch content"
                await db.commit()
                return {"error": "Content fetch failed"}

            article.content_text = content[:8000]
            extraction = await extract_seo_knowledge(content, article.title or "", article.source or "")

            article.summary = extraction.get("summary", "")
            article.key_insights = extraction.get("key_insights", [])
            article.ranking_factors = extraction.get("ranking_factors", [])
            article.seo_techniques = extraction.get("seo_techniques", [])
            article.ai_search_insights = extraction.get("ai_search_insights", [])
            article.entities = extraction.get("entities", [])
            article.status = ArticleStatus.processed
            article.processed_at = datetime.now(timezone.utc)
            await db.commit()

            # Store knowledge entries
            knowledge_count = 0
            for insight in (extraction.get("key_insights", []) + extraction.get("seo_techniques", []))[:6]:
                if not insight:
                    continue
                cats = extraction.get("categories", ["technical_seo"])
                try:
                    cat = KnowledgeCategory(cats[0] if cats else "technical_seo")
                except ValueError:
                    cat = KnowledgeCategory.technical_seo

                entry = SEOKnowledgeEntry(
                    content=insight,
                    category=cat,
                    source_url=article.url,
                    source_name=article.source or "",
                    article_id=article.id,
                    tags=extraction.get("entities", [])[:5],
                )
                db.add(entry)
                await db.commit()
                await db.refresh(entry)

                vid = await store_knowledge(insight, {"source": article.source, "category": cat.value}, str(entry.id))
                if vid:
                    entry.vector_id = vid
                    await db.commit()
                knowledge_count += 1

            return {
                "article_id": article_id,
                "status": "processed",
                "knowledge_extracted": knowledge_count,
            }

    return run_async(_run())
