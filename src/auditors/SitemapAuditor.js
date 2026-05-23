'use strict';

const axios = require('axios');
const xml2js = require('xml2js');
const { URL } = require('url');

class SitemapAuditor {
  constructor(config = {}) {
    this.config = config;
  }

  async audit(siteUrl, pages = []) {
    const issues = [];
    const sitemapUrls = await this.discoverSitemaps(siteUrl);

    if (sitemapUrls.length === 0) {
      issues.push({
        type: 'NO_SITEMAP',
        severity: 'critical',
        title: 'No sitemap.xml found',
        description: 'Google cannot discover your pages without a sitemap. This is mandatory for sites with 100+ pages.',
        fix: 'CREATE_SITEMAP',
        fixData: { siteUrl, pages: pages.map(p => p.url) },
      });
      return issues;
    }

    // Parse all sitemaps and collect URLs
    let sitemapUrls_list = [];
    for (const smUrl of sitemapUrls) {
      try {
        const urls = await this.getUrlsFromSitemap(smUrl);
        sitemapUrls_list.push(...urls);
      } catch (_) {
        issues.push({
          type: 'SITEMAP_PARSE_ERROR',
          severity: 'important',
          title: `Sitemap is malformed: ${smUrl}`,
          description: 'Google cannot read this sitemap due to XML errors.',
          url: smUrl,
          fix: 'FIX_SITEMAP_XML',
        });
      }
    }

    sitemapUrls_list = [...new Set(sitemapUrls_list)];

    // Find crawled pages missing from sitemap
    const crawledUrls = pages.map(p => p.url.replace(/\/$/, ''));
    const sitemapSet = new Set(sitemapUrls_list.map(u => u.replace(/\/$/, '')));
    const missingFromSitemap = crawledUrls.filter(u => !sitemapSet.has(u) && !u.includes('?'));

    if (missingFromSitemap.length > 0) {
      issues.push({
        type: 'PAGES_MISSING_FROM_SITEMAP',
        severity: 'critical',
        title: `${missingFromSitemap.length} pages missing from sitemap`,
        description: `These crawlable pages are not in your sitemap — Google won't prioritise discovering them.`,
        affectedUrls: missingFromSitemap,
        fix: 'UPDATE_SITEMAP',
        fixData: { missingUrls: missingFromSitemap, siteUrl },
      });
    }

    // Check for non-indexable pages IN the sitemap
    const nonIndexableInSitemap = pages.filter(p => !p.isIndexable && sitemapSet.has(p.url.replace(/\/$/, '')));
    if (nonIndexableInSitemap.length > 0) {
      issues.push({
        type: 'NOINDEX_IN_SITEMAP',
        severity: 'important',
        title: `${nonIndexableInSitemap.length} noindex pages listed in sitemap`,
        description: 'Sitemap should only list indexable pages. noindex pages in sitemap confuse Googlebot.',
        affectedUrls: nonIndexableInSitemap.map(p => p.url),
        fix: 'REMOVE_NOINDEX_FROM_SITEMAP',
      });
    }

    // Check sitemap size
    if (sitemapUrls_list.length > 49000) {
      issues.push({
        type: 'SITEMAP_TOO_LARGE',
        severity: 'important',
        title: 'Sitemap exceeds 50,000 URL limit',
        description: 'Split into a sitemap index file with multiple child sitemaps.',
        fix: 'CREATE_SITEMAP_INDEX',
      });
    }

    return issues;
  }

  async discoverSitemaps(siteUrl) {
    const candidates = [
      new URL('/sitemap.xml', siteUrl).href,
      new URL('/sitemap_index.xml', siteUrl).href,
      new URL('/sitemap-index.xml', siteUrl).href,
      new URL('/news-sitemap.xml', siteUrl).href,
    ];

    // Also check robots.txt for Sitemap: directives
    try {
      const robotsRes = await axios.get(new URL('/robots.txt', siteUrl).href, { timeout: 5000, validateStatus: null });
      if (robotsRes.status === 200) {
        const matches = robotsRes.data.match(/^Sitemap:\s*(.+)$/gim) || [];
        matches.forEach(m => candidates.push(m.replace(/^Sitemap:\s*/i, '').trim()));
      }
    } catch (_) {}

    const found = [];
    for (const url of [...new Set(candidates)]) {
      try {
        const res = await axios.get(url, { timeout: 8000, validateStatus: null });
        if (res.status === 200 && res.data && (res.data.includes('<urlset') || res.data.includes('<sitemapindex'))) {
          found.push(url);
        }
      } catch (_) {}
    }
    return found;
  }

  async getUrlsFromSitemap(sitemapUrl) {
    const res = await axios.get(sitemapUrl, { timeout: 10000 });
    const parsed = await xml2js.parseStringPromise(res.data);

    // Sitemap index — recurse
    if (parsed.sitemapindex) {
      const childUrls = (parsed.sitemapindex.sitemap || []).map(s => s.loc?.[0]).filter(Boolean);
      const all = [];
      for (const child of childUrls) {
        try {
          const childUrls2 = await this.getUrlsFromSitemap(child);
          all.push(...childUrls2);
        } catch (_) {}
      }
      return all;
    }

    // Regular sitemap
    if (parsed.urlset) {
      return (parsed.urlset.url || []).map(u => u.loc?.[0]).filter(Boolean);
    }

    return [];
  }
}

module.exports = { SitemapAuditor };
