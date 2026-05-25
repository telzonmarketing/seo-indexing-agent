"""
SEO Knowledge Extractor — Uses Ollama (llama3.2:3b) to extract structured SEO insights
from scraped articles. Runs as part of the autonomous learning pipeline.
"""
import json
import re
import httpx
from typing import Optional
from datetime import datetime, timezone

OLLAMA_URL = "http://localhost:11434"
OLLAMA_MODEL = "llama3.2:3b"


async def extract_seo_knowledge(article_text: str, article_title: str = "", source: str = "") -> dict:
    """
    Extract structured SEO knowledge from an article using Ollama.
    Returns dict with: summary, key_insights, ranking_factors, seo_techniques,
                       ai_search_insights, entities, categories, sentiment
    """
    if not article_text or len(article_text) < 100:
        return _empty_extraction()

    # Truncate to fit in context window
    text = article_text[:4000]

    prompt = f"""You are an expert SEO analyst. Extract structured knowledge from this SEO article.

Article Title: {article_title}
Source: {source}

Article Content:
{text}

Extract the following as JSON (respond ONLY with valid JSON, no markdown):
{{
  "summary": "2-3 sentence summary of the article's key message",
  "key_insights": ["insight 1", "insight 2", "insight 3", "insight 4", "insight 5"],
  "ranking_factors": ["factor 1", "factor 2", "factor 3"],
  "seo_techniques": ["technique 1", "technique 2", "technique 3"],
  "ai_search_insights": ["insight about ChatGPT/AI search if any"],
  "entities": ["SEO concepts, tools, algorithms mentioned"],
  "categories": ["technical_seo", "semantic_seo", "aeo", "ranking", "backlink", "content", "algorithm", "ai_search", "schema", "core_web_vitals"],
  "sentiment": "positive OR negative OR neutral OR update",
  "algorithm_update": "name if this is about a Google algorithm update, else null",
  "action_items": ["specific thing to do based on this article"]
}}

Pick only the categories that apply. Max 3 categories."""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "num_predict": 800,
                    },
                },
            )
            if resp.status_code != 200:
                return _empty_extraction()

            response_text = resp.json().get("response", "")
            return _parse_extraction(response_text)
    except Exception as e:
        print(f"Knowledge extraction error: {e}")
        return _empty_extraction()


async def generate_seo_recommendation(
    context: str,
    website_data: dict,
    knowledge_snippets: list[dict],
) -> str:
    """
    Generate an AI-enhanced SEO recommendation using learned knowledge.
    Augments the recommendation with real knowledge from the brain's memory.
    """
    knowledge_context = "\n".join([
        f"- [{k.get('source', '')}] {k.get('text', '')}"
        for k in knowledge_snippets[:5]
    ])

    prompt = f"""You are an expert SEO strategist with deep knowledge of the latest SEO practices.

Website: {website_data.get('domain', 'unknown')}
Issue/Context: {context}

Relevant SEO knowledge from recent research:
{knowledge_context}

Provide a specific, actionable recommendation for this website based on current best practices.
Keep it under 150 words. Focus on immediate impact."""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.5, "num_predict": 200},
                },
            )
            if resp.status_code == 200:
                return resp.json().get("response", "").strip()
    except Exception as e:
        print(f"Recommendation generation error: {e}")
    return ""


async def analyze_algorithm_update(article_text: str, title: str) -> Optional[dict]:
    """
    Detect if an article is about a Google algorithm update and extract key changes.
    """
    if not any(kw in title.lower() for kw in ["update", "algorithm", "core", "ranking", "google", "change"]):
        return None

    prompt = f"""Analyze this SEO article for Google algorithm updates.

Title: {title}
Content: {article_text[:2000]}

If this is about a Google algorithm update, respond with JSON:
{{
  "is_update": true,
  "update_name": "Core Update March 2025",
  "date": "March 2025",
  "key_changes": ["change 1", "change 2"],
  "impact": "high/medium/low",
  "who_affected": ["type of site affected"],
  "what_to_do": ["action 1", "action 2"]
}}

If NOT about an algorithm update, respond with: {{"is_update": false}}"""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.2, "num_predict": 400},
                },
            )
            if resp.status_code == 200:
                result = _parse_json_response(resp.json().get("response", ""))
                if result.get("is_update"):
                    return result
    except Exception:
        pass
    return None


