import { useEffect } from 'react'

/**
 * useIdleTagManager
 * ─────────────────
 * Defers loading of marketing/analytics scripts (Google Tag Manager + Meta
 * Pixel) until the first sign of user interaction OR a fallback timeout —
 * whichever comes first. The point is to keep the main thread free during
 * the initial hydration window so LCP / TBT don't get torpedoed by
 * third-party JS the user hasn't asked to interact with yet.
 *
 * Loading strategy:
 *   • One-shot listeners on `scroll`, `mousemove`, `touchstart`, `keydown`.
 *     The first to fire triggers the loader.
 *   • A 3.5s `setTimeout` fallback so bots/users-who-don't-touch-anything
 *     still get instrumented eventually.
 *   • The loader is idempotent — calling it twice does nothing the second
 *     time.
 *   • On unmount, both the timer and any still-pending listeners are torn
 *     down so we never leak handlers between route changes / hot reloads.
 *
 * The Google Consent Mode v2 default state (`denied` for everything except
 * `security_storage`) is set inside the loader, BEFORE `gtm.js` is
 * appended, so the GTM container is loaded with the correct consent
 * baseline. CookieConsent.jsx subsequently calls `gtag('consent','update',
 * {...})` once the user opts in.
 *
 * @param {string|undefined} gtmId      — Google Tag / GA4 measurement ID
 * @param {string|undefined} fbPixelId  — Meta (Facebook) Pixel ID
 */
export const useIdleTagManager = (gtmId, fbPixelId) => {
  useEffect(() => {
    // Bail entirely if neither id is configured — nothing to inject.
    if (!gtmId && !fbPixelId) return

    let loaded = false
    const events = ['scroll', 'mousemove', 'touchstart', 'keydown']

    const removeListeners = () => {
      events.forEach((ev) => window.removeEventListener(ev, loadTrackingScripts))
    }

    function loadTrackingScripts() {
      if (loaded) return
      loaded = true

      // ── Google Tag Manager / GA4 ─────────────────────────────────────
      if (gtmId) {
        // dataLayer + gtag stub must exist BEFORE gtm.js evaluates so any
        // queued gtag(...) calls survive script load.
        window.dataLayer = window.dataLayer || []
        if (typeof window.gtag !== 'function') {
          window.gtag = function gtag() { window.dataLayer.push(arguments) }
        }
        // Consent Mode v2 baseline — required for EEA/UK Google Ads compliance
        // since March 2024. CookieConsent.jsx flips these to 'granted' on accept.
        window.gtag('consent', 'default', {
          ad_storage:              'denied',
          ad_user_data:            'denied',
          ad_personalization:      'denied',
          analytics_storage:       'denied',
          functionality_storage:   'denied',
          personalization_storage: 'denied',
          security_storage:        'granted',
        })
        window.gtag('js', new Date())
        window.gtag('config', gtmId)

        const gtmScript = document.createElement('script')
        gtmScript.src   = `https://www.googletagmanager.com/gtm.js?id=${gtmId}`
        gtmScript.async = true
        gtmScript.defer = true
        document.head.appendChild(gtmScript)
      }

      // ── Meta (Facebook) Pixel ────────────────────────────────────────
      // The pixel itself is initialised lazily — but ONLY the queue stub is
      // wired up here. The actual `fbq('init', ...)` and `fbq('track',
      // 'PageView')` calls run from CookieConsent.jsx after the user
      // opts in, so we don't fire any user-tracking events without consent.
      if (fbPixelId) {
        if (!window.fbq) {
          const fbq = function () {
            fbq.callMethod
              ? fbq.callMethod.apply(fbq, arguments)
              : fbq.queue.push(arguments)
          }
          window.fbq    = window._fbq = fbq
          fbq.push      = fbq
          fbq.loaded    = true
          fbq.version   = '2.0'
          fbq.queue     = []
        }
        const fbScript = document.createElement('script')
        fbScript.src   = 'https://connect.facebook.net/en_US/fbevents.js'
        fbScript.async = true
        fbScript.defer = true
        document.head.appendChild(fbScript)
      }

      // Listeners self-clean via { once: true } once they fire, but we
      // also remove any siblings that haven't fired yet.
      removeListeners()
    }

    // Attach interaction-based triggers
    events.forEach((ev) =>
      window.addEventListener(ev, loadTrackingScripts, { once: true, passive: true })
    )

    // Fallback: load anyway after 3.5s so bots / silent visitors are still
    // instrumented eventually.
    const fallbackTimer = setTimeout(loadTrackingScripts, 3500)

    return () => {
      clearTimeout(fallbackTimer)
      removeListeners()
    }
  }, [gtmId, fbPixelId])
}

export default useIdleTagManager
