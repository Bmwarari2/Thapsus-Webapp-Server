import { useEffect } from 'react'

/**
 * Lightweight SEO component — sets <title> and <meta name="description">
 * per page without requiring react-helmet or any extra dependency.
 *
 * Usage:  <SEO title="Page Title" description="Page description text" />
 */
export function SEO({ title, description }) {
  useEffect(() => {
    const suffix = 'Thapsus Cargo'
    document.title = title ? `${title} | ${suffix}` : `${suffix} — Affordable Shipping from the UK to Kenya`

    if (description) {
      let meta = document.querySelector('meta[name="description"]')
      if (meta) {
        meta.setAttribute('content', description)
      }
      // Also update OG description
      let ogDesc = document.querySelector('meta[property="og:description"]')
      if (ogDesc) {
        ogDesc.setAttribute('content', description)
      }
    }
  }, [title, description])

  return null
}
