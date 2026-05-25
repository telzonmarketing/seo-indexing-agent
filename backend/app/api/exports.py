"""
Excel Export API — Download reports on demand.
"""
import os
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/exports", tags=["exports"])

SHEET_TYPES = ["technical_audit", "rankings", "backlinks", "blog_ideas", "content_gaps", "seo_tasks", "competitor", "internal_links", "full_report"]


@router.get("")
async def list_exports(current_user: User = Depends(get_current_user)):
    """List available export types."""
    return {
        "available_exports": [
            {"type": "full_report", "name": "Full SEO Report", "description": "All data in one Excel file", "sheets": 8},
            {"type": "technical_audit", "name": "Technical Audit", "description": "All SEO issues with severity and recommendations"},
            {"type": "rankings", "name": "Keyword Rankings", "description": "Keyword positions and ranking changes"},
            {"type": "backlinks", "name": "Backlink Opportunities", "description": "Directory listings and link building prospects"},
            {"type": "blog_ideas", "name": "Blog Ideas", "description": "AI-generated content ideas with briefs"},
            {"type": "content_gaps", "name": "Content Gap Analysis", "description": "Missing content opportunities"},
            {"type": "seo_tasks", "name": "SEO Task List", "description": "All tasks with priority and impact scores"},
            {"type": "competitor", "name": "Competitor Analysis", "description": "Competitor gaps and quick wins"},
            {"type": "internal_links", "name": "Internal Links", "description": "Internal linking opportunities"},
        ]
    }


@router.get("/download/{export_type}")
async def download_export(
    export_type: str,
    client_id: Optional[str] = None,
    website_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate and download an Excel report."""
    if export_type not in SHEET_TYPES:
        raise HTTPException(400, f"Invalid export type. Use: {SHEET_TYPES}")

    from sqlalchemy import select
    from app.models.client import Client
    from app.models.website import Website
    from app.models.crawl import Crawl, CrawlStatus, SEOIssue, Page
    from app.models.task import Task
    from app.models.blog_idea import BlogIdea
    from app.models.backlink import BacklinkOpportunity
    from app.models.ranking import KeywordRanking
    from app.services.excel_exporter import generate_full_report, generate_sheet_only

    # Gather data
    domain = "All Clients"
    seo_score = 0
    summary = {}
    issues = []
    tasks = []
    ideas = []
    opportunities = []
    rankings = []
    content_gaps = []
    content_gaps_list = []
    keyword_gaps = []

    if client_id:
        client = await db.scalar(select(Client).where(Client.id == client_id))
        if client:
            domain = client.name
            seo_score = client.seo_health_score or 0

    # Issues
    issues_q = select(SEOIssue)
    if website_id:
        crawl_q = select(Crawl).where(Crawl.website_id == website_id, Crawl.status == CrawlStatus.completed).order_by(Crawl.completed_at.desc()).limit(1)
        crawl = await db.scalar(crawl_q)
        if crawl:
            issues_q = issues_q.where(SEOIssue.crawl_id == crawl.id)
            summary = crawl.summary or {}
            seo_score = crawl.seo_score or 0

    issues_result = await db.execute(issues_q.limit(500))
    raw_issues = issues_result.scalars().all()
    issues = [{"issue_type": str(i.issue_type), "severity": str(i.severity), "page_url": i.page_url, "description": i.description, "recommendation": i.recommendation, "impact_score": i.impact_score} for i in raw_issues]

    # Tasks
    tasks_q = select(Task)
    if client_id:
        tasks_q = tasks_q.where(Task.client_id == client_id)
    tasks_result = await db.execute(tasks_q.order_by(Task.created_at.desc()).limit(500))
    raw_tasks = tasks_result.scalars().all()
    tasks = [{"title": t.title, "category": str(t.category or ""), "priority": str(t.priority), "status": str(t.status), "description": t.description, "ai_generated": t.ai_generated, "estimated_impact": t.estimated_impact, "page_url": t.page_url} for t in raw_tasks]

    # Blog ideas
    ideas_q = select(BlogIdea)
    if client_id:
        ideas_q = ideas_q.where(BlogIdea.client_id == client_id)
    ideas_result = await db.execute(ideas_q.order_by(BlogIdea.priority_score.desc()).limit(200))
    raw_ideas = ideas_result.scalars().all()
    ideas = [{"title": i.title, "target_keyword": i.target_keyword, "search_intent": str(i.search_intent or ""), "priority_score": i.priority_score, "source": i.source, "is_ai_friendly": i.is_ai_friendly, "is_seasonal": i.is_seasonal, "content_gap": i.content_gap, "ai_reasoning": i.ai_reasoning} for i in raw_ideas]

    # Backlinks
    blinks_q = select(BacklinkOpportunity)
    if client_id:
        blinks_q = blinks_q.where(BacklinkOpportunity.client_id == client_id)
    blinks_result = await db.execute(blinks_q.order_by(BacklinkOpportunity.domain_authority.desc()).limit(200))
    raw_blinks = blinks_result.scalars().all()
    opportunities = [{"platform": o.platform, "type": str(o.type), "domain_authority": o.domain_authority, "relevance_score": o.relevance_score, "is_dofollow": o.is_dofollow, "source_url": o.source_url, "notes": o.notes, "status": str(o.status)} for o in raw_blinks]

    # Rankings
    rankings_q = select(KeywordRanking)
    if website_id:
        rankings_q = rankings_q.where(KeywordRanking.website_id == website_id)
    rankings_result = await db.execute(rankings_q.order_by(KeywordRanking.position.asc()).limit(200))
    raw_rankings = rankings_result.scalars().all()
    rankings = [{"keyword": r.keyword, "position": r.position, "previous_position": r.previous_position, "search_volume": r.search_volume, "page_url": r.landing_page, "updated_at": str(r.checked_at or "")} for r in raw_rankings]

    data = {
        "domain": domain,
        "seo_score": seo_score,
        "summary": summary,
        "issues": issues,
        "tasks": tasks,
        "ideas": ideas,
        "opportunities": opportunities,
        "rankings": rankings,
        "gaps": content_gaps_list,
        "content_gaps": content_gaps,
        "keyword_gaps": keyword_gaps,
    }

    # Generate Excel
    if export_type == "full_report":
        excel_bytes = generate_full_report(data)
        filename = f"seo_os_full_report_{domain.replace(' ', '_')}_{datetime.now():%Y%m%d}.xlsx"
    else:
        excel_bytes = generate_sheet_only(export_type, data)
        filename = f"seo_os_{export_type}_{domain.replace(' ', '_')}_{datetime.now():%Y%m%d}.xlsx"

    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
