import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * ScrollToTop
 * Scrolls window to (0, 0) whenever the route changes.
 * Place this as the first child inside <Routes> (or just outside it) in App.jsx.
 */
export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    // Use 'instant' so there is no visible scroll animation on page change
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])

  return null
}
