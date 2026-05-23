"""
Page-level SEO analysis — runs on each crawled page.
"""
import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from bs4 import BeautifulSoup


@dataclass
class PageData:
    url: str
    status_code: int
    title: Optional[str] = None
    meta_description: Optional[str] = None
    h1: Optional[str] = None
    canonical_url: Optional[str] = None
    is_indexable: bool = True
    has_noindex: bool = False
    has_schema: bool = False
    schema_types: List[str] = field(default_factory=list)
    word_count: int = 0
    internal_links_count: int = 0
    external_links_count: int = 0
    broken_links: List[str] = field(default_factory=list)
    images_count: int = 0
    images_missing_alt: int = 0
    load_time_ms: Optional[int] = None
    page_size_bytes: int = 0
    headings: Dict[str, List[str]] = field(default_factory=dict)
    content_hash: Optional[str] = None
    og_tags: Dict[str, str] = field(default_factory=dict)
    issues: List[dict] = field(default_factory=list)


class SEOAnalyzer:
    def __init__(self, base_url: str):
        self.base_url = base_url
        from urllib.parse import urlparse
        self.base_domain = urlparse(base_url).netloc

    def analyze(self, url: str, status_code: int, html: str, soup: BeautifulSoup, load_time_ms: int) -> PageData:
        page = PageData(url=url, status_code=status_code, load_time_ms=load_time_ms)
        page.page_size_bytes = len(html.encode("utf-8"))

        if status_code >= 400:
            page.is_indexable = False
            page.issues.append({"type": "broken_link", "severity": "critical", "detail": f"HTTP {status_code}"})
            return page

        # Title
        title_tag = soup.find("title")
        if title_tag:
            page.title = title_tag.text.strip()[:300]
        else:
            page.issues.append({"type": "missing_title", "severity": "critical", "detail": "No <title> tag found"})

        if page.title and len(page.title) < 10:
            page.issues.append({"type": "missing_title", "severity": "high", "detail": f"Title too short: {len(page.title)} chars"})
        if page.title and len(page.title) > 70:
            page.issues.append({"type": "missing_title", "severity": "medium", "detail": f"Title too long: {len(page.title)} chars"})

        # Meta description
        meta_desc = soup.find("meta", attrs={"name": re.compile(r"description", re.I)})
        if meta_desc:
            page.meta_description = meta_desc.get("content", "").strip()[:500]
        if not page.meta_description:
            page.issues.append({"type": "missing_description", "severity": "medium", "detail": "Missing meta description"})

        # Robots / noindex
        robots_meta = soup.find("meta", attrs={"name": re.compile(r"robots", re.I)})
        if robots_meta:
            content = robots_meta.get("content", "").lower()
            if "noindex" in content:
                page.has_noindex = True
                page.is_indexable = False
                page.issues.append({"type": "noindex", "severity": "critical", "detail": "Page has noindex meta tag"})

        # Canonical
        canonical = soup.find("link", attrs={"rel": "canonical"})
        if canonical:
            page.canonical_url = canonical.get("href", "").strip()
        else:
            page.issues.append({"type": "missing_canonical", "severity": "medium", "detail": "Missing canonical URL"})

        # H1
        h1_tags = soup.find_all("h1")
        if not h1_tags:
            page.issues.append({"type": "missing_h1", "severity": "high", "detail": "No H1 heading found"})
        elif len(h1_tags) > 1:
            page.issues.append({"type": "missing_h1", "severity": "medium", "detail": f"Multiple H1s: {len(h1_tags)}"})
        else:
            page.h1 = h1_tags[0].text.strip()[:300]

        # Headings
        page.headings = {
            tag: [h.text.strip()[:200] for h in soup.find_all(tag)]
            for tag in ("h1", "h2", "h3", "h4")
        }

        # Schema
        schema_scripts = soup.find_all("script", attrs={"type": "application/ld+json"})
        page.has_schema = len(schema_scripts) > 0
        if not page.has_schema:
            page.issues.append({"type": "missing_schema", "severity": "medium", "detail": "No structured data found"})
        else:
            for script in schema_scripts:
                try:
                    data = json.loads(script.string or "{}")
                    schema_type = data.get("@type") or data.get("@graph", [{}])[0].get("@type", "")
                    if schema_type:
                        page.schema_types.append(schema_type if isinstance(schema_type, str) else schema_type[0])
                except Exception:
                    pass

        # OG tags
        for og in soup.find_all("meta", attrs={"property": re.compile(r"^og:")}):
            prop = og.get("property", "").replace("og:", "")
            page.og_tags[prop] = og.get("content", "")

        # Links
        from urllib.parse import urlparse
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.startswith("#") or href.startswith("mailto:") or href.startswith("tel:"):
                continue
            parsed = urlparse(href)
            if parsed.netloc and parsed.netloc != self.base_domain:
                page.external_links_count += 1
            else:
                page.internal_links_count += 1

        if page.internal_links_count == 0:
            page.issues.append({"type": "internal_link_issue", "severity": "medium", "detail": "No internal links found on this page"})

        # Images
        images = soup.find_all("img")
        page.images_count = len(images)
        page.images_missing_alt = sum(1 for img in images if not img.get("alt", "").strip())
        if page.images_missing_alt > 0:
            page.issues.append({"type": "missing_alt_text", "severity": "medium", "detail": f"{page.images_missing_alt} images missing alt text"})

        # Word count
        for element in soup(["script", "style", "nav", "footer", "header"]):
            element.decompose()
        text = soup.get_text(separator=" ", strip=True)
        words = text.split()
        page.word_count = len(words)

        if page.word_count < 300:
            page.issues.append({"type": "thin_content", "severity": "high", "detail": f"Thin content: only {page.word_count} words"})

        # Content hash (for duplicate detection)
        content_normalized = " ".join(words[:500])
        page.content_hash = hashlib.md5(content_normalized.encode()).hexdigest()

        # Performance
        if load_time_ms and load_time_ms > 3000:
            page.issues.append({"type": "slow_page", "severity": "high", "detail": f"Page load: {load_time_ms}ms (>3s)"})
        elif load_time_ms and load_time_ms > 1500:
            page.issues.append({"type": "slow_page", "severity": "medium", "detail": f"Page load: {load_time_ms}ms"})

        return page


