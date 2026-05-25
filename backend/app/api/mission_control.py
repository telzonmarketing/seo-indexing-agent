"""
Mission Control API — Live AI War Room
Provides real-time system-wide stats for the Mission Control dashboard.
Endpoint: GET /api/mission-control/live
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/mission-control", tags=["mission-control"])


@router.get("/live")
async def get_live_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Full live snapshot — everything on one request.
    Returns: system health, queue, AI activity, crawls, rankings, clients.
    Designed to be polled every 5–10 seconds from Mission Control dashboard.
    """
    from app.models.client import Client
    from app.models.website import Website
    from app.models.crawl import Crawl, CrawlStatus
    from app.models.activity import AIActivity
    from app.models.ranking import KeywordRanking
    from app.models.blog_idea import BlogIdea
    from app.models.backlink import BacklinkOpportunity
    from app.models.task import Task

    now = datetime.now(timezone.utc)
    since_1h = now - timedelta(hours=1)
    since_24h = now - timedelta(hours=24)

    # ── Counts ───────────────────────────────────────────────────────────────
    total_clients = await db.scalar(select(func.count(Client.id))) or 0
    total_websites = await db.scalar(
        select(func.count(Website.id)).where(Website.deleted_at == None)
    ) or 0
    total_keywords = await db.scalar(select(func.count(KeywordRanking.id))) or 0
    total_blog_ideas = await db.scalar(select(func.count(BlogIdea.id))) or 0
    total_backlinks = await db.scalar(select(func.count(BacklinkOpportunity.id))) or 0

    # ── Crawls ───────────────────────────────────────────────────────────────
    running_crawls = await db.scalar(
        select(func.count(Crawl.id)).where(Crawl.status == CrawlStatus.running)
    ) or 0
    completed_crawls_24h = await db.scalar(
        select(func.count(Crawl.id))
        .where(Crawl.status == CrawlStatus.completed, Crawl.created_at >= since_24h)
    ) or 0
    total_crawls = await db.scalar(select(func.count(Crawl.id))) or 0

    # Latest running crawls
    running_crawl_list = (await db.execute(
        select(Crawl)
        .where(Crawl.status == CrawlStatus.running)
        .order_by(Crawl.created_at.desc())
        .limit(5)
    )).scalars().all()

    # ── Activity Feed (last 20) ───────────────────────────────────────────────
    activity_result = await db.execute(
        select(AIActivity)
        .order_by(AIActivity.created_at.desc())
        .limit(20)
    )
    activities = activity_result.scalars().all()

    # Activity in last hour
    activity_1h = await db.scalar(
        select(func.count(AIActivity.id)).where(AIActivity.created_at >= since_1h)
    ) or 0

    # ── Recent tasks ─────────────────────────────────────────────────────────
    open_tasks = await db.scalar(
        select(func.count(Task.id)).where(Task.status.in_(["todo", "in_progress"]))
    ) or 0
    ai_tasks_24h = await db.scalar(
        select(func.count(Task.id))
        .where(Task.ai_generated == True, Task.created_at >= since_24h)
    ) or 0

    # ── System Health (psutil) ────────────────────────────────────────────────
    system_health = {}
    try:
        import psutil
        cpu = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        system_health = {
            "cpu_percent": round(cpu, 1),
            "memory_percent": round(mem.percent, 1),
            "memory_used_gb": round(mem.used / 1024**3, 2),
            "memory_total_gb": round(mem.total / 1024**3, 2),
            "disk_percent": round(disk.percent, 1),
            "disk_used_gb": round(disk.used / 1024**3, 1),
            "disk_total_gb": round(disk.total / 1024**3, 1),
        }
    except Exception:
        system_health = {"error": "psutil unavailable"}

    # ── Celery Queue ─────────────────────────────────────────────────────────
    queue_stats = {"depth": 0, "workers": 0, "error": None}
    try:
        import redis as redis_lib
        from app.config import settings
        r = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
        queue_stats["depth"] = r.llen("celery") or 0
        r.close()
    except Exception as e:
        queue_stats["error"] = str(e)[:80]

    # ── Ollama Status ─────────────────────────────────────────────────────────
    ollama_status = {"running": False, "model": None}
    try:
        import httpx
        from app.config import settings
        resp = httpx.get(f"{settings.OLLAMA_HOST}/api/tags", timeout=2.0)
        if resp.status_code == 200:
            models = resp.json().get("models", [])
            ollama_status = {
                "running": True,
                "model": settings.OLLAMA_MODEL,
                "models_loaded": len(models),
                "model_names": [m["name"] for m in models[:5]],
            }
    except Exception:
        ollama_status = {"running": False, "model": None}

    # ── Health Score ─────────────────────────────────────────────────────────
    health_score = 100
    if system_health.get("cpu_percent", 0) > 80: health_score -= 20
    if system_health.get("memory_percent", 0) > 85: health_score -= 20
    if system_health.get("disk_percent", 0) > 90: health_score -= 15
    if not ollama_status["running"]: health_score -= 15
    if queue_stats["depth"] > 100: health_score -= 10
    if running_crawls > 10: health_score -= 5

    health_status = (
        "healthy" if health_score >= 80 else
        "degraded" if health_score >= 50 else
        "critical"
    )

    return {
        "timestamp": now.isoformat(),
        "health": {
            "score": max(0, health_score),
            "status": health_status,
            "system": system_health,
            "ollama": ollama_status,
            "queue": queue_stats,
        },
        "counts": {
            "clients": total_clients,
            "websites": total_websites,
            "keywords_tracked": total_keywords,
            "blog_ideas": total_blog_ideas,
            "backlink_opportunities": total_backlinks,
            "open_tasks": open_tasks,
            "ai_tasks_24h": ai_tasks_24h,
        },
        "crawls": {
            "running": running_crawls,
            "completed_24h": completed_crawls_24h,
            "total": total_crawls,
            "active_list": [
                {
                    "id": str(c.id),
                    "website_id": str(c.website_id),
                    "pages_crawled": c.pages_crawled or 0,
                    "status": c.status if isinstance(c.status, str) else c.status.value,
                    "started": c.created_at.isoformat() if c.created_at else None,
                }
                for c in running_crawl_list
            ],
        },
        "activity": {
            "count_last_1h": activity_1h,
            "feed": [
                {
                    "id": str(a.id),
                    "type": a.activity_type if isinstance(a.activity_type, str) else a.activity_type.value,
                    "level": a.level if isinstance(a.level, str) else a.level.value,
                    "agent": a.agent,
                    "message": a.message,
                    "website_domain": a.website_domain,
                    "client_name": a.client_name,
                    "is_milestone": a.is_milestone,
                    "created_at": a.created_at.isoformat() if a.created_at else None,
                }
                for a in activities
            ],
        },
    }


