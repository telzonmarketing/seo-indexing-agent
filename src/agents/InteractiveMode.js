'use strict';

const inquirer = require('inquirer');
const chalk = require('chalk');
const { IndexingAgent } = require('./IndexingAgent');

async function runInteractive() {
  console.log(chalk.bold('Welcome! Let\'s audit and fix your website\'s indexing.\n'));

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: 'What do you want to do?',
      choices: [
        { name: 'Full pipeline (Audit + Fix + Submit) — recommended', value: 'run' },
        { name: 'Audit only — see all indexing issues', value: 'audit' },
        { name: 'Submit pages to Google — push URLs to Indexing API', value: 'submit' },
        { name: 'Monitor — watch indexing health over time', value: 'monitor' },
      ],
    },
    {
      type: 'input',
      name: 'siteUrl',
      message: 'Website URL (e.g. https://mysite.com):',
      default: process.env.SITE_URL || '',
      validate: v => v.startsWith('http') ? true : 'Please enter a valid URL starting with http(s)://',
    },
    {
      type: 'input',
      name: 'githubRepo',
      message: 'GitHub repo for source analysis (optional, e.g. owner/repo — press Enter to skip):',
      default: process.env.GITHUB_REPO || '',
    },
    {
      type: 'confirm',
      name: 'dryRun',
      message: 'Dry run? (preview fixes without applying)',
      default: false,
      when: (ans) => ans.mode === 'run' || ans.mode === 'fix',
    },
  ]);

  const agent = new IndexingAgent({
    siteUrl: answers.siteUrl,
    githubRepo: answers.githubRepo || undefined,
    dryRun: answers.dryRun,
  });

  switch (answers.mode) {
    case 'run': await agent.runFull(); break;
    case 'audit': await agent.audit('report.json'); break;
    case 'submit': await agent.submit(); break;
    case 'monitor': await agent.monitor(); break;
  }
}

module.exports = { runInteractive };
