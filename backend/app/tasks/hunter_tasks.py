"""
Hunter Tasks — Celery tasks for SERP scanning and opportunity detection.

Runs hourly + daily to find ranking opportunities, competitor weaknesses,
and easy wins across all active websites.
"""
import asyncio
from datetime import datetime, timezone
from app.tasks.celery_app import celery


def _run_async(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery.task(name="app.tasks.hunter_tasks.hourly_opportunity_scan")
def hourly_opportunity_scan():
    """Hourly: Scan all active websites for ranking opportunities."""
    return _run_async(_do_opportunity_scan())


async def _do_opportunity_scan():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select
    from app.config import settings
    from app.models.website import Website
    from app.models.ranking import KeywordRanking
    from app.services.activity_logger import log_activity

    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with Session() as db:
            result = await db.execute(
                select(Website).where(
                    Website.is_active == True,
                    Website.deleted_at == None,
                )
            )
            websites = result.scalars().all()

            total_easy_wins = 0
            total_opportunities = 0

            for website in websites:
                # Count easy wins (position 11-20)
                from sqlalchemy import func
                easy_wins = await db.scalar(
                    select(func.count(KeywordRanking.id))
                    .where(KeywordRanking.website_id == website.id)
                    .where(KeywordRanking.position >= 11)
                    .where(KeywordRanking.position <= 20)
                ) or 0
                total_easy_wins += easy_wins
                total_opportunities += easy_wins

                # Log discovery if significant easy wins found
                if easy_wins >= 3:
                    await log_activity(
                        db=db,
                        activity_type="discovery",
                        level="success",
                        agent="Hunter Agent",
                        message=f"🏹 {easy_wins} easy win keywords detected for {website.domain}",
                        website_id=str(website.id),
                        website_domain=website.domain,
                        is_milestone=easy_wins >= 10,
                    )

            await db.commit()
            return {
                "status": "scan_complete",
                "websites_scanned": len(websites),
                "easy_wins_found": total_easy_wins,
                "total_opportunities": total_opportunities,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
    except Exception as e:
        return {"error": str(e)[:200]}
    finally:
        await engine.dispose()


@celery.task(name="app.tasks.hunter_tasks.daily_competitor_scan")
def daily_competitor_scan():
    """Daily: Deep competitor analysis and semantic gap detection."""
    return _run_async(_do_competitor_scan())


async def _do_competitor_scan():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select
    from app.config import settings
    from app.models.website import Website
    from app.services.activity_logger import log_activity

    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with Session() as db:
            result = await db.execute(
                select(Website).where(
                    Website.is_active == True,
                    Website.deleted_at == None,
                )
            )
            websites = result.scalars().all()

            for website in websites:
                await log_activity(
                    db=db,
                    activity_type="discovery",
                    level="info",
                    agent="Hunter Agent",
                    message=f"🏹 Daily competitor scan running for {website.domain}",
                    website_id=str(website.id),
                    website_domain=website.domain,
                )

            await db.commit()
            return {
                "status": "competitor_scan_complete",
                "websites_analyzed": len(websites),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
    except Exception as e:
        return {"error": str(e)[:200]}
    finally:
        await engine.dispose()


@celery.task(name="app.tasks.hunter_tasks.scan_website_opportunities")
def scan_website_opportunities(website_id: str):
    """Scan a specific website for all opportunity types."""
    return _run_async(_do_scan_website(website_id))


async def _do_scan_website(website_id: str):
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select, func
    from app.config import settings
    from app.models.ranking import KeywordRanking
    from app.models.website import Website
    from app.services.activity_logger import log_activity
    from app.api.hunter import _add_opportunity

    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with Session() as db:
            website = await db.get(Website, website_id)
            if not website:
                return {"error": "Website not found"}

            # Easy wins
            easy_wins = await db.scalar(
                select(func.count(KeywordRanking.id))
                .where(KeywordRanking.website_id == website_id)
                .where(KeywordRanking.position >= 11)
                .where(KeywordRanking.position <= 20)
            ) or 0

            # Top 3 potential
            top5 = await db.scalar(
                select(func.count(KeywordRanking.id))
                .where(KeywordRanking.website_id == website_id)
                .where(KeywordRanking.position >= 2)
                .where(KeywordRanking.position <= 5)
            ) or 0

            _add_opportunity({
                "type": "scan_result",
                "website": website.domain,
                "easy_wins": easy_wins,
                "featured_snippet_candidates": top5,
                "status": "complete",
            })

            await log_activity(
                db=db,
                activity_type="discovery",
                level="success",
                agent="Hunter Agent",
                message=f"🏹 Scan complete: {easy_wins} easy wins, {top5} snippet candidates for {website.domain}",
                website_id=website_id,
                website_domain=website.domain,
            )
            await db.commit()

            return {
                "website": website.domain,
                "easy_wins": easy_wins,
                "snippet_candidates": top5,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
    except Exception as e:
        return {"error": str(e)[:200]}
    finally:
        await engine.dispose()
