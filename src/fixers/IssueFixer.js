'use strict';

const chalk = require('chalk');
const { URL } = require('url');

class IssueFixer {
  constructor(config = {}) {
    this.config = config;
  }

  async fix(issues = []) {
    const fixes = [];

    for (const issue of issues) {
      const fix = await this.generateFix(issue);
      if (fix) {
        fixes.push(fix);
        console.log(chalk.green(`  ✓ Fix generated: ${issue.title}`));
      }
    }

    return fixes;
  }

  async generateFix(issue) {
    switch (issue.fix) {
      case 'CREATE_ROBOTS_TXT': return this.fixCreateRobots(issue);
      case 'FIX_ROBOTS_TXT': return this.fixBlockingRobots(issue);
      case 'ADD_SITEMAP_TO_ROBOTS': return this.fixAddSitemapToRobots(issue);
      case 'CREATE_SITEMAP': return this.fixCreateSitemap(issue);
      case 'UPDATE_SITEMAP': return this.fixUpdateSitemap(issue);
      case 'REMOVE_NOINDEX': return this.fixRemoveNoindex(issue);
      case 'ADD_CANONICAL_TAGS': return this.fixAddCanonicals(issue);
      case 'ENABLE_SSR': return this.fixEnableSSR(issue);
      case 'ADD_GENERATE_METADATA': return this.fixAddMetadata(issue);
      case 'ADD_GENERATE_STATIC_PARAMS': return this.fixAddStaticParams(issue);
      case 'CONVERT_TO_SSR': return this.fixConvertToSSR(issue);
      default: return this.fixGeneric(issue);
    }
  }

  fixCreateRobots(issue) {
    const siteUrl = issue.fixData?.siteUrl || 'https://yoursite.com';
    const content = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /_next/
Disallow: /admin/
Disallow: /private/

Sitemap: ${siteUrl}/sitemap.xml
`;
    return {
      issue: issue.title,
      description: 'Create robots.txt with correct rules and sitemap reference',
      fileChange: { path: 'public/robots.txt', content },
      code: content,
    };
  }

  fixBlockingRobots(issue) {
    const siteUrl = issue.fixData?.siteUrl || 'https://yoursite.com';
    const content = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /_next/
Disallow: /admin/

Sitemap: ${siteUrl}/sitemap.xml
`;
    return {
      issue: issue.title,
      description: 'Replace blocking robots.txt with correct configuration',
      fileChange: { path: 'public/robots.txt', content },
      code: content,
    };
  }

