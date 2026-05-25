from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional

from app.database import get_db
from app.core.deps import get_current_user
from app.models.alert import Alert, AlertType, AlertSeverity
from app.models.user import User

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
async def list_alerts(
    client_id: Optional[str] = None,
    website_id: Optional[str] = None,
    severity: Optional[str] = None,
    is_read: Optional[bool] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(Alert).order_by(Alert.created_at.desc())
    if client_id:
        q = q.where(Alert.client_id == client_id)
    if website_id:
        q = q.where(Alert.website_id == website_id)
    if severity:
        q = q.where(Alert.severity == severity)
    if is_read is not None:
        q = q.where(Alert.is_read == is_read)

    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    result = await db.execute(q.limit(limit).offset(offset))
    alerts = result.scalars().all()

    return {"total": total, "alerts": [_serialize(a) for a in alerts]}


@router.get("/unread-count")
async def unread_count(
    client_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(func.count(Alert.id)).where(Alert.is_read == False)
    if client_id:
        q = q.where(Alert.client_id == client_id)
    count = await db.scalar(q) or 0
    return {"unread_count": count}


@router.patch("/{alert_id}/read")
async def mark_read(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alert = await db.scalar(select(Alert).where(Alert.id == alert_id))
    if alert:
        alert.is_read = True
        await db.commit()
    return {"ok": True}


@router.patch("/mark-all-read")
async def mark_all_read(
    client_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(Alert).where(Alert.is_read == False)
    if client_id:
        q = q.where(Alert.client_id == client_id)
    result = await db.execute(q)
    for alert in result.scalars().all():
        alert.is_read = True
    await db.commit()
    return {"ok": True}


@router.post("/seed-demo")
async def seed_demo_alerts(
    client_id: str,
    website_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create demo alerts to show the alert system working."""
    demo_alerts = [
        Alert(client_id=client_id, website_id=website_id, type=AlertType.ranking_drop, severity=AlertSeverity.high,
              title="Ranking drop detected", message="Your keyword 'SEO services' dropped from position 3 to 8", data={"keyword": "SEO services", "old_pos": 3, "new_pos": 8}),
        Alert(client_id=client_id, website_id=website_id, type=AlertType.new_backlink, severity=AlertSeverity.info,
              title="New backlink acquired", message="New dofollow link from clutch.co (DA 82)", data={"domain": "clutch.co", "da": 82}),
        Alert(client_id=client_id, website_id=website_id, type=AlertType.schema_error, severity=AlertSeverity.medium,
              title="Schema markup error", message="FAQPage schema missing on /faq page", data={"page": "/faq"}),
        Alert(client_id=client_id, website_id=website_id, type=AlertType.ranking_gain, severity=AlertSeverity.info,
              title="Ranking improvement!", message="'digital marketing agency' moved from position 12 to 6", data={"keyword": "digital marketing agency", "old_pos": 12, "new_pos": 6}),
    ]
    for a in demo_alerts:
        db.add(a)
    await db.commit()
    return {"created": len(demo_alerts)}


def _ev(v, default: str = "") -> str:
    """Get string value from enum."""
    if v is None:
        return default
    return v.value if hasattr(v, "value") else str(v)


def _serialize(a: Alert) -> dict:
    return {
        "id": str(a.id),
        "client_id": str(a.client_id) if a.client_id else None,
        "website_id": str(a.website_id) if a.website_id else None,
        "type": _ev(a.type),
        "severity": _ev(a.severity),
        "title": a.title,
        "message": a.message,
        "data": a.data or {},
        "page_url": a.page_url,
        "is_read": a.is_read,
        "is_resolved": a.is_resolved,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }
