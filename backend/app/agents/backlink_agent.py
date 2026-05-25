"""
Backlink Agent — Discovers and scores backlink opportunities.
Scans: directories (JustDial, IndiaMart, Sulekha, Yelp, Crunchbase, Clutch),
guest posts, Reddit, Quora, forums, competitor backlinks, resource pages.
"""
from .base_agent import BaseAgent


# High-value directory/platform database
DIRECTORY_DATABASE = [
    {"platform": "JustDial", "url": "https://www.justdial.com", "da": 72, "type": "directory", "category": "local_india"},
    {"platform": "IndiaMart", "url": "https://www.indiamart.com", "da": 70, "type": "directory", "category": "b2b_india"},
    {"platform": "Sulekha", "url": "https://www.sulekha.com", "da": 60, "type": "directory", "category": "local_india"},
    {"platform": "Crunchbase", "url": "https://www.crunchbase.com", "da": 91, "type": "profile", "category": "startup"},
    {"platform": "Clutch", "url": "https://clutch.co", "da": 82, "type": "directory", "category": "agency"},
    {"platform": "GoodFirms", "url": "https://www.goodfirms.co", "da": 72, "type": "directory", "category": "agency"},
    {"platform": "G2", "url": "https://www.g2.com", "da": 91, "type": "review", "category": "software"},
    {"platform": "Trustpilot", "url": "https://www.trustpilot.com", "da": 93, "type": "review", "category": "general"},
    {"platform": "Yelp", "url": "https://www.yelp.com", "da": 94, "type": "directory", "category": "local"},
    {"platform": "AngelList", "url": "https://angel.co", "da": 89, "type": "profile", "category": "startup"},
    {"platform": "LinkedIn Company", "url": "https://linkedin.com", "da": 99, "type": "profile", "category": "professional"},
    {"platform": "Facebook Business", "url": "https://facebook.com", "da": 100, "type": "profile", "category": "social"},
    {"platform": "Twitter/X Business", "url": "https://twitter.com", "da": 100, "type": "profile", "category": "social"},
    {"platform": "Google Business Profile", "url": "https://business.google.com", "da": 100, "type": "citation", "category": "local"},
    {"platform": "Bing Places", "url": "https://www.bingplaces.com", "da": 100, "type": "citation", "category": "local"},
    {"platform": "Apple Maps Connect", "url": "https://mapsconnect.apple.com", "da": 100, "type": "citation", "category": "local"},
    {"platform": "Yellow Pages", "url": "https://www.yellowpages.com", "da": 93, "type": "directory", "category": "local"},
    {"platform": "Foursquare", "url": "https://foursquare.com", "da": 92, "type": "citation", "category": "local"},
    {"platform": "HubSpot Directory", "url": "https://ecosystem.hubspot.com", "da": 93, "type": "directory", "category": "marketing"},
    {"platform": "Product Hunt", "url": "https://www.producthunt.com", "da": 90, "type": "profile", "category": "startup"},
    {"platform": "BetaList", "url": "https://betalist.com", "da": 72, "type": "directory", "category": "startup"},
    {"platform": "SaaSHub", "url": "https://www.saashub.com", "da": 70, "type": "directory", "category": "software"},
    {"platform": "Capterra", "url": "https://www.capterra.com", "da": 91, "type": "directory", "category": "software"},
    {"platform": "Software Advice", "url": "https://www.softwareadvice.com", "da": 82, "type": "directory", "category": "software"},
    {"platform": "GetApp", "url": "https://www.getapp.com", "da": 83, "type": "directory", "category": "software"},
    {"platform": "Hotfrog", "url": "https://www.hotfrog.com", "da": 62, "type": "directory", "category": "local"},
    {"platform": "Manta", "url": "https://www.manta.com", "da": 84, "type": "directory", "category": "b2b"},
    {"platform": "DMOZ Alternative", "url": "https://www.dmoz-odp.org", "da": 60, "type": "directory", "category": "general"},
    {"platform": "Alignable", "url": "https://www.alignable.com", "da": 70, "type": "directory", "category": "local_b2b"},
    {"platform": "Clutch India", "url": "https://clutch.co/in", "da": 82, "type": "directory", "category": "agency_india"},
]


