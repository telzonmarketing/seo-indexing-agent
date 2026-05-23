from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.models.report import Report, ReportType
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/reports", tags=["reports"])


class GenerateReportRequest(BaseModel):
    client_id: str
    website_id: Optional[str] = None
    crawl_id: Optional[str] = None
    type: ReportType = ReportType.seo_audit
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None


@router.get("")
async def list_reports(
    client_id: Optional[str] = None,
    report_type: Optional[ReportType] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Report)
    if client_id:
        query = query.where(Report.client_id == client_id)
    if report_type:
        query = query.where(Report.type == report_type)
    result = await db.execute(query.order_by(Report.created_at.desc()).limit(50))
    return [_serialize(r) for r in result.scalars().all()]


@router.post("/generate", status_code=201)
async def generate_report(
    data: GenerateReportRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from app.tasks.seo_tasks import generate_report_task
    task = generate_report_task.delay(
        data.client_id,
        data.website_id,
        data.crawl_id,
        data.type.value,
    )
    return {"status": "queued", "task_id": task.id}


@router.get("/{report_id}")
async def get_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return _serialize(report, detailed=True)


def _serialize(report: Report, detailed: bool = False) -> dict:
    data = {
        "id": str(report.id),
        "client_id": str(report.client_id),
        "website_id": str(report.website_id) if report.website_id else None,
        "type": report.type,
        "title": report.title,
        "summary": report.summary,
        "scores": report.scores or {},
        "period_start": report.period_start.isoformat() if report.period_start else None,
        "period_end": report.period_end.isoformat() if report.period_end else None,
        "created_at": report.created_at.isoformat() if report.created_at else None,
    }
    if detailed:
        data["content"] = report.content or {}
        data["ai_insights"] = report.ai_insights or []
        data["recommendations"] = report.recommendations or []
    return data