@router.get("/agents")
async def get_agent_status(current_user: User = Depends(get_current_user)):
    """
    Get live status of all AI agents.
    Delegates to the Orchestrator's AGENT_REGISTRY — single source of truth.
    """
    from app.api.orchestrator import AGENT_REGISTRY

    # Try Celery inspect for real active task data
    active_tasks: dict = {}
    try:
        from app.tasks.celery_app import celery
        inspect = celery.control.inspect(timeout=1.0)
        active_raw = inspect.active() or {}
        # Build a set of active task module names
        for worker_tasks in active_raw.values():
            for t in worker_tasks:
                name = t.get("name", "")
                prefix = name.rsplit(".", 1)[-1] if "." in name else name
                active_tasks[prefix] = True
    except Exception:
        pass

    # Map agent capabilities to Celery task names for live status
    TASK_ACTIVE_MAP = {
        "brain": ["check_new_seo_articles", "daily_deep_learning", "weekly_retrain"],
        "crawler": ["run_crawl_task", "schedule_due_crawls"],
        "alex": ["run_seo_audit"],
        "hunter": ["hourly_opportunity_scan", "daily_competitor_scan"],
        "content": ["daily_blog_ideas"],
        "backlink": ["daily_backlink_scan"],
        "aeo": ["weekly_ai_search_audit"],
        "reporting": ["daily_excel_reports", "generate_report_task"],
        "automation": ["run_health_check"],
    }

    # Color map for Mission Control display
    COLOR_MAP = {
        "brain": "indigo", "crawler": "blue", "alex": "red",
        "hunter": "orange", "content": "purple", "backlink": "orange",
        "aeo": "violet", "reporting": "yellow", "automation": "green",
    }

    agents = []
    for agent_id, config in AGENT_REGISTRY.items():
        # Check if any associated task is currently running
        tasks_for_agent = TASK_ACTIVE_MAP.get(agent_id, [])
        is_currently_running = any(t in active_tasks for t in tasks_for_agent)
        agents.append({
            "name": config["name"],
            "icon": config["icon"],
            "status": "running" if is_currently_running else "active",
            "color": COLOR_MAP.get(agent_id, "blue"),
            "description": config["description"],
            "schedule": config["schedule"],
            "capabilities": config["capabilities"],
            "queue": config["queue"],
        })

    return {
        "agents": agents,
        "total": len(agents),
        "active": len(agents),
        "running": sum(1 for a in agents if a["status"] == "running"),
    }
