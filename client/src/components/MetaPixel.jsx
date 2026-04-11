import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * MetaPixel
 * Fires a Meta (Facebook) Pixel PageView on every React Router route change.
 *
 * Why this is needed:
 * In a SPA, the fbq('track', 'PageView') call in index.html only fires
 * ONE pageview on initial load. Client-side route changes (e.g. user
 * clicks a link and React Router swaps the route) do NOT trigger a
 * page load, so the pixel never hears about them. This component
 * listens for route changes and manually fires a PageView for each one.
 *
 * The pixel itself is initialised in index.html — this component only
 * sends additional PageView events on navigation.
 *
 * Place this inside <BrowserRouter> alongside <GoogleAnalytics />.
 */
export function MetaPixel() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    // Guard: fbq is loaded from index.html; if it's blocked
    // (ad blocker, Brave, etc.) we just no-op silently.
    if (typeof window.fbq !== 'function') return

    window.fbq('track', 'PageView')
  }, [pathname, search])

  return null
}
