"""
Blog Idea Agent — Generates daily blog ideas from multiple SEO signals.
Sources: People Also Ask, Google Autosuggest, Competitor analysis, Reddit/Quora signals,
Google Trends, content gaps.
"""
from .base_agent import BaseAgent


class BlogIdeaAgent(BaseAgent):

    async def generate_ideas(self, context: dict) -> dict:
        domain = context.get("domain", "")
        industry = context.get("industry", "")
        existing_topics = context.get("existing_topics", [])
        competitor_domains = context.get("competitor_domains", [])
        top_keywords = context.get("top_keywords", [])

        system = (
            "You are an expert SEO content strategist and blog idea generator. "
            "You think like a senior content strategist who understands search intent, "
            "topical authority, AI search optimization, and viral content patterns. "
            "Always respond with valid JSON."
        )

        existing_str = ", ".join(existing_topics[:20]) if existing_topics else "none yet"
        kw_str = ", ".join(top_keywords[:15]) if top_keywords else "general topics"

        prompt = f"""Generate 15 high-impact blog ideas for: {domain}
Industry: {industry}
Existing content topics (avoid duplicates): {existing_str}
Target keywords: {kw_str}

For each idea provide:
- title: compelling blog title
- target_keyword: primary keyword to rank for
- secondary_keywords: list of 3-5 related keywords
- search_intent: one of informational/transactional/comparison/faq/local/ai_friendly
- source: what signal inspired it (paa/autosuggest/competitor/reddit/quora/trend)
- priority_score: 0-100 based on traffic potential and difficulty
- is_ai_friendly: true if great for AI search citations
- is_seasonal: true if seasonal/trending
- content_gap: true if competitors cover it but we don't
- ai_reasoning: 1 sentence why this is a high-priority topic
- suggested_outline: list of 5-7 H2 sections
- suggested_faqs: list of 3-5 FAQ questions

Include a variety of:
- Informational guides
- Comparison articles
- Local/industry-specific topics
- FAQ-style content perfect for AI search
- Trending/seasonal topics
- Transactional content

Return JSON: {{
  "ideas": [...],
  "top_opportunities": "2-3 sentence summary of biggest content opportunities",
  "content_gaps_found": number,
  "ai_friendly_count": number
}}"""

        result = await self._call_llm(prompt, system=system, json_mode=True)
        return self._parse_json(result, {
            "ideas": self._default_blog_ideas(domain, industry),
            "top_opportunities": f"Focus on informational and comparison content for {industry}",
            "content_gaps_found": 5,
            "ai_friendly_count": 3
        })

    def _default_blog_ideas(self, domain: str, industry: str) -> list:
        return [
            {
                "title": f"Complete Guide to {industry} in 2024",
                "target_keyword": f"{industry} guide",
                "secondary_keywords": [f"best {industry}", f"{industry} tips", f"how to {industry}"],
                "search_intent": "informational",
                "source": "content_gap",
                "priority_score": 75,
                "is_ai_friendly": True,
                "is_seasonal": False,
                "content_gap": True,
                "ai_reasoning": f"Comprehensive guides rank well and get AI citations for {industry} queries",
                "suggested_outline": ["What is it", "Why it matters", "How to get started", "Best practices", "Common mistakes", "FAQs"],
                "suggested_faqs": [f"What is the best {industry}?", f"How much does {industry} cost?", f"Is {industry} worth it?"]
            },
            {
                "title": f"Top 10 {industry} Tools Compared",
                "target_keyword": f"best {industry} tools",
                "secondary_keywords": [f"{industry} software", f"{industry} platforms", f"{industry} comparison"],
                "search_intent": "comparison",
                "source": "competitor",
                "priority_score": 80,
                "is_ai_friendly": True,
                "is_seasonal": False,
                "content_gap": False,
                "ai_reasoning": "Comparison content gets high CTR and AI search citations",
                "suggested_outline": ["Selection criteria", "Tool 1-5 reviews", "Tool 6-10 reviews", "Comparison table", "Verdict"],
                "suggested_faqs": [f"Which {industry} tool is best?", f"What are free {industry} tools?"]
            }
        ]

    async def generate_content_brief(self, idea: dict) -> dict:
        """Generate a full content brief for a specific blog idea."""
        system = "You are an expert SEO content brief writer. Always respond with valid JSON."

        prompt = f"""Create a detailed SEO content brief for:
Title: {idea.get('title')}
Target keyword: {idea.get('target_keyword')}
Search intent: {idea.get('search_intent')}

Return JSON: {{
  "word_count_target": number,
  "content_structure": [...sections with H2/H3],
  "semantic_entities_to_cover": [...],
  "competitor_insights": "what competitors are missing",
  "ai_search_optimization": "how to optimize for AI search",
  "internal_links_to_add": [...],
  "schema_markup": "recommended schema type",
  "meta_title": "optimized title tag",
  "meta_description": "optimized meta description"
}}"""

        result = await self._call_llm(prompt, system=system, json_mode=True)
        return self._parse_json(result, {
            "word_count_target": 1500,
            "content_structure": idea.get("suggested_outline", []),
            "semantic_entities_to_cover": [],
            "ai_search_optimization": "Add FAQ section and clear definitions",
            "schema_markup": "Article",
            "meta_title": idea.get("title", ""),
            "meta_description": f"Learn everything about {idea.get('target_keyword', '')}"
        })
