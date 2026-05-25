"""
Activity Logger — records every AI action into the live feed.
Used by all agents to emit real-time activity events.

Usage:
    await log_activity(db, ActivityType.blog_idea_created,
        agent="Blog Idea Agent",
        message="Generated blog idea: 'Top 10 SEO tools for 2025'",
        client_id=..., website_id=...,
        level=ActivityLevel.discovery,
        details={"keyword": "SEO tools", "search_volume": 5400})
"""
from datetime import datetime, timezone
from typing import Optional
import asyncio

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete

from app.models.activity import AIActivity, ActivityType, ActivityLevel


async def log_activity(
    db: AsyncSession,
    activity_type: ActivityType,
    agent: str,
    message: str,
    *,
    client_id: Optional[str] = None,
    website_id: Optional[str] = None,
    client_name: Optional[str] = None,
    website_domain: Optional[str] = None,
    level: ActivityLevel = ActivityLevel.info,
    details: Optional[dict] = None,
    duration_ms: Optional[int] = None,
    is_milestone: bool = False,
) -> AIActivity:
    """Record an AI activity event to the live feed."""
    event = AIActivity(
        activity_type=activity_type,
        level=level,
        agent=agent,
        message=message,
        details=details or {},
        client_id=client_id,
        website_id=website_id,
        client_name=client_name,
        website_domain=website_domain,
        duration_ms=duration_ms,
        is_milestone=is_milestone,
    )
    db.add(event)
    await db.commit()

    # Prune old events to keep feed manageable (keep last 1000)
    count = await db.scalar(select(func.count(AIActivity.id)))
    if count and count > 1000:
        # Delete oldest 200
        oldest = await db.execute(
            select(AIActivity.id)
            .order_by(AIActivity.created_at.asc())
            .limit(200)
        )
        oldest_ids = [row[0] for row in oldest]
        if oldest_ids:
            await db.execute(delete(AIActivity).where(AIActivity.id.in_(oldest_ids)))
            await db.commit()

    return event


def log_activity_sync(
    activity_type: ActivityType,
    agent: str,
    message: str,
    *,
    client_id: Optional[str] = None,
    website_id: Optional[str] = None,
    client_name: Optional[str] = None,
    website_domain: Optional[str] = None,
    level: ActivityLevel = ActivityLevel.info,
    details: Optional[dict] = None,
    is_milestone: bool = False,
):
    """
    Fire-and-forget activity log from sync Celery tasks.
    Creates its own DB session and runs the coroutine.
    """
    async def _write():
        from app.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            await log_activity(
                db, activity_type, agent, message,
                client_id=client_id, website_id=website_id,
                client_name=client_name, website_domain=website_domain,
                level=level, details=details, is_milestone=is_milestone,
            )

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_write())
    except Exception as e:
        print(f"Activity log error: {e}")
    finally:
        loop.close()
