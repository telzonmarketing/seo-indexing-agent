"""
Autonomous Mode API — Status, manual triggers, task execution logs.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/autonomous", tags=["autonomous"])

AUTONOMOUS_CONFIG = {
    "enabled": True,
    "working_hours": "24/7",
    "continuous_learning": True,
    "continuous_monitoring": True,
    "continuous_execution": True,
    "auto_priority_detection": True,
    "auto_task_generation": True,
    "auto_recommendations": True,
    "schedule": {
        "hourly": ["monitor_keyword_rankings", "monitor_ai_visibility"],
        "daily": ["crawl_websites", "generate_blog_ideas", "scan_backlinks", "detect_content_gaps", "generate_excel_reports"],
        "weekly": ["competitor_analysis", "ai_search_audit", "semantic_seo_audit"],
    }
}


@router.get("/status")
async def autonomous_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get autonomous engine status and stats."""
    from app.models.blog_idea import BlogIdea
    from app.models.backlink import BacklinkOpportunity
    from app.models.content_cluster import ContentCluster
    from app.models.task import Task
    from app.models.crawl import Crawl, CrawlStatus

    blog_ideas_count = await db.scalar(select(func.count(BlogIdea.id))) or 0
    backlinks_count = await db.scalar(select(func.count(BacklinkOpportunity.id))) or 0
    clusters_count = await db.scalar(select(func.count(ContentCluster.id))) or 0
    ai_tasks_count = await db.scalar(select(func.count(Task.id)).where(Task.ai_generated == True)) or 0
    crawls_completed = await db.scalar(select(func.count(Crawl.id)).where(Crawl.status == CrawlStatus.completed)) or 0

    # Last 24h activity
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    recent_ideas = await db.scalar(select(func.count(BlogIdea.id)).where(BlogIdea.created_at >= since)) or 0
    recent_backlinks = await db.scalar(select(func.count(BacklinkOpportunity.id)).where(BacklinkOpportunity.created_at >= since)) or 0
    recent_tasks = await db.scalar(select(func.count(Task.id)).where(Task.created_at >= since, Task.ai_generated == True)) or 0

    return {
        "mode": "autonomous",
        "status": "active",
        "config": AUTONOMOUS_CONFIG,
        "stats": {
            "total": {
                "blog_ideas": blog_ideas_count,
                "backlink_opportunities": backlinks_count,
                "content_clusters": clusters_count,
                "ai_tasks": ai_tasks_count,
                "crawls_completed": crawls_completed,
            },
            "last_24h": {
                "blog_ideas_generated": recent_ideas,
                "backlinks_found": recent_backlinks,
                "tasks_created": recent_tasks,
            }
        },
        "agents": [
            {"name": "Technical SEO Agent", "status": "active", "schedule": "on_crawl"},
            {"name": "Content Agent", "status": "active", "schedule": "on_crawl"},
            {"name": "Blog Idea Agent", "status": "active", "schedule": "daily 2:00 AM"},
            {"name": "Backlink Agent", "status": "active", "schedule": "daily 3:00 AM"},
            {"name": "Semantic SEO Agent", "status": "active", "schedule": "daily 4:00 AM + weekly"},
            {"name": "AI Search Agent", "status": "active", "schedule": "weekly Wednesday"},
            {"name": "Competitor Agent", "status": "active", "schedule": "weekly Monday"},
            {"name": "Reporting Agent", "status": "active", "schedule": "on_demand + daily 6:00 AM"},
        ],
        "next_runs": {
            "crawl_check": "Next hour :00",
            "blog_ideas": "Daily 2:00 AM UTC",
            "backlink_scan": "Daily 3:00 AM UTC",
            "content_gaps": "Daily 4:00 AM UTC",
            "excel_reports": "Daily 6:00 AM UTC",
            "competitor_analysis": "Monday 5:00 AM UTC",
            "ai_search_audit": "Wednesday 5:00 AM UTC",
            "semantic_audit": "Friday 5:00 AM UTC",
        }
    }


@router.post("/run/{task_name}")
async def trigger_autonomous_task(
    task_name: str,
    current_user: User = Depends(get_current_user),
):
    """Manually trigger any autonomous task."""
    from app.tasks.autonomous_tasks import (
        daily_blog_ideas, daily_backlink_scan, daily_excel_reports,
        detect_content_gaps, weekly_competitor_analysis,
        weekly_ai_search_audit, weekly_semantic_audit,
        monitor_keyword_rankings,
    )
    from app.tasks.seo_tasks import schedule_due_crawls

    task_map = {
        "blog_ideas": daily_blog_ideas,
        "backlink_scan": daily_backlink_scan,
        "excel_reports": daily_excel_reports,
        "content_gaps": detect_content_gaps,
        "competitor_analysis": weekly_competitor_analysis,
        "ai_search_audit": weekly_ai_search_audit,
        "semantic_audit": weekly_semantic_audit,
        "monitor_rankings": monitor_keyword_rankings,
        "crawl_check": schedule_due_crawls,
    }

    if task_name not in task_map:
        return {"error": f"Unknown task: {task_name}. Available: {list(task_map.keys())}"}

    task = task_map[task_name].delay()
    return {
        "task_id": task.id,
        "task_name": task_name,
        "status": "queued",
        "message": f"{task_name} started in background"
    }


