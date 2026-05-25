"""
System Health API — AI Energy Core monitoring.
Tracks CPU, RAM, disk, queue pressure, AI model status.
"""
from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
@router.get("/")
async def health_root():
    """Basic liveness probe — no auth required."""
    return {"status": "ok", "version": "2.0.0", "mode": "autonomous"}


@router.get("/db")
async def health_db():
    """Database connectivity check — no auth required."""
    try:
        from app.database import engine
        from sqlalchemy import text
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"database": "ok", "status": "connected"}
    except Exception as exc:
        return {"database": "error", "status": "disconnected", "detail": str(exc)}


@router.get("/redis")
async def health_redis():
    """Redis connectivity check — no auth required."""
    try:
        import redis.asyncio as aioredis
        from app.config import settings
        r = aioredis.from_url(settings.REDIS_URL)
        pong = await r.ping()
        await r.aclose()
        return {"redis": "ok", "status": "connected", "ping": pong}
    except Exception as exc:
        return {"redis": "error", "status": "disconnected", "detail": str(exc)}


@router.get("/workers")
async def health_workers():
    """Celery worker ping — no auth required."""
    try:
        from app.tasks.celery_app import celery
        inspector = celery.control.inspect(timeout=3)
        ping_result = inspector.ping() or {}
        workers = list(ping_result.keys())
        return {
            "workers": len(workers),
            "worker_names": workers,
            "status": "ok" if workers else "no_workers",
        }
    except Exception as exc:
        return {"workers": 0, "status": "error", "detail": str(exc)}


@router.get("/system")
async def get_system_health(
    current_user: User = Depends(get_current_user),
):
    """Get full AI Energy Core health report."""
    from app.services.system_health import get_full_health_report
    return await get_full_health_report()


@router.get("/metrics")
async def get_metrics(
    current_user: User = Depends(get_current_user),
):
    """Get raw system metrics (CPU, RAM, disk)."""
    from app.services.system_health import get_system_metrics
    return get_system_metrics()


@router.get("/queue")
async def get_queue_stats(
    current_user: User = Depends(get_current_user),
):
    """Get Celery queue depth and Redis status."""
    from app.services.system_health import get_redis_queue_stats
    return get_redis_queue_stats()


@router.get("/ai-engine")
async def get_ai_engine_status(
    current_user: User = Depends(get_current_user),
):
    """Get Ollama AI engine status and loaded models."""
    from app.services.system_health import get_ollama_status
    return await get_ollama_status()


@router.get("/prometheus", response_class=PlainTextResponse, include_in_schema=False)
async def prometheus_metrics(
    token: str = Query(None, description="Optional scrape token"),
):
    """
    Prometheus-format metrics endpoint.
    Scraped by Prometheus every 15s. No auth by default (internal only).
    Protect with PROMETHEUS_SCRAPE_TOKEN env var if exposed externally.
    """
    from app.config import settings as _cfg
    from app.services.system_health import get_system_metrics, get_redis_queue_stats

    scrape_token = _cfg.PROMETHEUS_SCRAPE_TOKEN
    if scrape_token and token != scrape_token:
        return PlainTextResponse("# Unauthorized\n", status_code=403)

    metrics = get_system_metrics()
    queue = get_redis_queue_stats()

    lines: list[str] = []

    def gauge(name: str, value, help_text: str, labels: str = ""):
        lbl = f"{{{labels}}}" if labels else ""
        lines.append(f"# HELP seoos_{name} {help_text}")
        lines.append(f"# TYPE seoos_{name} gauge")
        lines.append(f"seoos_{name}{lbl} {value}")

    # ── System ───────────────────────────────────────────────────────
    # system_health.py returns ram_percent / ram_used_gb keys
    gauge("cpu_percent", metrics.get("cpu_percent", 0), "CPU usage percent")
    gauge("memory_percent",
          metrics.get("ram_percent") or metrics.get("memory_percent", 0),
          "RAM usage percent")
    gauge("memory_used_bytes",
          round((metrics.get("ram_used_gb") or metrics.get("memory_used_gb") or 0) * 1024**3),
          "RAM used in bytes")
    gauge("disk_percent", metrics.get("disk_percent", 0), "Disk usage percent")

    # ── Celery queue ─────────────────────────────────────────────────
    gauge("queue_depth", queue.get("depth", 0), "Celery queue depth (celery queue)")
    gauge("queue_workers", queue.get("workers", 0), "Active Celery worker processes")

    # ── DB counts (async, uses app's shared engine) ──────────────────
    try:
        from app.database import get_db as _get_db
        from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
        from sqlalchemy import select, func
        from app.config import settings as cfg
        from app.models.client import Client
        from app.models.website import Website
        from app.models.crawl import Crawl, CrawlStatus

        engine = create_async_engine(cfg.DATABASE_URL, pool_size=1, max_overflow=0)
        Sess = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

        async with Sess() as db:
            clients_n = await db.scalar(select(func.count(Client.id))) or 0
            websites_n = await db.scalar(
                select(func.count(Website.id)).where(Website.deleted_at == None)
            ) or 0
            running_crawls = await db.scalar(
                select(func.count(Crawl.id)).where(Crawl.status == CrawlStatus.running)
            ) or 0

        await engine.dispose()

        gauge("clients_total", clients_n, "Total clients in system")
        gauge("websites_total", websites_n, "Total active websites")
        gauge("crawls_running", running_crawls, "Currently running crawls")
    except Exception:
        pass

    lines.append("")  # trailing newline
    return "\n".join(lines)
