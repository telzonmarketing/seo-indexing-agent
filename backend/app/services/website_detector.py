"""
Website Detection Engine — Auto-detects CMS, framework, hosting, analytics,
sitemap, robots.txt, schema, and determines bot execution mode.
"""
import asyncio
import re
from typing import Optional
import httpx
from urllib.parse import urljoin, urlparse


async def detect_website(url: str) -> dict:
    """
    Full website detection: CMS, framework, hosting, integrations.
    Returns structured detection result.
    """
    result = {
        "url": url,
        "domain": urlparse(url).netloc,
        "cms_type": "unknown",
        "framework_detected": None,
        "hosting_provider": None,
        "cdn_detected": None,
        "server_software": None,
        "php_version": None,
        "has_sitemap": False,
        "sitemap_url": None,
        "has_robots_txt": False,
        "robots_txt_url": None,
        "has_schema": False,
        "schema_types": [],
        "has_analytics": False,
        "analytics_type": None,
        "has_tag_manager": False,
        "has_ssl": url.startswith("https://"),
        "has_wordpress_api": False,
        "has_shopify_api": False,
        "has_cloudflare": False,
        "page_title": None,
        "meta_description": None,
        "response_time_ms": None,
        "status_code": None,
        "headers": {},
        "bot_execution_mode": "recommendation_only",
        "detected_integrations": [],
        "detection_confidence": "low",
    }

    base = url.rstrip("/")
    domain = urlparse(url).netloc

    async with httpx.AsyncClient(
        timeout=15.0,
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 (SEO-OS Bot/2.0; detection)"},
    ) as client:
        # 1. Fetch homepage
        try:
            import time
            t0 = time.time()
            resp = await client.get(base)
            result["response_time_ms"] = int((time.time() - t0) * 1000)
            result["status_code"] = resp.status_code
            html = resp.text
            headers = dict(resp.headers)
            result["headers"] = {k.lower(): v for k, v in headers.items()}
        except Exception as e:
            result["error"] = str(e)
            return result

        # 2. Parse headers for CMS / server hints
        _parse_headers(result, result["headers"])

        # 3. Parse HTML for CMS signatures
        _detect_cms_from_html(result, html)

        # 4. Parse title + meta
        title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
        if title_match:
            result["page_title"] = title_match.group(1).strip()[:200]

        desc_match = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)', html, re.IGNORECASE)
        if desc_match:
            result["meta_description"] = desc_match.group(1).strip()[:300]

        # 5. Schema detection
        schema_matches = re.findall(r'"@type"\s*:\s*"([^"]+)"', html)
        if schema_matches:
            result["has_schema"] = True
            result["schema_types"] = list(set(schema_matches))

        # 6. Analytics detection
        if "google-analytics.com" in html or "gtag(" in html or "ga(" in html:
            result["has_analytics"] = True
            result["analytics_type"] = "Google Analytics"
        if "googletagmanager.com" in html:
            result["has_tag_manager"] = True

        # 7. CDN / Cloudflare detection from headers
        if "cf-ray" in result["headers"] or "cloudflare" in result["headers"].get("server", "").lower():
            result["has_cloudflare"] = True
            result["cdn_detected"] = "Cloudflare"

        # 8. Check sitemap
        await _check_sitemap(client, base, result)

        # 9. Check robots.txt
        await _check_robots(client, base, result)

        # 10. WordPress REST API check
        if result["cms_type"] in ("wordpress", "unknown"):
            await _check_wordpress_api(client, base, result)

        # 11. Shopify check
        if result["cms_type"] in ("shopify", "unknown"):
            await _check_shopify(client, base, result)

        # 12. Determine bot execution mode
        result["bot_execution_mode"] = _determine_bot_mode(result)
        result["detection_confidence"] = _confidence(result)
        result["detected_integrations"] = _list_integrations(result)

    return result


def _parse_headers(result: dict, headers: dict):
    server = headers.get("server", "").lower()
    x_powered = headers.get("x-powered-by", "").lower()
    via = headers.get("via", "").lower()
    x_gen = headers.get("x-generator", "").lower()

    if "apache" in server:
        result["server_software"] = "Apache"
        result["hosting_provider"] = "cPanel/Apache"
    elif "nginx" in server:
        result["server_software"] = "Nginx"
    elif "litespeed" in server:
        result["server_software"] = "LiteSpeed"
        result["hosting_provider"] = "Hostinger/LiteSpeed"
    elif "cloudflare" in server:
        result["hosting_provider"] = "Cloudflare"

    if "php" in x_powered:
        match = re.search(r"php/?([\d.]+)", x_powered, re.IGNORECASE)
        if match:
            result["php_version"] = match.group(1)

    if "wp" in x_powered or "wordpress" in x_gen.lower():
        result["cms_type"] = "wordpress"
    if "shopify" in server or "shopify" in x_powered:
        result["cms_type"] = "shopify"


