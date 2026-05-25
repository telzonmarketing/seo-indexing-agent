from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional

from app.database import get_db
from app.core.deps import get_current_user
from app.models.backlink import BacklinkOpportunity, BacklinkStatus, BacklinkType
from app.models.user import User

router = APIRouter(prefix="/backlinks", tags=["backlinks"])


@router.get("")
async def list_backlinks(
    client_id: Optional[str] = None,
    website_id: Optional[str] = None,
    status: Optional[str] = None,
    type: Optional[str] = None,
    min_da: int = 0,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(BacklinkOpportunity).order_by(
        BacklinkOpportunity.domain_authority.desc(),
        BacklinkOpportunity.relevance_score.desc(),
    )
    if client_id:
        q = q.where(BacklinkOpportunity.client_id == client_id)
    if website_id:
        q = q.where(BacklinkOpportunity.website_id == website_id)
    if status:
        q = q.where(BacklinkOpportunity.status == status)
    if type:
        q = q.where(BacklinkOpportunity.type == type)
    if min_da:
        q = q.where(BacklinkOpportunity.domain_authority >= min_da)

    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    result = await db.execute(q.limit(limit).offset(offset))
    opps = result.scalars().all()

    return {
        "total": total,
        "opportunities": [_serialize(o) for o in opps],
    }


@router.get("/stats")
async def backlink_stats(
    client_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(BacklinkOpportunity)
    if client_id:
        q = q.where(BacklinkOpportunity.client_id == client_id)
    result = await db.execute(q)
    opps = result.scalars().all()

    return {
        "total": len(opps),
        "by_status": {
            "opportunity": sum(1 for o in opps if str(o.status) == "opportunity"),
            "submitted": sum(1 for o in opps if str(o.status) == "submitted"),
            "acquired": sum(1 for o in opps if str(o.status) == "acquired"),
        },
        "by_type": {
            "directory": sum(1 for o in opps if str(o.type) == "directory"),
            "guest_post": sum(1 for o in opps if str(o.type) == "guest_post"),
            "forum": sum(1 for o in opps if str(o.type) == "forum"),
            "citation": sum(1 for o in opps if str(o.type) == "citation"),
            "profile": sum(1 for o in opps if str(o.type) == "profile"),
        },
        "avg_da": int(sum(o.domain_authority or 0 for o in opps) / max(len(opps), 1)),
        "high_da_count": sum(1 for o in opps if (o.domain_authority or 0) >= 70),
    }


@router.patch("/{opp_id}/status")
async def update_backlink_status(
    opp_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    opp = await db.scalar(select(BacklinkOpportunity).where(BacklinkOpportunity.id == opp_id))
    if not opp:
        raise HTTPException(404, "Opportunity not found")

    if "status" in body:
        try:
            opp.status = BacklinkStatus(body["status"])
        except ValueError:
            raise HTTPException(400, f"Invalid status: {body['status']}")
    if "notes" in body:
        opp.notes = body["notes"]

    await db.commit()
    return _serialize(opp)


@router.post("/scan")
async def trigger_backlink_scan(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually trigger backlink opportunity scan."""
    from app.tasks.autonomous_tasks import daily_backlink_scan
    task = daily_backlink_scan.delay()
    return {"task_id": task.id, "message": "Backlink scan started"}


@router.delete("/{opp_id}")
async def delete_backlink(
    opp_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    opp = await db.scalar(select(BacklinkOpportunity).where(BacklinkOpportunity.id == opp_id))
    if not opp:
        raise HTTPException(404, "Opportunity not found")
    await db.delete(opp)
    await db.commit()
    return {"message": "Deleted"}


def _serialize(o: BacklinkOpportunity) -> dict:
    return {
        "id": str(o.id),
        "client_id": str(o.client_id),
        "website_id": str(o.website_id) if o.website_id else None,
        "source_domain": o.source_domain,
        "source_url": o.source_url,
        "platform": o.platform,
        "type": str(o.type),
        "status": str(o.status),
        "domain_authority": o.domain_authority,
        "relevance_score": o.relevance_score,
        "is_dofollow": o.is_dofollow,
        "notes": o.notes,
        "ai_reasoning": o.ai_reasoning,
        "submission_url": o.submission_url,
        "created_at": o.created_at.isoformat() if o.created_at else None,
    }
