"""
AI Search Optimization Agent — Optimizes content for ChatGPT, Perplexity,
Google AI Overviews, voice search, and AI citations.
"""
from .base_agent import BaseAgent


class AISearchAgent(BaseAgent):

    async def analyze(self, context: dict) -> dict:
        domain = context.get("domain", "")
        industry = context.get("industry", "")
        pages = context.get("pages", [])
        crawl_summary = context.get("crawl_summary", {})

        system = (
            "You are an expert AI search optimization specialist who understands how "
            "ChatGPT, Perplexity, Google AI Overviews, and voice assistants surface content. "
            "You know what makes content citation-worthy in AI systems. Always respond with valid JSON."
        )

        pages_str = "\n".join([
            f"- {p.get('url', '')} | {p.get('title', 'No title')} | schema: {p.get('has_schema', False)}"
            for p in pages[:20]
        ])

        prompt = f"""Analyze AI Search optimization opportunities for: {domain}
Industry: {industry}

Pages analyzed:
{pages_str}

Provide a comprehensive AI search optimization audit:

1. ChatGPT/Perplexity Citation Readiness — is content structured to be cited?
2. Google AI Overview Optimization — passage indexing, clear answers
3. Voice Search Optimization — conversational queries, featured snippets
4. Schema Markup Coverage — structured data for AI parsing
5. Content Chunking — proper content segmentation for AI extraction
6. Answer Extraction Optimization — clear, concise answers to common queries
7. Entity Authority — is the brand recognized as an authority entity?
8. FAQ Optimization — FAQ pages for direct answers

Return JSON: {{
  "ai_visibility_score": number,
  "chatgpt_readiness": {{
    "score": number,
    "issues": [...],
    "recommendations": [...]
  }},
  "google_ai_overview_readiness": {{
    "score": number,
    "issues": [...],
    "recommendations": [...]
  }},
  "voice_search_readiness": {{
    "score": number,
    "issues": [...],
    "recommendations": [...]
  }},
  "schema_coverage": {{
    "current_schemas": [...],
    "missing_schemas": [...],
    "priority_additions": [...]
  }},
  "content_chunking_issues": [
    {{
      "page": string,
      "issue": string,
      "fix": string
    }}
  ],
  "faq_opportunities": [
    {{
      "question": string,
      "page_to_add_to": string,
      "answer_outline": string
    }}
  ],
  "entity_authority_recommendations": [...],
  "tasks": [
    {{
      "title": string,
      "description": string,
      "priority": "high/medium/low",
      "estimated_impact": number,
      "category": "ai_search"
    }}
  ],
  "quick_wins": ["list of 5 immediate actions for AI visibility"]
}}"""

        result = await self._call_llm(prompt, system=system, json_mode=True)
        return self._parse_json(result, self._default_ai_analysis(domain, industry))

    def _default_ai_analysis(self, domain: str, industry: str) -> dict:
        return {
            "ai_visibility_score": 25,
            "chatgpt_readiness": {
                "score": 30,
                "issues": ["Content not structured for citation", "Missing authoritative statements", "No clear definitions"],
                "recommendations": ["Add definition sections", "Use clear heading hierarchy", "Add expert quotes"]
            },
            "google_ai_overview_readiness": {
                "score": 25,
                "issues": ["Long-form answers not passage-indexed", "Missing FAQ schema", "No structured definitions"],
                "recommendations": ["Add FAQ schema to all FAQ content", "Structure content with clear H2/H3", "Add TL;DR sections"]
            },
            "voice_search_readiness": {
                "score": 20,
                "issues": ["No conversational content", "Missing featured snippet optimization", "No voice-friendly FAQ"],
                "recommendations": ["Create FAQ pages with natural language questions", "Optimize for 'near me' queries", "Add direct answer boxes"]
            },
            "schema_coverage": {
                "current_schemas": [],
                "missing_schemas": ["Organization", "LocalBusiness", "FAQ", "HowTo", "Article", "BreadcrumbList"],
                "priority_additions": ["FAQPage schema — highest impact for AI search"]
            },
            "content_chunking_issues": [
                {"page": "homepage", "issue": "Content in large blocks, hard for AI to extract", "fix": "Break into clear sections with H2 headers"}
            ],
            "faq_opportunities": [
                {"question": f"What is {industry}?", "page_to_add_to": "homepage", "answer_outline": "Clear 2-3 sentence definition"},
                {"question": f"How does {industry} work?", "page_to_add_to": "services page", "answer_outline": "Step-by-step process"},
            ],
            "entity_authority_recommendations": [
                "Add Organization schema with sameAs links to social profiles",
                "Create an About page with team expertise signals",
                "Get citations on authoritative industry sites"
            ],
            "tasks": [
                {"title": "Add FAQPage schema to all FAQ content", "description": "Implement FAQ schema markup — biggest AI search win", "priority": "high", "estimated_impact": 80, "category": "ai_search"},
                {"title": "Create AI-optimized FAQ hub page", "description": "Build comprehensive FAQ page covering top 20 questions in your niche", "priority": "high", "estimated_impact": 75, "category": "ai_search"},
                {"title": "Optimize content chunking for AI extraction", "description": "Restructure long-form content with clear H2/H3 hierarchy", "priority": "medium", "estimated_impact": 60, "category": "ai_search"},
            ],
            "quick_wins": [
                "Add FAQPage schema to existing FAQ sections",
                "Add Organization schema to homepage",
                "Create a 'What is X' definition page",
                "Add TL;DR summary boxes to long articles",
                "Add HowTo schema to process/tutorial pages"
            ]
        }
