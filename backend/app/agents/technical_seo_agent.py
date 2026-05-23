"""
Technical SEO Agent — analyzes crawl data and generates technical fixes.
"""
from typing import List
from app.agents.base_agent import BaseAgent


SYSTEM_PROMPT = """You are a Senior Technical SEO Expert with 15 years of experience.
You analyze website crawl data and provide actionable, prioritized technical SEO recommendations.
Always respond in valid JSON format. Be specific, practical, and prioritize high-impact fixes.
Focus on issues that directly affect Google indexing and rankings."""


class TechnicalSEOAgent(BaseAgent):
    name = "TechnicalSEOAgent"

    async def analyze(self, crawl_data: dict) -> dict:
        issues = crawl_data.get("issues", [])
        summary = crawl_data.get("summary", {})
        domain = crawl_data.get("domain", "unknown")

        issue_text = "\n".join([
            f"- [{i['severity'].upper()}] {i['title']} | Page: {i.get('page_url', 'N/A')}"
            for i in issues[:50]
        ])

        prompt = f"""Analyze this technical SEO audit for {domain}:

CRAWL SUMMARY:
- Pages crawled: {summary.get('pages_crawled', 0)}
- Total issues: {len(issues)}
- Critical issues: {sum(1 for i in issues if i.get('severity') == 'critical')}
- Avg load time: {summary.get('avg_load_time_ms', 0)}ms
- Pages with noindex: {summary.get('noindex_pages', 0)}
- Missing titles: {summary.get('missing_titles', 0)}
- Missing H1: {summary.get('missing_h1', 0)}

TOP ISSUES:
{issue_text}

Respond with JSON:
{{
  "technical_score": <0-100 integer>,
  "summary": "<2-3 sentence executive summary>",
  "critical_findings": ["<finding 1>", "<finding 2>"],
  "recommendations": [
    {{
      "title": "<action>",
      "description": "<what to do and why>",
      "priority": "critical|high|medium|low",
      "estimated_impact": <0-100>,
      "effort": "low|medium|high",
      "category": "indexing|performance|structure|content|schema"
    }}
  ],
  "tasks": [
    {{
      "title": "<specific task>",
      "description": "<exact steps>",
      "priority": "critical|high|medium|low",
      "estimated_impact": <0-100>
    }}
  ],
  "ai_search_notes": "<note about AI search optimization opportunities>"
}}"""

        response = await self._call_llm(prompt, system=SYSTEM_PROMPT, json_mode=True)
        parsed = self._parse_json_response(response)

        if not parsed:
            parsed = self._heuristic_analysis(issues, summary, domain)

        return parsed

    def _heuristic_analysis(self, issues: list, summary: dict, domain: str) -> dict:
        critical = [i for i in issues if i.get("severity") == "critical"]
        high = [i for i in issues if i.get("severity") == "high"]
        score = max(0, 100 - len(critical) * 15 - len(high) * 5)

        recs = []
        if summary.get("missing_titles", 0) > 0:
            recs.append({
                "title": "Fix missing title tags",
                "description": f"Add unique title tags to {summary['missing_titles']} pages",
                "priority": "critical",
                "estimated_impact": 90,
                "effort": "medium",
                "category": "indexing",
            })
        if summary.get("noindex_pages", 0) > 0:
            recs.append({
                "title": "Audit noindex pages",
                "description": f"Review {summary['noindex_pages']} noindex pages — remove if unintentional",
                "priority": "critical",
                "estimated_impact": 95,
                "effort": "low",
                "category": "indexing",
            })

        return {
            "technical_score": score,
            "summary": f"Found {len(critical)} critical and {len(high)} high-priority technical SEO issues on {domain}.",
            "critical_findings": [i["title"] for i in critical[:5]],
            "recommendations": recs,
            "tasks": [{"title": r["title"], "description": r["description"], "priority": r["priority"], "estimated_impact": r["estimated_impact"]} for r in recs[:5]],
            "ai_search_notes": "Add FAQ schema and concise answer sections to improve AI search visibility.",
        }