  fixAddSitemapToRobots(issue) {
    const siteUrl = issue.fixData?.siteUrl || 'https://yoursite.com';
    const current = issue.fixData?.robotsText || '';
    const content = current.trimEnd() + `\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
    return {
      issue: issue.title,
      description: 'Add Sitemap directive to existing robots.txt',
      fileChange: { path: 'public/robots.txt', content },
      code: `Sitemap: ${siteUrl}/sitemap.xml`,
    };
  }

  fixCreateSitemap(issue) {
    const siteUrl = issue.fixData?.siteUrl || 'https://yoursite.com';
    const pages = issue.fixData?.pages || [];

    const nextjsSitemapCode = `// app/sitemap.ts — Next.js App Router dynamic sitemap
import { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Replace with your actual data source (database, CMS, API)
  // const pages = await db.query('SELECT slug, updated_at FROM pages')

  const staticPages = [
    { url: '${siteUrl}', lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: '${siteUrl}/about', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: '${siteUrl}/contact', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
  ]

  // Uncomment and adapt for dynamic pages:
  // const dynamicPages = pages.map(page => ({
  //   url: \`${siteUrl}/\${page.slug}\`,
  //   lastModified: page.updated_at,
  //   changeFrequency: 'weekly',
  //   priority: 0.8,
  // }))

  return [
    ...staticPages,
    // ...dynamicPages,
  ]
}
`;

    const staticXml = this.generateSitemapXml(siteUrl, pages);

    return {
      issue: issue.title,
      description: 'Create dynamic sitemap for Next.js App Router',
      fileChange: { path: 'app/sitemap.ts', content: nextjsSitemapCode },
      code: nextjsSitemapCode,
      additionalFiles: [{ path: 'public/sitemap.xml', content: staticXml }],
    };
  }

  fixUpdateSitemap(issue) {
    const siteUrl = issue.fixData?.siteUrl || 'https://yoursite.com';
    const missingUrls = issue.fixData?.missingUrls || [];
    const xmlEntries = missingUrls.map(url => `  <url>
    <loc>${url}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n');

    return {
      issue: issue.title,
      description: `Add ${missingUrls.length} missing URLs to sitemap`,
      code: `<!-- Add these entries to your sitemap.xml -->\n${xmlEntries}`,
      instruction: 'These URLs were found by crawling but are not in your sitemap. Add them to app/sitemap.ts or sitemap.xml.',
    };
  }

  fixRemoveNoindex(issue) {
    return {
      issue: issue.title,
      description: 'Remove noindex meta tags from production pages',
      code: `// Search your codebase for these patterns and remove them:
// <meta name="robots" content="noindex" />
// <meta name="robots" content="noindex, nofollow" />

// In Next.js — check for accidental noindex in layout.tsx or page.tsx:
// export const metadata = { robots: { index: false } }  ← REMOVE THIS

// Also check environment-specific config — staging noindex often bleeds into prod:
// next.config.js — ensure no headers() block adds X-Robots-Tag: noindex`,
      affectedUrls: issue.affectedUrls,
    };
  }

  fixAddCanonicals(issue) {
    return {
      issue: issue.title,
      description: 'Add canonical tags to all pages via Next.js metadata',
      code: `// app/layout.tsx — add canonical to root layout
export const metadata = {
  alternates: {
    canonical: '/',  // relative canonicals work in Next.js 13+
  },
}

// app/blog/[slug]/page.tsx — dynamic canonical
export async function generateMetadata({ params }) {
  return {
    alternates: {
      canonical: \`https://yoursite.com/blog/\${params.slug}\`,
    },
  }
}`,
      fileChange: null,
    };
  }

  fixEnableSSR(issue) {
    const framework = issue.fixData?.framework || 'nextjs';
    return {
      issue: issue.title,
      description: 'Convert client-side rendered pages to Server Components',
      code: `// BEFORE — client-side only (Googlebot sees empty page):
'use client'
import { useEffect, useState } from 'react'
export default function Page() {
  const [data, setData] = useState(null)
  useEffect(() => { fetch('/api/data').then(r => r.json()).then(setData) }, [])
  if (!data) return <div>Loading...</div>
  return <div>{data.title}</div>
}

// AFTER — Server Component (Googlebot sees full content instantly):
// No 'use client' directive needed
export default async function Page() {
  const data = await fetch('https://api.example.com/data', {
    next: { revalidate: 3600 }  // ISR: revalidate every hour
  }).then(r => r.json())
  return <div>{data.title}</div>
}`,
    };
  }

  fixAddMetadata(issue) {
    return {
      issue: issue.title,
      description: 'Add generateMetadata to App Router pages',
      code: `// Add to each page.tsx file:
import { Metadata } from 'next'

// For static pages:
export const metadata: Metadata = {
  title: 'Page Title | Site Name',
  description: 'A clear description of this page for Google search results.',
  openGraph: {
    title: 'Page Title',
    description: 'Description for social sharing',
  },
}

// For dynamic pages:
export async function generateMetadata({ params }): Promise<Metadata> {
  const item = await getData(params.slug)
  return {
    title: \`\${item.title} | Site Name\`,
    description: item.excerpt,
    alternates: { canonical: \`https://yoursite.com/\${params.slug}\` },
    openGraph: { title: item.title, images: [item.image] },
  }
}`,
    };
  }

  fixAddStaticParams(issue) {
    return {
      issue: issue.title,
      description: 'Add generateStaticParams to dynamic route pages',
      code: `// app/products/[id]/page.tsx
// This pre-renders every product page at build time

export async function generateStaticParams() {
  // Fetch all IDs from your data source
  const products = await fetch('https://api.example.com/products').then(r => r.json())

  return products.map((product) => ({
    id: product.id.toString(),
  }))
}

// Pages are now statically generated at build time
// Google will find all of them via sitemap + crawling
export default async function ProductPage({ params }) {
  const product = await getProduct(params.id)
  return <Product data={product} />
}`,
    };
  }

  fixConvertToSSR(issue) {
    return {
      issue: issue.title,
      description: 'Convert useEffect data fetching to server-side',
      code: `// Pattern to replace in each affected file:
// Remove: useEffect, useState, client-side fetch
// Add: async server component or getServerSideProps

// App Router conversion:
// 1. Remove 'use client' from the top of the file
// 2. Make the component async
// 3. Move fetch calls to the component body (top level)
// 4. Remove useEffect and useState hooks

// If you need interactivity, split the component:
// - page.tsx (server) → fetches data, passes as props
// - ProductDetails.tsx (client, 'use client') → handles UI interactions only`,
    };
  }

  fixGeneric(issue) {
    return {
      issue: issue.title,
      description: issue.description,
      instruction: `Manual fix required for: ${issue.type}. See audit report for details.`,
    };
  }

  generateSitemapXml(siteUrl, pages) {
    const urls = pages.length > 0 ? pages : [siteUrl];
    const entries = urls.map(url => `  <url>
    <loc>${url}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;
  }
}

module.exports = { IssueFixer };
