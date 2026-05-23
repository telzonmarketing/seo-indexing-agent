'use strict';

const chalk = require('chalk');
const ora = require('ora');
const { SiteCrawler } = require('../auditors/SiteCrawler');
const { IndexingAuditor } = require('../auditors/IndexingAuditor');
const { RobotsAuditor } = require('../auditors/RobotsAuditor');
const { SitemapAuditor } = require('../auditors/SitemapAuditor');
const { MetaAuditor } = require('../auditors/MetaAuditor');
const { GitHubConnector } = require('../utils/GitHubConnector');
const { GoogleSearchConsole } = require('../submitters/GoogleSearchConsole');
const { IndexingAPISubmitter } = require('../submitters/IndexingAPISubmitter');
const { IssueFixer } = require('../fixers/IssueFixer');
const { Reporter } = require('../utils/Reporter');

class IndexingAgent {
  constructor(config = {}) {
    this.config = {
      // Client identity
      clientId: config.clientId || null,
      clientName: config.clientName || null,

      siteUrl: config.siteUrl,
      githubRepo: config.githubRepo || process.env.GITHUB_REPO,
      githubToken: config.githubToken || process.env.GITHUB_TOKEN,
      githubBranch: config.githubBranch || process.env.GITHUB_BRANCH || 'main',
      maxPages: config.maxPages || parseInt(process.env.MAX_CRAWL_PAGES) || 1000,
      crawlDelay: config.crawlDelay || parseInt(process.env.CRAWL_DELAY_MS) || 500,
      autoSubmit: config.autoSubmit !== false,
      dryRun: config.dryRun || false,
      deep: config.deep || false,
      forceResubmit: config.forceResubmit || false,
      monitorInterval: config.monitorInterval || 24 * 3600 * 1000,
      // Per-client Google credentials (falls back to env if not set)
      googleServiceAccountPath: config.googleServiceAccountPath || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
    };

    this.results = {
      pagesFound: 0,
      issuesFound: [],
      issuesFixed: [],
      pagesSubmitted: [],
      errors: [],
      client: config.clientName || null,
      siteUrl: config.siteUrl || null,
    };
  }

  async audit(outputFile = 'report.json') {
    console.log(chalk.bold('\n[ PHASE 1 ] Auditing website for indexing issues\n'));

    if (!this.config.siteUrl && !this.config.githubRepo) {
      console.error(chalk.red('Error: Provide --url or --github'));
      process.exit(1);
    }

    const spinner = ora('Initialising crawl...').start();

    try {
      // Step 1: Crawl the site
      spinner.text = 'Crawling website pages...';
      const crawler = new SiteCrawler(this.config);
      const pages = await crawler.crawl(this.config.siteUrl);
      this.results.pagesFound = pages.length;
      spinner.succeed(`Found ${chalk.bold(pages.length)} pages`);

      // Step 2: If GitHub repo provided, also pull source files
      let sourceFiles = null;
      if (this.config.githubRepo) {
        spinner.start('Connecting to GitHub repo...');
        const github = new GitHubConnector(this.config.githubToken);
        sourceFiles = await github.getRepoFiles(this.config.githubRepo, this.config.githubBranch);
        spinner.succeed(`Loaded ${chalk.bold(Object.keys(sourceFiles).length)} source files from GitHub`);
      }

      // Step 3: Run all auditors in parallel
      spinner.start('Running indexing audit (robots, sitemap, meta, rendering)...');
      const [robotsIssues, sitemapIssues, metaIssues, indexingIssues] = await Promise.all([
        new RobotsAuditor(this.config).audit(this.config.siteUrl, pages),
        new SitemapAuditor(this.config).audit(this.config.siteUrl, pages),
        new MetaAuditor(this.config).audit(pages),
        new IndexingAuditor(this.config).audit(pages, sourceFiles),
      ]);

      this.results.issuesFound = [
        ...robotsIssues,
        ...sitemapIssues,
        ...metaIssues,
        ...indexingIssues,
      ];

      spinner.succeed(`Audit complete — ${chalk.bold(this.results.issuesFound.length)} issues found`);

      // Step 4: Generate report
      const reporter = new Reporter();
      await reporter.save(this.results, outputFile, this.config.clientId);
      reporter.printSummary(this.results);

      return this.results;

    } catch (err) {
      spinner.fail(`Audit failed: ${err.message}`);
      this.results.errors.push(err.message);
      throw err;
    }
  }

