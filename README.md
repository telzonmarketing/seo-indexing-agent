# SEO Indexing Agent

An AI-powered bot that audits **any website** for indexing issues, auto-generates fixes, and submits all pages to Google — targeting 99% indexing accuracy.

Works on: **Next.js · React · WordPress · Custom CMS · Any website**

---

## What it does

| Phase | Action |
|-------|--------|
| **Audit** | Crawls all pages, checks robots.txt, sitemap, meta tags, canonical URLs, rendering, CSR detection |
| **Fix** | Generates exact code fixes for every issue found, pushes patches to your GitHub repo |
| **Submit** | Sends every page URL to Google Indexing API for fast discovery |
| **Monitor** | Runs on a schedule via GitHub Actions — alerts you when new issues appear |

---

## Quick Start

```bash
# 1. Clone or copy this repo into your project
git clone https://github.com/YOUR_USERNAME/seo-indexing-agent

# 2. Install dependencies
npm install

# 3. Run interactive setup
npm run setup

# 4. Run the full pipeline
node src/index.js run --url https://yourwebsite.com
```

---

## CLI Commands

```bash
# Full pipeline: audit + fix + submit (recommended)
node src/index.js run --url https://mysite.com

# Audit only — see all issues without changing anything
node src/index.js audit --url https://mysite.com --output report.json

# Audit + read GitHub source for deeper analysis
node src/index.js audit --url https://mysite.com --github owner/repo

# Auto-fix issues and push to GitHub
node src/index.js fix --url https://mysite.com --github owner/repo

# Submit all pages to Google Indexing API
node src/index.js submit --url https://mysite.com

# Submit from your sitemap URL
node src/index.js submit --sitemap https://mysite.com/sitemap.xml

# Monitor continuously (checks every 24h)
node src/index.js monitor --url https://mysite.com --interval 24

# Dry run — preview fixes without applying
node src/index.js run --url https://mysite.com --dry-run

# Interactive mode (no flags needed)
node src/index.js
```

---

## Google Setup (for auto-submission)

The agent submits pages to Google via the **Indexing API**. Setup takes ~5 minutes:

### Step 1 — Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable these APIs:
   - **Web Search Indexing API**
   - **Search Console API**

### Step 2 — Create a Service Account

1. Go to **IAM & Admin → Service Accounts**
2. Click **Create Service Account**
3. Name it `seo-indexing-agent`
4. Click **Create and Continue**
5. Skip role assignment (we'll add in Search Console)
6. Click **Done**

### Step 3 — Download the key

1. Click your new service account
2. Go to **Keys** tab
3. Click **Add Key → Create new key → JSON**
4. Save the downloaded file as `config/service-account.json`

### Step 4 — Add to Search Console

1. Go to [search.google.com/search-console](https://search.google.com/search-console)
2. Select your property
3. Go to **Settings → Users and permissions**
4. Click **Add user**
5. Paste the service account email (looks like `seo-indexing-agent@project-id.iam.gserviceaccount.com`)
6. Set role to **Owner**

### Step 5 — Configure .env

```env
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./config/service-account.json
SITE_URL=https://yourwebsite.com
```

---

## GitHub Actions — Automated monitoring

The included workflow runs automatically:
- **On every push to main** — catches regressions immediately
- **Daily at 8am UTC** — ongoing monitoring

### Setup GitHub Secrets

Go to your repo → **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|--------|-------|
| `SITE_URL` | `https://yourwebsite.com` |
| `GH_TOKEN` | Your GitHub personal access token |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Contents of `service-account.json` (entire JSON) |

The workflow auto-uploads audit reports as artifacts and comments on commits if critical issues are found.

---

## What gets audited

### robots.txt
- Missing robots.txt
- Blanket `Disallow: /` blocking all crawlers
- No `Sitemap:` directive
- Pages blocked by rules

### Sitemap
- Missing sitemap.xml
- Malformed XML
- Pages missing from sitemap
- noindex pages listed in sitemap
- Sitemap exceeds 50,000 URL limit

### Meta tags
- noindex pages (critical if unintentional)
- Missing or duplicate title tags
- Missing meta descriptions
- Missing or wrong canonical URLs
- Missing H1 headings

### Rendering (Next.js / React)
- Client-side only data fetching (useEffect + fetch)
- Missing `generateMetadata()`
- Missing `generateStaticParams()` on dynamic routes
- Thin content / empty page shells

### Performance
- Pages loading over 3 seconds
- 4xx / 5xx error pages
- Redirect chains

---

## Output

The agent generates:
- `full-report.json` — complete audit data
- `report.html` — visual HTML report (use `--output report.html`)
- Console summary with colour-coded issues and score

---

## Configuration

All options via `.env`:

```env
SITE_URL=https://yourwebsite.com
GITHUB_TOKEN=ghp_...
GITHUB_REPO=owner/repo
GITHUB_BRANCH=main
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./config/service-account.json
MAX_CRAWL_PAGES=1000
CRAWL_DELAY_MS=500
AUTO_SUBMIT=true
MONITOR_INTERVAL_HOURS=24
```

---

## Works on any website

The crawler uses standard HTTP requests with Googlebot-compatible headers. It works on:
- Next.js / React / Vue / Angular SPAs
- WordPress / Drupal / Joomla
- Custom Express / Django / Rails apps
- Static sites (Jekyll, Hugo, Astro)
- Any publicly accessible website

For closed/private sites, provide the `--github` flag to analyse source code directly.

---

## License

MIT
