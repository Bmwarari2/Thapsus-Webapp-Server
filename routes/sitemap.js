import express from 'express';

const router = express.Router();

// ─── Central route registry ─────────────────────────────────────────────────
// Add new public pages here and the sitemap + robots.txt update automatically.
const PUBLIC_ROUTES = [
  { path: '/',              changefreq: 'weekly',  priority: 1.0  },
  { path: '/pricing',       changefreq: 'weekly',  priority: 0.9  },
  { path: '/track',         changefreq: 'daily',   priority: 0.9  },
  { path: '/exchange',      changefreq: 'daily',   priority: 0.7  },
  { path: '/prohibited',    changefreq: 'monthly', priority: 0.6  },
  { path: '/login',         changefreq: 'monthly', priority: 0.5  },
  { path: '/register',      changefreq: 'monthly', priority: 0.5  },
  { path: '/forgot-password', changefreq: 'yearly', priority: 0.3 },
  { path: '/privacy',       changefreq: 'yearly',  priority: 0.3  },
  { path: '/terms',         changefreq: 'yearly',  priority: 0.3  },
];

// Protected / admin paths that crawlers should NOT index
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
