import { useState, useEffect } from 'react'

const STORAGE_KEY = 'thapsus_cookie_consent'
const META_PIXEL_ID = '1556063629186873'

// ── Helpers ───────────────────────────────────────────────────────────────────

function grantAllConsent() {
  if (typeof window.gtag === 'function') {
    window.gtag('consent', 'update', {
      ad_storage:              'granted',
      ad_user_data:            'granted',
      ad_personalization:      'granted',
      analytics_storage:       'granted',
      functionality_storage:   'granted',
      personalization_storage: 'granted',
    })
  }
}

function loadMetaPixel() {
  // Guard against double-init
  if (window._fbqInitialized) return

  // Set up fbq queue stub
  if (!window.fbq) {
    const fbq = function () {
      fbq.callMethod
        ? fbq.callMethod.apply(fbq, arguments)
        : fbq.queue.push(arguments)
    }
    window.fbq = window._fbq = fbq
    fbq.push    = fbq
    fbq.loaded  = true
    fbq.version = '2.0'
    fbq.queue   = []
  }

  // Dynamically load fbevents.js
  const script    = document.createElement('script')
  script.async    = true
  script.src      = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.appendChild(script)

  // Init pixel and fire initial PageView
  window.fbq('init', META_PIXEL_ID)
  window.fbq('track', 'PageView')
  window._fbqInitialized = true
}

function applyStoredConsent(choice) {
  if (choice === 'granted') {
    grantAllConsent()
    loadMetaPixel()
  }
  // 'denied' → do nothing, consent stays denied from index.html defaults
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      // Returning visitor — silently apply their previous choice
      applyStoredConsent(stored)
    } else {
      // First visit — show the banner
      setVisible(true)
    }
  }, [])

  function handleAccept() {
    localStorage.setItem(STORAGE_KEY, 'granted')
    grantAllConsent()
    loadMetaPixel()
    setVisible(false)
  }

  function handleReject() {
    localStorage.setItem(STORAGE_KEY, 'denied')
    // gtag consent stays 'denied' from index.html default — no update needed
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      className="fixed bottom-0 left-0 right-0 z-[9999] bg-[#1e3a5f] text-white shadow-2xl"
    >
      <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Message */}
        <p className="flex-1 text-sm leading-relaxed text-gray-200">
          We use cookies and similar technologies to analyse traffic and improve your experience,
          and to show you relevant advertising through Meta. By clicking{' '}
          <strong className="text-white">Accept</strong>, you consent to our use of analytics and
          advertising cookies. You can change your mind at any time.{' '}
          <a href="/privacy" className="underline text-orange-400 hover:text-orange-300 transition-colors">
            Privacy Policy
          </a>
          .
        </p>

        {/* Buttons */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleReject}
            className="px-4 py-2 text-sm rounded-lg border border-gray-400 text-gray-300 hover:border-white hover:text-white transition-colors whitespace-nowrap"
          >
            Reject Non-Essential
          </button>
          <button
            onClick={handleAccept}
            className="px-5 py-2 text-sm rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-semibold transition-colors whitespace-nowrap"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  )
}
