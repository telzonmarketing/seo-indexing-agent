"""
Rankings API — Keyword rank tracking, GSC data, position history.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.ranking import KeywordRanking
from app.models.website import Website

router = APIRouter(prefix="/rankings", tags=["rankings"])


class KeywordAdd(BaseModel):
    website_id: str
    keywords: List[str]
    source: str = "manual"


class RankingUpdate(BaseModel):
    position: float
    previous_position: Optional[float] = None
    clicks: Optional[int] = None
    impressions: Optional[int] = None
    ctr: Optional[float] = None


@router.get("")
async def list_rankings(
    website_id: Optional[str] = None,
    keyword: Optional[str] = None,
    tracked_only: bool = False,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List keyword rankings, optionally filtered by website or keyword."""
    q = select(KeywordRanking).order_by(KeywordRanking.recorded_at.desc())

    if website_id:
        q = q.where(KeywordRanking.website_id == website_id)
    if keyword:
        q = q.where(KeywordRanking.keyword.ilike(f"%{keyword}%"))
    if tracked_only:
        q = q.where(KeywordRanking.is_tracked == True)

    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    result = await db.execute(q.limit(limit).offset(offset))
    rankings = result.scalars().all()

    return {
        "total": total or 0,
        "rankings": [_serialize(r) for r in rankings],
    }


