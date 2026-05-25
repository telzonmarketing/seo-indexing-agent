from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, HttpUrl
from typing import Optional
from datetime import datetime, timezone
import tldextract

from app.database import get_db
from app.models.website import Website, Integration, IntegrationType
from app.models.client import Client
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/websites", tags=["websites"])


class WebsiteCreate(BaseModel):
    client_id: str
    url: str
    sitemap_url: Optional[str] = None
    platform: Optional[str] = None
    crawl_frequency_hours: int = 168


class WebsiteUpdate(BaseModel):
    sitemap_url: Optional[str] = None
    platform: Optional[str] = None
    crawl_frequency_hours: Optional[int] = None
    is_active: Optional[bool] = None


@router.get("")
async def list_websites(
    client_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Website).options(selectinload(Website.integrations)).where(Website.deleted_at == None)
    if client_id:
        query = query.where(Website.client_id == client_id)
    result = await db.execute(query.order_by(Website.created_at.desc()))
    return [_serialize(w) for w in result.scalars().all()]


@router.post("", status_code=201)
async def create_website(
    data: WebsiteCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Client).where(Client.id == data.client_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Client not found")

    url = str(data.url).rstrip("/")
    extracted = tldextract.extract(url)
    domain = f"{extracted.domain}.{extracted.suffix}"
    if extracted.subdomain and extracted.subdomain != "www":
        domain = f"{extracted.subdomain}.{domain}"

    website = Website(
        client_id=data.client_id,
        domain=domain,
        url=url,
        sitemap_url=data.sitemap_url,
        platform=data.platform,
        crawl_frequency_hours=data.crawl_frequency_hours,
    )
    db.add(website)
    await db.commit()
    await db.refresh(website)
    return _serialize(website)


@router.get("/{website_id}")
async def get_website(
    website_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Website)
        .options(selectinload(Website.integrations), selectinload(Website.crawls))
        .where(Website.id == website_id)
    )
    website = result.scalar_one_or_none()
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")
    return _serialize(website, detailed=True)


@router.patch("/{website_id}")
async def update_website(
    website_id: str,
    data: WebsiteUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Website).where(Website.id == website_id))
    website = result.scalar_one_or_none()
    if not website:
        raise HTTPException(status_code=404, detail="Website not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(website, field, value)
    await db.commit()
    await db.refresh(website)
    return _serialize(website)


@router.delete("/{website_id}")
async def delete_website(
    website_id: str,
    permanent: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Soft-delete a website.

    Workflow:
      1. Locate website
      2. Cancel active crawls (revoke Celery tasks)
      3. Disable automation rules for this website
      4. Purge Redis queue entries for this website
      5. Disconnect integrations
      6. Log activity
      7. Soft-delete (set deleted_at, is_active=False)

    ?permanent=true → hard-delete (only if already soft-deleted, for 30-day cleanup cron).
    """
    from datetime import timedelta
    from app.models.crawl import Crawl, CrawlStatus
    from app.models.automation_rule import AutomationRule
    from app.services.activity_logger import log_activity

    website = await db.scalar(
        select(Website).options(selectinload(Website.integrations))
        .where(Website.id == website_id)
    )
    if not website:
        raise HTTPException(404, "Website not found")

    # Block re-deletion of already soft-deleted websites
    if website.deleted_at and not permanent:
        raise HTTPException(409, f"Website already deleted. Restore first or use ?permanent=true to hard-delete.")

    domain = website.domain
    crawls_cancelled = 0
    rules_disabled = 0

    # ── Permanent hard-delete (30-day cleanup path) ────────────────────────
    if permanent:
        if not website.deleted_at:
            raise HTTPException(400, "Website must be soft-deleted first (no ?permanent before soft-delete)")
        await db.delete(website)
        await db.commit()
        return {"deleted": True, "permanent": True, "domain": domain}

    # ── Step 2: Cancel active crawls ──────────────────────────────────────
    running_crawls_result = await db.execute(
        select(Crawl).where(
            Crawl.website_id == website_id,
            Crawl.status.in_([CrawlStatus.running, CrawlStatus.pending]),
        )
    )
    running_crawls = running_crawls_result.scalars().all()

    for crawl in running_crawls:
        if crawl.celery_task_id:
            try:
                from app.tasks.celery_app import celery
                celery.control.revoke(crawl.celery_task_id, terminate=True)
            except Exception:
                pass
        crawl.status = CrawlStatus.failed
        crawl.error_message = "Cancelled — website deleted"
        crawl.completed_at = datetime.now(timezone.utc)
        crawls_cancelled += 1

    # ── Step 3: Disable automation rules for this website ────────────────
    rules_result = await db.execute(
        select(AutomationRule).where(
            AutomationRule.website_id == website_id,
            AutomationRule.is_active == True,
        )
    )
    rules = rules_result.scalars().all()
    for rule in rules:
        rule.is_active = False
        rules_disabled += 1

    # ── Step 4: Purge Redis queue entries for this website ───────────────
    queue_purged = False
    try:
        import redis as redis_lib
        from app.config import settings
        r = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
        # Revoke all Celery tasks that contain this website_id in their kwargs
        # (best-effort scan of the queue)
        queue_len = r.llen("celery") or 0
        if queue_len > 0 and queue_len < 500:  # only scan if queue is manageable
            import json as _json
            to_remove = []
            all_tasks = r.lrange("celery", 0, queue_len - 1)
            for raw in all_tasks:
                try:
                    task_msg = _json.loads(raw)
                    body = _json.loads(task_msg.get("body", "{}")) if isinstance(task_msg.get("body"), str) else task_msg.get("body", {})
                    kwargs = body[2] if isinstance(body, list) and len(body) > 2 else {}
                    if str(website_id) in str(kwargs):
                        to_remove.append(raw)
                except Exception:
                    pass
            for item in to_remove:
                r.lrem("celery", 0, item)
        r.close()
        queue_purged = True
    except Exception:
        pass

    # ── Step 5: Mark integrations as disconnected ─────────────────────────
    for integration in (website.integrations or []):
        integration.is_connected = False
        integration.error_message = "Website deleted"

    # ── Step 6: Log activity ──────────────────────────────────────────────
    await log_activity(
        db=db,
        activity_type="website_deleted",
        level="warning",
        agent="System",
        message=(
            f"🗑️ Website '{domain}' deleted by {current_user.email}. "
            f"Stopped {crawls_cancelled} crawler(s), disabled {rules_disabled} rule(s)."
        ),
        website_id=str(website.id),
        website_domain=domain,
        is_milestone=False,
    )

    # ── Step 7: Soft-delete ───────────────────────────────────────────────
    now = datetime.now(timezone.utc)
    website.deleted_at = now
    website.is_active = False
    await db.commit()

    restore_deadline = (now + timedelta(days=30)).isoformat()
    return {
        "deleted": True,
        "permanent": False,
        "domain": domain,
        "crawls_cancelled": crawls_cancelled,
        "rules_disabled": rules_disabled,
        "queue_purged": queue_purged,
        "restore_before": restore_deadline,
        "message": f"'{domain}' soft-deleted. Restorable until {restore_deadline[:10]}.",
    }


@router.post("/{website_id}/restore")
async def restore_website(
    website_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Restore a soft-deleted website."""
    website = await db.scalar(select(Website).where(Website.id == website_id))
    if not website:
        raise HTTPException(404, "Website not found")
    if not website.deleted_at:
        raise HTTPException(400, "Website is not deleted")

    website.deleted_at = None
    website.is_active = True
    await db.commit()
    return {"restored": True, "domain": website.domain}


@router.get("/{website_id}/seo-score")
async def get_seo_score(
    website_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Compute a unified AI SEO Score (0-100) for a website.
    Aggregates technical score, content score, rankings performance, AEO score, and signals.
    """
    from app.models.ranking import KeywordRanking
    from app.models.crawl import Crawl

    website = await db.scalar(
        select(Website).options(selectinload(Website.integrations)).where(Website.id == website_id)
    )
    if not website:
        raise HTTPException(404, "Website not found")

    # Get rankings stats
    rankings = (await db.execute(
        select(KeywordRanking).where(KeywordRanking.website_id == website_id)
    )).scalars().all()

    # Score components
    technical = website.technical_score or 0
    content = website.content_score or 0
    aeo = website.aeo_score or 0
    ai_vis = website.ai_visibility_score or 0

    # Rankings component (0-100)
    rankings_score = 0
    ranked = [r for r in rankings if r.position]
    if ranked:
        top10 = len([r for r in ranked if r.position <= 10])
        avg_pos = sum(r.position for r in ranked) / len(ranked)
        top10_pct = (top10 / len(ranked)) * 100
        pos_score = max(0, min(100, 100 - avg_pos + 1))
        rankings_score = int((top10_pct * 0.6) + (pos_score * 0.4))

    # Signals bonuses
    bonus = 0
    if website.has_ssl: bonus += 5
    if website.has_schema: bonus += 5
    if website.has_sitemap: bonus += 3
    if website.has_robots_txt: bonus += 2
    if website.is_verified: bonus += 5

    raw_score = (
        technical * 0.30 +
        content * 0.25 +
        rankings_score * 0.20 +
        aeo * 0.15 +
        ai_vis * 0.10
    ) + bonus

    final_score = min(100, int(raw_score))
    grade = "A+" if final_score >= 90 else "A" if final_score >= 80 else "B+" if final_score >= 70 else "B" if final_score >= 60 else "C" if final_score >= 50 else "D"

    return {
        "website_id": website_id,
        "domain": website.domain,
        "seo_score": final_score,
        "grade": grade,
        "components": {
            "technical": technical,
            "content": content,
            "rankings": rankings_score,
            "aeo": aeo,
            "ai_visibility": ai_vis,
        },
        "signals": {
            "has_ssl": website.has_ssl,
            "has_schema": website.has_schema,
            "has_sitemap": website.has_sitemap,
            "has_robots_txt": website.has_robots_txt,
            "is_verified": website.is_verified,
        },
        "keywords_tracked": len(rankings),
        "keywords_ranked": len(ranked),
        "last_crawled": website.last_crawled_at.isoformat() if website.last_crawled_at else None,
        "tip": "Run a crawl and AEO audit to get the most accurate score" if not website.last_crawled_at else "Score updates automatically after each crawl",
    }


@router.post("/{website_id}/connect/{integration_type}")
async def connect_integration(
    website_id: str,
    integration_type: IntegrationType,
    credentials: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Website).where(Website.id == website_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Website not found")

    existing = await db.execute(
        select(Integration).where(
            Integration.website_id == website_id,
            Integration.type == integration_type,
        )
    )
    integration = existing.scalar_one_or_none()
    if integration:
        integration.credentials = credentials
        integration.is_connected = True
        integration.error_message = None
    else:
        integration = Integration(
            website_id=website_id,
            type=integration_type,
            credentials=credentials,
            is_connected=True,
        )
        db.add(integration)

    await db.commit()
    return {"status": "connected", "type": integration_type}


def _serialize(website: Website, detailed: bool = False) -> dict:
    data = {
        "id": str(website.id),
        "client_id": str(website.client_id),
        "domain": website.domain,
        "url": website.url,
        "sitemap_url": website.sitemap_url,
        "platform": website.platform,
        "is_verified": website.is_verified,
        "technical_score": website.technical_score,
        "content_score": website.content_score,
        "authority_score": website.authority_score,
        "ai_visibility_score": website.ai_visibility_score,
        "aeo_score": website.aeo_score,
        "has_ssl": website.has_ssl,
        "has_schema": website.has_schema,
        "has_sitemap": website.has_sitemap,
        "has_robots_txt": website.has_robots_txt,
        "last_crawled_at": website.last_crawled_at.isoformat() if website.last_crawled_at else None,
        "crawl_frequency_hours": website.crawl_frequency_hours,
        "is_active": website.is_active,
        "integrations": [
            {"type": i.type, "is_connected": i.is_connected}
            for i in (website.integrations or [])
        ],
        "created_at": website.created_at.isoformat() if website.created_at else None,
    }
    if detailed and hasattr(website, "crawls"):
        data["recent_crawls"] = [
            {
                "id": str(c.id),
                "status": c.status,
                "pages_crawled": c.pages_crawled,
                "issues_found": c.issues_found,
                "seo_score": c.seo_score,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in (website.crawls or [])[-5:]
        ]
    return data
