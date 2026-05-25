"""
Alex Brother — Ranking Hunter
24/7 SERP scanner, competitor weakness detector, AI opportunity finder.

Tasks:
- Scan Google SERPs
- Find AI overview opportunities
- Detect featured snippet gaps
- Find People Also Ask opportunities
- Discover competitor weaknesses
- Detect easy-to-rank keywords
- Find local ranking opportunities
- Identify AI search opportunities
"""
import asyncio
import httpx
import json
import os
import re
from typing import Optional
from datetime import datetime, timezone
from urllib.parse import quote_plus, urlencode

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
LLM_MODEL = "llama3.2:3b"

SERP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}


# ─── SERP Scanning ───────────────────────────────────────────────────────────

async def scan_serp_for_keyword(keyword: str, domain: str = "") -> dict:
    """
    Scan Google SERP for a keyword — check rankings, features, competition.
    Returns SERP features, top domains, and ranking opportunities.
    """
    try:
        # Use DuckDuckGo HTML search (no API key needed)
        encoded = quote_plus(keyword)
        url = f"https://html.duckduckgo.com/html/?q={encoded}"

        async with httpx.AsyncClient(timeout=15.0, headers=SERP_HEADERS, follow_redirects=True) as client:
            resp = await client.get(url)

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(resp.text, "lxml")

        results = []
        for result in soup.select(".result")[:10]:
            title_el = result.select_one(".result__title a")
            url_el = result.select_one(".result__url")
            snippet_el = result.select_one(".result__snippet")

            if title_el:
                result_url = title_el.get("href", "")
                results.append({
                    "title": title_el.get_text(strip=True),
                    "url": result_url,
                    "snippet": snippet_el.get_text(strip=True) if snippet_el else "",
                    "domain": _extract_domain(result_url),
                })

        # Check if our domain is already ranking
        our_position = None
        if domain:
            for i, r in enumerate(results, 1):
                if domain.lower() in r.get("domain", "").lower():
                    our_position = i
                    break

        # Analyze top domains for competition level
        top_domains = [r.get("domain", "") for r in results[:5]]
        strong_competition = any(
            d in top_domains
            for d in ["wikipedia.org", "amazon.com", "reddit.com", "youtube.com", "forbes.com"]
        )

        return {
            "keyword": keyword,
            "results_count": len(results),
            "top_results": results[:5],
            "top_domains": top_domains,
            "our_position": our_position,
            "our_ranking": our_position is not None,
            "competition_level": "high" if strong_competition else "medium",
            "easy_win": not strong_competition and len(results) < 8,
        }

    except Exception as e:
        return {
            "keyword": keyword,
            "error": str(e),
            "results_count": 0,
            "top_results": [],
        }


def _extract_domain(url: str) -> str:
    """Extract domain from URL."""
    try:
        import tldextract
        ext = tldextract.extract(url)
        return f"{ext.domain}.{ext.suffix}" if ext.domain else url
    except Exception:
        return url.split("/")[2] if "/" in url else url


# ─── Keyword Opportunity Scanner ─────────────────────────────────────────────

async def find_easy_keywords(
    seed_keyword: str,
    domain: str = "",
    industry: str = "",
) -> list[dict]:
    """
    Use AI to generate related keywords, then scan SERPs to find easy wins.
    """
    # Generate keyword variations with Ollama
    prompt = f"""Generate 10 specific, long-tail keyword variations for the topic: "{seed_keyword}"
Industry: {industry or 'general'}

Focus on:
- Question keywords (how, what, why, when)
- Comparison keywords (vs, compare, best)
- Location-specific if relevant
- Informational intent keywords
- Low-competition long-tail phrases

Return ONLY a JSON array of keyword strings, no other text:
["keyword 1", "keyword 2", ...]"""

    keywords = [seed_keyword]  # always include the seed

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={"model": LLM_MODEL, "prompt": prompt, "stream": False},
            )
            if resp.status_code == 200:
                raw = resp.json().get("response", "")
                start = raw.find("[")
                end = raw.rfind("]") + 1
                if start >= 0 and end > start:
                    extras = json.loads(raw[start:end])
                    keywords.extend([k for k in extras if isinstance(k, str) and k])
    except Exception as e:
        print(f"Keyword generation error: {e}")

    # Scan top 5 keywords (to avoid rate limits)
    opportunities = []
    for kw in keywords[:5]:
        serp = await scan_serp_for_keyword(kw, domain)
        if serp.get("easy_win") or not serp.get("our_ranking"):
            opportunities.append({
                "keyword": kw,
                "opportunity_type": "easy_win" if serp.get("easy_win") else "not_ranking",
                "our_position": serp.get("our_position"),
                "competition": serp.get("competition_level", "unknown"),
                "top_competitors": serp.get("top_domains", [])[:3],
                "action": _get_action(serp),
                "priority": "high" if serp.get("easy_win") else "medium",
            })
        await asyncio.sleep(1)  # polite rate limiting

    return opportunities


