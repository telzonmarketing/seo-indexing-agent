"""
Live AI Activity Feed API
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from typing import Optional

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.activity import AIActivity, ActivityType, ActivityLevel

router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("/feed")
async def get_activity_feed(
    limit: int = Query(50, le=200),
    offset: int = 0,
    level: Optional[str] = None,
    agent: Optional[str] = None,
    client_id: Optional[str] = None,
    website_id: Optional[str] = None,
    milestones_only: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the live AI activity feed — what every agent is doing."""
    q = select(AIActivity).order_by(AIActivity.created_at.desc())

    if level:
        try:
            q = q.where(AIActivity.level == ActivityLevel(level))
        except ValueError:
            pass
    if agent:
        q = q.where(AIActivity.agent.ilike(f"%{agent}%"))
    if client_id:
        q = q.where(AIActivity.client_id == client_id)
    if website_id:
        q = q.where(AIActivity.website_id == website_id)
    if milestones_only:
        q = q.where(AIActivity.is_milestone == True)

    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    result = await db.execute(q.limit(limit).offset(offset))
    events = result.scalars().all()

    return {
        "total": total,
        "events": [_serialize(e) for e in events],
    }


@router.get("/stats")
async def get_activity_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get activity stats — agent breakdown, level breakdown, recent count."""
    total = await db.scalar(select(func.count(AIActivity.id)))

    # Count by level
    level_result = await db.execute(
        select(AIActivity.level, func.count(AIActivity.id))
        .group_by(AIActivity.level)
    )
    by_level = {(lv.value if hasattr(lv, "value") else str(lv)): cnt for lv, cnt in level_result}

    # Count by agent
    agent_result = await db.execute(
        select(AIActivity.agent, func.count(AIActivity.id))
        .group_by(AIActivity.agent)
        .order_by(func.count(AIActivity.id).desc())
        .limit(10)
    )
    by_agent = {ag: cnt for ag, cnt in agent_result}

    # Milestones
    milestones = await db.scalar(
        select(func.count(AIActivity.id)).where(AIActivity.is_milestone == True)
    )

    return {
        "total_events": total or 0,
        "milestones": milestones or 0,
        "by_level": by_level,
        "by_agent": by_agent,
    }


@router.get("/milestones")
async def get_milestones(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get major milestone events only."""
    result = await db.execute(
        select(AIActivity)
        .where(AIActivity.is_milestone == True)
        .order_by(AIActivity.created_at.desc())
        .limit(limit)
    )
    return {"milestones": [_serialize(e) for e in result.scalars().all()]}


@router.delete("/clear")
async def clear_feed(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clear old activity events (keep milestones)."""
    await db.execute(
        delete(AIActivity).where(AIActivity.is_milestone == False)
    )
    await db.commit()
    return {"message": "Activity feed cleared (milestones preserved)"}


@router.post("/seed")
async def seed_activity(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Seed demo activity events to show the live feed in action."""
    from app.services.activity_logger import log_activity

    demo_events = [
        (ActivityType.brain_learning, ActivityLevel.learning, "Brain Agent", "Fetched 96 articles from 15 SEO sources", True),
        (ActivityType.brain_article_processed, ActivityLevel.success, "Brain Agent", "Processed article: 'Google Search Central — Core Web Vitals Update 2025'", False),
        (ActivityType.brain_knowledge_stored, ActivityLevel.discovery, "Brain Agent", "Stored 7 new SEO insights into vector memory", True),
        (ActivityType.finding_keywords, ActivityLevel.discovery, "Alex Brother", "Found 12 low-competition keywords with high AI search potential", True),
        (ActivityType.serp_scanned, ActivityLevel.info, "Alex Brother", "Scanned Google SERP for 'best SEO tools 2025' — analyzing top 10 results", False),
        (ActivityType.competitor_weakness_found, ActivityLevel.discovery, "Alex Brother", "Competitor weakness detected: missing FAQ schema on 3 main pages", True),
        (ActivityType.generating_blog_ideas, ActivityLevel.info, "Blog Idea Agent", "Generating blog ideas from Google Trends and Reddit data", False),
        (ActivityType.blog_idea_created, ActivityLevel.success, "Blog Idea Agent", "New blog idea: 'How AI Overviews Are Changing SEO in 2025'", True),
        (ActivityType.finding_backlink_opportunities, ActivityLevel.info, "Backlink Agent", "Scanning for guest post opportunities in tech niche", False),
        (ActivityType.backlink_opportunity_found, ActivityLevel.discovery, "Backlink Agent", "Found 5 high-DA directory opportunities for submission", True),
        (ActivityType.schema_generated, ActivityLevel.success, "Technical SEO Agent", "Generated FAQ schema for /services page — ready for deployment", False),
        (ActivityType.llms_txt_generated, ActivityLevel.success, "AEO Agent", "Generated /llms.txt file — AI systems can now properly cite your content", True),
        (ActivityType.detecting_ai_visibility, ActivityLevel.info, "AEO Agent", "Scanning AI visibility signals — checking ChatGPT, Perplexity, Gemini readiness", False),
        (ActivityType.technical_issue_found, ActivityLevel.warning, "Technical SEO Agent", "Detected: 3 pages missing meta descriptions — auto-fix recommended", False),
        (ActivityType.analyzing_semantic_gaps, ActivityLevel.info, "Semantic Agent", "Analyzing topical authority gaps — comparing against competitor clusters", False),
    ]

    for activity_type, level, agent, message, is_milestone in demo_events:
        await log_activity(db, activity_type, agent, message, level=level, is_milestone=is_milestone)

    return {"message": f"Seeded {len(demo_events)} demo activity events", "count": len(demo_events)}


def _serialize(e: AIActivity) -> dict:
    ev = lambda v: v.value if hasattr(v, "value") else str(v) if v else None
    return {
        "id": str(e.id),
        "type": ev(e.activity_type),
        "level": ev(e.level),
        "agent": e.agent,
        "message": e.message,
        "details": e.details or {},
        "client_id": str(e.client_id) if e.client_id else None,
        "website_id": str(e.website_id) if e.website_id else None,
        "client_name": e.client_name,
        "website_domain": e.website_domain,
        "duration_ms": e.duration_ms,
        "is_milestone": e.is_milestone,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }
