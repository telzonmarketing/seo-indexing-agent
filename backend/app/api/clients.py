from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, EmailStr
from typing import Optional, List
import re
import uuid
from datetime import datetime, timezone, timedelta

from app.database import get_db
from app.models.client import Client
from app.models.website import Website
from app.models.task import Task, TaskStatus
from app.models.crawl import Crawl, CrawlStatus, SEOIssue
from app.models.ranking import KeywordRanking
from app.models.blog_idea import BlogIdea
from app.models.backlink import BacklinkOpportunity
from app.models.alert import Alert
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/clients", tags=["clients"])


def slugify(name: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", name.lower())
    return re.sub(r"[\s_-]+", "-", slug).strip("-")


class ClientCreate(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    industry: Optional[str] = None
    notes: Optional[str] = None
    tags: List[str] = []


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    industry: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    is_active: Optional[bool] = None


@router.get("")
async def list_clients(
    q: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Client).options(selectinload(Client.websites))
    if q:
        query = query.where(Client.name.ilike(f"%{q}%"))
    query = query.where(Client.deleted_at == None).offset(skip).limit(limit).order_by(Client.created_at.desc())
    result = await db.execute(query)
    clients = result.scalars().all()
    return {"clients": [_serialize_client(c) for c in clients], "total": len(clients)}


@router.post("", status_code=201)
async def create_client(
    data: ClientCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    slug = slugify(data.name)
    existing = await db.execute(select(Client).where(Client.slug == slug))
    if existing.scalar_one_or_none():
        slug = f"{slug}-{str(uuid.uuid4())[:6]}"

    client = Client(slug=slug, **data.model_dump())
    db.add(client)
    await db.commit()

    # Re-query with relationship eager-loaded to avoid MissingGreenlet
    client = await db.scalar(
        select(Client)
        .options(selectinload(Client.websites))
        .where(Client.id == client.id)
    )

    # Initialize client workspace on disk
    try:
        from app.services.client_directory import init_client_workspace
        init_client_workspace(str(client.id), client.name, client.industry or "")
    except Exception as e:
        print(f"Workspace init failed (non-fatal): {e}")

    # Log activity
    try:
        from app.services.activity_logger import log_activity
        from app.models.activity import ActivityType, ActivityLevel
        await log_activity(
            db, ActivityType.agent_started, "System",
            f"New client onboarded: {client.name}",
            client_id=client.id, client_name=client.name,
            level=ActivityLevel.success, is_milestone=True,
        )
    except Exception:
        pass

    return _serialize_client(client)


@router.get("/{client_id}")
async def get_client(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Client)
        .options(
            selectinload(Client.websites),
            selectinload(Client.tasks),
        )
        .where(Client.id == client_id, Client.deleted_at == None)
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return _serialize_client(client, detailed=True)


@router.get("/{client_id}/dashboard")
async def get_client_dashboard(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Full client dashboard — loads everything needed for the client view."""
    client = await db.scalar(
        select(Client)
        .options(selectinload(Client.websites))
        .where(Client.id == client_id, Client.deleted_at == None)
    )
    if not client:
        raise HTTPException(404, "Client not found")

    # All websites for this client
    ws_result = await db.execute(select(Website).where(Website.client_id == client_id, Website.is_active == True))
    websites = ws_result.scalars().all()
    website_ids = [w.id for w in websites]

    # Tasks
    tasks_result = await db.execute(
        select(Task).where(Task.client_id == client_id).order_by(Task.created_at.desc()).limit(20)
    )
    tasks = tasks_result.scalars().all()

    open_tasks = [t for t in tasks if str(t.status) not in ("done",)]
    critical_tasks = [t for t in open_tasks if str(t.priority) == "critical"]
    ai_tasks = [t for t in tasks if t.ai_generated]

    # Latest crawl per website (for issues/scores)
    total_issues = 0
    critical_issues = 0
    avg_score = 0
    crawl_summaries = []

    for website in websites:
        crawl = await db.scalar(
            select(Crawl)
            .where(Crawl.website_id == website.id, Crawl.status == CrawlStatus.completed)
            .order_by(Crawl.completed_at.desc())
            .limit(1)
        )
        if crawl:
            summary = crawl.summary or {}
            total_issues += summary.get("total_issues", 0)
            critical_issues += summary.get("critical_issues", 0)
            avg_score += crawl.seo_score or 0
            crawl_summaries.append({
                "website": website.domain,
                "crawled_at": crawl.completed_at.isoformat() if crawl.completed_at else None,
                "pages": crawl.pages_crawled or 0,
                "issues": summary.get("total_issues", 0),
                "score": crawl.seo_score or 0,
            })

    if websites:
        avg_score = avg_score // len(websites)

    # Rankings
    rankings_result = await db.execute(
        select(KeywordRanking)
        .where(KeywordRanking.website_id.in_(website_ids) if website_ids else False)
        .order_by(KeywordRanking.position.asc())
        .limit(10)
    )
    rankings = rankings_result.scalars().all()

    # Blog ideas
    ideas_result = await db.execute(
        select(BlogIdea)
        .where(BlogIdea.client_id == client_id)
        .order_by(BlogIdea.priority_score.desc())
        .limit(10)
    )
    ideas = ideas_result.scalars().all()

    # Backlinks
    backlinks_result = await db.execute(
        select(BacklinkOpportunity)
        .where(BacklinkOpportunity.client_id == client_id)
        .order_by(BacklinkOpportunity.domain_authority.desc())
        .limit(8)
    )
    backlinks = backlinks_result.scalars().all()

    # Alerts
    alerts_result = await db.execute(
        select(Alert)
        .where(Alert.client_id == client_id, Alert.is_read == False)
        .order_by(Alert.created_at.desc())
        .limit(10)
    )
    alerts = alerts_result.scalars().all()

    # Recent AI actions (recent AI-generated tasks)
    recent_ai = await db.execute(
        select(Task)
        .where(Task.client_id == client_id, Task.ai_generated == True)
        .order_by(Task.created_at.desc())
        .limit(6)
    )
    recent_ai_tasks = recent_ai.scalars().all()

    # Workspace info
    workspace_info = {}
    try:
        from app.services.client_directory import get_workspace_info
        workspace_info = get_workspace_info(client_id)
    except Exception:
        pass

    return {
        "client": _serialize_client(client),
        "summary": {
            "avg_seo_score": avg_score,
            "total_websites": len(websites),
            "total_issues": total_issues,
            "critical_issues": critical_issues,
            "open_tasks": len(open_tasks),
            "critical_tasks": len(critical_tasks),
            "ai_tasks": len(ai_tasks),
            "total_blog_ideas": len(ideas),
            "backlink_opportunities": len(backlinks),
            "unread_alerts": len(alerts),
        },
        "websites": [_serialize_website(w) for w in websites],
        "crawl_summaries": crawl_summaries,
        "tasks": [_serialize_task(t) for t in tasks[:10]],
        "rankings": [
            {
                "keyword": r.keyword,
                "position": r.position,
                "previous_position": r.previous_position,
                "change": (r.previous_position or 0) - (r.position or 0) if r.previous_position else 0,
            }
            for r in rankings
        ],
        "blog_ideas": [
            {
                "id": str(i.id),
                "title": i.title,
                "target_keyword": i.target_keyword,
                "priority_score": i.priority_score,
                "search_intent": _enum_val(i.search_intent) if i.search_intent else None,
                "is_ai_friendly": i.is_ai_friendly,
                "status": _enum_val(i.status),
            }
            for i in ideas
        ],
        "backlinks": [
            {
                "platform": b.platform,
                "domain_authority": b.domain_authority,
                "type": _enum_val(b.type),
                "status": _enum_val(b.status),
                "source_url": b.source_url,
            }
            for b in backlinks
        ],
        "alerts": [
            {
                "id": str(a.id),
                "type": _enum_val(a.type),
                "severity": _enum_val(a.severity),
                "title": a.title,
                "message": a.message,
                "is_read": a.is_read,
                "is_resolved": a.is_resolved,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in alerts
        ],
        "recent_ai_actions": [
            {
                "title": t.title,
                "category": _enum_val(t.category) if t.category else None,
                "priority": _enum_val(t.priority),
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in recent_ai_tasks
        ],
        "workspace": workspace_info,
        "bot_modes": list(set(_enum_val(w.bot_mode, "recommendation_only") for w in websites)),
    }


@router.patch("/{client_id}")
async def update_client(
    client_id: str,
    data: ClientUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(client, field, value)

    await db.commit()
    await db.refresh(client)
    return _serialize_client(client)


@router.delete("/{client_id}")
async def delete_client(
    client_id: str,
    permanent: bool = False,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Soft delete client (archives workspace, marks deleted_at). permanent=True does hard delete after 30 days."""
    client = await db.scalar(select(Client).where(Client.id == client_id))
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if permanent:
        # Hard delete — only allowed if soft-deleted 30+ days ago
        if client.deleted_at and (datetime.now(timezone.utc) - client.deleted_at).days < 30:
            raise HTTPException(400, "Must wait 30 days after soft delete before permanent deletion")
        try:
            from app.services.client_directory import permanent_delete_client
            permanent_delete_client(client_id)
        except Exception:
            pass
        await db.delete(client)
        await db.commit()
        return {"deleted": True, "permanent": True}

    # Soft delete: archive workspace, set deleted_at
    try:
        from app.services.client_directory import archive_client
        archive_result = archive_client(client_id, reason="user_deleted")
    except Exception:
        archive_result = {}

    client.deleted_at = datetime.now(timezone.utc)
    client.is_active = False
    await db.commit()

    return {
        "deleted": True,
        "permanent": False,
        "message": "Client archived. Permanent deletion available after 30 days.",
        "archived_at": client.deleted_at.isoformat(),
        "archive": archive_result,
    }


@router.get("/{client_id}/workspace")
async def get_workspace(
    client_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get client workspace directory info and file listings."""
    from app.services.client_directory import get_workspace_info, list_client_exports, get_automation_log

    client = await db.scalar(select(Client).where(Client.id == client_id))
    if not client:
        raise HTTPException(404, "Client not found")

    workspace = get_workspace_info(client_id)
    exports = list_client_exports(client_id)
    logs = get_automation_log(client_id)

    return {
        "client_id": client_id,
        "client_name": client.name,
        "workspace": workspace,
        "exports": exports,
        "recent_logs": logs[:20],
    }


def _serialize_client(client: Client, detailed: bool = False) -> dict:
    data = {
        "id": str(client.id),
        "name": client.name,
        "slug": client.slug,
        "email": client.email,
        "phone": client.phone,
        "company": client.company,
        "industry": client.industry,
        "notes": client.notes,
        "tags": client.tags or [],
        "seo_health_score": client.seo_health_score,
        "is_active": client.is_active,
        "deleted_at": client.deleted_at.isoformat() if client.deleted_at else None,
        "website_count": len(client.websites) if client.websites is not None else 0,
        "created_at": client.created_at.isoformat() if client.created_at else None,
        "updated_at": client.updated_at.isoformat() if client.updated_at else None,
    }
    if detailed:
        data["websites"] = [_serialize_website(w) for w in (client.websites or [])]
    return data


def _enum_val(v, default: str = "") -> str:
    """Get string value from enum or plain string."""
    if v is None:
        return default
    return v.value if hasattr(v, "value") else str(v)


def _serialize_website(w: Website) -> dict:
    return {
        "id": str(w.id),
        "domain": w.domain,
        "url": w.url,
        "cms_type": _enum_val(w.cms_type, "unknown"),
        "framework_detected": w.framework_detected,
        "hosting_provider": w.hosting_provider,
        "cdn_detected": getattr(w, "cdn_detected", None),
        "server_software": getattr(w, "server_software", None),
        "bot_mode": _enum_val(w.bot_mode, "recommendation_only"),
        "technical_score": w.technical_score,
        "content_score": w.content_score,
        "ai_visibility_score": w.ai_visibility_score,
        "aeo_score": getattr(w, "aeo_score", 0),
        "is_verified": w.is_verified,
        "has_ssl": getattr(w, "has_ssl", False),
        "has_sitemap": getattr(w, "has_sitemap", False),
        "has_schema": getattr(w, "has_schema", False),
        "has_analytics": getattr(w, "has_analytics", False),
        "has_robots_txt": getattr(w, "has_robots_txt", False),
        "has_tag_manager": getattr(w, "has_tag_manager", False),
        "onboarding_step": getattr(w, "onboarding_step", 1),
        "onboarding_complete": getattr(w, "onboarding_complete", False),
        "last_crawled_at": w.last_crawled_at.isoformat() if w.last_crawled_at else None,
        "is_active": w.is_active,
    }


def _serialize_task(t: Task) -> dict:
    return {
        "id": str(t.id),
        "title": t.title,
        "description": t.description,
        "priority": _enum_val(t.priority),
        "status": _enum_val(t.status),
        "category": _enum_val(t.category) if t.category else None,
        "ai_generated": t.ai_generated,
        "estimated_impact": t.estimated_impact,
        "page_url": t.page_url,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }
