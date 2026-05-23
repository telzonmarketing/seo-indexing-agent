'use strict';

const axios = require('axios');

class GitHubConnector {
  constructor(token) {
    this.token = token || process.env.GITHUB_TOKEN;
    this.headers = {
      'Authorization': `token ${this.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'SEOIndexingAgent/1.0',
    };
    this.base = 'https://api.github.com';
  }

  async getRepoFiles(repo, branch = 'main') {
    if (!this.token) {
      console.warn('Warning: No GitHub token — reading public repos only');
    }

    // Get full file tree
    const treeRes = await axios.get(
      `${this.base}/repos/${repo}/git/trees/${branch}?recursive=1`,
      { headers: this.headers }
    );

    const relevantFiles = treeRes.data.tree.filter(f =>
      f.type === 'blob' &&
      f.path.match(/\.(tsx?|jsx?|json|txt|xml|toml|ya?ml)$/) &&
      !f.path.includes('node_modules') &&
      !f.path.includes('.next') &&
      !f.path.includes('dist') &&
      f.size < 200000 // skip very large files
    );

    const files = {};
    const batchSize = 10;

    for (let i = 0; i < Math.min(relevantFiles.length, 200); i += batchSize) {
      const batch = relevantFiles.slice(i, i + batchSize);
      await Promise.all(batch.map(async (file) => {
        try {
          const res = await axios.get(
            `${this.base}/repos/${repo}/contents/${file.path}?ref=${branch}`,
            { headers: this.headers }
          );
          if (res.data.content) {
            files[file.path] = Buffer.from(res.data.content, 'base64').toString('utf8');
          }
        } catch (_) {}
      }));
    }

    return files;
  }

  async pushFile(repo, filePath, content, commitMessage, branch = 'main') {
    if (!this.token) throw new Error('GitHub token required to push files');

    // Check if file exists to get its SHA
    let sha;
    try {
      const existing = await axios.get(
        `${this.base}/repos/${repo}/contents/${filePath}?ref=${branch}`,
        { headers: this.headers }
      );
      sha = existing.data.sha;
    } catch (_) {}

    const body = {
      message: commitMessage,
      content: Buffer.from(content).toString('base64'),
      branch,
    };
    if (sha) body.sha = sha;

    await axios.put(
      `${this.base}/repos/${repo}/contents/${filePath}`,
      body,
      { headers: this.headers }
    );
  }

  async createPullRequest(repo, title, body, branch, baseBranch = 'main') {
    if (!this.token) throw new Error('GitHub token required to create PRs');

    const res = await axios.post(
      `${this.base}/repos/${repo}/pulls`,
      { title, body, head: branch, base: baseBranch },
      { headers: this.headers }
    );
    return res.data.html_url;
  }
}

module.exports = { GitHubConnector };
