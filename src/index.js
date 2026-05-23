#!/usr/bin/env node

'use strict';

require('dotenv').config();
const { program } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const { IndexingAgent } = require('./agents/IndexingAgent');
const { loadClients, getClient, addClient, removeClient, slugify } = require('./utils/ClientManager');

const banner = `
${chalk.bold.blue('╔══════════════════════════════════════════════════════╗')}
${chalk.bold.blue('║')}   ${chalk.bold.white('SEO Indexing Agent')} ${chalk.gray('— Multi-Client Edition')}          ${chalk.bold.blue('║')}
${chalk.bold.blue('║')}   ${chalk.gray('Audit • Fix • Submit • Monitor any website')}          ${chalk.bold.blue('║')}
${chalk.bold.blue('╚══════════════════════════════════════════════════════╝')}
`;

console.log(banner);

// ── Helpers ──────────────────────────────────────────────────────────────────

function agentFromClient(client, extra = {}) {
  return new IndexingAgent({
    clientId: client.id,
    clientName: client.name,
    siteUrl: client.url,
    githubRepo: client.githubRepo,
    githubToken: client.githubToken,
    githubBranch: client.githubBranch,
    googleServiceAccountPath: client.googleServiceAccountPath,
    ...extra,
  });
}

async function resolveClients(opts) {
  if (opts.all) return loadClients();
  if (opts.client) return [getClient(opts.client)];
  return null; // means: use --url directly
}

// ── clients — list all enrolled clients ──────────────────────────────────────

program
  .command('clients')
  .description('List all enrolled client websites')
  .action(() => {
    const clients = loadClients();
    if (clients.length === 0) {
      console.log(chalk.yellow('No clients enrolled yet. Run: node src/index.js enroll\n'));
      return;
    }
    console.log(chalk.bold(`  ${'ID'.padEnd(22)} ${'Name'.padEnd(24)} ${'URL'.padEnd(36)} Enrolled`));
    console.log(chalk.gray('  ' + '─'.repeat(96)));
    clients.forEach(c => {
      console.log(
        `  ${chalk.cyan(c.id.padEnd(22))} ${c.name.padEnd(24)} ${chalk.gray(c.url.padEnd(36))} ${chalk.gray(c.enrolled || '')}`
      );
    });
    console.log();
  });

// ── enroll — add a new client ─────────────────────────────────────────────────

program
  .command('enroll')
  .description('Enroll a new client website')
  .action(async () => {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Client name (e.g. Acme Corp):',
        validate: v => v.trim() ? true : 'Name is required',
      },
      {
        type: 'input',
        name: 'url',
        message: 'Website URL (e.g. https://acme.com):',
        validate: v => v.startsWith('http') ? true : 'Must start with http:// or https://',
      },
      {
        type: 'input',
        name: 'googleServiceAccountPath',
        message: 'Path to Google service account JSON for this client (Enter to use default from .env):',
        default: '',
      },
      {
        type: 'input',
        name: 'githubRepo',
        message: 'GitHub repo for auto-fix pushes (owner/repo, or Enter to skip):',
        default: '',
      },
      {
        type: 'input',
        name: 'githubToken',
        message: 'GitHub token for this client (or Enter to use default from .env):',
        default: '',
      },
      {
        type: 'input',
        name: 'notes',
        message: 'Notes (optional — e.g. "WordPress", "Next.js", "e-commerce"):',
        default: '',
      },
    ]);

    const id = slugify(answers.name.trim());
    const client = {
      id,
      name: answers.name.trim(),
      url: answers.url.trim(),
      googleServiceAccountPath: answers.googleServiceAccountPath.trim() || null,
      githubRepo: answers.githubRepo.trim() || null,
      githubToken: answers.githubToken.trim() || null,
      notes: answers.notes.trim() || null,
    };

    addClient(client);
    console.log(chalk.green(`\n✓ Client "${client.name}" enrolled with id: ${chalk.bold(id)}`));
    console.log(chalk.gray(`  Run audit: node src/index.js audit --client ${id}`));
    console.log(chalk.gray(`  Full run:  node src/index.js run --client ${id}\n`));
  });

// ── remove — remove a client ──────────────────────────────────────────────────

program
  .command('remove <id>')
  .description('Remove a client from the registry')
  .action((id) => {
    removeClient(id);
    console.log(chalk.green(`\n✓ Client "${id}" removed\n`));
  });

// ── audit ─────────────────────────────────────────────────────────────────────

program
  .command('audit')
  .description('Audit a website for indexing issues')
  .option('-u, --url <url>', 'Website URL to audit (without --client)')
  .option('-c, --client <id>', 'Client id from your enrolled clients')
  .option('--all', 'Run for all enrolled clients')
  .option('-o, --output <file>', 'Save report to file (json/html)', 'report.json')
  .option('--deep', 'Deep crawl (slower, more thorough)', false)
  .action(async (opts) => {
    const clients = await resolveClients(opts);

    if (clients) {
      for (const client of clients) {
        console.log(chalk.bold.white(`\n── ${client.name} (${client.url}) ──`));
        const agent = agentFromClient(client, { deep: opts.deep });
        await agent.audit('report.json');
      }
      return;
    }

    const agent = new IndexingAgent({ siteUrl: opts.url || process.env.SITE_URL, deep: opts.deep });
    await agent.audit(opts.output);
  });

// ── fix ───────────────────────────────────────────────────────────────────────