async def get_seo_strategy_for_website(
    domain: str,
    cms_type: str,
    industry: str,
    issues: list[str],
    knowledge_snippets: list[dict],
) -> dict:
    """
    Generate a comprehensive SEO strategy for a website using brain knowledge.
    """
    knowledge_str = "\n".join([f"• {k['text']}" for k in knowledge_snippets[:8]])
    issues_str = "\n".join([f"• {i}" for i in issues[:10]])

    prompt = f"""You are a senior SEO strategist. Create an actionable SEO strategy.

Website: {domain}
CMS: {cms_type}
Industry: {industry}

Current Issues:
{issues_str or "No issues identified yet"}

Relevant Best Practices (from latest research):
{knowledge_str or "Use standard SEO best practices"}

Respond with JSON:
{{
  "priority_actions": ["action 1", "action 2", "action 3"],
  "quick_wins": ["quick win 1", "quick win 2"],
  "30_day_plan": ["week1: ...", "week2: ...", "week3: ...", "week4: ..."],
  "ai_search_strategy": ["strategy for ChatGPT/Perplexity visibility"],
  "content_strategy": "one paragraph content recommendation",
  "expected_impact": "high/medium/low",
  "timeline_weeks": 12
}}"""

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.4, "num_predict": 600},
                },
            )
            if resp.status_code == 200:
                result = _parse_json_response(resp.json().get("response", ""))
                if result:
                    return result
    except Exception as e:
        print(f"Strategy generation error: {e}")

    return {
        "priority_actions": ["Fix technical SEO issues", "Improve content quality", "Build topical authority"],
        "quick_wins": ["Add schema markup", "Fix broken internal links"],
        "30_day_plan": ["Week 1: Technical audit", "Week 2: Content optimization", "Week 3: Schema", "Week 4: Links"],
        "ai_search_strategy": ["Add FAQ sections", "Use conversational content format"],
        "content_strategy": "Build comprehensive pillar pages targeting your main topics.",
        "expected_impact": "medium",
        "timeline_weeks": 12,
    }


def _parse_extraction(response_text: str) -> dict:
    """Parse JSON extraction from Ollama response."""
    result = _parse_json_response(response_text)
    if not result:
        return _empty_extraction()

    return {
        "summary": result.get("summary", "")[:1000],
        "key_insights": _clean_list(result.get("key_insights", []))[:8],
        "ranking_factors": _clean_list(result.get("ranking_factors", []))[:6],
        "seo_techniques": _clean_list(result.get("seo_techniques", []))[:6],
        "ai_search_insights": _clean_list(result.get("ai_search_insights", []))[:4],
        "entities": _clean_list(result.get("entities", []))[:10],
        "categories": _clean_list(result.get("categories", []))[:3],
        "sentiment": result.get("sentiment", "neutral"),
        "algorithm_update": result.get("algorithm_update"),
        "action_items": _clean_list(result.get("action_items", []))[:5],
    }


def _parse_json_response(text: str) -> dict:
    """Extract JSON from Ollama response (handles markdown code blocks)."""
    # Try direct parse
    try:
        return json.loads(text.strip())
    except Exception:
        pass

    # Extract from code block
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except Exception:
            pass

    # Find first { ... } block
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            pass

    return {}


def _clean_list(lst) -> list[str]:
    """Clean and validate list of strings."""
    if not isinstance(lst, list):
        return []
    return [str(item).strip() for item in lst if item and str(item).strip()]


def _empty_extraction() -> dict:
    return {
        "summary": "",
        "key_insights": [],
        "ranking_factors": [],
        "seo_techniques": [],
        "ai_search_insights": [],
        "entities": [],
        "categories": [],
        "sentiment": "neutral",
        "algorithm_update": None,
        "action_items": [],
    }
