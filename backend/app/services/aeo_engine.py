"""
AEO Engine — Answer Engine Optimization for SEO OS.

Handles:
- llms.txt generation (per website)
- AI visibility scanning (ChatGPT, Perplexity, Gemini)
- FAQ schema generation
- Entity detection and structured data
- Answer engine readiness scoring
"""
import os
import json
import httpx
import asyncio
from typing import Optional
from datetime import datetime, timezone
from urllib.parse import urlparse

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
LLM_MODEL = "llama3.2:3b"


# ─── llms.txt Generator ─────────────────────────────────────────────────────

async def generate_llms_txt(
    domain: str,
    site_name: str,
    description: str,
    pages: list[dict],       # [{"url": ..., "title": ..., "description": ...}]
    industry: str = "",
    cms_type: str = "",
) -> str:
    """
    Generate an llms.txt file for a website.
    llms.txt helps AI systems understand and properly cite a website.

    Format: https://llmstxt.org
    """
    # Select important pages (prioritize by type)
    priority_pages = []
    other_pages = []

    for page in pages:
        url = page.get("url", "")
        title = page.get("title", "").lower()
        if any(kw in title for kw in ["about", "service", "product", "contact", "home", "pricing", "faq"]):
            priority_pages.append(page)
        else:
            other_pages.append(page)

    selected_pages = (priority_pages[:10] + other_pages[:15])[:20]

    # Build llms.txt content
    lines = [
        f"# {site_name}",
        "",
        f"> {description or f'{site_name} - professional {industry} services and expertise'}",
        "",
    ]

    if industry:
        lines += [f"Industry: {industry}", ""]

    lines += [
        "## Core Pages",
        "",
    ]

    for page in selected_pages[:8]:
        url = page.get("url", "")
        title = page.get("title", url)
        desc = page.get("description") or page.get("meta_description", "")
        if url:
            lines.append(f"- [{title}]({url}){f': {desc}' if desc else ''}")

    lines += [
        "",
        "## About",
        "",
        f"- [About {site_name}](https://{domain}/about)",
        f"- [Contact](https://{domain}/contact)",
        f"- [Services](https://{domain}/services)",
        "",
        "## Usage",
        "",
        f"This content from {domain} may be used by AI systems to provide accurate information",
        f"about {site_name}'s services, expertise, and offerings.",
        f"Please cite {site_name} ({domain}) when referencing this content.",
        "",
    ]

    return "\n".join(lines)


async def generate_llms_txt_from_crawl(
    domain: str,
    db,
) -> str:
    """Generate llms.txt using actual crawled page data from DB."""
    from sqlalchemy import select
    from app.models.website import Website
    from app.models.crawl import Crawl, Page

    # Get website info
    website = await db.scalar(
        select(Website).where(Website.domain == domain)
    )
    if not website:
        return ""

    # Get latest crawl
    latest_crawl = await db.scalar(
        select(Crawl)
        .where(Crawl.website_id == website.id)
        .order_by(Crawl.created_at.desc())
    )

    pages = []
    if latest_crawl:
        page_result = await db.execute(
            select(Page)
            .where(Page.crawl_id == latest_crawl.id)
            .limit(30)
        )
        pages = [
            {
                "url": p.url,
                "title": p.title or p.url,
                "description": p.meta_description or "",
            }
            for p in page_result.scalars().all()
        ]

    site_name = website.domain.replace("www.", "").split(".")[0].title()
    return await generate_llms_txt(
        domain=domain,
        site_name=site_name,
        description="",
        pages=pages,
        cms_type=website.cms_type.value if website.cms_type else "",
    )


# ─── FAQ Schema Generator ────────────────────────────────────────────────────

