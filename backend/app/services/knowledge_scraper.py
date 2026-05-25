"""
SEO Knowledge Scraper — Fetches articles from free SEO knowledge sources via RSS + web scraping.
Runs continuously every 2 hours to find new SEO articles, algorithm updates, and AI search insights.
"""
import feedparser
import httpx
import re
from datetime import datetime, timezone
from typing import Optional
from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin

# ─── RSS Feed Sources ───────────────────────────────────────────────────────
RSS_FEEDS = [
    {
        "name": "Google Search Central",
        "rss": "https://developers.google.com/search/blog/rss.xml",
        "site": "https://developers.google.com/search/blog",
        "category": "algorithm",
        "priority": 10,  # highest priority — official Google updates
    },
    {
        "name": "Search Engine Land",
        "rss": "https://searchengineland.com/feed",
        "site": "https://searchengineland.com",
        "category": "technical_seo",
        "priority": 9,
    },
    {
        "name": "Search Engine Journal",
        "rss": "https://www.searchenginejournal.com/feed",
        "site": "https://searchenginejournal.com",
        "category": "technical_seo",
        "priority": 8,
    },
    {
        "name": "Ahrefs Blog",
        "rss": "https://ahrefs.com/blog/feed/",
        "site": "https://ahrefs.com/blog",
        "category": "backlink",
        "priority": 9,
    },
    {
        "name": "Moz Blog",
        "rss": "https://moz.com/blog/feed",
        "site": "https://moz.com/blog",
        "category": "ranking",
        "priority": 8,
    },
    {
        "name": "Backlinko",
        "rss": "https://backlinko.com/feed",
        "site": "https://backlinko.com/blog",
        "category": "ranking",
        "priority": 8,
    },
    {
        "name": "SE Roundtable",
        "rss": "https://www.seroundtable.com/atom.xml",
        "site": "https://www.seroundtable.com",
        "category": "algorithm",
        "priority": 9,
    },
    {
        "name": "Search Engine Watch",
        "rss": "https://www.searchenginewatch.com/feed/",
        "site": "https://www.searchenginewatch.com",
        "category": "technical_seo",
        "priority": 7,
    },
    {
        "name": "Web.dev",
        "rss": "https://web.dev/feed.xml",
        "site": "https://web.dev/blog",
        "category": "core_web_vitals",
        "priority": 8,
    },
    {
        "name": "Cloudflare Blog",
        "rss": "https://blog.cloudflare.com/rss/",
        "site": "https://blog.cloudflare.com",
        "category": "technical_seo",
        "priority": 6,
    },
    {
        "name": "ContentKing Academy",
        "rss": "https://www.contentkingapp.com/academy/feed/",
        "site": "https://www.contentkingapp.com/academy",
        "category": "content",
        "priority": 7,
    },
    {
        "name": "Schema.org",
        "rss": None,
        "site": "https://schema.org/docs/documents.html",
        "category": "schema",
        "priority": 7,
    },
    {
        "name": "OpenAI Blog",
        "rss": None,
        "site": "https://openai.com/index",
        "category": "ai_search",
        "priority": 8,
    },
    {
        "name": "Anthropic News",
        "rss": None,
        "site": "https://www.anthropic.com/news",
        "category": "ai_search",
        "priority": 8,
    },
    {
        "name": "Perplexity Blog",
        "rss": None,
        "site": "https://www.perplexity.ai/hub/blog",
        "category": "ai_search",
        "priority": 8,
    },
]