program
  .command('fix')
  .description('Auto-generate and push fixes for indexing issues')
  .option('-u, --url <url>', 'Website URL')
  .option('-c, --client <id>', 'Client id')
  .option('--all', 'Run for all enrolled clients')
  .option('--dry-run', 'Show fixes without applying', false)
  .action(async (opts) => {
    const clients = await resolveClients(opts);

    if (clients) {
      for (const client of clients) {
        console.log(chalk.bold.white(`\n── ${client.name} (${client.url}) ──`));
        const agent = agentFromClient(client, { dryRun: opts.dryRun });
        await agent.fix();
      }
      return;
    }

    const agent = new IndexingAgent({ siteUrl: opts.url || process.env.SITE_URL, dryRun: opts.dryRun });
    await agent.fix();
  });

// ── submit ────────────────────────────────────────────────────────────────────

program
  .command('submit')
  .description('Submit all pages to Google Indexing API')
  .option('-u, --url <url>', 'Website URL')
  .option('-c, --client <id>', 'Client id')
  .option('--all', 'Run for all enrolled clients')
  .option('--sitemap <url>', 'Sitemap URL to submit from')
  .option('--force', 'Re-submit already submitted pages', false)
  .action(async (opts) => {
    const clients = await resolveClients(opts);

    if (clients) {
      for (const client of clients) {
        console.log(chalk.bold.white(`\n── ${client.name} (${client.url}) ──`));
        const agent = agentFromClient(client, { forceResubmit: opts.force });
        await agent.submit();
      }
      return;
    }

    const agent = new IndexingAgent({
      siteUrl: opts.url || process.env.SITE_URL,
      sitemapUrl: opts.sitemap,
      forceResubmit: opts.force,
    });
    await agent.submit();
  });

// ── monitor ───────────────────────────────────────────────────────────────────

program
  .command('monitor')
  .description('Continuously monitor indexing health')
  .option('-u, --url <url>', 'Website URL')
  .option('-c, --client <id>', 'Client id')
  .option('--interval <hours>', 'Check interval in hours', '24')
  .action(async (opts) => {
    const clients = await resolveClients(opts);

    if (clients && clients.length === 1) {
      const agent = agentFromClient(clients[0], { monitorInterval: parseInt(opts.interval) * 3600 * 1000 });
      await agent.monitor();
      return;
    }

    const agent = new IndexingAgent({
      siteUrl: opts.url || process.env.SITE_URL,
      monitorInterval: parseInt(opts.interval) * 3600 * 1000,
    });
    await agent.monitor();
  });

// ── run — full pipeline ───────────────────────────────────────────────────────

program
  .command('run')
  .description('Full pipeline: audit → fix → submit')
  .option('-u, --url <url>', 'Website URL')
  .option('-c, --client <id>', 'Client id')
  .option('--all', 'Run for all enrolled clients')
  .option('-g, --github <repo>', 'GitHub repo (without --client)')
  .option('--dry-run', 'Preview changes only', false)
  .action(async (opts) => {
    const clients = await resolveClients(opts);

    if (clients) {
      console.log(chalk.bold(`\nRunning full pipeline for ${clients.length} client(s)\n`));
      for (const client of clients) {
        console.log(chalk.bold.white(`\n${'═'.repeat(56)}`));
        console.log(chalk.bold.white(`  ${client.name}`));
        console.log(chalk.gray(`  ${client.url}`));
        console.log(chalk.bold.white(`${'═'.repeat(56)}`));
        const agent = agentFromClient(client, { dryRun: opts.dryRun });
        await agent.runFull();
      }
      console.log(chalk.bold.green(`\n✓ All ${clients.length} client(s) processed\n`));
      return;
    }

    const agent = new IndexingAgent({
      siteUrl: opts.url || process.env.SITE_URL,
      githubRepo: opts.github || process.env.GITHUB_REPO,
      dryRun: opts.dryRun,
    });
    await agent.runFull();
  });

// ── reports — show what's been saved ─────────────────────────────────────────

program
  .command('reports')
  .description('List saved reports for all clients')
  .option('-c, --client <id>', 'Show reports for one client only')
  .action((opts) => {
    const fs = require('fs');
    const path = require('path');
    const reportsDir = path.resolve(process.cwd(), 'reports');

    if (!fs.existsSync(reportsDir)) {
      console.log(chalk.yellow('\nNo reports yet. Run an audit first.\n'));
      return;
    }

    const dirs = opts.client
      ? [opts.client]
      : fs.readdirSync(reportsDir).filter(d => fs.statSync(path.join(reportsDir, d)).isDirectory());

    if (dirs.length === 0) {
      console.log(chalk.yellow('\nNo reports found.\n'));
      return;
    }

    dirs.forEach(clientId => {
      const clientDir = path.join(reportsDir, clientId);
      if (!fs.existsSync(clientDir)) return;
      const files = fs.readdirSync(clientDir).filter(f => f !== 'latest.json' && f !== 'latest.html').sort().reverse();
      console.log(chalk.bold.cyan(`\n  ${clientId}`));
      files.forEach(f => console.log(chalk.gray(`    reports/${clientId}/${f}`)));
    });
    console.log();
  });

// ── Default: interactive mode ─────────────────────────────────────────────────

if (process.argv.length === 2) {
  const { runInteractive } = require('./agents/InteractiveMode');
  runInteractive();
} else {
  program.parse(process.argv);
}
