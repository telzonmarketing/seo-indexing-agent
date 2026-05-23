'use strict';

const axios = require('axios');
const { URL } = require('url');

class RobotsAuditor {
  constructor(config = {}) {
    this.config = config;
  }

  async audit(siteUrl, pages = []) {
    const issues = [];
    const robotsUrl = new URL('/robots.txt', siteUrl).href;

    let robotsText = '';
    let robotsExists = false;

    try {
      const res = await axios.get(robotsUrl, { timeout: 8000, validateStatus: null });
      if (res.status === 200 && typeof res.data === 'string') {
        robotsText = res.data;
        robotsExists = true;
      }
    } catch (_) {}

    if (!robotsExists) {
      issues.push({
        type: 'MISSING_ROBOTS_TXT',
        severity: 'important',
        title: 'robots.txt not found',
        description: 'A robots.txt file is missing. Without it, crawlers have no guidance and crawl budget may be wasted on non-content pages.',
        url: robotsUrl,
        fix: 'CREATE_ROBOTS_TXT',
        fixData: { siteUrl },
      });
      return issues;
    }

    // Check for blanket block
    if (/Disallow:\s*\/\s*$/m.test(robotsText)) {
      const hasGooglebot = /User-agent:\s*Googlebot/i.test(robotsText);
      issues.push({
        type: 'ROBOTS_BLOCKS_ALL',
        severity: 'critical',
        title: 'robots.txt blocks all crawlers',
        description: 'Your robots.txt has "Disallow: /" which prevents Googlebot from crawling any page. This is the #1 cause of zero indexing.',
        url: robotsUrl,
        snippet: robotsText.substring(0, 300),
        fix: 'FIX_ROBOTS_TXT',
        fixData: { robotsText, siteUrl },
      });
    }

    // Check no sitemap reference
    if (!/Sitemap:/i.test(robotsText)) {
      issues.push({
        type: 'ROBOTS_NO_SITEMAP',
        severity: 'important',
        title: 'robots.txt has no Sitemap directive',
        description: 'Add "Sitemap: https://yoursite.com/sitemap.xml" to robots.txt so all crawlers can discover your sitemap automatically.',
        url: robotsUrl,
        fix: 'ADD_SITEMAP_TO_ROBOTS',
        fixData: { robotsText, siteUrl },
      });
    }

    // Check pages blocked by robots
    const blockedPages = pages.filter(p => this.isBlockedByRobots(p.url, robotsText));
    if (blockedPages.length > 0) {
      issues.push({
        type: 'PAGES_BLOCKED_BY_ROBOTS',
        severity: 'critical',
        title: `${blockedPages.length} pages blocked by robots.txt`,
        description: `These pages exist but are blocked from crawling: ${blockedPages.slice(0, 5).map(p => p.url).join(', ')}`,
        affectedUrls: blockedPages.map(p => p.url),
        fix: 'REVIEW_ROBOTS_RULES',
        fixData: { blockedPages: blockedPages.map(p => p.url), robotsText, siteUrl },
      });
    }

    return issues;
  }

  isBlockedByRobots(url, robotsText) {
    const lines = robotsText.split('\n');
    let currentAgent = null;
    let isBlocked = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('User-agent:')) {
        currentAgent = trimmed.replace('User-agent:', '').trim();
      }
      if ((currentAgent === '*' || currentAgent === 'Googlebot') && trimmed.startsWith('Disallow:')) {
        const path = trimmed.replace('Disallow:', '').trim();
        if (path && path !== '/' && url.includes(path)) {
          isBlocked = true;
        }
      }
    }
    return isBlocked;
  }
}

module.exports = { RobotsAuditor };
