"""
SEO Brain Agent — The central AI intelligence that:
1. Orchestrates the learning pipeline
2. Uses vector memory to enhance SEO recommendations
3. Detects algorithm updates and adapts strategies
4. Continuously improves ranking logic from learned knowledge

This is the brain that makes the platform smarter every day.
"""
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from typing import Optional

from app.models.seo_knowledge import (
    SEOArticle, SEOKnowledgeEntry, BrainLearningSession, SEOBrainState,
    ArticleStatus, KnowledgeCategory,
)
from app.models.website import Website
from app.models.client import Client
from app.models.task import Task, TaskPriority, TaskStatus, TaskCategory


async def run_learning_session(db: AsyncSession, session_type: str = "hourly_check") -> dict:
    """
    Main learning pipeline — orchestrates fetching, extraction, and storage.
    Called by Celery beat schedule.
    """
    from app.services.knowledge_scraper import fetch_all_feeds, fetch_article_content
    from app.services.knowledge_extractor import extract_seo_knowledge, analyze_algorithm_update
    from app.services.vector_memory import store_knowledge

    session = BrainLearningSession(session_type=session_type, status="running")
    db.add(session)
    await db.commit()
    await db.refresh(session)

    articles_found = 0
    articles_new = 0
    articles_processed = 0
    knowledge_extracted = 0
    top_topics = []
    new_algorithm_updates = []

    try:
        # Step 1: Fetch all RSS feeds
        print(f"🧠 Brain learning session: {session_type}")
        feed_articles = await fetch_all_feeds()
        session.sources_checked = len({a["source"] for a in feed_articles})
        articles_found = len(feed_articles)
        session.articles_found = articles_found
        await db.commit()

        # Step 2: Filter only new articles
        for article_data in feed_articles:
            url = article_data.get("url", "")
            if not url:
                continue

            # Check if already in DB
            existing = await db.scalar(select(SEOArticle).where(SEOArticle.url == url))
            if existing:
                continue

            # New article — save to DB
            article = SEOArticle(
                url=url,
                title=article_data.get("title", "")[:500],
                source=article_data.get("source", ""),
                source_url=article_data.get("source_url", ""),
                categories=[article_data.get("category", "")],
                published_at=article_data.get("published_at"),
                status=ArticleStatus.pending,
            )
            db.add(article)
            articles_new += 1

        session.articles_new = articles_new
        await db.commit()

        # Step 3: Process pending articles (limit to 5 per session to avoid long runs)
        pending = await db.execute(
            select(SEOArticle)
            .where(SEOArticle.status == ArticleStatus.pending)
            .order_by(SEOArticle.scraped_at.desc())
            .limit(5)
        )
        pending_articles = pending.scalars().all()

        for article in pending_articles:
            try:
                # Mark as processing
                article.status = ArticleStatus.processing
                await db.commit()

                # Fetch full content
                content = await fetch_article_content(article.url)
                if not content or len(content) < 200:
                    article.status = ArticleStatus.skipped
                    await db.commit()
                    continue

                article.content_text = content[:8000]
                article.content_length = len(content)

                # Extract knowledge using Ollama
                extraction = await extract_seo_knowledge(
                    content,
                    article_title=article.title or "",
                    source=article.source or "",
                )

                # Update article with extracted data
                article.summary = extraction.get("summary", "")
                article.key_insights = extraction.get("key_insights", [])
                article.ranking_factors = extraction.get("ranking_factors", [])
                article.seo_techniques = extraction.get("seo_techniques", [])
                article.ai_search_insights = extraction.get("ai_search_insights", [])
                article.entities = extraction.get("entities", [])
                if extraction.get("categories"):
                    article.categories = extraction["categories"]
                article.sentiment = extraction.get("sentiment", "neutral")
                article.status = ArticleStatus.processed
                article.processed_at = datetime.now(timezone.utc)
                await db.commit()
                articles_processed += 1

                # Check for algorithm update
                algo_update = extraction.get("algorithm_update")
                if algo_update:
                    new_algorithm_updates.append(algo_update)

                # Store individual knowledge entries
                all_insights = (
                    extraction.get("key_insights", []) +
                    extraction.get("ranking_factors", []) +
                    extraction.get("seo_techniques", []) +
                    extraction.get("ai_search_insights", []) +
                    extraction.get("action_items", [])
                )

                for insight in all_insights[:8]:  # max 8 entries per article
                    if not insight or len(insight) < 20:
                        continue

                    # Determine category
                    cats = extraction.get("categories", [])
                    category = cats[0] if cats else article.categories[0] if article.categories else "technical_seo"
                    try:
                        cat_enum = KnowledgeCategory(category)
                    except ValueError:
                        cat_enum = KnowledgeCategory.technical_seo

                    entry = SEOKnowledgeEntry(
                        content=insight,
                        category=cat_enum,
                        source_url=article.url,
                        source_name=article.source or "",
                        article_id=article.id,
                        tags=extraction.get("entities", [])[:5],
                        confidence=80,
                        relevance_year=datetime.now().year,
                    )
                    db.add(entry)
                    await db.commit()
                    await db.refresh(entry)

                    # Store in Qdrant vector memory
                    vector_id = await store_knowledge(
                        text=insight,
                        metadata={
                            "source": article.source,
                            "category": category,
                            "source_url": article.url,
                            "article_id": str(article.id),
                            "tags": extraction.get("entities", [])[:5],
                        },
                        point_id=str(entry.id),
                    )
                    if vector_id:
                        entry.vector_id = vector_id
                        await db.commit()

                    knowledge_extracted += 1

                # Collect top topics
                if article.title:
                    top_topics.append(article.title)

            except Exception as e:
                article.status = ArticleStatus.failed
                article.error_message = str(e)[:500]
                await db.commit()
                print(f"Article processing error: {e}")

        # Step 4: Update brain state
        await _update_brain_state(db, articles_processed, knowledge_extracted, top_topics, new_algorithm_updates)

        # Complete session
        session.articles_processed = articles_processed
        session.knowledge_extracted = knowledge_extracted
        session.top_topics = top_topics[:10]
        session.new_algorithm_updates = new_algorithm_updates
        session.status = "completed"
        session.completed_at = datetime.now(timezone.utc)
        session.duration_seconds = int(
            (session.completed_at - session.started_at).total_seconds()
        )
        await db.commit()

        return {
            "session_id": str(session.id),
            "status": "completed",
            "sources_checked": session.sources_checked,
            "articles_found": articles_found,
            "articles_new": articles_new,
            "articles_processed": articles_processed,
            "knowledge_extracted": knowledge_extracted,
            "top_topics": top_topics[:5],
            "algorithm_updates": new_algorithm_updates,
        }

    except Exception as e:
        session.status = "failed"
        session.error = str(e)[:500]
        session.completed_at = datetime.now(timezone.utc)
        await db.commit()
        return {"session_id": str(session.id), "status": "failed", "error": str(e)}


