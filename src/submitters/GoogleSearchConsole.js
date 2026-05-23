'use strict';

const { google } = require('googleapis');
const fs = require('fs');

class GoogleSearchConsole {
  constructor() {
    this.searchconsole = null;
  }

  async init() {
    if (this.searchconsole) return;

    let credentials;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
      try { credentials = JSON.parse(fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf8')); } catch (_) {}
    }
    if (!credentials && process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      try { credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY); } catch (_) {}
    }

    if (!credentials) return;

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/webmasters',
        'https://www.googleapis.com/auth/webmasters.readonly',
      ],
    });

    this.searchconsole = google.searchconsole({ version: 'v1', auth });
  }

  async getIndexingStatus(siteUrl, urls = []) {
    await this.init();
    if (!this.searchconsole) return null;

    const results = [];
    for (const url of urls.slice(0, 50)) { // GSC API limit
      try {
        const res = await this.searchconsole.urlInspection.index.inspect({
          requestBody: {
            inspectionUrl: url,
            siteUrl,
          },
        });
        results.push({
          url,
          verdict: res.data.inspectionResult?.indexStatusResult?.verdict,
          coverageState: res.data.inspectionResult?.indexStatusResult?.coverageState,
          robotsTxtState: res.data.inspectionResult?.indexStatusResult?.robotsTxtState,
          indexingState: res.data.inspectionResult?.indexStatusResult?.indexingState,
          lastCrawlTime: res.data.inspectionResult?.indexStatusResult?.lastCrawlTime,
        });
      } catch (_) {}
    }
    return results;
  }

  async submitSitemap(siteUrl, sitemapUrl) {
    await this.init();
    if (!this.searchconsole) return false;

    try {
      await this.searchconsole.sitemaps.submit({
        siteUrl,
        feedpath: sitemapUrl,
      });
      return true;
    } catch (_) {
      return false;
    }
  }
}

module.exports = { GoogleSearchConsole };
