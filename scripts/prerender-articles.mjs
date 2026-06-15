#!/usr/bin/env node
/**
 * Build-time prerenderer for the public Shipping Guides.
 *
 * The article content is fully static (sourced from client/src/data/articles.js),
 * so we can generate real, crawlable HTML for every guide at build time. Each
 * page gets:
 *   • the full article content rendered into <div id="root"> (visible without JS)
 *   • page-specific <title>, description, canonical and Open Graph/Twitter tags
 *   • Article + FAQPage + BreadcrumbList JSON-LD (for SEO + AEO)
 *
 * Because the SPA mounts with ReactDOM.createRoot (not hydrateRoot), React
 * replaces this prerendered markup on the client — so users get the full
 * interactive app while crawlers and answer engines get complete HTML.
 *
 * Output: client/dist/articles/index.html and client/dist/articles/<slug>/index.html
 * Run automatically after `npm run build` (see package.json).
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { articles, ARTICLE_CATEGORIES } from '../client/src/data/articles.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'client', 'dist')
const TEMPLATE_PATH = path.join(DIST, 'index.html')
const SITE_URL = 'https://thapsus.uk'

/* ── HTML helpers ───────────────────────────────────────────────────────────── */
const esc = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// Inline markup: **bold** and [label](url) → safe HTML. Text is escaped first,
// then the (escaped) markers are converted, so user content can't inject tags.
function inline(text = '') {
  let out = esc(text)
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const external = /^https?:\/\//.test(url)
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : ''
    return `<a href="${esc(url)}"${attrs}>${label}</a>`
  })
  return out
}

function renderBlock(b) {
  switch (b.type) {
    case 'h2': return `<h2>${esc(b.text)}</h2>`
    case 'h3': return `<h3>${esc(b.text)}</h3>`
    case 'p': return `<p>${inline(b.text)}</p>`
    case 'ul': return `<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`
    case 'ol': return `<ol>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ol>`
    case 'quote': return `<blockquote>${inline(b.text)}</blockquote>`
    case 'callout':
      return `<aside class="callout"><strong>${esc(b.title)}</strong><p>${inline(b.text)}</p></aside>`
    case 'table':
      return `<table><thead><tr>${b.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>` +
        `<tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    default: return ''
  }
}

/* ── JSON-LD (identical schemas to the React SEO component) ──────────────────── */
function articleJsonLd(a) {
  const url = `${SITE_URL}/articles/${a.slug}`
  return [
    {
      '@context': 'https://schema.org', '@type': 'Article',
      headline: a.title, description: a.description,
      keywords: (a.keywords || []).join(', '), articleSection: a.category,
      datePublished: a.datePublished, dateModified: a.dateModified || a.datePublished,
      author: { '@type': 'Organization', name: a.author?.name || 'Thapsus Cargo' },
      publisher: { '@type': 'Organization', name: 'Thapsus Cargo', logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` } },
      mainEntityOfPage: { '@type': 'WebPage', '@id': url }, url,
    },
    {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: (a.faqs || []).map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE_URL}/articles` },
        { '@type': 'ListItem', position: 3, name: a.title, item: url },
      ],
    },
  ]
}

function listingJsonLd() {
  return [
    {
      '@context': 'https://schema.org', '@type': 'Blog',
      name: 'Thapsus Cargo Shipping Guides',
      description: 'In-depth guides on shipping from the UK to Kenya — costs, customs, consolidation, Buy-for-me and more.',
      url: `${SITE_URL}/articles`,
      publisher: { '@type': 'Organization', name: 'Thapsus Cargo', logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` } },
    },
    {
      '@context': 'https://schema.org', '@type': 'ItemList',
      itemListElement: articles.map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE_URL}/articles/${a.slug}`, name: a.title })),
    },
  ]
}

const jsonLdScripts = (blocks) =>
  blocks.map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`).join('\n    ')

