"""
Reporting Agent — generates comprehensive SEO audit reports.
"""
from app.agents.base_agent import BaseAgent


SYSTEM_PROMPT = """You are a Senior SEO Consultant writing executive-level reports.
Your reports are clear, data-driven, and actionable.
Non-technical clients should understand the findings and value.
Respond in valid JSON only."""


class ReportingAgent(BaseAgent):
    name = "ReportingAgent"

    async def generate_audit_report(self, data: dict) -> dict:
        domain = data.get("domain", "unknown")
        technical = data.get("technical_analysis", {})
        content = data.get("content_analysis", {})
        linking = data.get("linking_analysis", {})
        crawl_summary = data.get("crawl_summary", {})

        prompt = f"""Generate an executive SEO audit report for {domain}:

SCORES:
- Technical SEO: {technical.get('technical_score', 0)}/100
- Content Quality: {content.get('content_score', 0)}/100
- Internal Linking: {linking.get('linking_score', 0)}/100

CRAWL DATA:
- Pages crawled: {crawl_summary.get('pages_crawled', 0)}
- Critical issues: {crawl_summary.get('critical_issues', 0)}
- High issues: {crawl_summary.get('high_issues', 0)}

TECHNICAL SUMMARY: {technical.get('summary', '')}
CONTENT SUMMARY: {content.get('summary', '')}

TOP RECOMMENDATIONS:
Technical: {technical.get('recommendations', [])[:3]}
Content: {content.get('content_recommendations', [])[:3]}

Respond with JSON:
{{
  "overall_score": <0-100>,
  "title": "<Report title>",
  "executive_summary": "<3-4 sentence summary for the client>",
  "key_wins": ["<positive finding 1>", "<positive finding 2>"],
  "priority_actions": [
    {{
      "rank": <1-10>,
      "action": "<what to do>",
      "impact": "<expected result>",
      "timeline": "<1 week|1 month|3 months>"
    }}
  ],
  "score_breakdown": {{
    "technical": <score>,
    "content": <score>,
    "linking": <score>,
    "overall": <score>
  }},
  "roadmap": {{
    "month_1": ["<task>"],
    "month_2": ["<task>"],
    "month_3": ["<task>"]
  }},
  "client_friendly_summary": "<Plain English summary a business owner can understand>"
}}"""

        response = await self._call_llm(prompt, system=SYSTEM_PROMPT, json_mode=True)
        parsed = self._parse_json_response(response)

        if not parsed:
            t_score = technical.get("technical_score", 50)
            c_score = content.get("content_score", 50)
            l_score = linking.get("linking_score", 50)
            overall = int((t_score + c_score + l_score) / 3)
            parsed = {
                "overall_score": overall,
                "title": f"SEO Audit Report — {domain}",
                "executive_summary": f"{domain} scored {overall}/100 overall. {crawl_summary.get('critical_issues', 0)} critical issues require immediate attention.",
                "key_wins": ["Website is accessible to crawlers", "Pages are loading correctly"],
                "priority_actions": [
                    {"rank": 1, "action": "Fix critical indexing issues", "impact": "Improve search visibility", "timeline": "1 week"},
                    {"rank": 2, "action": "Expand thin content pages", "impact": "Increase organic traffic", "timeline": "1 month"},
                ],
                "score_breakdown": {"technical": t_score, "content": c_score, "linking": l_score, "overall": overall},
                "roadmap": {
                    "month_1": ["Fix all critical technical issues", "Audit and update title tags"],
                    "month_2": ["Expand thin content", "Implement schema markup"],
                    "month_3": ["Build internal linking structure", "Create topic clusters"],
                },
                "client_friendly_summary": f"Your website has a solid foundation but needs {crawl_summary.get('critical_issues', 0)} critical fixes to improve its search rankings.",
            }

        return parsed
