import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * GoogleAnalytics
 * Fires a GA4 pageview on every React Router route change.
 *
 * Why this is needed:
 * In a SPA, the `gtag('config', ...)` call in index.html only fires
 * ONE pageview on initial load. Client-side route changes (e.g. user
 * clicks a link and React Router swaps the route) do NOT trigger a
 * page load, so GA4 never hears about them. This component listens
 * for route changes and manually fires a pageview for each one.
 *
 * Place this inside <BrowserRouter> alongside <ScrollToTop />.
 */
const GA_MEASUREMENT_ID = 'G-09M01VBWF0'

export function GoogleAnalytics() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    // Guard: gtag is loaded from index.html; if it's blocked
    // (ad blocker, Brave, etc.) we just no-op silently.
    if (typeof window.gtag !== 'function') return

    window.gtag('config', GA_MEASUREMENT_ID, {
      page_path: pathname + search,
    })
  }, [pathname, search])

  return null
}
