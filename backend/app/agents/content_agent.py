"""
Content Optimization Agent — analyzes content quality and generates briefs.
"""
from app.agents.base_agent import BaseAgent


SYSTEM_PROMPT = """You are a Senior SEO Content Strategist.
You analyze website content and provide actionable content optimization recommendations.
Focus on semantic SEO, topic authority, content gaps, and E-E-A-T signals.
Respond in valid JSON only."""


class ContentAgent(BaseAgent):
    name = "ContentAgent"

    async def analyze(self, crawl_data: dict) -> dict:
        pages = crawl_data.get("pages", [])
        domain = crawl_data.get("domain", "unknown")

        thin_pages = [p for p in pages if p.get("word_count", 0) < 300]
        no_schema = [p for p in pages if not p.get("has_schema")]
        no_desc = [p for p in pages if not p.get("meta_description")]

        page_sample = "\n".join([
            f"- {p.get('url', '')} | Words: {p.get('word_count', 0)} | Title: {p.get('title', 'None')[:60]}"
            for p in pages[:20]
        ])

        prompt = f"""Analyze content quality for {domain}:

CONTENT STATS:
- Total pages: {len(pages)}
- Thin content pages (<300 words): {len(thin_pages)}
- Pages missing schema: {len(no_schema)}
- Pages missing meta description: {len(no_desc)}

PAGE SAMPLE:
{page_sample}

Respond with JSON:
{{
  "content_score": <0-100>,
  "summary": "<executive summary>",
  "content_gaps": ["<gap 1>", "<gap 2>", "<gap 3>"],
  "topic_clusters": [
    {{
      "pillar": "<main topic>",
      "cluster_pages": ["<subtopic 1>", "<subtopic 2>"]
    }}
  ],
  "content_recommendations": [
    {{
      "page_url": "<url or 'new page'>",
      "action": "expand|create|rewrite|merge",
      "title": "<recommendation>",
      "description": "<what and why>",
      "target_word_count": <number>,
      "priority": "high|medium|low"
    }}
  ],
  "faq_suggestions": ["<question 1>", "<question 2>", "<question 3>"],
  "schema_recommendations": [
    {{
      "page_url": "<url>",
      "schema_type": "<Article|FAQPage|Product|LocalBusiness|etc>",
      "reason": "<why>"
    }}
  ],
  "ai_search_optimization": {{
    "direct_answer_opportunities": ["<opportunity 1>", "<opportunity 2>"],
    "featured_snippet_targets": ["<query 1>", "<query 2>"]
  }}
}}"""

        response = await self._call_llm(prompt, system=SYSTEM_PROMPT, json_mode=True)
        parsed = self._parse_json_response(response)

        if not parsed:
            parsed = self._heuristic_content_analysis(pages, thin_pages, domain)

        return parsed

    def _heuristic_content_analysis(self, pages, thin_pages, domain):
        score = max(0, 100 - len(thin_pages) * 10)
        return {
            "content_score": score,
            "summary": f"{len(thin_pages)} pages have thin content on {domain}. Focus on expanding key pages first.",
            "content_gaps": ["Comprehensive guides", "FAQ sections", "Case studies"],
            "topic_clusters": [],
            "content_recommendations": [
                {
                    "page_url": p.get("url", ""),
                    "action": "expand",
                    "title": f"Expand thin content on {p.get('url', '').split('/')[-1] or 'homepage'}",
                    "description": f"Page has only {p.get('word_count', 0)} words. Target 800-1200 words.",
                    "target_word_count": 1000,
                    "priority": "high",
                }
                for p in thin_pages[:5]
            ],
            "faq_suggestions": [
                f"What is {domain}?",
                f"How does {domain} work?",
                f"What are the benefits of {domain}?",
            ],
            "schema_recommendations": [],
            "ai_search_optimization": {
                "direct_answer_opportunities": ["Add concise answer sections to target featured snippets"],
                "featured_snippet_targets": [],
            },
        }


class InternalLinkingAgent(BaseAgent):
    name = "InternalLinkingAgent"

    async def analyze(self, crawl_data: dict) -> dict:
        pages = crawl_data.get("pages", [])
        domain = crawl_data.get("domain", "unknown")

        orphan_pages = [p for p in pages if p.get("internal_links_count", 0) == 0]
        low_link_pages = [p for p in pages if 1 <= p.get("internal_links_count", 0) <= 2]

        prompt = f"""Analyze internal linking for {domain}:

LINKING STATS:
- Total pages: {len(pages)}
- Orphan pages (no internal links): {len(orphan_pages)}
- Low-linked pages (1-2 links): {len(low_link_pages)}

TOP PAGES BY INTERNAL LINKS:
{chr(10).join([f"- {p.get('url','')}: {p.get('internal_links_count',0)} links" for p in sorted(pages, key=lambda x: x.get('internal_links_count',0), reverse=True)[:10]])}

Respond with JSON:
{{
  "linking_score": <0-100>,
  "summary": "<summary>",
  "orphan_pages": ["<url1>", "<url2>"],
  "linking_suggestions": [
    {{
      "source_page": "<from>",
      "target_page": "<to>",
      "anchor_text": "<text>",
      "reason": "<why>"
    }}
  ],
  "hub_pages": ["<url> - <why it should be a hub>"],
  "recommendations": ["<rec 1>", "<rec 2>"]
}}"""

        response = await self._call_llm(prompt, system="You are an Internal Linking SEO Expert. Respond in JSON.", json_mode=True)
        parsed = self._parse_json_response(response)

        if not parsed:
            parsed = {
                "linking_score": max(0, 100 - len(orphan_pages) * 5),
                "summary": f"Found {len(orphan_pages)} orphan pages that need internal links.",
                "orphan_pages": [p.get("url", "") for p in orphan_pages[:10]],
                "linking_suggestions": [],
                "hub_pages": [],
                "recommendations": [
                    "Link from your homepage to key service/product pages.",
                    "Add related posts or suggested readings to blog articles.",
                    "Create a comprehensive sitemap page for users.",
                ],
            }

        return parsed
