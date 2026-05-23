'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const xml2js = require('xml2js');

class SiteCrawler {
  constructor(config = {}) {
    this.config = config;
    this.visited = new Set();
    this.queue = [];
    this.pages = [];
    this.maxPages = config.maxPages || 1000;
    this.delay = config.crawlDelay || 500;
  }

  async seedFromSitemap(siteUrl) {
    try {
      const sitemapUrl = new URL('/sitemap.xml', siteUrl).href;
      const res = await axios.get(sitemapUrl, { timeout: 8000, validateStatus: null });
      if (res.status !== 200) return;
      const parsed = await xml2js.parseStringPromise(res.data, { explicitArray: false });
      const urlset = parsed?.urlset?.url;
      if (!urlset) return;
      const urls = Array.isArray(urlset) ? urlset : [urlset];
      urls.forEach(u => {
        const loc = u?.loc;
        if (loc && !this.visited.has(loc) && !this.queue.includes(loc)) {
          this.queue.push(loc);
        }
      });
    } catch (_) {}
  }

  async crawl(startUrl) {
    if (!startUrl) throw new Error('No URL provided to crawl');

    const base = new URL(startUrl);
    this.baseOrigin = base.origin;
    this.baseDomain = base.hostname;

    this.queue.push(startUrl);

    // Seed all URLs from sitemap so SPA pages are discovered
    await this.seedFromSitemap(startUrl);

    while (this.queue.length > 0 && this.pages.length < this.maxPages) {
      const url = this.queue.shift();
      if (this.visited.has(url)) continue;
      this.visited.add(url);

      try {
        const page = await this.fetchPage(url);
        if (page) {
          this.pages.push(page);
          const links = this.extractLinks(page.html, url);
          links.forEach(link => {
            if (!this.visited.has(link) && !this.queue.includes(link)) {
              this.queue.push(link);
            }
          });
        }
      } catch (err) {
        // skip unreachable pages
      }

      if (this.delay > 0) await this.sleep(this.delay);
    }

    return this.pages;
  }

  async fetchPage(url) {
    const start = Date.now();
    try {
      const res = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'SEOIndexingAgent/1.0 (compatible; Googlebot/2.1)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        maxRedirects: 5,
        validateStatus: null,
      });

      const loadTime = Date.now() - start;
      const $ = cheerio.load(res.data || '');

      return {
        url,
        statusCode: res.status,
        html: res.data || '',
        title: $('title').text().trim(),
        metaDescription: $('meta[name="description"]').attr('content') || '',
        metaRobots: $('meta[name="robots"]').attr('content') || '',
        canonicalUrl: $('link[rel="canonical"]').attr('href') || '',
        h1: $('h1').first().text().trim(),
        hasStructuredData: $('script[type="application/ld+json"]').length > 0,
        contentLength: (res.data || '').length,
        loadTime,
        headers: res.headers,
        redirectChain: res.request?.res?.responseUrl !== url ? [url, res.request?.res?.responseUrl] : [],
        isIndexable: this.checkIndexable($, res.headers),
        links: [],
      };
    } catch (err) {
      return {
        url,
        statusCode: 0,
        error: err.message,
        isIndexable: false,
      };
    }
  }

  checkIndexable($, headers) {
    const metaRobots = $('meta[name="robots"]').attr('content') || '';
    const xRobotsTag = headers?.['x-robots-tag'] || '';
    const noindex = /noindex/i.test(metaRobots) || /noindex/i.test(xRobotsTag);
    return !noindex;
  }

  extractLinks(html, baseUrl) {
    const $ = cheerio.load(html || '');
    const links = [];

    $('a[href]').each((_, el) => {
      try {
        const href = $(el).attr('href');
        const resolved = new URL(href, baseUrl).href;
        const parsed = new URL(resolved);

        if (
          parsed.origin === this.baseOrigin &&
          !resolved.includes('#') &&
          !resolved.match(/\.(pdf|jpg|jpeg|png|gif|svg|ico|css|js|woff|woff2|ttf|zip|mp4|mp3)$/i) &&
          !resolved.includes('/api/') &&
          !resolved.includes('/_next/') &&
          !resolved.includes('/admin/')
        ) {
          links.push(resolved.split('?')[0]);
        }
      } catch (_) {}
    });

    return [...new Set(links)];
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { SiteCrawler };
