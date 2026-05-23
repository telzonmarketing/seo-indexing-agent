'use strict';

class MetaAuditor {
  constructor(config = {}) {
    this.config = config;
  }

  async audit(pages = []) {
    const issues = [];

    const noindex = pages.filter(p => /noindex/i.test(p.metaRobots || '') || /noindex/i.test(p.headers?.['x-robots-tag'] || ''));
    if (noindex.length > 0) {
      issues.push({
        type: 'NOINDEX_PAGES',
        severity: 'critical',
        title: `${noindex.length} pages have noindex tag`,
        description: 'These pages are explicitly excluded from Google index. If unintentional (e.g., left from staging), remove immediately.',
        affectedUrls: noindex.map(p => p.url),
        fix: 'REMOVE_NOINDEX',
        fixData: { pages: noindex.map(p => p.url) },
      });
    }

    // Missing title tags
    const noTitle = pages.filter(p => !p.title || p.title.length < 5);
    if (noTitle.length > 0) {
      issues.push({
        type: 'MISSING_TITLE',
        severity: 'important',
        title: `${noTitle.length} pages missing <title> tag`,
        description: 'Title tags are a primary ranking signal. Pages without titles are deprioritised by Google.',
        affectedUrls: noTitle.map(p => p.url),
        fix: 'ADD_TITLE_TAGS',
      });
    }

    // Duplicate titles
    const titleMap = {};
    pages.forEach(p => {
      if (p.title) {
        titleMap[p.title] = titleMap[p.title] || [];
        titleMap[p.title].push(p.url);
      }
    });
    const dupTitles = Object.entries(titleMap).filter(([, urls]) => urls.length > 1);
    if (dupTitles.length > 0) {
      issues.push({
        type: 'DUPLICATE_TITLES',
        severity: 'important',
        title: `${dupTitles.length} duplicate title tags found`,
        description: 'Duplicate titles cause Google to pick which page to index, often ignoring the others.',
        affectedUrls: dupTitles.flatMap(([, urls]) => urls),
        details: dupTitles.map(([title, urls]) => ({ title, urls })),
        fix: 'FIX_DUPLICATE_TITLES',
      });
    }

    // Missing meta description
    const noDesc = pages.filter(p => !p.metaDescription || p.metaDescription.length < 10);
    if (noDesc.length > 0) {
      issues.push({
        type: 'MISSING_META_DESCRIPTION',
        severity: 'low',
        title: `${noDesc.length} pages missing meta description`,
        description: 'Meta descriptions improve click-through rates from search results, which signals quality to Google.',
        affectedUrls: noDesc.map(p => p.url),
        fix: 'ADD_META_DESCRIPTIONS',
      });
    }

    // Missing canonical
    const noCanonical = pages.filter(p => !p.canonicalUrl);
    if (noCanonical.length > 0) {
      issues.push({
        type: 'MISSING_CANONICAL',
        severity: 'important',
        title: `${noCanonical.length} pages missing canonical URL`,
        description: 'Without canonicals, URL parameters (?utm=, ?ref=) create duplicate page versions that split indexing signals.',
        affectedUrls: noCanonical.map(p => p.url),
        fix: 'ADD_CANONICAL_TAGS',
      });
    }

    // Self-referencing canonical conflicts
    const wrongCanonical = pages.filter(p =>
      p.canonicalUrl &&
      p.canonicalUrl !== p.url &&
      !p.canonicalUrl.replace(/\/$/, '').endsWith(new URL(p.url).pathname.replace(/\/$/, ''))
    );
    if (wrongCanonical.length > 0) {
      issues.push({
        type: 'WRONG_CANONICAL',
        severity: 'critical',
        title: `${wrongCanonical.length} pages have incorrect canonical URL`,
        description: 'Canonical pointing to a different page tells Google to index that page instead — your page will be excluded.',
        affectedUrls: wrongCanonical.map(p => ({ url: p.url, canonical: p.canonicalUrl })),
        fix: 'FIX_CANONICAL_TAGS',
      });
    }

    // Missing H1
    const noH1 = pages.filter(p => !p.h1 || p.h1.length < 3);
    if (noH1.length > 0) {
      issues.push({
        type: 'MISSING_H1',
        severity: 'low',
        title: `${noH1.length} pages missing H1 heading`,
        description: 'H1 headings help Google understand the primary topic of each page.',
        affectedUrls: noH1.map(p => p.url),
        fix: 'ADD_H1_TAGS',
      });
    }

    // Slow pages (over 3 seconds)
    const slowPages = pages.filter(p => p.loadTime > 3000);
    if (slowPages.length > 0) {
      issues.push({
        type: 'SLOW_PAGES',
        severity: 'important',
        title: `${slowPages.length} pages load slowly (>3s)`,
        description: 'Page speed is a Google ranking factor. Slow pages get deprioritised in crawl budget allocation.',
        affectedUrls: slowPages.map(p => ({ url: p.url, loadTime: p.loadTime })),
        fix: 'OPTIMISE_PAGE_SPEED',
      });
    }

    // 4xx/5xx errors
    const errorPages = pages.filter(p => p.statusCode >= 400);
    if (errorPages.length > 0) {
      issues.push({
        type: 'ERROR_PAGES',
        severity: 'critical',
        title: `${errorPages.length} pages return error status codes`,
        description: 'Pages returning 4xx/5xx cannot be indexed and waste crawl budget.',
        affectedUrls: errorPages.map(p => ({ url: p.url, status: p.statusCode })),
        fix: 'FIX_ERROR_PAGES',
      });
    }

    return issues;
  }
}

module.exports = { MetaAuditor };
