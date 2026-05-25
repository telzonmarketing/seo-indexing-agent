"""
Competitor Agent — Analyzes competitor content, backlinks, keywords,
and identifies gaps and opportunities to outrank them.
"""
from .base_agent import BaseAgent


class CompetitorAgent(BaseAgent):

    async def analyze(self, context: dict) -> dict:
        domain = context.get("domain", "")
        industry = context.get("industry", "")
        our_pages = context.get("pages", [])
        competitor_domains = context.get("competitor_domains", [])
        crawl_summary = context.get("crawl_summary", {})

        system = (
            "You are an expert competitor analysis specialist and SEO strategist. "
            "You identify competitor weaknesses and opportunities to outrank them. "
            "Always respond with valid JSON."
        )

        comp_str = ", ".join(competitor_domains[:5]) if competitor_domains else f"top {industry} competitors"
        our_pages_str = "\n".join([f"- {p.get('title', '')}" for p in our_pages[:15]])

        prompt = f"""Perform a comprehensive competitor gap analysis for:
Our domain: {domain}
Industry: {industry}
Key competitors: {comp_str}

Our current content:
{our_pages_str}

Analyze:
1. Content gaps — topics competitors rank for that we don't cover
2. Keyword gaps — keywords competitors rank for that we're missing
3. Backlink opportunities — sites linking to competitors but not us
4. Schema/technical advantages competitors have
5. Content quality gaps — where we can create better content
6. Quick wins to outrank specific competitor pages

Return JSON: {{
  "competitor_summary": "Overall competitive landscape analysis",
  "content_gaps": [
    {{
      "topic": string,
      "competitor_covering_it": string,
      "our_opportunity": string,
      "estimated_traffic": number,
      "difficulty": "low/medium/high",
      "priority": number
    }}
  ],
  "keyword_gaps": [
    {{
      "keyword": string,
      "search_volume": number,
      "competitor_ranking": string,
      "our_current_rank": "not ranking",
      "recommended_action": string
    }}
  ],
  "content_quality_opportunities": [
    {{
      "topic": string,
      "competitor_weakness": string,
      "our_advantage": string,
      "content_type": string
    }}
  ],
  "quick_wins": [
    {{
      "action": string,
      "competitor_to_beat": string,
      "expected_outcome": string,
      "effort": "low/medium/high"
    }}
  ],
  "backlink_gap_domains": ["domain1", "domain2"],
  "recommended_schema_to_add": [...],
  "tasks": [
    {{
      "title": string,
      "description": string,
      "priority": "high/medium/low",
      "estimated_impact": number,
      "category": "competitor"
    }}
  ],
  "30_day_action_plan": "Specific steps to gain competitive advantage in 30 days"
}}"""

        result = await self._call_llm(prompt, system=system, json_mode=True)
        return self._parse_json(result, self._default_competitor_analysis(domain, industry, competitor_domains))

    def _default_competitor_analysis(self, domain: str, industry: str, competitors: list) -> dict:
        return {
            "competitor_summary": f"Competitive landscape analysis for {domain} in {industry} industry",
            "content_gaps": [
                {
                    "topic": f"Best {industry} Guide 2024",
                    "competitor_covering_it": competitors[0] if competitors else "competitor.com",
                    "our_opportunity": "Create more comprehensive, updated version",
                    "estimated_traffic": 1000,
                    "difficulty": "medium",
                    "priority": 85
                },
                {
                    "topic": f"{industry} vs alternatives comparison",
                    "competitor_covering_it": competitors[0] if competitors else "competitor.com",
                    "our_opportunity": "Build unbiased comparison landing page",
                    "estimated_traffic": 500,
                    "difficulty": "low",
                    "priority": 75
                }
            ],
            "keyword_gaps": [
                {"keyword": f"best {industry} service", "search_volume": 1000, "competitor_ranking": "position 1", "our_current_rank": "not ranking", "recommended_action": "Create dedicated landing page"},
                {"keyword": f"{industry} near me", "search_volume": 800, "competitor_ranking": "position 3", "our_current_rank": "not ranking", "recommended_action": "Optimize Google Business Profile + local page"},
            ],
            "content_quality_opportunities": [
                {"topic": f"{industry} how-to guide", "competitor_weakness": "Outdated information from 2022", "our_advantage": "Create updated 2024 version with fresh data", "content_type": "guide"}
            ],
            "quick_wins": [
                {"action": f"Create '{industry} near me' local landing page", "competitor_to_beat": competitors[0] if competitors else "top competitor", "expected_outcome": "Rank in top 5 for local queries", "effort": "low"},
                {"action": "Add FAQ schema to service pages", "competitor_to_beat": "All competitors lacking schema", "expected_outcome": "Capture featured snippets", "effort": "low"},
            ],
            "backlink_gap_domains": ["industry-directory.com", "niche-blog.com"],
            "recommended_schema_to_add": ["FAQPage", "LocalBusiness", "Service"],
            "tasks": [
                {"title": f"Fill top 3 content gaps vs competitors", "description": "Create content for the highest-traffic topics competitors rank for", "priority": "high", "estimated_impact": 80, "category": "competitor"},
                {"title": "Build better comparison content", "description": "Create in-depth comparison pages that outperform competitor versions", "priority": "medium", "estimated_impact": 65, "category": "competitor"},
            ],
            "30_day_action_plan": f"Week 1: Fill top content gaps. Week 2: Build local citations. Week 3: Launch comparison pages. Week 4: Execute backlink outreach."
        }

    async def monitor_competitor_changes(self, context: dict) -> dict:
        """Monitor competitor site changes and new content."""
        domain = context.get("domain", "")
        competitors = context.get("competitor_domains", [])

        system = "You are a competitor monitoring specialist. Always respond with valid JSON."
        comp_str = ", ".join(competitors[:3]) if competitors else "main competitors"

        prompt = f"""What competitive monitoring should be set up for {domain} vs {comp_str}?

Return JSON: {{
  "monitoring_checklist": [...],
  "alert_triggers": [...],
  "content_to_watch": [...],
  "recommended_tools": [...],
  "weekly_checks": [...]
}}"""

        result = await self._call_llm(prompt, system=system, json_mode=True)
        return self._parse_json(result, {
            "monitoring_checklist": ["New content published", "Ranking changes", "Backlink gains", "Schema updates", "Site speed changes"],
            "alert_triggers": ["Competitor gains 10+ new backlinks", "Competitor publishes content in our niche", "Competitor rank jumps 10+ positions"],
            "recommended_tools": ["Google Alerts", "SEMrush", "Ahrefs", "SimilarWeb"],
            "weekly_checks": ["Check top 10 competitor pages for updates", "Monitor competitor backlink growth", "Track ranking movements"]
        })