def _detect_cms_from_html(result: dict, html: str):
    html_lower = html.lower()

    # WordPress
    if any(s in html for s in ["/wp-content/", "/wp-includes/", "wp-json"]):
        result["cms_type"] = "wordpress"
        result["framework_detected"] = "WordPress"

    # Shopify
    elif any(s in html for s in ["cdn.shopify.com", "shopify.com/s/files", "Shopify.theme"]):
        result["cms_type"] = "shopify"
        result["framework_detected"] = "Shopify"

    # Wix
    elif "wixstatic.com" in html or "wix.com/_api" in html or "X-Wix-" in str(html):
        result["cms_type"] = "wix"
        result["framework_detected"] = "Wix"

    # Webflow
    elif "webflow.com" in html or 'data-wf-page' in html:
        result["cms_type"] = "webflow"
        result["framework_detected"] = "Webflow"

    # Next.js
    elif "__NEXT_DATA__" in html or "_next/static" in html:
        result["cms_type"] = "nextjs"
        result["framework_detected"] = "Next.js"

    # React
    elif 'root">' in html and ("react" in html_lower or "bundle.js" in html_lower):
        result["cms_type"] = "react"
        result["framework_detected"] = "React"

    # Laravel
    elif "laravel" in html_lower or "laravel_session" in html_lower:
        result["cms_type"] = "laravel"
        result["framework_detected"] = "Laravel/PHP"

    # Static HTML
    elif result["php_version"] is None and result["cms_type"] == "unknown":
        if "<html" in html_lower and not any(fw in html_lower for fw in ["angular", "vue", "ember"]):
            result["cms_type"] = "custom_html"
            result["framework_detected"] = "Custom HTML/Static"


async def _check_sitemap(client: httpx.AsyncClient, base: str, result: dict):
    for path in ["/sitemap.xml", "/sitemap_index.xml", "/sitemap.php", "/sitemap/"]:
        try:
            r = await client.get(base + path)
            if r.status_code == 200 and ("xml" in r.headers.get("content-type", "") or "<sitemap" in r.text.lower() or "<urlset" in r.text.lower()):
                result["has_sitemap"] = True
                result["sitemap_url"] = base + path
                break
        except Exception:
            pass

    # Also check robots.txt for sitemap hint
    try:
        r = await client.get(base + "/robots.txt")
        if r.status_code == 200:
            match = re.search(r"Sitemap:\s*(https?://[^\s]+)", r.text, re.IGNORECASE)
            if match and not result["has_sitemap"]:
                result["has_sitemap"] = True
                result["sitemap_url"] = match.group(1)
    except Exception:
        pass


async def _check_robots(client: httpx.AsyncClient, base: str, result: dict):
    try:
        r = await client.get(base + "/robots.txt")
        if r.status_code == 200 and len(r.text) > 5:
            result["has_robots_txt"] = True
            result["robots_txt_url"] = base + "/robots.txt"
    except Exception:
        pass


async def _check_wordpress_api(client: httpx.AsyncClient, base: str, result: dict):
    try:
        r = await client.get(base + "/wp-json/wp/v2/posts?per_page=1", timeout=8.0)
        if r.status_code == 200:
            result["has_wordpress_api"] = True
            result["cms_type"] = "wordpress"
            result["framework_detected"] = "WordPress"
    except Exception:
        pass


async def _check_shopify(client: httpx.AsyncClient, base: str, result: dict):
    try:
        r = await client.get(base + "/products.json?limit=1", timeout=8.0)
        if r.status_code == 200 and "products" in r.text:
            result["has_shopify_api"] = True
            result["cms_type"] = "shopify"
    except Exception:
        pass


def _determine_bot_mode(result: dict) -> str:
    """Determine what automation is possible based on detection."""
    if result.get("has_wordpress_api"):
        return "partial_automation"
    return "recommendation_only"


def _confidence(result: dict) -> str:
    if result["cms_type"] not in ("unknown", "custom_html"):
        return "high"
    if result["framework_detected"]:
        return "medium"
    return "low"


def _list_integrations(result: dict) -> list:
    integrations = []
    if result.get("has_analytics"):
        integrations.append({"type": "ga4", "detected": True, "status": "detected_not_connected"})
    if result.get("has_tag_manager"):
        integrations.append({"type": "gtm", "detected": True, "status": "detected_not_connected"})
    if result.get("has_cloudflare"):
        integrations.append({"type": "cloudflare", "detected": True, "status": "detected_not_connected"})
    if result.get("has_wordpress_api"):
        integrations.append({"type": "wordpress", "detected": True, "status": "api_available"})
    return integrations


def cms_display_name(cms_type: str) -> str:
    names = {
        "wordpress": "WordPress",
        "shopify": "Shopify",
        "nextjs": "Next.js",
        "react": "React",
        "php": "PHP",
        "laravel": "Laravel",
        "wix": "Wix",
        "webflow": "Webflow",
        "custom_html": "Custom HTML",
        "static": "Static Site",
        "unknown": "Unknown",
    }
    return names.get(cms_type, cms_type.title())