class BacklinkAgent(BaseAgent):

    async def find_opportunities(self, context: dict) -> dict:
        domain = context.get("domain", "")
        industry = context.get("industry", "")
        location = context.get("location", "India")
        niche = context.get("niche", industry)
        website_id = context.get("website_id", "")

        system = (
            "You are an expert backlink strategist and link building specialist. "
            "You find high-quality, relevant backlink opportunities that will genuinely "
            "improve domain authority and organic rankings. Always respond with valid JSON."
        )

        prompt = f"""Find the best backlink opportunities for:
Domain: {domain}
Industry: {industry}
Location: {location}
Niche: {niche}

Generate 20 specific backlink opportunities including:
- Business directory submissions
- Guest post opportunities
- Resource page links
- Forum participation (Reddit/Quora)
- Industry-specific directories
- Local citation opportunities

For each opportunity:
- source_domain: the website domain
- source_url: specific URL to submit/contact
- type: directory/guest_post/forum/citation/profile/resource
- platform: platform name
- domain_authority: estimated DA (0-100)
- relevance_score: how relevant to the niche (0-100)
- is_dofollow: true/false
- notes: specific action to take
- ai_reasoning: why this link will help rankings

Also include Reddit subreddits and Quora spaces where the business can contribute.

Return JSON: {{
  "opportunities": [...],
  "priority_directories": ["list of top 5 to submit to first"],
  "guest_post_niches": ["topics to pitch for guest posts"],
  "reddit_communities": ["r/subreddit1", "r/subreddit2"],
  "quora_spaces": ["space1", "space2"],
  "estimated_da_gain": "projected domain authority improvement",
  "action_plan": "prioritized 30-day backlink action plan"
}}"""

        result = await self._call_llm(prompt, system=system, json_mode=True)
        parsed = self._parse_json(result, {})

        # Always supplement with our curated directory database
        if "opportunities" not in parsed or not parsed["opportunities"]:
            parsed["opportunities"] = []

        # Add curated directories filtered by relevance
        for d in DIRECTORY_DATABASE[:15]:
            parsed["opportunities"].append({
                "source_domain": d["platform"].lower().replace(" ", ""),
                "source_url": d["url"],
                "type": d["type"],
                "platform": d["platform"],
                "domain_authority": d["da"],
                "relevance_score": 70,
                "is_dofollow": True,
                "notes": f"Submit {domain} to {d['platform']} directory",
                "ai_reasoning": f"High DA ({d['da']}) directory in {d['category']} category",
                "website_id": website_id,
            })

        return parsed

    async def analyze_competitor_backlinks(self, context: dict) -> dict:
        domain = context.get("domain", "")
        competitors = context.get("competitor_domains", [])

        system = "You are an expert link gap analysis specialist. Always respond with valid JSON."

        comp_str = ", ".join(competitors[:5]) if competitors else "unknown"
        prompt = f"""Perform a link gap analysis for {domain} vs competitors: {comp_str}

Identify:
- Types of backlinks competitors likely have that we're missing
- High-authority sites in our niche we should target
- Quick wins for link building

Return JSON: {{
  "link_gap_opportunities": [...],
  "competitor_link_patterns": "analysis of competitor link building patterns",
  "quick_wins": ["list of 5 quick backlink wins"],
  "long_term_strategy": "6-month link building roadmap"
}}"""

        result = await self._call_llm(prompt, system=system, json_mode=True)
        return self._parse_json(result, {
            "link_gap_opportunities": [],
            "competitor_link_patterns": "Analysis unavailable",
            "quick_wins": ["Submit to Google Business Profile", "Create Crunchbase profile", "List on Clutch"],
            "long_term_strategy": "Build directory citations first, then pursue guest posts"
        })
