"""
SEO Crawler Engine — httpx + BeautifulSoup based.
Crawls a website and extracts SEO data from every page.
"""
import asyncio
import hashlib
import time
from dataclasses import dataclass, field
from typing import Set, List, Optional
from urllib.parse import urljoin, urlparse
import httpx
from bs4 import BeautifulSoup

from app.config import settings
from app.crawler.analyzers import SEOAnalyzer, PageData


HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; SEO-OS-Bot/1.0; +https://seo-os.agency)",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}


@dataclass
class CrawlResult:
    pages: List[PageData] = field(default_factory=list)
    errors: List[dict] = field(default_factory=list)
    total_urls_found: int = 0
    crawl_time_seconds: float = 0.0


class CrawlEngine:
    def __init__(self, base_url: str, max_pages: int = 200, delay_ms: int = 300, concurrent: int = 5):
        self.base_url = base_url.rstrip("/")
        self.max_pages = min(max_pages, settings.CRAWLER_MAX_PAGES)
        self.delay_ms = delay_ms
        self.concurrent = concurrent
        self.parsed_base = urlparse(self.base_url)
        self.visited: Set[str] = set()
        self.queue: asyncio.Queue = asyncio.Queue()
        self.analyzer = SEOAnalyzer(self.base_url)
        self.results: List[PageData] = []
        self.errors: List[dict] = []

    def _normalize_url(self, url: str) -> Optional[str]:
        parsed = urlparse(url)
        # Only crawl same domain
        if parsed.scheme not in ("http", "https"):
            return None
        if parsed.netloc and parsed.netloc != self.parsed_base.netloc:
            return None
        normalized = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
        if parsed.query:
            normalized += f"?{parsed.query}"
        return normalized.rstrip("/") or self.base_url

    def _is_crawlable(self, url: str) -> bool:
        skip_exts = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico",
                     ".css", ".js", ".pdf", ".zip", ".mp4", ".mp3", ".woff", ".woff2")
        path = urlparse(url).path.lower()
        return not any(path.endswith(ext) for ext in skip_exts)

    async def _fetch_page(self, client: httpx.AsyncClient, url: str) -> Optional[PageData]:
        try:
            start = time.time()
            response = await client.get(url, headers=HEADERS, follow_redirects=True, timeout=settings.CRAWLER_TIMEOUT_SECONDS)
            load_time_ms = int((time.time() - start) * 1000)

            content_type = response.headers.get("content-type", "")
            if "text/html" not in content_type:
                return None

            html = response.text
            soup = BeautifulSoup(html, "lxml")

            # Extract links for crawl queue
            links = []
            for tag in soup.find_all("a", href=True):
                href = tag["href"]
                abs_url = urljoin(url, href)
                norm = self._normalize_url(abs_url)
                if norm and self._is_crawlable(norm) and norm not in self.visited:
                    links.append(norm)

            page_data = self.analyzer.analyze(url, response.status_code, html, soup, load_time_ms)
            return page_data, links

        except (httpx.TimeoutException, httpx.ConnectError) as e:
            self.errors.append({"url": url, "error": str(e)})
            return None
        except Exception as e:
            self.errors.append({"url": url, "error": f"Unexpected: {e}"})
            return None

    async def _worker(self, client: httpx.AsyncClient, semaphore: asyncio.Semaphore):
        while True:
            try:
                url = self.queue.get_nowait()
            except asyncio.QueueEmpty:
                break

            if url in self.visited or len(self.results) >= self.max_pages:
                self.queue.task_done()
                continue

            self.visited.add(url)

            async with semaphore:
                result = await self._fetch_page(client, url)
                if result:
                    page_data, links = result
                    self.results.append(page_data)
                    for link in links:
                        if link not in self.visited and len(self.visited) < self.max_pages * 2:
                            await self.queue.put(link)

            await asyncio.sleep(self.delay_ms / 1000)
            self.queue.task_done()

    async def crawl(self, on_progress=None) -> CrawlResult:
        start_time = time.time()
        await self.queue.put(self.base_url)

        limits = httpx.Limits(max_connections=self.concurrent, max_keepalive_connections=self.concurrent)
        semaphore = asyncio.Semaphore(self.concurrent)

        async with httpx.AsyncClient(limits=limits, verify=False) as client:
            # Also fetch sitemap if available
            await self._try_sitemap(client)

            workers = [
                asyncio.create_task(self._worker(client, semaphore))
                for _ in range(self.concurrent)
            ]

            await asyncio.gather(*workers, return_exceptions=True)

        return CrawlResult(
            pages=self.results,
            errors=self.errors,
            total_urls_found=len(self.visited),
            crawl_time_seconds=time.time() - start_time,
        )

    async def _try_sitemap(self, client: httpx.AsyncClient):
        sitemap_urls = [
            f"{self.base_url}/sitemap.xml",
            f"{self.base_url}/sitemap_index.xml",
        ]
        for sitemap_url in sitemap_urls:
            try:
                resp = await client.get(sitemap_url, headers=HEADERS, timeout=10)
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "lxml-xml")
                    for loc in soup.find_all("loc"):
                        url = loc.text.strip()
                        norm = self._normalize_url(url)
                        if norm and norm not in self.visited:
                            await self.queue.put(norm)
                    break
            except Exception:
                pass
