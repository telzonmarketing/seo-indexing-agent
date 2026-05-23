'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class Reporter {
  async save(results, outputFile = 'report.json', clientId = null) {
    const report = {
      timestamp: new Date().toISOString(),
      client: results.client || null,
      siteUrl: results.siteUrl || null,
      summary: {
        pagesFound: results.pagesFound,
        issuesFound: results.issuesFound.length,
        critical: results.issuesFound.filter(i => i.severity === 'critical').length,
        important: results.issuesFound.filter(i => i.severity === 'important').length,
        low: results.issuesFound.filter(i => i.severity === 'low').length,
        issuesFixed: results.issuesFixed.length,
        pagesSubmitted: results.pagesSubmitted.length,
      },
      issues: results.issuesFound,
      fixes: results.issuesFixed,
      submitted: results.pagesSubmitted,
      errors: results.errors,
    };

    // If client-scoped, save to reports/<clientId>/ directory
    if (clientId) {
      const date = new Date().toISOString().slice(0, 10);
      const dir = path.resolve(process.cwd(), `reports/${clientId}`);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const ext = outputFile.endsWith('.html') ? 'html' : 'json';
      const dated = path.join(dir, `${date}-audit.${ext}`);
      const latest = path.join(dir, `latest.${ext}`);

      const content = ext === 'html' ? this.generateHTML(report) : JSON.stringify(report, null, 2);
      fs.writeFileSync(dated, content);
      fs.writeFileSync(latest, content);
      console.log(chalk.gray(`  Report saved: reports/${clientId}/${date}-audit.${ext}`));
      return;
    }

    if (outputFile.endsWith('.html')) {
      fs.writeFileSync(outputFile, this.generateHTML(report));
    } else {
      fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
    }
  }

  printSummary(results) {
    const critical = results.issuesFound.filter(i => i.severity === 'critical');
    const important = results.issuesFound.filter(i => i.severity === 'important');
    const low = results.issuesFound.filter(i => i.severity === 'low');

    console.log('\n' + chalk.bold('─'.repeat(56)));
    console.log(chalk.bold('  AUDIT SUMMARY'));
    console.log(chalk.bold('─'.repeat(56)));
    console.log(`  Pages crawled:       ${chalk.bold(results.pagesFound)}`);
    console.log(`  Total issues:        ${chalk.bold(results.issuesFound.length)}`);
    console.log(`  Critical:            ${critical.length > 0 ? chalk.red.bold(critical.length) : chalk.green('0')}`);
    console.log(`  Important:           ${important.length > 0 ? chalk.yellow.bold(important.length) : chalk.green('0')}`);
    console.log(`  Low:                 ${chalk.gray(low.length)}`);
    console.log(chalk.bold('─'.repeat(56)));

    if (critical.length > 0) {
      console.log(chalk.red.bold('\n  CRITICAL issues (fix immediately):'));
      critical.forEach(i => console.log(chalk.red(`  ✗ ${i.title}`)));
    }
    if (important.length > 0) {
      console.log(chalk.yellow.bold('\n  IMPORTANT issues:'));
      important.forEach(i => console.log(chalk.yellow(`  ! ${i.title}`)));
    }
    if (low.length > 0) {
      console.log(chalk.gray.bold('\n  Low priority:'));
      low.forEach(i => console.log(chalk.gray(`  · ${i.title}`)));
    }

    const score = Math.max(0, 100 - (critical.length * 20) - (important.length * 8) - (low.length * 2));
    const scoreColor = score >= 80 ? chalk.green : score >= 60 ? chalk.yellow : chalk.red;
    console.log('\n' + chalk.bold('─'.repeat(56)));
    console.log(`  Indexing score:      ${scoreColor.bold(score + '/100')}`);
    console.log(chalk.bold('─'.repeat(56)) + '\n');
  }

  generateHTML(report) {
    const severityColor = { critical: '#E24B4A', important: '#BA7517', low: '#888780' };
    const issueRows = report.issues.map(i => `
      <tr>
        <td><span style="color:${severityColor[i.severity]||'#888'};font-weight:500">${i.severity}</span></td>
        <td>${i.title}</td>
        <td>${i.description}</td>
      </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>SEO Indexing Report — ${new Date(report.timestamp).toLocaleDateString()}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 2rem; color: #1a1a1a; }
  h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: .5rem; }
  .meta { color: #666; font-size: .9rem; margin-bottom: 2rem; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); gap: 1rem; margin-bottom: 2rem; }
  .card { background: #f5f5f5; border-radius: 8px; padding: 1rem; }
  .card-label { font-size: .75rem; color: #666; margin-bottom: .25rem; }
  .card-value { font-size: 1.75rem; font-weight: 600; }
  .critical { color: #E24B4A; } .important { color: #BA7517; }
  table { width: 100%; border-collapse: collapse; font-size: .875rem; }
  th { text-align: left; padding: .75rem; background: #f5f5f5; border-bottom: 1px solid #eee; }
  td { padding: .75rem; border-bottom: 1px solid #eee; vertical-align: top; }
</style>
</head>
<body>
<h1>SEO Indexing Agent Report</h1>
<p class="meta">Generated: ${new Date(report.timestamp).toLocaleString()} &nbsp;|&nbsp; Pages crawled: ${report.summary.pagesFound}</p>
<div class="cards">
  <div class="card"><div class="card-label">Total issues</div><div class="card-value">${report.summary.issuesFound}</div></div>
  <div class="card"><div class="card-label">Critical</div><div class="card-value critical">${report.summary.critical}</div></div>
  <div class="card"><div class="card-label">Important</div><div class="card-value important">${report.summary.important}</div></div>
  <div class="card"><div class="card-label">Pages submitted</div><div class="card-value">${report.summary.pagesSubmitted}</div></div>
</div>
<h2 style="font-size:1.1rem;margin-bottom:.75rem">Issues found</h2>
<table><thead><tr><th>Severity</th><th>Issue</th><th>Description</th></tr></thead>
<tbody>${issueRows}</tbody></table>
</body></html>`;
  }
}

module.exports = { Reporter };
