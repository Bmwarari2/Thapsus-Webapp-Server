import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  Menu, X, LogOut, Settings, BarChart3, Truck, Plane, Bike,
  Shield, ShoppingBag, Activity, ChevronDown,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'

/* ─────────────────────────────────────────────────────────────────────────────
 * <LiquidGlassNav />
 *
 * Floating, capsule-shaped navigation that replaces the legacy edge-to-edge
 * top bar. Uses heavy backdrop blur + saturation, a translucent neutral
 * material, and a layered shadow that combines an ambient drop with an inset
 * specular highlight to mimic Apple's "Liquid Glass" optical signature.
 *
 * Two bugs from the legacy nav are explicitly solved here:
 *
 *   1. LANDSCAPE TRUNCATION — the user-settings dropdown previously rendered
 *      with a fixed pixel width and no max-height, so on a phone rotated to
 *      landscape (≤ ~500px tall) the lower menu items (admin links, logout)
 *      would fall off the bottom of the viewport with no scroll. The
 *      replacement panel is now viewport-aware: when the OS reports landscape
 *      orientation AND a short height, the menu pivots from an anchored
 *      flyout to a centred modal sheet. Otherwise it stays anchored but is
 *      strictly bounded by `max-h: calc(100dvh - 5rem)` with overflow-y-auto,
 *      so the items can never be rendered past the physical screen edge.
 *
 *   2. STACKING-CONTEXT BLEED — the floating pill establishes its own
 *      isolated stacking context (`isolate` + `z-50`), and the dropdown /
 *      modal layers sit at `z-[60..70]`, guaranteeing no body content
 *      eclipses the menu on the z-axis even when scrolling complex pages.
 *
 * Accessibility / degradation:
 *   - `reduce-transparency:` variant (defined in tailwind.config.js) swaps
 *     the translucent material for a solid high-contrast surface when the OS
 *     advertises `prefers-reduced-transparency: reduce`.
 *   - `motion-reduce:` disables transforms / animations for vestibular safety.
 *   - All pill typography carries a subtle `text-shadow` so contrast does
 *     not collapse when the pill floats over photographic backgrounds.
 * ────────────────────────────────────────────────────────────────────────── */

// Hook: tells us when the viewport is in landscape AND too short for an
// anchored vertical menu — the trigger to morph into a modal sheet.
function useIsLandscapeShort() {
  const [match, setMatch] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(orientation: landscape) and (max-height: 500px)')
    const onChange = (e) => setMatch(e.matches)
    onChange(mq)
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else mq.addListener(onChange)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange)
      else mq.removeListener(onChange)
    }
  }, [])
  return match
}

// Tailwind class string for any inline link inside the dropdown / sheet.
const ITEM_BASE =
  'flex items-center gap-2 w-full px-4 py-2.5 rounded-2xl text-sm font-bold ' +
  'text-slate-700 dark:text-slate-100 hover:bg-white/60 dark:hover:bg-white/10 ' +
  'hover:text-[#1e3a5f] dark:hover:text-white transition-colors ' +
  'motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400'

