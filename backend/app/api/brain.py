"""
AI Brain API — Endpoints for the self-learning SEO brain.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.seo_knowledge import (
    SEOArticle, SEOKnowledgeEntry, BrainLearningSession, SEOBrainState,
    ArticleStatus, KnowledgeCategory,
)

router = APIRouter(prefix="/brain", tags=["brain"])


@router.get("/status")
async def get_brain_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the AI Brain's current status, stats, and learning progress."""
    from app.agents.seo_brain_agent import get_brain_status
    return await get_brain_status(db)


@router.post("/learn")
async def trigger_learning(
    session_type: str = "manual",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually trigger a learning session (fetches + processes new articles)."""
    from app.tasks.celery_app import celery

    task = celery.send_task("app.tasks.brain_tasks.check_new_seo_articles")
    return {
        "message": "Learning session triggered",
        "task_id": task.id,
        "session_type": session_type,
        "status": "queued",
    }


@router.post("/learn/now")
async def learn_now(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Run learning session DIRECTLY (not via Celery) — for immediate results.
    Fetches new articles from all RSS feeds and processes up to 5 immediately.
    """
    from app.agents.seo_brain_agent import run_learning_session
    result = await run_learning_session(db, session_type="manual_direct")
    return result


@router.post("/learn/deep")
async def trigger_deep_learning(
    current_user: User = Depends(get_current_user),
):
    """Trigger a full deep learning session (processes all pending articles)."""
    from app.tasks.celery_app import celery
    task = celery.send_task("app.tasks.brain_tasks.daily_deep_learning")
    return {"message": "Deep learning session triggered", "task_id": task.id}


@router.post("/learn/retrain")
async def trigger_retrain(
    current_user: User = Depends(get_current_user),
):
    """Trigger weekly retrain — recalculate ranking patterns and brain generation."""
    from app.tasks.celery_app import celery
    task = celery.send_task("app.tasks.brain_tasks.weekly_retrain")
    return {"message": "Retrain triggered", "task_id": task.id}


@router.get("/articles")
async def list_articles(
    status: Optional[str] = None,
    source: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = Query(20, le=100),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List scraped SEO articles with their processing status."""
    q = select(SEOArticle).order_by(SEOArticle.scraped_at.desc())

    if status:
        q = q.where(SEOArticle.status == status)
    if source:
        q = q.where(SEOArticle.source == source)

    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    result = await db.execute(q.limit(limit).offset(offset))
    articles = result.scalars().all()

    return {
        "total": total,
        "articles": [_serialize_article(a) for a in articles],
    }


@router.get("/articles/{article_id}")
async def get_article(
    article_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific article with full extracted knowledge."""
    article = await db.scalar(select(SEOArticle).where(SEOArticle.id == article_id))
    if not article:
        raise HTTPException(404, "Article not found")
    return _serialize_article(article, detailed=True)


@router.post("/articles/{article_id}/process")
async def reprocess_article(
    article_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-process a specific article through the AI extraction pipeline."""
    from app.tasks.celery_app import celery
    task = celery.send_task("app.tasks.brain_tasks.process_single_article", args=[article_id])
    return {"message": "Article queued for processing", "task_id": task.id, "article_id": article_id}


@router.get("/knowledge")
async def list_knowledge(
    category: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(20, le=100),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List knowledge entries. Optionally filter by category."""
    q = select(SEOKnowledgeEntry).order_by(
        SEOKnowledgeEntry.usage_count.desc(),
        SEOKnowledgeEntry.created_at.desc()
    )

    if category:
        try:
            cat = KnowledgeCategory(category)
            q = q.where(SEOKnowledgeEntry.category == cat)
        except ValueError:
            pass

    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    result = await db.execute(q.limit(limit).offset(offset))
    entries = result.scalars().all()

    return {
        "total": total,
        "knowledge": [_serialize_knowledge(e) for e in entries],
    }


@router.get("/knowledge/search")
async def search_knowledge(
    q: str = Query(..., min_length=3),
    category: Optional[str] = None,
    limit: int = 10,
    current_user: User = Depends(get_current_user),
):
    """
    Semantic search over the knowledge base.
    Returns relevant knowledge entries ranked by similarity.
    """
    from app.services.vector_memory import search_knowledge as vector_search

    results = await vector_search(q, limit=limit, category=category)

    if not results:
        # Fallback: basic keyword search in DB
        return {
            "query": q,
            "results": [],
            "message": "Vector search unavailable. Pull nomic-embed-text: ollama pull nomic-embed-text",
        }

    return {
        "query": q,
        "results": results,
        "count": len(results),
    }


@router.get("/knowledge/by-category")
async def knowledge_by_category(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get knowledge count broken down by category with top insights per category."""
    result = await db.execute(
        select(SEOKnowledgeEntry.category, func.count(SEOKnowledgeEntry.id).label("count"))
        .group_by(SEOKnowledgeEntry.category)
        .order_by(func.count(SEOKnowledgeEntry.id).desc())
    )

    categories = []
    for cat, count in result:
        cat_val = cat.value if hasattr(cat, "value") else str(cat)
        # Get top 3 insights for this category
        top = await db.execute(
            select(SEOKnowledgeEntry)
            .where(SEOKnowledgeEntry.category == cat)
            .order_by(SEOKnowledgeEntry.confidence.desc())
            .limit(3)
        )
        categories.append({
            "category": cat_val,
            "count": count,
            "top_insights": [e.content[:200] for e in top.scalars().all()],
        })

    return {"categories": categories}


@router.get("/sessions")
async def list_sessions(
    limit: int = Query(20, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all learning sessions with stats."""
    result = await db.execute(
        select(BrainLearningSession)
        .order_by(BrainLearningSession.started_at.desc())
        .limit(limit)
    )
    sessions = result.scalars().all()

    return {
        "sessions": [
            {
                "id": str(s.id),
                "type": s.session_type,
                "status": s.status,
                "sources_checked": s.sources_checked,
                "articles_found": s.articles_found,
                "articles_new": s.articles_new,
                "articles_processed": s.articles_processed,
                "knowledge_extracted": s.knowledge_extracted,
                "top_topics": s.top_topics or [],
                "algorithm_updates": s.new_algorithm_updates or [],
                "duration_seconds": s.duration_seconds,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            }
            for s in sessions
        ]
    }


@router.get("/sources")
async def list_sources(
    current_user: User = Depends(get_current_user),
):
    """List all SEO knowledge sources being monitored."""
    from app.services.knowledge_scraper import RSS_FEEDS
    return {
        "sources": [
            {
                "name": f["name"],
                "site": f["site"],
                "has_rss": f.get("rss") is not None,
                "category": f["category"],
                "priority": f["priority"],
            }
            for f in RSS_FEEDS
        ],
        "total": len(RSS_FEEDS),
    }


@router.get("/recommend")
async def get_recommendation(
    context: str = Query(..., min_length=10),
    website_id: Optional[str] = None,
    fast: bool = Query(True, description="Fast mode: return knowledge snippets only, skip LLM generation"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a brain-enhanced SEO recommendation for a specific context/issue.
    Uses vector search to find relevant learned knowledge.
    Set fast=false to also generate an LLM recommendation (slower, ~10s).
    """
    from app.services.vector_memory import search_knowledge
    from app.models.website import Website
    import asyncio

    # Get relevant knowledge (fast - vector search only)
    snippets = await search_knowledge(context, limit=5)

    website_data = {"domain": "unknown"}
    if website_id:
        website = await db.scalar(select(Website).where(Website.id == website_id))
        if website:
            website_data = {"domain": website.domain}

    recommendation = None
    if not fast and snippets:
        # Only call Ollama when explicitly requested
        from app.services.knowledge_extractor import generate_seo_recommendation
        try:
            recommendation = await asyncio.wait_for(
                generate_seo_recommendation(
                    context=context,
                    website_data=website_data,
                    knowledge_snippets=snippets,
                ),
                timeout=15.0,
            )
        except asyncio.TimeoutError:
            recommendation = "AI recommendation timed out. Knowledge snippets above contain relevant insights."

    # Build fast recommendation from snippets if no LLM
    if not recommendation and snippets:
        recommendation = f"Based on {len(snippets)} knowledge entries: " + "; ".join(
            s.get("text", "")[:120] for s in snippets[:3]
        )
    elif not recommendation:
        recommendation = "No relevant knowledge found. Run more brain learning sessions to build the knowledge base."

    return {
        "context": context,
        "recommendation": recommendation,
        "knowledge_used": snippets,
        "knowledge_sources": len(snippets),
        "generated_by_llm": not fast and snippets is not None,
    }


@router.get("/embed-check")
async def check_embedding(
    current_user: User = Depends(get_current_user),
):
    """Check if the embedding model (nomic-embed-text) is available."""
    from app.services.vector_memory import check_embedding_model
    return await check_embedding_model()


# ─── Serializers ────────────────────────────────────────────────────────────

def _serialize_article(a: SEOArticle, detailed: bool = False) -> dict:
    ev = lambda v: v.value if hasattr(v, "value") else str(v) if v else None
    data = {
        "id": str(a.id),
        "url": a.url,
        "title": a.title,
        "source": a.source,
        "status": ev(a.status),
        "categories": a.categories or [],
        "content_length": a.content_length or 0,
        "has_vector": bool(a.vector_id),
        "published_at": a.published_at.isoformat() if a.published_at else None,
        "scraped_at": a.scraped_at.isoformat() if a.scraped_at else None,
        "processed_at": a.processed_at.isoformat() if a.processed_at else None,
    }
    if detailed:
        data.update({
            "summary": a.summary,
            "key_insights": a.key_insights or [],
            "ranking_factors": a.ranking_factors or [],
            "seo_techniques": a.seo_techniques or [],
            "ai_search_insights": a.ai_search_insights or [],
            "entities": a.entities or [],
            "sentiment": a.sentiment,
            "error_message": a.error_message,
        })
    return data


def _serialize_knowledge(e: SEOKnowledgeEntry) -> dict:
    ev = lambda v: v.value if hasattr(v, "value") else str(v) if v else None
    return {
        "id": str(e.id),
        "content": e.content,
        "category": ev(e.category),
        "source_name": e.source_name,
        "source_url": e.source_url,
        "confidence": e.confidence,
        "tags": e.tags or [],
        "usage_count": e.usage_count,
        "has_vector": bool(e.vector_id),
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }
