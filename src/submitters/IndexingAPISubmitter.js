'use strict';

const { google } = require('googleapis');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs');

class IndexingAPISubmitter {
  constructor() {
    this.auth = null;
    this.submitted = new Set();
    this.BATCH_SIZE = 100; // Google rate limit: 200/day, we batch conservatively
    this.DELAY_MS = 500;
  }

  async getAuth() {
    if (this.auth) return this.auth;

    let credentials;

    // Try service account key file
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
      try {
        credentials = JSON.parse(fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf8'));
      } catch (_) {}
    }

    // Try inline JSON
    if (!credentials && process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      try {
        credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
      } catch (_) {}
    }

    if (!credentials) {
      throw new Error(
        'Google credentials not found. Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH or GOOGLE_SERVICE_ACCOUNT_KEY in .env\n' +
        'See README.md → Google Setup for instructions.'
      );
    }

    this.auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/indexing'],
    });

    return this.auth;
  }

  async submitUrl(url, type = 'URL_UPDATED') {
    const auth = await this.getAuth();
    const client = await auth.getClient();

    const res = await client.request({
      url: 'https://indexing.googleapis.com/v3/urlNotifications:publish',
      method: 'POST',
      data: { url, type },
    });

    return res.data;
  }

  async submitBatch(urls, forceResubmit = false) {
    const auth = await this.getAuth();
    const client = await auth.getClient();

    const toSubmit = forceResubmit ? urls : urls.filter(u => !this.submitted.has(u));
    const results = { submitted: [], failed: [], skipped: urls.length - toSubmit.length };

    if (toSubmit.length === 0) {
      console.log(chalk.yellow('  All pages already submitted. Use --force to re-submit.'));
      return results;
    }

    const spinner = ora(`Submitting ${toSubmit.length} pages to Google...`).start();
    let count = 0;

    for (let i = 0; i < toSubmit.length; i += this.BATCH_SIZE) {
      const batch = toSubmit.slice(i, i + this.BATCH_SIZE);

      await Promise.all(batch.map(async (url) => {
        try {
          await client.request({
            url: 'https://indexing.googleapis.com/v3/urlNotifications:publish',
            method: 'POST',
            data: { url, type: 'URL_UPDATED' },
          });
          results.submitted.push(url);
          this.submitted.add(url);
          count++;
          spinner.text = `Submitted ${count}/${toSubmit.length} pages...`;
        } catch (err) {
          results.failed.push({ url, error: err.message });
        }
      }));

      // Respect rate limits between batches
      if (i + this.BATCH_SIZE < toSubmit.length) {
        await this.sleep(this.DELAY_MS * batch.length);
      }
    }

    spinner.succeed(`Submitted ${results.submitted.length}/${toSubmit.length} pages to Google Indexing API`);

    if (results.failed.length > 0) {
      console.log(chalk.yellow(`\n  ${results.failed.length} failed submissions:`));
      results.failed.forEach(f => {
        console.log(chalk.gray(`    ${f.url}: ${f.error}`));
      });
    }

    return results;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { IndexingAPISubmitter };
