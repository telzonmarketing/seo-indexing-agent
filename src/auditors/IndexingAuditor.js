'use strict';

const cheerio = require('cheerio');

class IndexingAuditor {
  constructor(config = {}) {
    this.config = config;
  }

  async audit(pages = [], sourceFiles = null) {
    const issues = [];

    // Detect client-side only rendering (SPA pages with no server content)
    const spaPages = pages.filter(p => this.isSPARendered(p));
    if (spaPages.length > 0) {
      issues.push({
        type: 'CLIENT_SIDE_RENDERING',
        severity: 'critical',
        title: `${spaPages.length} pages appear to be client-side rendered only`,
        description: 'These pages have very little HTML content served from the server. Googlebot may not execute JavaScript to see the full content, leaving them effectively invisible.',
        affectedUrls: spaPages.map(p => p.url),
        fix: 'ENABLE_SSR',
        fixData: { pages: spaPages.map(p => p.url), framework: this.detectFramework(sourceFiles) },
      });
    }

    // Detect Next.js specific issues from source files
    if (sourceFiles) {
      const nextIssues = this.auditNextJsSource(sourceFiles);
      issues.push(...nextIssues);
    }

    // Detect pages with very thin content
    const thinPages = pages.filter(p => p.contentLength < 500 && p.statusCode === 200);
    if (thinPages.length > 0) {
      issues.push({
        type: 'THIN_CONTENT',
        severity: 'important',
        title: `${thinPages.length} pages have very thin content (<500 bytes)`,
        description: 'Google deprioritises pages with very little content. This often indicates client-side rendering or empty shells.',
        affectedUrls: thinPages.map(p => p.url),
        fix: 'ADD_SERVER_CONTENT',
      });
    }

    // Detect redirect chains
    const redirectPages = pages.filter(p => p.redirectChain && p.redirectChain.length > 1);
    if (redirectPages.length > 0) {
      issues.push({
        type: 'REDIRECT_CHAINS',
        severity: 'important',
        title: `${redirectPages.length} pages have redirect chains`,
        description: 'Long redirect chains waste crawl budget and dilute link equity.',
        affectedUrls: redirectPages.map(p => p.redirectChain),
        fix: 'FIX_REDIRECT_CHAINS',
      });
    }

    return issues;
  }

  isSPARendered(page) {
    if (!page.html || page.statusCode !== 200) return false;
    const $ = cheerio.load(page.html);

    // Remove scripts and styles to see actual HTML content
    $('script, style, noscript').remove();
    const textContent = $('body').text().trim();

    // Signs of a SPA: very little text, but large HTML (from JS bundles)
    const htmlLength = page.html.length;
    const textLength = textContent.length;
    const ratio = textLength / Math.max(htmlLength, 1);

    return textLength < 100 && htmlLength > 5000 && ratio < 0.02;
  }

  detectFramework(sourceFiles) {
    if (!sourceFiles) return 'unknown';
    const files = Object.keys(sourceFiles);
    if (files.some(f => f.includes('next.config'))) return 'nextjs';
    if (files.some(f => f.includes('nuxt.config'))) return 'nuxtjs';
    if (files.some(f => f.includes('gatsby-config'))) return 'gatsby';
    if (files.some(f => f.includes('vite.config'))) return 'vite-react';
    if (files.some(f => f.includes('angular.json'))) return 'angular';
    return 'unknown';
  }

  auditNextJsSource(sourceFiles) {
    const issues = [];
    const fileEntries = Object.entries(sourceFiles);

    // Find pages using useEffect for data fetching (client-side only)
    const clientOnlyPages = fileEntries.filter(([path, content]) => {
      return (
        (path.includes('/pages/') || path.includes('/app/')) &&
        content.includes('useEffect') &&
        content.includes('fetch(') &&
        !content.includes('getStaticProps') &&
        !content.includes('getServerSideProps') &&
        !content.includes('async function Page') &&
        !content.includes('async function page')
      );
    });

    if (clientOnlyPages.length > 0) {
      issues.push({
        type: 'NEXTJS_CLIENT_FETCH',
        severity: 'critical',
        title: `${clientOnlyPages.length} Next.js pages fetch data client-side only`,
        description: 'Pages using useEffect+fetch render empty for Googlebot. Convert to getStaticProps, getServerSideProps, or async Server Components.',
        affectedFiles: clientOnlyPages.map(([path]) => path),
        fix: 'CONVERT_TO_SSR',
        fixData: { files: clientOnlyPages },
      });
    }

    // Check for missing generateMetadata
    const appRouterPages = fileEntries.filter(([path]) =>
      path.match(/app\/.*page\.(tsx?|jsx?)$/)
    );
    const missingMetadata = appRouterPages.filter(([, content]) =>
      !content.includes('generateMetadata') && !content.includes("export const metadata")
    );
    if (missingMetadata.length > 0) {
      issues.push({
        type: 'NEXTJS_MISSING_METADATA',
        severity: 'important',
        title: `${missingMetadata.length} App Router pages missing generateMetadata`,
        description: 'Without generateMetadata, pages get no title/description in search results.',
        affectedFiles: missingMetadata.map(([path]) => path),
        fix: 'ADD_GENERATE_METADATA',
        fixData: { files: missingMetadata },
      });
    }

    // Check for missing generateStaticParams on dynamic routes
    const dynamicPages = appRouterPages.filter(([path]) => path.includes('['));
    const missingStaticParams = dynamicPages.filter(([, content]) =>
      !content.includes('generateStaticParams')
    );
    if (missingStaticParams.length > 0) {
      issues.push({
        type: 'NEXTJS_MISSING_STATIC_PARAMS',
        severity: 'critical',
        title: `${missingStaticParams.length} dynamic routes missing generateStaticParams`,
        description: 'Dynamic routes without generateStaticParams are not pre-rendered. Google may never discover individual pages.',
        affectedFiles: missingStaticParams.map(([path]) => path),
        fix: 'ADD_GENERATE_STATIC_PARAMS',
      });
    }

    return issues;
  }
}

module.exports = { IndexingAuditor };
