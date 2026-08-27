import express from 'express';

const router = express.Router();

// ─── Central route registry ─────────────────────────────────────────────────
// Add new public pages here and the sitemap + robots.txt update automatically.
// Article slugs are derived from the client data file so the sitemap stays in
// sync automatically — add a guide in client/src/data/articles.js and it is
// crawlable here with no further edits. The data module is pure ESM data
// (no JSX / Vite-specific syntax) so Node can import it directly.
import { articles } from '../client/src/data/articles.js';

const ARTICLE_SLUGS = articles.map((a) => a.slug);

// Every public, indexable page in the SPA (see client/src/App.jsx). Each is
// served by the SPA fallback (or prerendered, for /articles) so crawlers get
// a 200 + rendered content. Keep this in step with the public <Route>s.
const PUBLIC_ROUTES = [
  // /pricing, /uk-stores, /prohibited and /register were retired with the
  // WhatsApp-first rebuild — the SPA 404s them, and a sitemap pointing
  // crawlers at 404s hurts more than it helps.
  { path: '/',              changefreq: 'weekly',  priority: 1.0  },
  { path: '/track',         changefreq: 'daily',   priority: 0.9  },
  { path: '/articles',      changefreq: 'weekly',  priority: 0.8  },
  { path: '/faq',           changefreq: 'monthly', priority: 0.6  },
  { path: '/login',         changefreq: 'monthly', priority: 0.5  },
  { path: '/forgot-password', changefreq: 'yearly', priority: 0.3 },
  { path: '/privacy',       changefreq: 'yearly',  priority: 0.3  },
  { path: '/terms',         changefreq: 'yearly',  priority: 0.3  },
  // Individual guide pages
  ...ARTICLE_SLUGS.map((slug) => ({
    path: `/articles/${slug}`, changefreq: 'monthly', priority: 0.7,
  })),
];

// Public routes that are intentionally NOT in the sitemap. They are reachable
// (the SPA serves them) but have no search value — they are transactional,
// token-based, or parameterised. We also Disallow them below so crawlers don't
// waste budget on, or index, thin/sensitive pages.
//   /check-inbox, /verify-email  — post-signup email landings
//   /reset-password              — one-time token page
//   /pay/:orderId                — per-order payment page (sensitive)
//   /nps                         — post-delivery survey landing
//   /track/:tn                   — parameterised tracking deep-link
//
// NOTE: /exchange was previously listed here but no such page exists in the
// router, so it 404'd — removed to keep the sitemap free of dead URLs.

// Protected / admin / transactional paths that crawlers should NOT index
const DISALLOWED_PATHS = [
  '/admin',
  '/dashboard',
  '/credit',
  '/orders',
  '/orders/*',
  '/consolidation',
  '/support',
  '/warehouse',
  '/ship-instructions',
  // Transactional / token / sensitive public pages (no SEO value)
  '/check-inbox',
  '/verify-email',
  '/reset-password',
  '/pay',
  '/nps',
  '/api/',
];

function getBaseUrl(req) {
  // Prefer env var, fall back to request host
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host  = req.headers['x-forwarded-host']  || req.headers.host;
  return `${proto}://${host}`;
}

// ─── GET /sitemap.xml ────────────────────────────────────────────────────────
router.get('/sitemap.xml', (req, res) => {
  const base    = getBaseUrl(req);
  const today   = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const urls = PUBLIC_ROUTES.map(({ path, changefreq, priority }) => `
  <url>
    <loc>${base}${path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority.toFixed(1)}</priority>
  </url>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">${urls}
</urlset>`;

  res.set({
    'Content-Type': 'application/xml',
    'Cache-Control': 'public, max-age=3600, s-maxage=3600',
  });
  res.send(xml);
});

// ─── GET /robots.txt ─────────────────────────────────────────────────────────
router.get('/robots.txt', (req, res) => {
  const base = getBaseUrl(req);

  const disallowLines = DISALLOWED_PATHS.map(p => `Disallow: ${p}`).join('\n');

  const txt = `# Thapsus Cargo — robots.txt
User-agent: *
Allow: /
${disallowLines}

Sitemap: ${base}/sitemap.xml
`;

  res.set({
    'Content-Type': 'text/plain',
    'Cache-Control': 'public, max-age=86400, s-maxage=86400',
  });
  res.send(txt);
});

export default router;
export { PUBLIC_ROUTES, DISALLOWED_PATHS };