def build_issue_list(pages: List[PageData], website_id: str, crawl_id: str) -> List[dict]:
    """Convert page-level issues to database-ready SEOIssue records."""
    from app.models.crawl import IssueType, IssueSeverity

    SEVERITY_MAP = {
        "critical": IssueSeverity.critical,
        "high": IssueSeverity.high,
        "medium": IssueSeverity.medium,
        "low": IssueSeverity.low,
        "info": IssueSeverity.info,
    }

    IMPACT_MAP = {
        IssueSeverity.critical: 95,
        IssueSeverity.high: 75,
        IssueSeverity.medium: 50,
        IssueSeverity.low: 25,
        IssueSeverity.info: 10,
    }

    RECOMMENDATION_MAP = {
        "missing_title": "Add a unique, descriptive title tag between 30-70 characters.",
        "missing_description": "Add a compelling meta description between 120-160 characters.",
        "missing_h1": "Add exactly one H1 heading that includes your primary keyword.",
        "missing_canonical": "Add a canonical tag pointing to the preferred version of this URL.",
        "noindex": "Remove the noindex directive unless this page should be excluded from search.",
        "broken_link": "Fix or remove this broken link to improve crawl efficiency.",
        "missing_schema": "Add structured data (JSON-LD) to help search engines understand your content.",
        "thin_content": "Expand the page content to at least 600-800 words with valuable information.",
        "slow_page": "Optimize page speed: compress images, enable caching, minimize JS/CSS.",
        "missing_alt_text": "Add descriptive alt text to all images for accessibility and SEO.",
        "internal_link_issue": "Add internal links to help distribute PageRank and improve navigation.",
        "duplicate_content": "Add a canonical tag or consolidate duplicate content.",
        "redirect_chain": "Fix redirect chains to a single 301 redirect.",
        "mobile_issue": "Ensure the page is fully mobile-responsive.",
    }

    records = []
    for page in pages:
        for issue in page.issues:
            sev = SEVERITY_MAP.get(issue["severity"], IssueSeverity.medium)
            issue_type_str = issue["type"]
            try:
                issue_type = IssueType(issue_type_str)
            except ValueError:
                issue_type = IssueType.broken_link

            records.append({
                "crawl_id": crawl_id,
                "website_id": website_id,
                "page_url": page.url,
                "issue_type": issue_type,
                "severity": sev,
                "title": issue["detail"],
                "description": issue["detail"],
                "recommendation": RECOMMENDATION_MAP.get(issue_type_str, "Review and fix this issue."),
                "impact_score": IMPACT_MAP[sev],
            })

    return records
