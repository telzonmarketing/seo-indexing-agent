"""
Self-Healing Tasks — Celery tasks for autonomous system recovery.

Runs every 5 minutes via Celery Beat.
Checks for: stalled crawls, queue overflow, Ollama health, DB health, Redis.
"""
import asyncio
from app.tasks.celery_app import celery


def _run_async(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery.task(name="app.tasks.healing_tasks.run_health_check")
def run_health_check():
    """Run all self-healing checks and auto-recover where possible."""
    return _run_async(_do_health_check())


async def _do_health_check():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from app.config import settings
    from app.services.self_healing import healing_engine

    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with Session() as db:
            result = await healing_engine.run_full_check(db)

            # If critical issues found, log to activity
            if result.get("critical_issues", 0) > 0:
                from app.services.activity_logger import log_activity
                critical_items = [
                    e for e in healing_engine.recovery_log[:5]
                    if e.get("severity") == "critical"
                ]
                for item in critical_items[:2]:  # log top 2 critical issues
                    await log_activity(
                        db=db,
                        activity_type="alert",
                        level="warning",
                        agent="Self-Healing Engine",
                        message=f"⚠️ {item['system'].upper()}: {item['issue']} — {item['action']}",
                        is_milestone=False,
                    )
                await db.commit()

            return result
    except Exception as e:
        return {"error": str(e)[:200], "status": "check_failed"}
    finally:
        await engine.dispose()


@celery.task(name="app.tasks.healing_tasks.recover_stalled_crawls")
def recover_stalled_crawls():
    """Manually trigger stalled crawl recovery."""
    return _run_async(_do_recover_crawls())


async def _do_recover_crawls():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from app.config import settings
    from app.services.self_healing import healing_engine

    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with Session() as db:
            result = await healing_engine.check_stalled_crawls(db)
            return result
    finally:
        await engine.dispose()