/* ── Body markup (visible without JS) ───────────────────────────────────────── */
function articleBodyHtml(a) {
  const takeaways = a.takeaways?.length
    ? `<section class="takeaways"><h2>Key takeaways</h2><ul>${a.takeaways.map((t) => `<li>${inline(t)}</li>`).join('')}</ul></section>` : ''
  const faqs = a.faqs?.length
    ? `<section class="faqs"><h2>Frequently asked questions</h2>${a.faqs.map((f) => `<div class="faq"><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`).join('')}</section>` : ''
  return `<main class="prerender-article"><article>
    <nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/articles">Guides</a> / <span>${esc(a.title)}</span></nav>
    <span class="cat">${esc(a.category)}</span>
    <h1>${esc(a.title)}</h1>
    <p class="meta">${a.readingTime} min read · Updated ${esc(new Date(a.dateModified || a.datePublished).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))} · By ${esc(a.author?.name || 'Thapsus Cargo')}</p>
    <div class="quick-answer"><strong>Quick answer</strong><p>${esc(a.quickAnswer)}</p></div>
    ${takeaways}
    <div class="body">${a.body.map(renderBlock).join('\n')}</div>
    ${faqs}
  </article></main>`
}

function listingBodyHtml() {
  const cards = articles.map((a) => `<li class="card"><a href="/articles/${a.slug}">
    <span class="cat">${esc(a.category)}</span>
    <h2>${esc(a.title)}</h2>
    <p>${esc(a.description)}</p>
    <span class="rt">${a.readingTime} min read</span>
  </a></li>`).join('\n')
  return `<main class="prerender-listing">
    <h1>Shipping guides &amp; resources</h1>
    <p class="lede">Clear, in-depth answers to everything about shipping from the UK to Kenya — costs, customs, consolidation and smart shopping.</p>
    <p class="cats">Categories: ${ARTICLE_CATEGORIES.map(esc).join(' · ')}</p>
    <ul class="cards">${cards}</ul>
  </main>`
}

/* ── Template injection ─────────────────────────────────────────────────────── */
function buildPage(template, { title, description, canonical, type, jsonLd, body }) {
  const fullTitle = `${title} | Thapsus Cargo`
  const url = `${SITE_URL}${canonical}`
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(fullTitle)}</title>`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(url)}" />`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}" />`)
    .replace(/<meta property="og:type"[^>]*>/, `<meta property="og:type" content="${esc(type)}" />`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${esc(url)}" />`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(fullTitle)}" />`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(description)}" />`)
    .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(fullTitle)}" />`)
    .replace(/<meta name="twitter:url"[^>]*>/, `<meta name="twitter:url" content="${esc(url)}" />`)
    .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${esc(description)}" />`)

  // Inject JSON-LD just before </head>
  html = html.replace('</head>', `    ${jsonLdScripts(jsonLd)}\n  </head>`)
  // Inject prerendered content into the root container
  html = html.replace('<div id="root"></div>', `<div id="root">${body}</div>`)
  return html
}

/* ── Main ───────────────────────────────────────────────────────────────────── */
async function main() {
  if (!existsSync(TEMPLATE_PATH)) {
    console.error(`[prerender] ${TEMPLATE_PATH} not found — run the client build first.`)
    process.exit(1)
  }
  const template = await readFile(TEMPLATE_PATH, 'utf8')

  // Listing page → client/dist/articles/index.html
  const listingDir = path.join(DIST, 'articles')
  await mkdir(listingDir, { recursive: true })
  await writeFile(path.join(listingDir, 'index.html'), buildPage(template, {
    title: 'Shipping Guides & Resources',
    description: 'In-depth guides on shipping from the UK to Kenya — costs, customs duty, package consolidation, Buy-for-me and more. Practical, up-to-date answers for Kenyan shoppers.',
    canonical: '/articles', type: 'website', jsonLd: listingJsonLd(), body: listingBodyHtml(),
  }))

  // Each article → client/dist/articles/<slug>/index.html
  for (const a of articles) {
    const dir = path.join(DIST, 'articles', a.slug)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'index.html'), buildPage(template, {
      title: a.title, description: a.description,
      canonical: `/articles/${a.slug}`, type: 'article',
      jsonLd: articleJsonLd(a), body: articleBodyHtml(a),
    }))
  }

  console.log(`[prerender] Wrote ${articles.length + 1} static guide pages to client/dist/articles/`)
}

main().catch((err) => { console.error('[prerender] failed:', err); process.exit(1) })