async def fetch_all_feeds() -> list[dict]:
    """
    Fetch all RSS feeds and return list of article metadata dicts.
    Each dict: {url, title, source, category, published_at, summary}
    """
    articles = []

    async with httpx.AsyncClient(
        timeout=15.0,
        follow_redirects=True,
        headers={"User-Agent": "SEO-OS Brain/2.0 (learning bot)"},
    ) as client:
        for feed_config in RSS_FEEDS:
            if not feed_config.get("rss"):
                # No RSS — try to scrape links from site
                site_articles = await _scrape_site_links(client, feed_config)
                articles.extend(site_articles)
                continue

            try:
                resp = await client.get(feed_config["rss"])
                if resp.status_code != 200:
                    continue
                feed = feedparser.parse(resp.text)
                for entry in feed.entries[:10]:  # max 10 per feed
                    url = entry.get("link", "")
                    if not url:
                        continue

                    published_at = None
                    if hasattr(entry, "published_parsed") and entry.published_parsed:
                        import time
                        published_at = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)

                    articles.append({
                        "url": url,
                        "title": entry.get("title", "")[:500],
                        "source": feed_config["name"],
                        "source_url": feed_config["rss"],
                        "category": feed_config["category"],
                        "priority": feed_config["priority"],
                        "published_at": published_at,
                        "summary_snippet": _clean_html(entry.get("summary", ""))[:500],
                    })
            except Exception as e:
                print(f"Feed error {feed_config['name']}: {e}")

    return articles


async def _scrape_site_links(client: httpx.AsyncClient, feed_config: dict) -> list[dict]:
    """Scrape links from non-RSS sites."""
    articles = []
    try:
        resp = await client.get(feed_config["site"])
        if resp.status_code != 200:
            return []
        soup = BeautifulSoup(resp.text, "html.parser")
        base_url = f"{urlparse(feed_config['site']).scheme}://{urlparse(feed_config['site']).netloc}"
        links = set()
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.startswith("/"):
                href = base_url + href
            if not href.startswith("http"):
                continue
            if base_url in href and len(href) > len(base_url) + 5:
                links.add(href)

        for link in list(links)[:5]:  # max 5 per site
            text = soup.find("a", href=lambda h: h and link.endswith(h.lstrip("/")))
            title = text.get_text(strip=True)[:200] if text else link.split("/")[-1].replace("-", " ")
            articles.append({
                "url": link,
                "title": title,
                "source": feed_config["name"],
                "source_url": feed_config["site"],
                "category": feed_config["category"],
                "priority": feed_config["priority"],
                "published_at": None,
                "summary_snippet": "",
            })
    except Exception as e:
        print(f"Site scrape error {feed_config['name']}: {e}")
    return articles


async def fetch_article_content(url: str) -> Optional[str]:
    """
    Fetch full article content and extract clean text.
    Returns cleaned article text (max 8000 chars for LLM processing).
    """
    try:
        async with httpx.AsyncClient(
            timeout=20.0,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; SEO-OS Brain/2.0)",
                "Accept": "text/html,application/xhtml+xml",
            },
        ) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return None

            soup = BeautifulSoup(resp.text, "html.parser")

            # Remove noise
            for tag in soup.find_all(["script", "style", "nav", "header", "footer",
                                       "aside", "form", "iframe", "button", "noscript"]):
                tag.decompose()

            # Try to find main content
            content = (
                soup.find("article") or
                soup.find("main") or
                soup.find(class_=re.compile(r"content|post|article|entry|blog", re.I)) or
                soup.find("body")
            )

            if not content:
                return None

            text = content.get_text(separator="\n", strip=True)
            # Clean up whitespace
            text = re.sub(r"\n{3,}", "\n\n", text)
            text = re.sub(r" {2,}", " ", text)

            # Limit to 8000 chars for LLM processing (fits in context)
            return text[:8000]
    except Exception as e:
        print(f"Content fetch error {url}: {e}")
        return None


def _clean_html(html: str) -> str:
    """Strip HTML tags from text."""
    return BeautifulSoup(html, "html.parser").get_text(strip=True)


def get_source_by_url(url: str) -> str:
    """Identify source name from article URL."""
    domain = urlparse(url).netloc.lower()
    for feed in RSS_FEEDS:
        feed_domain = urlparse(feed["site"]).netloc.lower()
        if feed_domain in domain or domain in feed_domain:
            return feed["name"]
    return domain.replace("www.", "").split(".")[0].title()