def _get_action(serp: dict) -> str:
    if serp.get("easy_win"):
        return f"Create content targeting '{serp['keyword']}' — low competition, quick win"
    if not serp.get("our_ranking"):
        return f"Create or optimize content for '{serp['keyword']}'"
    pos = serp.get("our_position")
    if pos and pos > 5:
        return f"Optimize existing content to move from #{pos} to top 3"
    return "Monitor and maintain current ranking"


# ─── Competitor Weakness Scanner ─────────────────────────────────────────────

async def scan_competitor_weaknesses(
    competitor_domain: str,
    our_domain: str = "",
) -> dict:
    """
    Analyze a competitor domain to find content gaps and SEO weaknesses.
    """
    findings = {
        "competitor": competitor_domain,
        "weaknesses": [],
        "opportunities": [],
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        async with httpx.AsyncClient(timeout=15.0, headers=SERP_HEADERS, follow_redirects=True) as client:
            resp = await client.get(f"https://{competitor_domain}")
            content = resp.text

            from bs4 import BeautifulSoup
            soup = BeautifulSoup(content, "lxml")

            # Check for common SEO weaknesses
            meta_desc = soup.find("meta", {"name": "description"})
            h1_tags = soup.find_all("h1")
            faq_schema = '"FAQPage"' in content
            json_ld = '"@context"' in content
            img_alts = [img for img in soup.find_all("img") if not img.get("alt")]
            llms_txt = False

            # Check llms.txt
            try:
                llms_resp = await client.get(f"https://{competitor_domain}/llms.txt", timeout=5.0)
                llms_txt = llms_resp.status_code == 200
            except Exception:
                pass

            if not meta_desc or not meta_desc.get("content"):
                findings["weaknesses"].append({
                    "issue": "Missing or empty meta description",
                    "opportunity": "Your pages with strong meta descriptions will stand out in SERPs",
                    "priority": "medium",
                })
            if len(h1_tags) != 1:
                findings["weaknesses"].append({
                    "issue": f"H1 issues: {len(h1_tags)} H1 tags found (should be 1)",
                    "opportunity": "Use single, keyword-rich H1 tags for better CTR",
                    "priority": "medium",
                })
            if not faq_schema:
                findings["weaknesses"].append({
                    "issue": "No FAQ schema — missing featured snippet opportunities",
                    "opportunity": "Add FAQ schema to compete for AI search answers",
                    "priority": "high",
                })
            if not json_ld:
                findings["weaknesses"].append({
                    "issue": "No structured data (JSON-LD)",
                    "opportunity": "Add Organization, Article, FAQ schema for AI visibility",
                    "priority": "high",
                })
            if not llms_txt:
                findings["weaknesses"].append({
                    "issue": "No /llms.txt file",
                    "opportunity": "Create llms.txt to gain advantage in AI search systems",
                    "priority": "high",
                })
            if len(img_alts) > 3:
                findings["weaknesses"].append({
                    "issue": f"{len(img_alts)} images missing alt text",
                    "opportunity": "Proper alt text improves accessibility and image search ranking",
                    "priority": "low",
                })

    except Exception as e:
        findings["error"] = str(e)

    return findings


# ─── AI Search Opportunity Scanner ───────────────────────────────────────────

async def find_ai_search_opportunities(
    domain: str,
    keywords: list[str],
) -> list[dict]:
    """Find specific AI search optimization opportunities for a domain."""
    opportunities = []

    question_prefixes = ["how to", "what is", "why does", "when should", "which is better", "can you", "does", "is there"]

    for kw in keywords[:15]:
        kw_lower = kw.lower().strip()

        # Question-format keywords → ideal for AI overview / featured snippets
        if any(kw_lower.startswith(p) for p in question_prefixes):
            opportunities.append({
                "type": "ai_overview_candidate",
                "keyword": kw,
                "action": f"Create a comprehensive, direct-answer page for: '{kw}'",
                "ai_platforms": ["Google AI Overview", "ChatGPT", "Perplexity"],
                "schema_recommendation": "FAQPage + HowTo schema",
                "priority": "high",
            })

        # Comparison keywords → Gemini/Perplexity specialize in these
        elif any(word in kw_lower for word in [" vs ", " versus ", "compare ", "best ", "top "]):
            opportunities.append({
                "type": "comparison_content",
                "keyword": kw,
                "action": f"Create comparison content with structured pros/cons for: '{kw}'",
                "ai_platforms": ["Perplexity", "Bing AI", "Gemini"],
                "schema_recommendation": "Article + Table schema",
                "priority": "medium",
            })

        # Definition/explanation keywords → good for encyclopedia-style AI answers
        elif any(word in kw_lower for word in ["definition", "meaning", "explained", "guide", "tutorial"]):
            opportunities.append({
                "type": "definition_content",
                "keyword": kw,
                "action": f"Create authoritative, definition-style content for: '{kw}'",
                "ai_platforms": ["ChatGPT", "Google AI Overview", "Gemini"],
                "schema_recommendation": "DefinedTerm + Article schema",
                "priority": "medium",
            })

    return opportunities[:10]


# ─── Trending Topic Scanner ───────────────────────────────────────────────────

async def get_trending_seo_topics(industry: str = "SEO") -> list[dict]:
    """
    Use the Brain's knowledge base to surface trending topics.
    """
    try:
        from app.services.vector_memory import search_knowledge
        results = await search_knowledge(
            f"trending {industry} topics 2025 algorithm updates",
            limit=8,
        )
        trends = []
        for r in results:
            if r.get("score", 0) > 0.4:
                trends.append({
                    "topic": r.get("text", "")[:100],
                    "source": r.get("source", ""),
                    "relevance": round(r.get("score", 0), 2),
                    "category": r.get("category", ""),
                })
        return trends
    except Exception:
        return []


# ─── Master Alex Brother Scan ─────────────────────────────────────────────────

async def run_alex_brother_scan(
    website_id: str,
    db,
    seed_keywords: Optional[list[str]] = None,
) -> dict:
    """
    Full Alex Brother scan for a website:
    1. Scan SERPs for top keywords
    2. Find easy keyword opportunities
    3. Scan competitor weaknesses
    4. Find AI search opportunities
    5. Get trending topics from Brain knowledge
    """
    from sqlalchemy import select
    from app.models.website import Website
    from app.models.ranking import KeywordRanking
    from app.models.backlink import BacklinkOpportunity

    website = await db.scalar(select(Website).where(Website.id == website_id))
    if not website:
        return {"error": "Website not found"}

    domain = website.domain

    # Get keywords from DB
    if not seed_keywords:
        kw_result = await db.execute(
            select(KeywordRanking.keyword)
            .where(KeywordRanking.website_id == website_id)
            .distinct()
            .limit(10)
        )
        seed_keywords = [row[0] for row in kw_result] or [domain.split(".")[0]]

    # Run scans in parallel
    main_keyword = seed_keywords[0] if seed_keywords else domain.split(".")[0]

    easy_keywords, ai_opportunities, trending = await asyncio.gather(
        find_easy_keywords(main_keyword, domain),
        find_ai_search_opportunities(domain, seed_keywords),
        get_trending_seo_topics(),
        return_exceptions=True,
    )

    if isinstance(easy_keywords, Exception):
        easy_keywords = []
    if isinstance(ai_opportunities, Exception):
        ai_opportunities = []
    if isinstance(trending, Exception):
        trending = []

    return {
        "website_id": str(website_id),
        "domain": domain,
        "main_keyword": main_keyword,
        "easy_keyword_opportunities": easy_keywords,
        "ai_search_opportunities": ai_opportunities,
        "trending_topics": trending,
        "total_opportunities": len(easy_keywords) + len(ai_opportunities),
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    }