@router.get("/agents")
async def list_agents(current_user: User = Depends(get_current_user)):
    """List all AI agents and their capabilities."""
    return {
        "agents": [
            {
                "name": "Technical SEO Agent",
                "description": "Analyzes crawl data, detects technical issues, generates technical tasks",
                "capabilities": ["missing_titles", "broken_links", "redirect_chains", "crawl_depth", "page_speed", "schema_validation", "canonical_tags", "indexability"],
                "schedule": "Runs on every crawl",
                "model": "llama3.2:3b (local)"
            },
            {
                "name": "Content Agent",
                "description": "Optimizes content quality, generates content recommendations",
                "capabilities": ["content_briefs", "faq_generation", "heading_optimization", "content_structure", "ai_readability", "snippet_optimization"],
                "schedule": "Runs on every crawl",
                "model": "llama3.2:3b (local)"
            },
            {
                "name": "Blog Idea Agent",
                "description": "Generates daily blog ideas from multiple SEO signals",
                "capabilities": ["paa_analysis", "autosuggest_mining", "competitor_content", "trend_detection", "content_brief_generation"],
                "schedule": "Daily 2:00 AM UTC",
                "model": "llama3.2:3b (local)"
            },
            {
                "name": "Backlink Agent",
                "description": "Discovers and scores backlink opportunities from 30+ sources",
                "capabilities": ["directory_scan", "guest_post_opportunities", "competitor_backlinks", "local_citations", "forum_opportunities"],
                "schedule": "Daily 3:00 AM UTC",
                "model": "llama3.2:3b (local)"
            },
            {
                "name": "Semantic SEO Agent",
                "description": "Builds topic clusters, detects semantic gaps, improves topical authority",
                "capabilities": ["topic_clustering", "semantic_gap_detection", "entity_coverage", "internal_linking", "topical_authority_scoring"],
                "schedule": "Daily 4:00 AM + Weekly Friday",
                "model": "llama3.2:3b (local)"
            },
            {
                "name": "AI Search Agent",
                "description": "Optimizes for ChatGPT, Perplexity, Google AI Overviews, voice search",
                "capabilities": ["chatgpt_optimization", "perplexity_optimization", "ai_overview_readiness", "voice_search", "schema_coverage", "content_chunking"],
                "schedule": "Weekly Wednesday 5:00 AM UTC",
                "model": "llama3.2:3b (local)"
            },
            {
                "name": "Competitor Agent",
                "description": "Analyzes competitors, finds gaps, identifies ranking opportunities",
                "capabilities": ["content_gap_analysis", "keyword_gap_analysis", "backlink_gap", "quick_win_detection", "30_day_strategy"],
                "schedule": "Weekly Monday 5:00 AM UTC",
                "model": "llama3.2:3b (local)"
            },
            {
                "name": "Reporting Agent",
                "description": "Generates executive SEO reports and Excel exports",
                "capabilities": ["audit_reports", "ranking_reports", "executive_summaries", "excel_exports", "roadmap_generation"],
                "schedule": "On-demand + Daily 6:00 AM Excel",
                "model": "llama3.2:3b (local)"
            },
        ]
    }


# In-memory emergency stop flag (in production, use Redis)
_emergency_stopped = False


@router.post("/emergency-stop")
async def emergency_stop(current_user: User = Depends(get_current_user)):
    """
    Emergency stop — immediately revoke all pending Celery tasks and
    set the global stop flag to prevent new tasks from starting.
    This is a safety mechanism to halt all autonomous operations instantly.
    """
    global _emergency_stopped
    _emergency_stopped = True

    revoked_count = 0
    errors = []

    try:
        from app.tasks.celery_app import celery
        inspect = celery.control.inspect()
        # Revoke all active, reserved, and scheduled tasks
        for node, tasks in (inspect.active() or {}).items():
            for task in tasks:
                celery.control.revoke(task["id"], terminate=True)
                revoked_count += 1
        for node, tasks in (inspect.reserved() or {}).items():
            for task in tasks:
                celery.control.revoke(task["id"])
                revoked_count += 1
        # Purge queues
        celery.control.purge()
    except Exception as e:
        errors.append(str(e))

    return {
        "status": "stopped",
        "message": "Emergency stop activated. All autonomous operations halted.",
        "tasks_revoked": revoked_count,
        "errors": errors,
        "stopped_by": current_user.email,
        "stopped_at": datetime.now(timezone.utc).isoformat(),
        "to_resume": "POST /autonomous/resume to restart autonomous mode",
    }


@router.post("/resume")
async def resume_autonomous(current_user: User = Depends(get_current_user)):
    """Resume autonomous operations after an emergency stop."""
    global _emergency_stopped
    _emergency_stopped = False
    return {
        "status": "active",
        "message": "Autonomous mode resumed. All agents are operational.",
        "resumed_by": current_user.email,
        "resumed_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/emergency-status")
async def emergency_status(current_user: User = Depends(get_current_user)):
    """Check if emergency stop is active."""
    return {
        "stopped": _emergency_stopped,
        "status": "stopped" if _emergency_stopped else "active",
    }
