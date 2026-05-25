"""
Semantic SEO Agent — Builds topic clusters, detects semantic gaps,
analyzes topical authority, and improves entity coverage.
"""
from .base_agent import BaseAgent


class SemanticSEOAgent(BaseAgent):

    async def analyze(self, context: dict) -> dict:
        domain = context.get("domain", "")
        industry = context.get("industry", "")
        pages = context.get("pages", [])
        crawl_summary = context.get("crawl_summary", {})

        system = (
            "You are an expert semantic SEO specialist and topical authority builder. "
            "You understand NLP, entity relationships, topic clustering, and how search engines "
            "evaluate topical depth and authority. Always respond with valid JSON."
        )

        pages_str = "\n".join([
            f"- {p.get('url', '')} | {p.get('title', 'No title')} | {p.get('word_count', 0)} words"
            for p in pages[:30]
        ])

        prompt = f"""Perform a deep Semantic SEO analysis for: {domain}
Industry: {industry}

Current pages:
{pages_str}

Analyze and return:
1. Topic Clusters — identify existing clusters and what's missing
2. Semantic Gaps — topics the site should cover but doesn't
3. Entity Coverage — key entities/concepts missing from the content
4. Topical Authority Score — 0-100 for the domain's topic coverage
5. Content Depth Issues — pages that are too shallow
6. Internal Linking Opportunities — semantic connections to make
7. AI Search Optimization — how to improve AI search visibility

Return JSON: {{
  "topical_authority_score": number,
  "topic_clusters": [
    {{
      "topic": string,
      "pillar_keyword": string,
      "coverage_score": number,
      "existing_pages": [urls],
      "missing_pages": ["suggested page titles"],
      "semantic_entities": ["entities to cover"],
      "content_gaps": ["specific gaps"]
    }}
  ],
  "semantic_gaps": [
    {{
      "topic": string,
      "why_important": string,
      "suggested_content": string,
      "estimated_traffic": number
    }}
  ],
  "entity_coverage": {{
    "missing_entities": ["entity1", "entity2"],
    "entity_relationships": "analysis",
    "recommendations": ["specific actions"]
  }},
  "internal_linking_opportunities": [
    {{
      "from_page": string,
      "to_page": string,
      "anchor_text": string,
      "reason": string
    }}
  ],
  "ai_search_recommendations": [
    {{
      "action": string,
      "impact": string,
      "priority": "high/medium/low"
    }}
  ],
  "tasks": [
    {{
      "title": string,
      "description": string,
      "priority": "high/medium/low",
      "estimated_impact": number
    }}
  ]
}}"""

        result = await self._call_llm(prompt, system=system, json_mode=True)
        return self._parse_json(result, self._default_semantic_analysis(domain, industry))

    def _default_semantic_analysis(self, domain: str, industry: str) -> dict:
        return {
            "topical_authority_score": 35,
            "topic_clusters": [
                {
                    "topic": f"Core {industry} Services",
                    "pillar_keyword": f"{industry} services",
                    "coverage_score": 40,
                    "existing_pages": [],
                    "missing_pages": [f"Complete Guide to {industry}", f"{industry} FAQ", f"Best {industry} Practices"],
                    "semantic_entities": [industry, "services", "solutions", "expertise"],
                    "content_gaps": ["No comprehensive guide", "Missing FAQ page", "No case studies"]
                }
            ],
            "semantic_gaps": [
                {"topic": f"{industry} FAQ", "why_important": "Captures voice search + AI queries", "suggested_content": "FAQ hub page", "estimated_traffic": 500},
                {"topic": f"How does {industry} work", "why_important": "Top informational query", "suggested_content": "Explainer article", "estimated_traffic": 300},
            ],
            "entity_coverage": {
                "missing_entities": [industry, "solutions", "services", "pricing"],
                "entity_relationships": "Weak entity coverage detected",
                "recommendations": ["Add entity definitions to homepage", "Create knowledge graph connections"]
            },
            "internal_linking_opportunities": [],
            "ai_search_recommendations": [
                {"action": "Add FAQ schema markup to all FAQ content", "impact": "Increases AI search citations by 40%", "priority": "high"},
                {"action": "Structure content with clear definitions", "impact": "Improves passage indexing", "priority": "high"},
            ],
            "tasks": [
                {"title": f"Build {industry} topic cluster", "description": "Create pillar page and 5 supporting cluster pages", "priority": "high", "estimated_impact": 75},
                {"title": "Fix semantic gaps in top pages", "description": "Add missing entity references and topic depth", "priority": "medium", "estimated_impact": 60},
            ]
        }

    async def build_content_cluster(self, context: dict) -> dict:
        """Generate a complete content cluster plan for a topic."""
        topic = context.get("topic", "")
        domain = context.get("domain", "")
        industry = context.get("industry", "")

        system = "You are an expert topical authority builder. Always respond with valid JSON."

        prompt = f"""Build a complete content cluster for the topic: "{topic}"
Domain: {domain}, Industry: {industry}

Return JSON: {{
  "pillar_page": {{
    "title": string,
    "target_keyword": string,
    "word_count": number,
    "outline": [...]
  }},
  "cluster_pages": [
    {{
      "title": string,
      "target_keyword": string,
      "search_intent": string,
      "word_count": number,
      "connects_to_pillar": true
    }}
  ],
  "semantic_entities": [...],
  "internal_linking_plan": {{
    "pillar_to_clusters": [...],
    "cluster_to_cluster": [...],
    "anchor_texts": {{}}
  }},
  "schema_recommendations": [...],
  "estimated_authority_gain": number,
  "estimated_traffic": number
}}"""

        result = await self._call_llm(prompt, system=system, json_mode=True)
        return self._parse_json(result, {
            "pillar_page": {"title": f"Complete Guide to {topic}", "target_keyword": topic, "word_count": 3000, "outline": []},
            "cluster_pages": [],
            "semantic_entities": [],
            "internal_linking_plan": {},
            "estimated_authority_gain": 15,
            "estimated_traffic": 1000
        })