async def _update_brain_state(
    db: AsyncSession,
    new_articles: int,
    new_knowledge: int,
    top_topics: list,
    algorithm_updates: list,
):
    """Update the singleton SEOBrainState record."""
    state = await db.scalar(select(SEOBrainState).where(SEOBrainState.id == 1))
    if not state:
        state = SEOBrainState(id=1)
        db.add(state)

    state.total_articles_learned = (state.total_articles_learned or 0) + new_articles
    state.total_knowledge_entries = (state.total_knowledge_entries or 0) + new_knowledge
    state.total_learning_sessions = (state.total_learning_sessions or 0) + 1
    state.last_learning_at = datetime.now(timezone.utc)

    if top_topics:
        state.last_article_title = top_topics[0][:500]
    if algorithm_updates:
        state.last_algorithm_update = algorithm_updates[0][:500]

    # Update knowledge count by category
    cat_counts = {}
    cat_result = await db.execute(
        select(SEOKnowledgeEntry.category, func.count(SEOKnowledgeEntry.id))
        .group_by(SEOKnowledgeEntry.category)
    )
    for cat, count in cat_result:
        cat_val = cat.value if hasattr(cat, "value") else str(cat)
        cat_counts[cat_val] = count
    state.knowledge_by_category = cat_counts

    # Intelligence score grows with knowledge (log scale-ish)
    total = state.total_knowledge_entries or 0
    if total < 50:
        state.intelligence_score = max(10, total)
    elif total < 200:
        state.intelligence_score = 50 + (total - 50) // 3
    elif total < 1000:
        state.intelligence_score = 100 + (total - 200) // 10
    else:
        state.intelligence_score = min(999, 180 + (total - 1000) // 50)

    state.updated_at = datetime.now(timezone.utc)
    await db.commit()


async def search_brain_knowledge(
    query: str,
    category: Optional[str] = None,
    limit: int = 5,
) -> list[dict]:
    """
    Search the brain's knowledge base semantically.
    Used to enhance SEO recommendations with real learned knowledge.
    """
    from app.services.vector_memory import search_knowledge
    return await search_knowledge(query, limit=limit, category=category)


async def get_brain_enhanced_recommendation(
    db: AsyncSession,
    context: str,
    website: Website,
) -> str:
    """Generate a knowledge-enhanced recommendation for a specific SEO issue."""
    from app.services.knowledge_extractor import generate_seo_recommendation
    from app.services.vector_memory import search_knowledge

    # Get relevant knowledge from memory
    knowledge = await search_knowledge(context, limit=5)

    # Fall back to DB search if vector search unavailable
    if not knowledge:
        entries = await db.execute(
            select(SEOKnowledgeEntry)
            .order_by(SEOKnowledgeEntry.usage_count.desc())
            .limit(5)
        )
        knowledge = [
            {"text": e.content, "source": e.source_name or "", "category": str(e.category), "score": 0.8}
            for e in entries.scalars().all()
        ]

    return await generate_seo_recommendation(
        context=context,
        website_data={"domain": website.domain},
        knowledge_snippets=knowledge,
    )


async def get_brain_status(db: AsyncSession) -> dict:
    """Get current brain status and stats."""
    from app.services.vector_memory import get_collection_stats, check_embedding_model

    state = await db.scalar(select(SEOBrainState).where(SEOBrainState.id == 1))

    total_articles = await db.scalar(select(func.count(SEOArticle.id)))
    total_processed = await db.scalar(select(func.count(SEOArticle.id)).where(SEOArticle.status == ArticleStatus.processed))
    total_knowledge = await db.scalar(select(func.count(SEOKnowledgeEntry.id)))
    total_sessions = await db.scalar(select(func.count(BrainLearningSession.id)))

    recent_sessions = await db.execute(
        select(BrainLearningSession)
        .order_by(BrainLearningSession.started_at.desc())
        .limit(5)
    )

    vector_stats = get_collection_stats()
    embed_status = await check_embedding_model()

    return {
        "enabled": True,
        "intelligence_score": state.intelligence_score if state else 10,
        "brain_generation": state.brain_generation if state else 1,
        "last_learning_at": state.last_learning_at.isoformat() if state and state.last_learning_at else None,
        "last_article_title": state.last_article_title if state else None,
        "last_algorithm_update": state.last_algorithm_update if state else None,
        "stats": {
            "total_articles_scraped": total_articles or 0,
            "articles_processed": total_processed or 0,
            "total_knowledge_entries": total_knowledge or 0,
            "total_learning_sessions": total_sessions or 0,
            "knowledge_vectors": vector_stats.get("total_vectors", 0),
        },
        "knowledge_by_category": state.knowledge_by_category if state else {},
        "vector_memory": vector_stats,
        "embedding_model": embed_status,
        "sources_count": len([f for f in __import__("app.services.knowledge_scraper", fromlist=["RSS_FEEDS"]).RSS_FEEDS]),
        "recent_sessions": [
            {
                "id": str(s.id),
                "type": s.session_type,
                "status": s.status,
                "articles_processed": s.articles_processed,
                "knowledge_extracted": s.knowledge_extracted,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "duration_seconds": s.duration_seconds,
            }
            for s in recent_sessions.scalars().all()
        ],
    }
