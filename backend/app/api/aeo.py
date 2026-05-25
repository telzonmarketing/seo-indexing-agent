"""
AEO API — Answer Engine Optimization endpoints.
- llms.txt generation
- AI visibility scanning
- FAQ schema generation
- AEO audit
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/aeo", tags=["aeo"])


@router.get("/audit/{website_id}")
async def run_aeo_audit(
    website_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Full AEO audit — AI visibility, llms.txt, FAQ schema, recommendations.
    Runs live scan against the actual website.
    """
    from app.services.aeo_engine import run_aeo_audit
    return await run_aeo_audit(website_id, db)


@router.get("/visibility/{website_id}")
async def check_ai_visibility(
    website_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check AI visibility signals for a website."""
    from app.services.aeo_engine import check_chatgpt_visibility
    from app.models.website import Website

    website = await db.scalar(select(Website).where(Website.id == website_id))
    if not website:
        raise HTTPException(404, "Website not found")

    return await check_chatgpt_visibility(website.domain)


@router.get("/llms-txt/{website_id}")
async def get_llms_txt(
    website_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate an llms.txt file for a website."""
    from app.services.aeo_engine import generate_llms_txt_from_crawl
    from app.models.website import Website
    from fastapi.responses import PlainTextResponse

    website = await db.scalar(select(Website).where(Website.id == website_id))
    if not website:
        raise HTTPException(404, "Website not found")

    content = await generate_llms_txt_from_crawl(website.domain, db)
    if not content:
        raise HTTPException(404, "No crawl data available — crawl the website first")

    return {
        "website_id": website_id,
        "domain": website.domain,
        "llms_txt": content,
        "file_path": f"/llms.txt",
        "note": "Save this content to the root of your website as /llms.txt",
    }


@router.post("/faq-schema")
async def generate_faq_schema(
    url: str = Query(...),
    title: str = Query(...),
    content: str = Query(..., min_length=100),
    current_user: User = Depends(get_current_user),
):
    """Generate FAQ schema markup for a specific page."""
    from app.services.aeo_engine import generate_faq_schema
    schema = await generate_faq_schema(url, content, title)
    if not schema:
        raise HTTPException(500, "Could not generate FAQ schema — check Ollama is running")
    return {"url": url, "schema": schema}


@router.get("/opportunities/{website_id}")
async def get_ai_search_opportunities(
    website_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get AI search optimization opportunities for a website."""
    from app.services.aeo_engine import get_ai_search_opportunities
    from app.models.website import Website
    from app.models.ranking import KeywordRanking
    from sqlalchemy import select

    website = await db.scalar(select(Website).where(Website.id == website_id))
    if not website:
        raise HTTPException(404, "Website not found")

    # Get tracked keywords
    kw_result = await db.execute(
        select(KeywordRanking.keyword)
        .where(KeywordRanking.website_id == website_id)
        .distinct()
        .limit(50)
    )
    keywords = [row[0] for row in kw_result]

    opportunities = await get_ai_search_opportunities(website.domain, keywords)

    return {
        "website_id": website_id,
        "domain": website.domain,
        "keywords_analyzed": len(keywords),
        "opportunities": opportunities,
        "count": len(opportunities),
    }


@router.get("/score/{website_id}")
async def get_aeo_score(
    website_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get current AEO score for a website (from DB — no live scan)."""
    from app.models.website import Website

    website = await db.scalar(select(Website).where(Website.id == website_id))
    if not website:
        raise HTTPException(404, "Website not found")

    score = website.aeo_score or 0
    return {
        "website_id": website_id,
        "domain": website.domain,
        "aeo_score": score,
        "grade": "A" if score >= 80 else "B" if score >= 60 else "C" if score >= 40 else "D",
        "tip": "Run /aeo/audit/{id} for a full live scan",
    }
