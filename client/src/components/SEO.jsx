import { useEffect } from 'react'

const SITE_NAME = 'Thapsus Cargo'
const SITE_URL = 'https://thapsus.uk'

/** Set (or create) a <meta> tag by name/property attribute. */
function setMeta(attr, key, content) {
  if (!content) return
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

/** Set (or create) the canonical <link>. */
function setCanonical(href) {
  if (!href) return
  let el = document.head.querySelector('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Lightweight, dependency-free SEO + AEO head manager.
 *
 * Sets <title>, meta description, canonical, Open Graph + Twitter tags, and
 * injects any number of JSON-LD structured-data blocks (Article, FAQPage,
 * BreadcrumbList, etc.). Structured data is the backbone of Answer Engine
 * Optimization (AEO): it lets Google, Bing and AI answer engines lift clean,
 * citable facts straight from the page.
 *
 * All page-scoped JSON-LD is tagged with `data-seo-jsonld` and removed on
 * unmount so schema never leaks across client-side navigations.
 *
 * Usage:
 *   <SEO
 *     title="Page Title"
 *     description="…"
 *     canonical="/articles/my-slug"
 *     image="https://…/og.png"
 *     type="article"
 *     jsonLd={[articleSchema, faqSchema]}
 *   />
 */
export function SEO({
  title,
  description,
  canonical,
  image = `${SITE_URL}/og-image.png`,
  type = 'website',
  jsonLd,
}) {
  useEffect(() => {
    const fullTitle = title
      ? `${title} | ${SITE_NAME}`
      : `${SITE_NAME} — Affordable Shipping from the UK to Kenya`
    document.title = fullTitle

    const url = canonical
      ? (canonical.startsWith('http') ? canonical : `${SITE_URL}${canonical}`)
      : (typeof window !== 'undefined' ? window.location.href.split('?')[0] : SITE_URL)

    if (description) {
      setMeta('name', 'description', description)
      setMeta('property', 'og:description', description)
      setMeta('name', 'twitter:description', description)
    }

    setCanonical(url)
    setMeta('property', 'og:title', title ? `${title} | ${SITE_NAME}` : fullTitle)
    setMeta('property', 'og:type', type)
    setMeta('property', 'og:url', url)
    setMeta('property', 'og:image', image)
    setMeta('name', 'twitter:title', title ? `${title} | ${SITE_NAME}` : fullTitle)
    setMeta('name', 'twitter:url', url)
    setMeta('name', 'twitter:image', image)

    // ── JSON-LD structured data (AEO) ──────────────────────────────────────
    const blocks = (Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : []).filter(Boolean)
    const nodes = blocks.map((data) => {
      const s = document.createElement('script')
      s.type = 'application/ld+json'
      s.setAttribute('data-seo-jsonld', 'true')
      s.text = JSON.stringify(data)
      document.head.appendChild(s)
      return s
    })

    return () => {
      nodes.forEach((n) => n.remove())
    }
  }, [title, description, canonical, image, type, jsonLd])

  return null
}
