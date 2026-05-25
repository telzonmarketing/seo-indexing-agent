from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from app.database import get_db
from app.models.crawl import Crawl, CrawlStatus, SEOIssue, Page
from app.models.website import Website
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/crawls", tags=["crawls"])


@router.get("")
async def list_crawls(
    website_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 30,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List all crawls — optionally filtered by website or status."""
    query = select(Crawl).order_by(Crawl.created_at.desc())
    if website_id:
        query = query.where(Crawl.website_id == website_id)
    if status:
        query = query.where(Crawl.status == status)

    total = await db.scalar(
        select(func.count(Crawl.id))
        .where(Crawl.website_id == website_id if website_id else True)
        .where(Crawl.status == status if status else True)
    ) or 0

    result = await db.execute(query.offset(offset).limit(limit))
    crawls = result.scalars().all()

    # Enrich with website domain
    website_map = {}
    wids = list({str(c.website_id) for c in crawls})
    if wids:
        ws_result = await db.execute(select(Website).where(Website.id.in_(wids)))
        website_map = {str(w.id): w.domain for w in ws_result.scalars().all()}

    return {
        "crawls": [
            {**_serialize_crawl(c), "website_domain": website_map.get(str(c.website_id), "")}
            for c in crawls
        ],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


class CrawlStart(BaseModel):
    website_id: str
    max_pages: int = 200
    deep: bool = False
    include_ai_audit: bool = True


@router.post("", status_code=201)
async def start_crawl(
    data: CrawlStart,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Website).where(Website.id == data.website_id))
    website = result.scalar_one_or_none()
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")

    crawl = Crawl(
        website_id=data.website_id,
        status=CrawlStatus.pending,
        crawl_config={"max_pages": data.max_pages, "deep": data.deep, "include_ai_audit": data.include_ai_audit},
    )
    db.add(crawl)
    await db.commit()
    await db.refresh(crawl)

    # Queue via Celery
    from app.tasks.seo_tasks import run_crawl_task
    task = run_crawl_task.delay(str(crawl.id), str(website.id), data.max_pages, data.include_ai_audit)
    crawl.celery_task_id = task.id
    crawl.status = CrawlStatus.running
    crawl.started_at = datetime.now(timezone.utc)
    await db.commit()

    return {"id": str(crawl.id), "status": crawl.status, "celery_task_id": task.id}


@router.get("/{crawl_id}")
async def get_crawl(
    crawl_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Crawl)
        .options(selectinload(Crawl.issues))
        .where(Crawl.id == crawl_id)
    )
    crawl = result.scalar_one_or_none()
    if not crawl:
        raise HTTPException(status_code=404, detail="Crawl not found")
    return _serialize_crawl(crawl)


@router.get("/{crawl_id}/pages")
async def get_crawl_pages(
    crawl_id: str,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Page).where(Page.crawl_id == crawl_id).offset(skip).limit(limit)
    )
    return [_serialize_page(p) for p in result.scalars().all()]


@router.get("/{crawl_id}/issues")
async def get_crawl_issues(
    crawl_id: str,
    severity: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(SEOIssue).where(SEOIssue.crawl_id == crawl_id)
    if severity:
        query = query.where(SEOIssue.severity == severity)
    result = await db.execute(query.order_by(SEOIssue.impact_score.desc()))
    return [_serialize_issue(i) for i in result.scalars().all()]


@router.get("/website/{website_id}")
async def get_website_crawls(
    website_id: str,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Crawl)
        .where(Crawl.website_id == website_id)
        .order_by(Crawl.created_at.desc())
        .limit(limit)
    )
    return [_serialize_crawl(c) for c in result.scalars().all()]


@router.post("/{crawl_id}/cancel")
async def cancel_crawl(
    crawl_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Cancel a running or pending crawl."""
    crawl = await db.get(Crawl, crawl_id)
    if not crawl:
        raise HTTPException(status_code=404, detail="Crawl not found")
    if crawl.status not in (CrawlStatus.running, CrawlStatus.pending):
        return {"success": False, "message": f"Crawl already {crawl.status}"}

    # Revoke Celery task if tracked
    if crawl.celery_task_id:
        try:
            from app.tasks.celery_app import celery
            celery.control.revoke(crawl.celery_task_id, terminate=True)
        except Exception:
            pass

    crawl.status = CrawlStatus.failed
    crawl.error_message = "Cancelled by user"
    crawl.completed_at = datetime.now(timezone.utc)
    await db.commit()
    return {"success": True, "crawl_id": crawl_id, "status": "cancelled"}


@router.get("/stats/overview")
async def crawl_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Quick stats: total, running, completed today, failed."""
    from datetime import timedelta
    from sqlalchemy import case
    now = datetime.now(timezone.utc)
    since_24h = now - timedelta(hours=24)

    total = await db.scalar(select(func.count(Crawl.id))) or 0
    running = await db.scalar(select(func.count(Crawl.id)).where(Crawl.status == CrawlStatus.running)) or 0
    completed_24h = await db.scalar(
        select(func.count(Crawl.id))
        .where(Crawl.status == CrawlStatus.completed, Crawl.completed_at >= since_24h)
    ) or 0
    failed_24h = await db.scalar(
        select(func.count(Crawl.id))
        .where(Crawl.status == CrawlStatus.failed, Crawl.created_at >= since_24h)
    ) or 0

    return {
        "total": total,
        "running": running,
        "completed_24h": completed_24h,
        "failed_24h": failed_24h,
    }


def _get_issues_safe(crawl: Crawl) -> list:
    """Return issues only if they were eagerly loaded — avoids MissingGreenlet in list views."""
    from sqlalchemy.orm.base import instance_state
    from sqlalchemy.orm import RelationshipProperty
    try:
        state = instance_state(crawl)
        if "issues" in state.dict:
            return [_serialize_issue(i) for i in (crawl.issues or [])]
    except Exception:
        pass
    return []


def _serialize_crawl(crawl: Crawl) -> dict:
    return {
        "id": str(crawl.id),
        "website_id": str(crawl.website_id),
        "status": crawl.status,
        "pages_found": crawl.pages_found,
        "pages_crawled": crawl.pages_crawled,
        "issues_found": crawl.issues_found,
        "seo_score": crawl.seo_score,
        "summary": crawl.summary or {},
        "ai_audit": crawl.ai_audit or {},
        "started_at": crawl.started_at.isoformat() if crawl.started_at else None,
        "completed_at": crawl.completed_at.isoformat() if crawl.completed_at else None,
        "created_at": crawl.created_at.isoformat() if crawl.created_at else None,
        "issues": _get_issues_safe(crawl),
    }


def _serialize_page(page: Page) -> dict:
    return {
        "id": str(page.id),
        "url": page.url,
        "status_code": page.status_code,
        "title": page.title,
        "meta_description": page.meta_description,
        "h1": page.h1,
        "is_indexable": page.is_indexable,
        "has_noindex": page.has_noindex,
        "word_count": page.word_count,
        "load_time_ms": page.load_time_ms,
        "has_schema": page.has_schema,
        "schema_types": page.schema_types or [],
        "internal_links_count": page.internal_links_count,
        "broken_links": page.broken_links or [],
    }


def _serialize_issue(issue: SEOIssue) -> dict:
    return {
        "id": str(issue.id),
        "page_url": issue.page_url,
        "issue_type": issue.issue_type,
        "severity": issue.severity,
        "title": issue.title,
        "description": issue.description,
        "recommendation": issue.recommendation,
        "impact_score": issue.impact_score,
        "is_resolved": issue.is_resolved,
    }
