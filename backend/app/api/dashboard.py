from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timezone, timedelta

from app.database import get_db
from app.models.client import Client
from app.models.website import Website
from app.models.crawl import Crawl, SEOIssue, CrawlStatus, IssueSeverity
from app.models.task import Task, TaskStatus
from app.models.report import Report
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/overview")
async def get_overview(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    month_ago = now - timedelta(days=30)

    clients_count = await db.scalar(select(func.count(Client.id)).where(Client.is_active == True))
    websites_count = await db.scalar(select(func.count(Website.id)).where(Website.is_active == True))
    open_tasks = await db.scalar(
        select(func.count(Task.id)).where(Task.status.notin_([TaskStatus.done]))
    )
    critical_issues = await db.scalar(
        select(func.count(SEOIssue.id)).where(
            SEOIssue.severity == IssueSeverity.critical,
            SEOIssue.is_resolved == False,
        )
    )
    recent_crawls = await db.scalar(
        select(func.count(Crawl.id)).where(
            Crawl.created_at >= month_ago,
            Crawl.status == CrawlStatus.completed,
        )
    )

    avg_score_result = await db.execute(
        select(func.avg(Website.technical_score)).where(Website.is_active == True)
    )
    avg_score = avg_score_result.scalar() or 0

    result = await db.execute(
        select(Client)
        .where(Client.is_active == True)
        .order_by(Client.updated_at.desc())
        .limit(5)
    )
    recent_clients = [
        {"id": str(c.id), "name": c.name, "seo_health_score": c.seo_health_score}
        for c in result.scalars().all()
    ]

    issues_result = await db.execute(
        select(SEOIssue)
        .where(SEOIssue.is_resolved == False)
        .order_by(SEOIssue.impact_score.desc())
        .limit(10)
    )
    top_issues = [
        {
            "id": str(i.id),
            "title": i.title,
            "severity": i.severity,
            "page_url": i.page_url,
            "impact_score": i.impact_score,
        }
        for i in issues_result.scalars().all()
    ]

    return {
        "stats": {
            "total_clients": clients_count or 0,
            "total_websites": websites_count or 0,
            "open_tasks": open_tasks or 0,
            "critical_issues": critical_issues or 0,
            "recent_crawls": recent_crawls or 0,
            "avg_seo_score": round(float(avg_score), 1),
        },
        "recent_clients": recent_clients,
        "top_issues": top_issues,
    }


@router.get("/client/{client_id}")
async def get_client_dashboard(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    client = await db.scalar(select(Client).where(Client.id == client_id))
    if not client:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Client not found")

    websites = await db.execute(select(Website).where(Website.client_id == client_id))
    website_list = websites.scalars().all()

    tasks_result = await db.execute(
        select(Task).where(Task.client_id == client_id).order_by(Task.created_at.desc()).limit(20)
    )

    open_critical = await db.scalar(
        select(func.count(SEOIssue.id)).where(
            SEOIssue.website_id.in_([str(w.id) for w in website_list]),
            SEOIssue.severity == IssueSeverity.critical,
            SEOIssue.is_resolved == False,
        )
    )

    return {
        "client": {"id": str(client.id), "name": client.name, "seo_health_score": client.seo_health_score},
        "websites": [
            {
                "id": str(w.id),
                "domain": w.domain,
                "technical_score": w.technical_score,
                "content_score": w.content_score,
                "ai_visibility_score": w.ai_visibility_score,
                "last_crawled_at": w.last_crawled_at.isoformat() if w.last_crawled_at else None,
            }
            for w in website_list
        ],
        "tasks": [
            {"id": str(t.id), "title": t.title, "status": t.status, "priority": t.priority}
            for t in tasks_result.scalars().all()
        ],
        "open_critical_issues": open_critical or 0,
    }