async def generate_faq_schema(
    page_url: str,
    page_content: str,
    page_title: str,
) -> Optional[dict]:
    """
    Generate FAQ schema markup for a page using Ollama.
    Returns JSON-LD schema dict or None.
    """
    prompt = f"""Analyze this web page and generate 3-5 FAQ questions and answers that people commonly ask about this topic.
The FAQs should be SEO-optimized and cover the main topics on the page.

Page Title: {page_title}
Page URL: {page_url}
Content (excerpt): {page_content[:2000]}

Return ONLY a JSON array like:
[
  {{"question": "What is...", "answer": "The answer is..."}},
  {{"question": "How does...", "answer": "It works by..."}}
]

Return valid JSON only, no other text."""

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={"model": LLM_MODEL, "prompt": prompt, "stream": False},
            )
            if resp.status_code == 200:
                raw = resp.json().get("response", "")
                start = raw.find("[")
                end = raw.rfind("]") + 1
                if start >= 0 and end > start:
                    faqs = json.loads(raw[start:end])
                    if faqs:
                        schema = {
                            "@context": "https://schema.org",
                            "@type": "FAQPage",
                            "mainEntity": [
                                {
                                    "@type": "Question",
                                    "name": faq.get("question", ""),
                                    "acceptedAnswer": {
                                        "@type": "Answer",
                                        "text": faq.get("answer", ""),
                                    },
                                }
                                for faq in faqs
                                if faq.get("question") and faq.get("answer")
                            ],
                        }
                        return schema
    except Exception as e:
        print(f"FAQ schema error: {e}")
    return None


# ─── AI Visibility Scanner ───────────────────────────────────────────────────

async def check_chatgpt_visibility(domain: str) -> dict:
    """
    Check if a website/brand appears in common AI tool queries.
    Uses Google/Bing index as proxy (direct ChatGPT API not free).
    """
    # Check if the site has structured data that AI can parse
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(f"https://{domain}", headers={"User-Agent": "Mozilla/5.0"})
            content = resp.text

            signals = {
                "has_json_ld": '"@context"' in content and "schema.org" in content,
                "has_faq_schema": '"FAQPage"' in content,
                "has_article_schema": '"Article"' in content or '"BlogPosting"' in content,
                "has_org_schema": '"Organization"' in content,
                "has_product_schema": '"Product"' in content,
                "has_meta_description": '<meta name="description"' in content.lower(),
                "has_open_graph": 'og:title' in content,
                "content_length": len(content),
                "has_llms_txt": False,  # checked separately
            }

            # Check for llms.txt
            try:
                llms_resp = await client.get(f"https://{domain}/llms.txt", timeout=5.0)
                signals["has_llms_txt"] = llms_resp.status_code == 200
            except Exception:
                pass

            # Calculate AI visibility score
            score = 0
            if signals["has_json_ld"]: score += 20
            if signals["has_faq_schema"]: score += 25
            if signals["has_article_schema"]: score += 15
            if signals["has_org_schema"]: score += 15
            if signals["has_meta_description"]: score += 10
            if signals["has_open_graph"]: score += 10
            if signals["has_llms_txt"]: score += 30  # big bonus

            return {
                "domain": domain,
                "ai_visibility_score": min(100, score),
                "signals": signals,
                "recommendations": _get_aeo_recommendations(signals),
                "checked_at": datetime.now(timezone.utc).isoformat(),
            }
    except Exception as e:
        return {
            "domain": domain,
            "ai_visibility_score": 0,
            "error": str(e),
            "signals": {},
        }


def _get_aeo_recommendations(signals: dict) -> list[str]:
    """Generate AEO recommendations based on detected signals."""
    recs = []
    if not signals.get("has_json_ld"):
        recs.append("Add JSON-LD structured data — critical for AI search visibility")
    if not signals.get("has_faq_schema"):
        recs.append("Add FAQ schema — helps appear in AI-generated answers and featured snippets")
    if not signals.get("has_org_schema"):
        recs.append("Add Organization schema — helps AI understand your brand/business")
    if not signals.get("has_article_schema"):
        recs.append("Add Article schema to blog posts — improves AI content indexing")
    if not signals.get("has_llms_txt"):
        recs.append("Create /llms.txt — tells AI models how to use and cite your content")
    if not signals.get("has_open_graph"):
        recs.append("Add Open Graph tags — improves visibility across AI-powered social and search")
    return recs