  async fix() {
    console.log(chalk.bold('\n[ PHASE 2 ] Auto-generating fixes\n'));

    // First audit if we haven't
    if (this.results.issuesFound.length === 0) {
      await this.audit();
    }

    const fixer = new IssueFixer(this.config);
    const fixes = await fixer.fix(this.results.issuesFound);

    if (this.config.dryRun) {
      console.log(chalk.yellow('\nDry run — no changes applied. Showing fixes:\n'));
      fixes.forEach(f => {
        console.log(chalk.bold(f.issue));
        console.log(chalk.gray(f.description));
        if (f.code) console.log(chalk.cyan(f.code));
        console.log();
      });
      return;
    }

    // Push fixes to GitHub if repo provided
    if (this.config.githubRepo && fixes.some(f => f.fileChange)) {
      const spinner = ora('Pushing fixes to GitHub...').start();
      const github = new GitHubConnector(this.config.githubToken);
      for (const fix of fixes.filter(f => f.fileChange)) {
        await github.pushFile(
          this.config.githubRepo,
          fix.fileChange.path,
          fix.fileChange.content,
          `fix(seo): ${fix.issue}`,
          this.config.githubBranch
        );
      }
      spinner.succeed(`Pushed ${fixes.filter(f => f.fileChange).length} fixes to GitHub`);
    }

    this.results.issuesFixed = fixes;
    return fixes;
  }

  async submit() {
    console.log(chalk.bold('\n[ PHASE 3 ] Submitting pages to Google\n'));

    const spinner = ora('Discovering pages to submit...').start();

    let pagesToSubmit = [];

    // Get pages from sitemap or crawl
    if (this.config.sitemapUrl) {
      const sitemapAuditor = new SitemapAuditor(this.config);
      pagesToSubmit = await sitemapAuditor.getUrlsFromSitemap(this.config.sitemapUrl);
    } else {
      const crawler = new SiteCrawler(this.config);
      const pages = await crawler.crawl(this.config.siteUrl);
      pagesToSubmit = pages.map(p => p.url);
    }

    spinner.succeed(`Found ${chalk.bold(pagesToSubmit.length)} pages to submit`);

    // Submit via Google Indexing API
    const submitter = new IndexingAPISubmitter();
    const results = await submitter.submitBatch(pagesToSubmit, this.config.forceResubmit);

    this.results.pagesSubmitted = results.submitted;

    console.log(chalk.green(`\n✓ Submitted ${results.submitted.length} pages to Google`));
    if (results.failed.length > 0) {
      console.log(chalk.yellow(`  ${results.failed.length} pages failed — check report for details`));
    }

    return results;
  }

  async runFull() {
    console.log(chalk.bold.green('\nRunning full pipeline: Audit → Fix → Submit\n'));
    console.log(chalk.gray('─'.repeat(56)));

    await this.audit('full-report.json');
    console.log(chalk.gray('─'.repeat(56)));

    const criticalIssues = this.results.issuesFound.filter(i => i.severity === 'critical');
    if (criticalIssues.length > 0) {
      console.log(chalk.yellow(`\nFound ${criticalIssues.length} critical issues — fixing before submission\n`));
      await this.fix();
    }
    console.log(chalk.gray('─'.repeat(56)));

    if (this.config.googleServiceAccountPath || process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      await this.submit();
    } else {
      console.log(chalk.yellow('\nSkipping submission: Google credentials not configured'));
      console.log(chalk.gray('Add GOOGLE_SERVICE_ACCOUNT_KEY_PATH to .env or to the client config\n'));
    }

    console.log(chalk.bold.green('\n✓ Full pipeline complete!\n'));
  }

  async monitor() {
    console.log(chalk.bold('\n[ MONITOR ] Watching indexing health\n'));
    console.log(chalk.gray(`Checking every ${this.config.monitorInterval / 3600000}h\n`));

    const runCheck = async () => {
      const timestamp = new Date().toISOString();
      console.log(chalk.gray(`[${timestamp}] Running health check...`));

      try {
        await this.runFull();
        const healthy = this.results.issuesFound.filter(i => i.severity === 'critical').length === 0;
        console.log(healthy
          ? chalk.green(`[${timestamp}] Site is healthy`)
          : chalk.red(`[${timestamp}] ${this.results.issuesFound.length} issues detected`)
        );
      } catch (err) {
        console.error(chalk.red(`[${timestamp}] Check failed: ${err.message}`));
      }
    };

    await runCheck();
    setInterval(runCheck, this.config.monitorInterval);
  }
}

module.exports = { IndexingAgent };
