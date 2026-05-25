"""
AI Energy Core — System health monitoring for SEO OS.

Tracks:
- CPU / RAM / Disk usage
- Crawler load
- Database connection pool
- Redis / Celery queue pressure
- AI processing load (Ollama)
- Vector memory status
"""
import os
import asyncio
import httpx
from datetime import datetime, timezone
from typing import Optional

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")


def get_system_metrics() -> dict:
    """Collect CPU, RAM, disk metrics via psutil."""
    if not HAS_PSUTIL:
        return {
            "cpu_percent": 0,
            "ram_percent": 0,
            "ram_used_gb": 0,
            "ram_total_gb": 0,
            "disk_percent": 0,
            "disk_used_gb": 0,
            "disk_total_gb": 0,
            "available": False,
        }

    cpu = psutil.cpu_percent(interval=0.1)
    ram = psutil.virtual_memory()
    disk = psutil.disk_usage("/")

    return {
        "cpu_percent": round(cpu, 1),
        "ram_percent": round(ram.percent, 1),
        "ram_used_gb": round(ram.used / 1024**3, 2),
        "ram_total_gb": round(ram.total / 1024**3, 2),
        "disk_percent": round(disk.percent, 1),
        "disk_used_gb": round(disk.used / 1024**3, 1),
        "disk_total_gb": round(disk.total / 1024**3, 1),
        "available": True,
    }


def get_redis_queue_stats() -> dict:
    """Check Celery queue depth via Redis."""
    try:
        import redis
        r = redis.from_url(REDIS_URL, socket_connect_timeout=2)
        r.ping()

        # Celery default queue
        celery_len = r.llen("celery") or 0

        # Check brain queue if exists
        brain_len = r.llen("brain") or 0

        return {
            "status": "connected",
            "celery_queue": celery_len,
            "brain_queue": brain_len,
            "total_queued": celery_len + brain_len,
            "pressure": "high" if celery_len > 20 else "medium" if celery_len > 5 else "normal",
        }
    except Exception as e:
        return {"status": "error", "error": str(e), "total_queued": 0, "pressure": "unknown"}


async def get_ollama_status() -> dict:
    """Check Ollama AI processing load."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            if resp.status_code == 200:
                models = resp.json().get("models", [])
                return {
                    "status": "running",
                    "models_loaded": len(models),
                    "models": [m["name"] for m in models[:5]],
                    "has_embed_model": any("nomic-embed" in m["name"] for m in models),
                    "has_llm": any("llama" in m["name"] or "deepseek" in m["name"] or "qwen" in m["name"] for m in models),
                }
    except Exception:
        pass
    return {"status": "offline", "models_loaded": 0}


def get_qdrant_storage_stats() -> dict:
    """Check Qdrant vector memory storage."""
    try:
        from app.services.vector_memory import get_collection_stats
        stats = get_collection_stats()
        return {
            "status": "green",
            "vectors": stats.get("total_vectors", 0),
            "dim": stats.get("dim", 768),
        }
    except Exception as e:
        return {"status": "error", "error": str(e), "vectors": 0}


def get_workspace_stats() -> dict:
    """Check client workspace disk usage."""
    try:
        from pathlib import Path
        base = Path(os.environ.get("SEO_OS_DATA_DIR", "/tmp/seo-os"))
        if not base.exists():
            return {"total_mb": 0, "clients": 0}

        total_bytes = sum(f.stat().st_size for f in base.rglob("*") if f.is_file())
        clients_dir = base / "clients"
        client_count = len(list(clients_dir.iterdir())) if clients_dir.exists() else 0

        return {
            "total_mb": round(total_bytes / 1024 / 1024, 1),
            "clients": client_count,
            "base_path": str(base),
        }
    except Exception as e:
        return {"total_mb": 0, "clients": 0, "error": str(e)}


async def get_full_health_report() -> dict:
    """Collect all system health metrics in one call."""
    sys_metrics = get_system_metrics()
    redis_stats = get_redis_queue_stats()
    ollama = await get_ollama_status()
    qdrant = get_qdrant_storage_stats()
    workspace = get_workspace_stats()

    # Overall health score (0-100)
    score = 100
    if sys_metrics.get("cpu_percent", 0) > 80:
        score -= 20
    elif sys_metrics.get("cpu_percent", 0) > 60:
        score -= 10
    if sys_metrics.get("ram_percent", 0) > 85:
        score -= 20
    elif sys_metrics.get("ram_percent", 0) > 70:
        score -= 10
    if redis_stats.get("pressure") == "high":
        score -= 15
    if ollama.get("status") != "running":
        score -= 15
    if qdrant.get("status") != "green":
        score -= 10
    score = max(0, score)

    # AI food system messages (contextual status messages)
    messages = []
    if sys_metrics.get("ram_percent", 0) > 80:
        messages.append("AI requires more memory — RAM usage high")
    if redis_stats.get("total_queued", 0) > 10:
        messages.append("Crawler system under load — queue building up")
    if sys_metrics.get("disk_percent", 0) > 85:
        messages.append("Storage nearing limit — consider cleanup")
    if ollama.get("status") == "running" and ollama.get("models_loaded", 0) > 0:
        messages.append("Semantic engine processing — AI models active")
    if redis_stats.get("total_queued", 0) > 0:
        messages.append("Ranking hunter active — tasks in queue")
    if qdrant.get("vectors", 0) > 0:
        messages.append(f"AI learning actively — {qdrant['vectors']} knowledge vectors indexed")

    return {
        "health_score": score,
        "status": "healthy" if score >= 70 else "degraded" if score >= 40 else "critical",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "system": sys_metrics,
        "redis_queue": redis_stats,
        "ai_engine": ollama,
        "vector_memory": qdrant,
        "workspace": workspace,
        "ai_food_messages": messages,
        "alerts": [
            msg for msg in [
                "High CPU usage detected" if sys_metrics.get("cpu_percent", 0) > 80 else None,
                "RAM pressure — consider restart" if sys_metrics.get("ram_percent", 0) > 90 else None,
                "Ollama offline — AI processing halted" if ollama.get("status") != "running" else None,
                "Redis disconnected — task queue unavailable" if redis_stats.get("status") != "connected" else None,
            ]
            if msg
        ],
    }