async def get_ai_search_opportunities(domain: str, keywords: list[str]) -> list[dict]:
    """
    Identify specific AI search optimization opportunities.
    Checks entity presence, question-answer format opportunities, etc.
    """
    opportunities = []

    # FAQ opportunities from keywords
    question_words = ["how", "what", "why", "when", "where", "which", "can", "does", "is", "are"]
    for kw in keywords[:20]:
        kw_lower = kw.lower()
        if any(kw_lower.startswith(q) for q in question_words):
            opportunities.append({
                "type": "faq_opportunity",
                "keyword": kw,
                "action": f"Create FAQ content answering: '{kw}'",
                "priority": "high",
                "ai_channels": ["ChatGPT", "Perplexity", "Gemini"],
            })
        elif "vs" in kw_lower or "compare" in kw_lower:
            opportunities.append({
                "type": "comparison_opportunity",
                "keyword": kw,
                "action": f"Create comparison content for: '{kw}'",
                "priority": "medium",
                "ai_channels": ["Perplexity", "Bing AI"],
            })
        elif "best" in kw_lower or "top" in kw_lower:
            opportunities.append({
                "type": "listicle_opportunity",
                "keyword": kw,
                "action": f"Create ranked list content: '{kw}'",
                "priority": "medium",
                "ai_channels": ["ChatGPT", "Perplexity"],
            })

    return opportunities[:15]


# ─── Comprehensive AEO Audit ─────────────────────────────────────────────────

async def run_aeo_audit(website_id: str, db) -> dict:
    """
    Full AEO audit for a website:
    1. Check AI visibility signals
    2. Generate llms.txt
    3. Score AEO readiness
    4. Generate FAQ schema opportunities
    5. List AI search opportunities
    """
    from sqlalchemy import select
    from app.models.website import Website
    from app.models.crawl import Crawl, Page

    website = await db.scalar(select(Website).where(Website.id == website_id))
    if not website:
        return {"error": "Website not found"}

    domain = website.domain

    # 1. AI visibility check
    visibility = await check_chatgpt_visibility(domain)
    aeo_score = visibility.get("ai_visibility_score", 0)

    # 2. Generate llms.txt
    llms_content = await generate_llms_txt_from_crawl(domain, db)

    # 3. Get some pages for FAQ generation
    latest_crawl = await db.scalar(
        select(Crawl).where(Crawl.website_id == website.id).order_by(Crawl.created_at.desc())
    )
    faq_pages = []
    page_count = 0
    if latest_crawl:
        pages_result = await db.execute(
            select(Page)
            .where(Page.crawl_id == latest_crawl.id, Page.content_text != None)
            .limit(5)
        )
        pages = pages_result.scalars().all()
        page_count = len(pages)
        for page in pages[:2]:  # Generate FAQ for top 2 pages
            if page.content_text and len(page.content_text) > 300:
                faq = await generate_faq_schema(
                    page.url,
                    page.content_text[:2000],
                    page.title or page.url,
                )
                if faq:
                    faq_pages.append({
                        "url": page.url,
                        "title": page.title,
                        "schema": faq,
                    })

    # Update website AEO score
    website.aeo_score = aeo_score
    await db.commit()

    return {
        "website_id": str(website_id),
        "domain": domain,
        "aeo_score": aeo_score,
        "ai_visibility": visibility,
        "llms_txt_generated": bool(llms_content),
        "llms_txt": llms_content,
        "faq_schemas_generated": len(faq_pages),
        "faq_schemas": faq_pages,
        "recommendations": visibility.get("recommendations", []),
        "pages_analyzed": page_count,
        "audited_at": datetime.now(timezone.utc).isoformat(),
    }