@router.post("/track", status_code=201)
async def add_keywords_to_track(
    data: KeywordAdd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add keywords to track for a website."""
    website = await db.scalar(select(Website).where(Website.id == data.website_id))
    if not website:
        raise HTTPException(404, "Website not found")

    added = []
    for kw in data.keywords[:50]:  # max 50 per request
        kw = kw.strip()
        if not kw:
            continue
        # Check if already exists
        existing = await db.scalar(
            select(KeywordRanking)
            .where(KeywordRanking.website_id == data.website_id, KeywordRanking.keyword == kw)
        )
        if not existing:
            entry = KeywordRanking(
                website_id=data.website_id,
                keyword=kw,
                source=data.source,
                is_tracked=True,
                position=None,
            )
            db.add(entry)
            added.append(kw)

    await db.commit()
    return {"added": len(added), "keywords": added, "website_id": data.website_id}


@router.patch("/{ranking_id}")
async def update_ranking(
    ranking_id: str,
    data: RankingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update position for a keyword ranking."""
    ranking = await db.scalar(select(KeywordRanking).where(KeywordRanking.id == ranking_id))
    if not ranking:
        raise HTTPException(404, "Ranking not found")

    # Shift current → previous
    if data.position is not None and ranking.position:
        ranking.previous_position = ranking.position
    if data.position is not None:
        ranking.position = data.position
    if data.clicks is not None:
        ranking.clicks = data.clicks
    if data.impressions is not None:
        ranking.impressions = data.impressions
    if data.ctr is not None:
        ranking.ctr = data.ctr
    ranking.recorded_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(ranking)
    return _serialize(ranking)


@router.delete("/{ranking_id}")
async def delete_ranking(
    ranking_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a keyword from tracking."""
    ranking = await db.scalar(select(KeywordRanking).where(KeywordRanking.id == ranking_id))
    if not ranking:
        raise HTTPException(404, "Ranking not found")
    await db.delete(ranking)
    await db.commit()
    return {"deleted": True}


@router.get("/summary/{website_id}")
async def get_ranking_summary(
    website_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get ranking overview stats for a website."""
    website = await db.scalar(select(Website).where(Website.id == website_id))
    if not website:
        raise HTTPException(404, "Website not found")

    result = await db.execute(
        select(KeywordRanking).where(KeywordRanking.website_id == website_id)
    )
    rankings = result.scalars().all()

    top3 = [r for r in rankings if r.position and r.position <= 3]
    top10 = [r for r in rankings if r.position and r.position <= 10]
    improved = [r for r in rankings if r.position and r.previous_position and r.position < r.previous_position]
    declined = [r for r in rankings if r.position and r.previous_position and r.position > r.previous_position]

    avg_pos = sum(r.position for r in rankings if r.position) / max(len([r for r in rankings if r.position]), 1)
    total_clicks = sum(r.clicks or 0 for r in rankings)
    total_impressions = sum(r.impressions or 0 for r in rankings)

    return {
        "website_id": website_id,
        "domain": website.domain,
        "total_keywords": len(rankings),
        "tracked": len([r for r in rankings if r.is_tracked]),
        "top_3": len(top3),
        "top_10": len(top10),
        "improved": len(improved),
        "declined": len(declined),
        "avg_position": round(avg_pos, 1) if rankings else None,
        "total_clicks": total_clicks,
        "total_impressions": total_impressions,
        "top_keywords": sorted(
            [r for r in rankings if r.position],
            key=lambda r: r.position
        )[:10],
    }


@router.post("/seed/{website_id}")
async def seed_demo_rankings(
    website_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Seed demo keyword rankings for testing."""
    website = await db.scalar(select(Website).where(Website.id == website_id))
    if not website:
        raise HTTPException(404, "Website not found")

    import random
    demo_keywords = [
        ("seo audit tool", 4, 6),
        ("technical seo checklist", 7, 9),
        ("best seo software 2025", 12, 15),
        ("ai seo tools", 3, 5),
        ("seo automation software", 8, 11),
        ("keyword rank tracker", 15, 18),
        ("website crawl tool", 6, 8),
        ("seo reporting tool", 9, 12),
        ("backlink checker free", 22, 25),
        ("seo health check", 5, 7),
    ]

    added = 0
    for kw, pos, prev_pos in demo_keywords:
        existing = await db.scalar(
            select(KeywordRanking)
            .where(KeywordRanking.website_id == website_id, KeywordRanking.keyword == kw)
        )
        if not existing:
            entry = KeywordRanking(
                website_id=website_id,
                keyword=kw,
                position=float(pos),
                previous_position=float(prev_pos),
                clicks=random.randint(10, 500),
                impressions=random.randint(100, 5000),
                ctr=round(random.uniform(0.01, 0.15), 3),
                is_tracked=True,
                source="demo",
            )
            db.add(entry)
            added += 1

    await db.commit()
    return {"seeded": added, "website_id": website_id, "domain": website.domain}


@router.get("/cannibalization/{website_id}")
async def detect_keyword_cannibalization(
    website_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Detect keyword cannibalization — multiple pages competing for the same keyword.
    Uses tracked keywords and page URLs from rankings data.
    Groups keywords by semantic similarity and finds overlap.
    """
    website = await db.scalar(select(Website).where(Website.id == website_id))
    if not website:
        raise HTTPException(404, "Website not found")

    result = await db.execute(
        select(KeywordRanking)
        .where(KeywordRanking.website_id == website_id, KeywordRanking.page_url.isnot(None))
        .order_by(KeywordRanking.keyword)
    )
    rankings = result.scalars().all()

    if not rankings:
        return {
            "website_id": website_id,
            "domain": website.domain,
            "cannibalization_groups": [],
            "total_conflicts": 0,
            "message": "No rankings with page URLs tracked yet. Add rankings with page URLs to detect cannibalization.",
        }

    # Group keywords by page URL
    page_keywords: dict[str, list] = {}
    for r in rankings:
        url = r.page_url or ""
        if url not in page_keywords:
            page_keywords[url] = []
        page_keywords[url].append(r)

    # Find keyword stem overlaps (simple but effective)
    cannibalization_groups = []

    # Group by keyword stems — find keywords where root words overlap across different pages
    from collections import defaultdict
    stem_groups: dict[str, list] = defaultdict(list)

    for r in rankings:
        # Extract stem words (2+ chars)
        words = [w.lower() for w in (r.keyword or "").split() if len(w) >= 3]
        for word in words:
            stem_groups[word].append(r)

    # Find words that appear in multiple different pages
    seen_conflicts = set()
    for word, entries in stem_groups.items():
        if len(entries) < 2:
            continue
        unique_pages = list({e.page_url for e in entries if e.page_url})
        if len(unique_pages) < 2:
            continue

        conflict_key = frozenset(unique_pages)
        if conflict_key in seen_conflicts:
            continue
        seen_conflicts.add(conflict_key)

        affected_keywords = list({e.keyword for e in entries})
        severity = "high" if len(unique_pages) >= 3 else "medium" if len(unique_pages) == 2 else "low"

        cannibalization_groups.append({
            "trigger_word": word,
            "conflicting_pages": unique_pages,
            "affected_keywords": affected_keywords[:10],
            "page_count": len(unique_pages),
            "keyword_count": len(affected_keywords),
            "severity": severity,
            "impact": "Multiple pages competing for the same search intent — Google may not know which to rank",
            "fix": "Consolidate content into one authoritative page or differentiate the search intent",
        })

    # Sort by severity and page_count
    severity_order = {"high": 0, "medium": 1, "low": 2}
    cannibalization_groups.sort(key=lambda g: (severity_order.get(g["severity"], 3), -g["page_count"]))

    total_high = len([g for g in cannibalization_groups if g["severity"] == "high"])
    total_medium = len([g for g in cannibalization_groups if g["severity"] == "medium"])

    return {
        "website_id": website_id,
        "domain": website.domain,
        "cannibalization_groups": cannibalization_groups[:20],
        "total_conflicts": len(cannibalization_groups),
        "total_high": total_high,
        "total_medium": total_medium,
        "pages_analyzed": len(page_keywords),
        "keywords_analyzed": len(rankings),
        "recommendation": "Focus on fixing high-severity conflicts first — they're hurting rankings the most",
    }


@router.get("/wins/{website_id}")
async def get_daily_seo_wins(
    website_id: str,
    limit: int = Query(10, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Daily SEO Wins Feed — keywords that improved in ranking position.
    Shows the best positive changes for a website.
    """
    website = await db.scalar(select(Website).where(Website.id == website_id))
    if not website:
        raise HTTPException(404, "Website not found")

    result = await db.execute(
        select(KeywordRanking)
        .where(
            KeywordRanking.website_id == website_id,
            KeywordRanking.position.isnot(None),
            KeywordRanking.previous_position.isnot(None),
        )
        .order_by(
            (KeywordRanking.previous_position - KeywordRanking.position).desc()
        )
        .limit(limit)
    )
    rankings = result.scalars().all()

    wins = []
    for r in rankings:
        if not r.position or not r.previous_position:
            continue
        change = r.previous_position - r.position
        if change <= 0:
            continue  # only improvements

        milestone = None
        if r.position <= 3 and r.previous_position > 3:
            milestone = "Entered Top 3! 🏆"
        elif r.position <= 10 and r.previous_position > 10:
            milestone = "Entered Top 10! 🎯"
        elif r.position <= 20 and r.previous_position > 20:
            milestone = "Entered Top 20!"
        elif change >= 10:
            milestone = f"Jumped {round(change)} spots! 🚀"

        wins.append({
            "keyword": r.keyword,
            "position": r.position,
            "previous_position": r.previous_position,
            "improvement": round(change, 1),
            "page_url": r.page_url,
            "clicks": r.clicks or 0,
            "milestone": milestone,
        })

    return {
        "website_id": website_id,
        "domain": website.domain,
        "wins": wins,
        "total_wins": len(wins),
        "big_movers": [w for w in wins if w["improvement"] >= 5],
    }


def _serialize(r: KeywordRanking) -> dict:
    change = None
    if r.position and r.previous_position:
        change = round(r.previous_position - r.position, 1)  # positive = improved

    return {
        "id": str(r.id),
        "website_id": str(r.website_id),
        "keyword": r.keyword,
        "page_url": r.page_url,
        "position": r.position,
        "previous_position": r.previous_position,
        "position_change": change,
        "trend": "up" if change and change > 0 else "down" if change and change < 0 else "same",
        "clicks": r.clicks or 0,
        "impressions": r.impressions or 0,
        "ctr": round((r.ctr or 0) * 100, 2),
        "is_tracked": r.is_tracked,
        "source": r.source,
        "recorded_at": r.recorded_at.isoformat() if r.recorded_at else None,
    }
