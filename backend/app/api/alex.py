"""
Alex Brother API — Ranking Hunter endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/alex", tags=["alex-brother"])


@router.get("/scan/{website_id}")
async def run_scan(
    website_id: str,
    keywords: Optional[str] = Query(None, description="Comma-separated seed keywords"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Run a full Alex Brother scan — SERP analysis, keyword opportunities,
    AI search opportunities, trending topics from Brain knowledge.
    """
    from app.services.alex_brother import run_alex_brother_scan

    seed_kws = [k.strip() for k in keywords.split(",")] if keywords else None
    result = await run_alex_brother_scan(website_id, db, seed_kws)

    # Log activity
    try:
        from app.services.activity_logger import log_activity
        from app.models.activity import ActivityType, ActivityLevel
        from app.models.website import Website

        website = await db.scalar(select(Website).where(Website.id == website_id))
        total = result.get("total_opportunities", 0)
        if total > 0:
            await log_activity(
                db, ActivityType.serp_scanned, "Alex Brother",
                f"Scanned SERPs for {website.domain if website else 'website'} — found {total} opportunities",
                website_id=website_id,
                website_domain=website.domain if website else None,
                level=ActivityLevel.discovery,
                is_milestone=total >= 5,
                details={"opportunities": total},
            )
    except Exception:
        pass

    return result


@router.get("/serp")
async def scan_serp(
    keyword: str = Query(..., min_length=2),
    domain: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """Scan a single keyword on Google SERP."""
    from app.services.alex_brother import scan_serp_for_keyword
    return await scan_serp_for_keyword(keyword, domain or "")


@router.get("/keywords/{website_id}")
async def find_keywords(
    website_id: str,
    seed: str = Query(..., min_length=2, description="Seed keyword"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Find easy-to-rank keyword opportunities from a seed keyword."""
    from app.services.alex_brother import find_easy_keywords
    from app.models.website import Website

    website = await db.scalar(select(Website).where(Website.id == website_id))
    if not website:
        raise HTTPException(404, "Website not found")

    opportunities = await find_easy_keywords(seed, website.domain)
    return {
        "seed_keyword": seed,
        "domain": website.domain,
        "opportunities": opportunities,
        "count": len(opportunities),
    }


@router.get("/competitor")
async def analyze_competitor(
    domain: str = Query(..., min_length=3),
    our_domain: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """Scan a competitor domain for SEO weaknesses."""
    from app.services.alex_brother import scan_competitor_weaknesses
    return await scan_competitor_weaknesses(domain, our_domain or "")


@router.get("/ai-opportunities/{website_id}")
async def get_ai_opportunities(
    website_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get AI search optimization opportunities for a website."""
    from app.services.alex_brother import find_ai_search_opportunities
    from app.models.website import Website
    from app.models.ranking import KeywordRanking

    website = await db.scalar(select(Website).where(Website.id == website_id))
    if not website:
        raise HTTPException(404, "Website not found")

    kw_result = await db.execute(
        select(KeywordRanking.keyword)
        .where(KeywordRanking.website_id == website_id)
        .distinct()
        .limit(30)
    )
    keywords = [row[0] for row in kw_result]

    opportunities = await find_ai_search_opportunities(website.domain, keywords)
    return {
        "domain": website.domain,
        "keywords_analyzed": len(keywords),
        "opportunities": opportunities,
        "count": len(opportunities),
    }


@router.get("/trending")
async def get_trending(
    industry: str = Query("SEO"),
    current_user: User = Depends(get_current_user),
):
    """Get trending SEO topics from the Brain's learned knowledge."""
    from app.services.alex_brother import get_trending_seo_topics
    topics = await get_trending_seo_topics(industry)
    return {"industry": industry, "trending": topics, "count": len(topics)}