export const LiquidGlassNav = () => {
  const [mobileMenuOpen, setMobileMenuOpen]     = useState(false)
  const [userDropdownOpen, setUserDropdownOpen] = useState(false)
  const { isAuthenticated, user, isAdmin, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const isLandscapeShort = useIsLandscapeShort()
  const userBtnRef    = useRef(null)
  const userPanelRef  = useRef(null)
  const mobilePanelRef = useRef(null)

  const closeAll = useCallback(() => {
    setUserDropdownOpen(false)
    setMobileMenuOpen(false)
  }, [])

  // Close menus on navigation
  useEffect(() => { closeAll() }, [location.pathname, closeAll])

  // Click-outside handling for both panels
  useEffect(() => {
    if (!userDropdownOpen && !mobileMenuOpen) return
    const onDown = (e) => {
      const t = e.target
      const inUserPanel    = userPanelRef.current?.contains(t)
      const onUserBtn      = userBtnRef.current?.contains(t)
      const inMobilePanel  = mobilePanelRef.current?.contains(t)
      if (userDropdownOpen && !inUserPanel && !onUserBtn) setUserDropdownOpen(false)
      if (mobileMenuOpen   && !inMobilePanel && !onUserBtn) setMobileMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [userDropdownOpen, mobileMenuOpen])

  // ESC closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeAll() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [closeAll])

  // When the modal sheet is open, lock body scroll so the page beneath
  // doesn't drift while the user reads/scrolls the menu.
  useEffect(() => {
    const lock = (userDropdownOpen && isLandscapeShort) || mobileMenuOpen
    if (!lock) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [userDropdownOpen, isLandscapeShort, mobileMenuOpen])

  const handleLogout = () => {
    logout()
    closeAll()
    navigate('/')
  }

  const navLinks = [
    { label: t('nav.home'),                          href: '/' },
    isAuthenticated && { label: t('nav.dashboard'),  href: '/dashboard' },
    { label: t('nav.track'),                         href: '/track' },
    { label: t('nav.pricing'),                       href: '/pricing' },
    isAuthenticated && { label: t('nav.wallet'),     href: '/wallet' },
  ].filter(Boolean)

  // --------------------------------------------------------------------------
  // The user-settings panel content — rendered inside either the anchored
  // dropdown OR the centred modal sheet, depending on viewport orientation.
  // --------------------------------------------------------------------------
  const UserPanelContents = (
    <div className="space-y-1">
      <Link to="/dashboard"  className={ITEM_BASE} onClick={closeAll}>{t('nav.dashboard')}</Link>
      <Link to="/wallet"     className={ITEM_BASE} onClick={closeAll}>{t('nav.wallet')}</Link>
      <Link to="/insurance"  className={ITEM_BASE} onClick={closeAll}>
        <Shield size={14} /> Insurance
      </Link>
      <Link to="/buy-for-me" className={ITEM_BASE} onClick={closeAll}>
        <ShoppingBag size={14} /> Buy for me
      </Link>
      <Link to="/dsar"       className={ITEM_BASE} onClick={closeAll}>My data</Link>

      {(user?.role === 'operator' || isAdmin) && (
        <div className="pt-1 mt-1 border-t border-white/40 dark:border-white/10 space-y-1">
          <Link to="/ops"                className={ITEM_BASE} onClick={closeAll}>
            <Truck size={14} className="text-orange-500" /> Operator console
          </Link>
          <Link to="/ops/consolidations" className={ITEM_BASE} onClick={closeAll}>
            <Plane size={14} /> Consolidations
          </Link>
          <Link to="/ops/dispatch"       className={ITEM_BASE} onClick={closeAll}>
            Dispatch board
          </Link>
        </div>
      )}

      {user?.role === 'clearing_agent' && (
        <div className="pt-1 mt-1 border-t border-white/40 dark:border-white/10 space-y-1">
          <Link to="/partner/agent"          className={ITEM_BASE} onClick={closeAll}>
            <Plane size={14} className="text-orange-500" /> Clearing agent
          </Link>
          <Link to="/partner/agent/invoices" className={ITEM_BASE} onClick={closeAll}>
            My invoices
          </Link>
        </div>
      )}

      {user?.role === 'rider' && (
        <div className="pt-1 mt-1 border-t border-white/40 dark:border-white/10 space-y-1">
          <Link to="/partner/rider" className={ITEM_BASE} onClick={closeAll}>
            <Bike size={14} className="text-orange-500" /> Rider runs
          </Link>
        </div>
      )}

      {isAdmin && (
        <div className="pt-1 mt-1 border-t border-white/40 dark:border-white/10 space-y-1">
          <Link to="/admin"        className={ITEM_BASE} onClick={closeAll}>
            <BarChart3 size={16} className="text-orange-500" /> {t('nav.admin')}
          </Link>
          <Link to="/kpi"          className={ITEM_BASE} onClick={closeAll}>
            <Activity size={16} className="text-orange-500" /> KPI dashboard
          </Link>
          <Link to="/ops/settings" className={ITEM_BASE} onClick={closeAll}>
            <Settings size={16} className="text-orange-500" /> Pricing settings
          </Link>
        </div>
      )}

      <div className="pt-1 mt-1 border-t border-white/40 dark:border-white/10">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-4 py-2.5 rounded-2xl text-sm font-bold text-red-600 hover:bg-red-50/80 dark:hover:bg-red-500/10 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          <LogOut size={16} /> {t('nav.logout')}
        </button>
      </div>
    </div>
  )

  // --------------------------------------------------------------------------
  // Surface presets — solid fallback when the OS prefers reduced transparency,
  // translucent + heavy backdrop blur otherwise.
  // --------------------------------------------------------------------------
  const PILL_SURFACE = [
    // Liquid Glass material
    'bg-neutral-300/20 dark:bg-neutral-400/20',
    'backdrop-blur-[16px] backdrop-saturate-150',
    'border border-white/20 dark:border-white/10',
    // Layered shadow: ambient drop + specular highlight
    'shadow-[0_8px_32px_rgba(0,0,0,0.10),inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-1px_2px_rgba(0,0,0,0.04)]',
    // Reduced-transparency fallback (defined in tailwind.config.js plugin)
    'reduce-transparency:bg-white reduce-transparency:dark:bg-gray-900',
    'reduce-transparency:backdrop-blur-0 reduce-transparency:backdrop-saturate-100',
    'reduce-transparency:border-slate-300 reduce-transparency:dark:border-slate-700',
    'reduce-transparency:shadow-md',
  ].join(' ')

  const PANEL_SURFACE = [
    'bg-white/80 dark:bg-neutral-900/80',
    'backdrop-blur-2xl backdrop-saturate-150',
    'border border-white/40 dark:border-white/10',
    'shadow-[0_12px_40px_rgba(0,0,0,0.18),inset_0_2px_6px_rgba(255,255,255,0.55)]',
    'reduce-transparency:bg-white reduce-transparency:dark:bg-gray-900',
    'reduce-transparency:backdrop-blur-0 reduce-transparency:backdrop-saturate-100',
    'reduce-transparency:border-slate-300 reduce-transparency:dark:border-slate-700',
  ].join(' ')

  return (
    <>
      {/* Floating capsule. Note `isolate` + `z-50` establish a permanent
          stacking context so the dropdown / modal can never be eclipsed by
          page content. */}
      <nav
        role="navigation"
        aria-label="Primary"
        className={[
          'fixed left-1/2 -translate-x-1/2',
          // Respect iOS notch / Dynamic Island via env(safe-area-inset-top)
          'top-[max(theme(spacing.4),calc(env(safe-area-inset-top,0px)+0.5rem))]',
          'w-[95%] max-w-4xl',
          'rounded-full',
          'z-50 isolate',
          'flex items-center justify-between px-6 py-3',
          'text-shadow-glass',
          'transition-[box-shadow,background-color] duration-300 motion-reduce:transition-none',
          PILL_SURFACE,
        ].join(' ')}
      >
        {/* Brand */}
        <Link
          to="/"
          className="group flex items-center gap-2 font-black text-lg sm:text-xl md:text-2xl tracking-tighter leading-none transition-transform duration-300 motion-reduce:transition-none hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded-full"
        >
          <img
            src="/iOS-ipad.png"
            alt="Thapsus Cargo"
            width="64"
            height="64"
            className="h-7 sm:h-8 w-auto drop-shadow-[0_0_10px_rgba(249,115,22,0.35)]"
          />
          <div className="hidden xs:flex items-center gap-1">
            <span className="text-slate-900 dark:text-white">Thapsus</span>
            <span className="text-orange-500 drop-shadow-[0_0_12px_rgba(249,115,22,0.4)]">Cargo</span>
          </div>
        </Link>

        {/* Centre nav links — desktop only */}
        <ul className="hidden lg:flex items-center gap-7 text-shadow">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                to={link.href}
                className="relative text-xs font-bold uppercase tracking-widest text-slate-800 dark:text-slate-200 hover:text-[#1e3a5f] dark:hover:text-white transition-colors motion-reduce:transition-none py-2 group focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded"
              >
                {link.label}
                <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-gradient-to-r from-orange-400 to-orange-600 transition-[width] duration-300 motion-reduce:transition-none group-hover:w-full rounded-full" />
              </Link>
            </li>
          ))}
        </ul>

        {/* Right cluster: profile + settings dropdown OR auth CTAs */}
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <div className="relative">
              <button
                ref={userBtnRef}
                type="button"
                onClick={() => setUserDropdownOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={userDropdownOpen}
                className="group flex items-center gap-2 bg-white/30 dark:bg-white/10 hover:bg-white/50 dark:hover:bg-white/15 border border-white/30 dark:border-white/10 backdrop-blur-md pl-1.5 pr-2 sm:pr-3 py-1 rounded-full transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              >
                <span className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center text-xs font-black text-white shadow-[0_0_12px_rgba(249,115,22,0.4)]">
                  {user?.name?.charAt(0)?.toUpperCase() || '?'}
                </span>
                <span className="hidden sm:inline-block max-w-[8rem] truncate text-sm font-bold text-slate-900 dark:text-white">
                  {user?.name}
                </span>
                <ChevronDown
                  size={14}
                  className={`hidden sm:inline-block text-slate-700 dark:text-slate-300 transition-transform motion-reduce:transition-none ${userDropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {/* Anchored dropdown — used in PORTRAIT or tall landscape. The
                  `max-h: calc(100dvh - 5rem)` + `overflow-y-auto` mathematically
                  guarantees no item can be pushed off the physical screen. */}
              {userDropdownOpen && !isLandscapeShort && (
                <div
                  ref={userPanelRef}
                  role="menu"
                  className={[
                    'absolute right-0 top-[calc(100%+0.75rem)]',
                    'w-72 max-w-[calc(100vw-2rem)]',
                    'max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain',
                    'rounded-3xl p-2 z-[60]',
                    'origin-top-right animate-fade-in',
                    PANEL_SURFACE,
                  ].join(' ')}
                >
                  {UserPanelContents}
                </div>
              )}

              {/* Modal sheet — used in LANDSCAPE on phones (≤500px tall).
                  Centred, scrollable, with an overlay that captures taps to
                  dismiss. This permanently solves the legacy clipping bug:
                  even if the menu has 12+ items, the user can scroll within
                  the sheet rather than items overflowing the viewport edge. */}
              {userDropdownOpen && isLandscapeShort && (
                <div
                  className="fixed inset-0 z-[70] flex items-center justify-center p-3 bg-black/45 backdrop-blur-[2px] reduce-transparency:bg-black/70 reduce-transparency:backdrop-blur-0 animate-fade-in"
                  onClick={closeAll}
                  aria-hidden="false"
                >
                  <div
                    ref={userPanelRef}
                    role="menu"
                    aria-label="User settings"
                    onClick={(e) => e.stopPropagation()}
                    className={[
                      'w-full max-w-md',
                      'max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain',
                      'rounded-3xl p-3',
                      PANEL_SURFACE,
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-white/40 dark:border-white/10">
                      <span className="text-sm font-black tracking-tight text-slate-900 dark:text-white truncate">
                        {user?.name || 'Account'}
                      </span>
                      <button
                        onClick={closeAll}
                        aria-label="Close menu"
                        className="p-1 rounded-full text-slate-700 dark:text-slate-200 hover:bg-white/60 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    {UserPanelContents}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="hidden sm:inline-flex px-4 py-2 bg-white/30 hover:bg-white/50 backdrop-blur-md border border-white/30 rounded-full text-xs font-bold text-slate-900 dark:text-white transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              >
                {t('nav.login')}
              </Link>
              <Link
                to="/register"
                className="inline-flex px-4 py-2 bg-orange-500 hover:bg-orange-400 rounded-full text-xs font-black tracking-tight text-slate-900 transition-colors motion-reduce:transition-none shadow-[0_0_18px_rgba(249,115,22,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              >
                {t('nav.register')}
              </Link>
            </div>
          )}

          {/* Mobile / small-viewport hamburger — opens a centred sheet that
              hosts the primary nav links. Same pattern as the user menu on
              landscape, so the bug fix is consistent across both menus. */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            className="lg:hidden p-2 bg-white/30 dark:bg-white/10 hover:bg-white/50 dark:hover:bg-white/15 border border-white/30 dark:border-white/10 rounded-full text-slate-800 dark:text-slate-100 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {/* Mobile primary-nav sheet (centred, viewport-aware, scrollable). */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center p-3 pt-20 bg-black/45 backdrop-blur-[2px] reduce-transparency:bg-black/70 reduce-transparency:backdrop-blur-0 animate-fade-in lg:hidden"
          onClick={closeAll}
        >
          <div
            ref={mobilePanelRef}
            onClick={(e) => e.stopPropagation()}
            className={[
              'w-full max-w-md',
              'max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain',
              'rounded-3xl p-4',
              PANEL_SURFACE,
            ].join(' ')}
          >
            <div className="space-y-1.5">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className="block px-4 py-3 rounded-2xl text-sm font-bold uppercase tracking-widest text-slate-800 dark:text-slate-100 bg-white/40 hover:bg-white/70 dark:bg-white/5 dark:hover:bg-white/15 transition-colors motion-reduce:transition-none"
                  onClick={closeAll}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {!isAuthenticated && (
              <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-white/40 dark:border-white/10">
                <Link
                  to="/login"
                  className="text-center py-3 rounded-2xl bg-white/50 hover:bg-white/70 border border-white/40 dark:bg-white/5 dark:hover:bg-white/10 dark:border-white/10 text-sm font-bold text-slate-900 dark:text-white transition-colors motion-reduce:transition-none"
                  onClick={closeAll}
                >
                  {t('nav.login')}
                </Link>
                <Link
                  to="/register"
                  className="text-center py-3 rounded-2xl bg-orange-500 hover:bg-orange-400 text-sm font-black text-slate-900 transition-colors motion-reduce:transition-none shadow-[0_0_18px_rgba(249,115,22,0.35)]"
                  onClick={closeAll}
                >
                  {t('nav.register')}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default LiquidGlassNav
