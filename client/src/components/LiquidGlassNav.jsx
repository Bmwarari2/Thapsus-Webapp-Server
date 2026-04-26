import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  Menu, X, LogOut, Settings, BarChart3, Truck, Plane, Bike,
  Shield, ShoppingBag, Activity, ChevronDown, ChevronRight,
  Home as HomeIcon, Search, Calculator, LayoutDashboard, LogIn,
  Wallet as WalletIcon, FileText, ShieldAlert, Database, Receipt,
  Warehouse as WarehouseIcon, LifeBuoy, Globe, BookOpen, ScrollText,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'

/* ─────────────────────────────────────────────────────────────────────────────
 * Liquid Glass navigation — split architecture
 *
 * Desktop (≥ lg, 1024px):
 *   • Fixed top bar with brand on the far left.
 *   • The user profile/avatar on the far right is the SOLE trigger for a
 *     multi-column "mega" dropdown that aggregates every link previously
 *     scattered across hamburger + profile menus.
 *   • For role users (admin/operator/clearing_agent/rider), high-density
 *     role tools are nested inside hover-triggered fly-out panels that slide
 *     open beside the main dropdown columns.
 *   • No hamburger icon is rendered.
 *
 * Mobile (< lg):
 *   • Fixed minimal top bar — logo + brand text only. No links, no hamburger.
 *   • Fixed bottom tab bar with primary routes as icon targets, ending in a
 *     "Menu" tab that opens a 90vh bottom sheet aggregating every other link.
 *   • Inside the sheet, role-specific links live in collapsible accordions.
 *
 * MobileLayout and DesktopLayout are conditionally rendered (not just
 * display-toggled) based on a synchronously-resolved matchMedia query, so
 * we never ship two layouts to the DOM at once and avoid hydration churn.
 * ────────────────────────────────────────────────────────────────────────── */

// ──────────────────────────────────────────────────────────────────────────
// Hooks
// ──────────────────────────────────────────────────────────────────────────

function useMediaQuery(query) {
  const get = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(query)
    const onChange = (e) => setMatches(e.matches)
    onChange(mq)
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else mq.addListener(onChange)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange)
      else mq.removeListener(onChange)
    }
  }, [query])
  return matches
}

function useScrollLock(active) {
  useEffect(() => {
    if (!active) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [active])
}

function useEscape(active, onEscape) {
  useEffect(() => {
    if (!active) return
    const onKey = (e) => { if (e.key === 'Escape') onEscape() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active, onEscape])
}

// ──────────────────────────────────────────────────────────────────────────
// Surface presets — applied as Tailwind class strings. Contextual scaling:
// thinner glass for narrow surfaces (top bars), thicker glass for large
// surfaces (sheet, dropdown). Each preset includes a reduce-transparency
// fallback so the component never collapses below WCAG contrast.
// ──────────────────────────────────────────────────────────────────────────

const SURFACE_THIN = [
  'bg-neutral-300/20 dark:bg-neutral-400/20',
  'backdrop-blur-md backdrop-saturate-150',
  'border-b border-white/20 dark:border-white/10',
  'shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_1px_12px_rgba(0,0,0,0.06)]',
  'reduce-transparency:bg-white reduce-transparency:dark:bg-gray-900',
  'reduce-transparency:backdrop-blur-0 reduce-transparency:backdrop-saturate-100',
  'reduce-transparency:border-slate-300 reduce-transparency:dark:border-slate-700',
].join(' ')

const SURFACE_MEDIUM = [
  'bg-neutral-300/20 dark:bg-neutral-400/20',
  'backdrop-blur-xl backdrop-saturate-150',
  'border-t border-white/20 dark:border-white/10',
  'shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_-2px_18px_rgba(0,0,0,0.08)]',
  'reduce-transparency:bg-white reduce-transparency:dark:bg-gray-900',
  'reduce-transparency:backdrop-blur-0 reduce-transparency:backdrop-saturate-100',
  'reduce-transparency:border-slate-300 reduce-transparency:dark:border-slate-700',
].join(' ')

const SURFACE_THICK = [
  'bg-white/40 dark:bg-neutral-900/60',
  'backdrop-blur-2xl backdrop-saturate-150',
  'border border-white/30 dark:border-white/10',
  'shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),0_24px_60px_rgba(0,0,0,0.18)]',
  'reduce-transparency:bg-white reduce-transparency:dark:bg-gray-900',
  'reduce-transparency:backdrop-blur-0 reduce-transparency:backdrop-saturate-100',
  'reduce-transparency:border-slate-300 reduce-transparency:dark:border-slate-700',
].join(' ')

const SURFACE_DROPDOWN = [
  'bg-white/70 dark:bg-neutral-900/70',
  'backdrop-blur-2xl backdrop-saturate-150',
  'border border-white/40 dark:border-white/10',
  'shadow-[inset_0_1px_1px_rgba(255,255,255,0.5),0_18px_50px_rgba(0,0,0,0.18)]',
  'reduce-transparency:bg-white reduce-transparency:dark:bg-gray-900',
  'reduce-transparency:backdrop-blur-0 reduce-transparency:backdrop-saturate-100',
  'reduce-transparency:border-slate-300 reduce-transparency:dark:border-slate-700',
].join(' ')

// ──────────────────────────────────────────────────────────────────────────
// Brand mark — used by both top bars
// ──────────────────────────────────────────────────────────────────────────

const Brand = ({ size = 'md' }) => (
  <Link
    to="/"
    aria-label="Thapsus Cargo home"
    className="group flex items-center gap-2 font-black tracking-tighter leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded-full"
  >
    <img
      src="/iOS-ipad.png"
      alt=""
      width="64"
      height="64"
      className={size === 'lg' ? 'h-9 w-auto drop-shadow-[0_0_10px_rgba(249,115,22,0.35)]' : 'h-7 w-auto drop-shadow-[0_0_8px_rgba(249,115,22,0.3)]'}
    />
    <span className={size === 'lg' ? 'text-lg sm:text-xl text-shadow-glass' : 'text-base text-shadow-glass'}>
      <span className="text-slate-900 dark:text-white">Thapsus</span>
      <span className="text-orange-500 ml-1 drop-shadow-[0_0_10px_rgba(249,115,22,0.4)]">Cargo</span>
    </span>
  </Link>
)

// ──────────────────────────────────────────────────────────────────────────
// Route metadata — single source of truth for both layouts
// ──────────────────────────────────────────────────────────────────────────

function buildLinkSets({ isAuthenticated, isAdmin, role, t }) {
  // Always-visible primary nav (used by mobile bottom tabs and desktop column 1)
  const primary = [
    { to: '/',        label: t('nav.home') || 'Home',        icon: HomeIcon },
    { to: '/track',   label: t('nav.track') || 'Track',      icon: Search },
    { to: '/pricing', label: t('nav.pricing') || 'Pricing',  icon: Calculator },
  ]

  // Browse-style public links (mobile sheet + desktop column 1)
  const browse = [
    { to: '/exchange',   label: 'Exchange rates',  icon: Globe },
    { to: '/faq',        label: 'FAQ',             icon: BookOpen },
    { to: '/prohibited', label: 'Prohibited items', icon: ShieldAlert },
  ]

  // Account links visible only when authenticated
  const account = isAuthenticated ? [
    { to: '/dashboard',  label: t('nav.dashboard') || 'Dashboard', icon: LayoutDashboard },
    { to: '/orders',     label: 'My orders',                       icon: Receipt },
    { to: '/wallet',     label: t('nav.wallet') || 'Wallet',       icon: WalletIcon },
    { to: '/insurance',  label: 'Insurance',                       icon: Shield },
    { to: '/buy-for-me', label: 'Buy for me',                      icon: ShoppingBag },
    { to: '/consolidation', label: 'Consolidation',                icon: Plane },
    { to: '/support',    label: 'Support',                         icon: LifeBuoy },
    { to: '/warehouse',  label: 'Warehouse address',               icon: WarehouseIcon },
    { to: '/dsar',       label: 'My data',                         icon: Database },
  ] : []

  // Info / legal links (always visible)
  const info = [
    { to: '/privacy', label: 'Privacy',           icon: ScrollText },
    { to: '/terms',   label: 'Terms of service',  icon: FileText },
    ...(isAuthenticated ? [{ to: '/ship-instructions', label: 'How to ship', icon: BookOpen }] : []),
  ]

  // Role-scoped link groups (rendered in accordions on mobile, fly-outs on desktop)
  const roleGroups = []
  if (role === 'operator' || isAdmin) {
    roleGroups.push({
      key:   'operator',
      label: 'Operator tools',
      icon:  Truck,
      links: [
        { to: '/ops',                label: 'Operator console',  icon: Truck },
        { to: '/ops/consolidations', label: 'Consolidations',    icon: Plane },
        { to: '/ops/dispatch',       label: 'Dispatch board',    icon: Bike },
      ],
    })
  }
  if (role === 'clearing_agent') {
    roleGroups.push({
      key:   'agent',
      label: 'Clearing agent',
      icon:  Plane,
      links: [
        { to: '/partner/agent',          label: 'Agent portal', icon: Plane },
        { to: '/partner/agent/invoices', label: 'My invoices',  icon: Receipt },
      ],
    })
  }
  if (role === 'rider') {
    roleGroups.push({
      key:   'rider',
      label: 'Rider',
      icon:  Bike,
      links: [
        { to: '/partner/rider', label: 'Today\'s runs', icon: Bike },
      ],
    })
  }
  if (isAdmin) {
    roleGroups.push({
      key:   'admin',
      label: 'Admin tools',
      icon:  BarChart3,
      links: [
        { to: '/admin',        label: t('nav.admin') || 'Admin dashboard', icon: BarChart3 },
        { to: '/kpi',          label: 'KPI dashboard',                     icon: Activity },
        { to: '/ops/settings', label: 'Pricing settings',                  icon: Settings },
      ],
    })
  }

  return { primary, browse, account, info, roleGroups }
}

// ──────────────────────────────────────────────────────────────────────────
// Shared link primitives
// ──────────────────────────────────────────────────────────────────────────

const ROW_BASE =
  'flex items-center gap-3 w-full px-3 py-2 rounded-2xl text-sm font-semibold ' +
  'text-slate-700 dark:text-slate-100 transition-colors motion-reduce:transition-none ' +
  'hover:bg-white/60 dark:hover:bg-white/10 hover:text-[#1e3a5f] dark:hover:text-white ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400'

const SectionLabel = ({ children }) => (
  <div className="px-3 pt-2 pb-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
    {children}
  </div>
)

const LinkRow = ({ to, label, icon: Icon, onClick }) => (
  <Link to={to} onClick={onClick} className={ROW_BASE}>
    {Icon && <Icon size={16} className="text-orange-500 shrink-0" aria-hidden />}
    <span className="truncate">{label}</span>
  </Link>
)

// ──────────────────────────────────────────────────────────────────────────
// Accordion (used in mobile sheet for role groups)
// ──────────────────────────────────────────────────────────────────────────

const Accordion = ({ id, label, icon: Icon, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = `acc-${id}`
  return (
    <div className="rounded-2xl bg-white/40 dark:bg-white/5 border border-white/30 dark:border-white/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center justify-between gap-2 px-3 py-3 text-left text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
      >
        <span className="flex items-center gap-2">
          {Icon && <Icon size={16} className="text-orange-500" aria-hidden />}
          {label}
        </span>
        <ChevronDown
          size={16}
          className={`transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div id={panelId} className="px-2 pb-2 space-y-1">
          {children}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// MobileLayout
// ══════════════════════════════════════════════════════════════════════════

const MobileLayout = ({ links, isAuthenticated, user, isAdmin, onLogout, t }) => {
  const [sheetOpen, setSheetOpen] = useState(false)
  const location = useLocation()
  const closeSheet = useCallback(() => setSheetOpen(false), [])

  // Auto-close sheet on navigation
  useEffect(() => { closeSheet() }, [location.pathname, closeSheet])

  useScrollLock(sheetOpen)
  useEscape(sheetOpen, closeSheet)

  // Bottom-tab definition. Always 5 cells so spacing stays even.
  const tabs = useMemo(() => ([
    { to: '/',        label: 'Home',    icon: HomeIcon },
    { to: '/track',   label: 'Track',   icon: Search },
    { to: '/pricing', label: 'Pricing', icon: Calculator },
    isAuthenticated
      ? { to: '/dashboard', label: 'Account', icon: LayoutDashboard }
      : { to: '/login',     label: 'Sign in', icon: LogIn },
    { kind: 'menu', label: 'Menu', icon: Menu },
  ]), [isAuthenticated])

  return (
    <>
      {/* Top branding bar — minimal, fixed, light glass */}
      <header
        className={[
          'fixed top-0 inset-x-0 z-50',
          'flex items-center justify-center',
          'h-[calc(env(safe-area-inset-top,0px)+3.25rem)] pt-[env(safe-area-inset-top,0px)]',
          'transform-gpu',
          SURFACE_THIN,
        ].join(' ')}
      >
        <Brand size="sm" />
      </header>

      {/* Bottom tab bar — fixed, medium glass */}
      <nav
        role="navigation"
        aria-label="Primary"
        className={[
          'fixed bottom-0 inset-x-0 z-50',
          'pb-[env(safe-area-inset-bottom,0px)]',
          'transform-gpu',
          SURFACE_MEDIUM,
        ].join(' ')}
      >
        <ul className="grid grid-cols-5">
          {tabs.map((tab, i) => {
            const Icon = tab.icon
            if (tab.kind === 'menu') {
              const active = sheetOpen
              return (
                <li key="menu">
                  <button
                    type="button"
                    onClick={() => setSheetOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={sheetOpen}
                    className={`w-full flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-bold transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${active ? 'text-orange-600' : 'text-slate-700 dark:text-slate-200 hover:text-orange-600'}`}
                  >
                    <span className={`relative inline-flex items-center justify-center w-7 h-7 rounded-full ${active ? 'bg-orange-500/15' : ''}`}>
                      <Icon size={18} aria-hidden />
                    </span>
                    {tab.label}
                  </button>
                </li>
              )
            }
            return (
              <li key={tab.to}>
                <NavLink
                  to={tab.to}
                  end={tab.to === '/'}
                  className={({ isActive }) =>
                    `w-full flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-bold transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${isActive ? 'text-orange-600' : 'text-slate-700 dark:text-slate-200 hover:text-orange-600'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={`relative inline-flex items-center justify-center w-7 h-7 rounded-full ${isActive ? 'bg-orange-500/15' : ''}`}>
                        <Icon size={18} aria-hidden />
                      </span>
                      {tab.label}
                    </>
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom sheet — aggregated menu, accordions for role groups */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="Application menu"
        >
          {/* Dim backdrop */}
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Close menu"
            className="absolute inset-0 bg-black/45 reduce-transparency:bg-black/70 backdrop-blur-[2px] reduce-transparency:backdrop-blur-0"
          />

          {/* Sheet */}
          <section
            className={[
              'relative w-full max-h-[90dvh] h-[90dvh]',
              'rounded-t-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]',
              'flex flex-col',
              'animate-slide-up transform-gpu will-change-transform',
              SURFACE_THICK,
            ].join(' ')}
          >
            {/* Drag handle + header */}
            <div className="flex flex-col items-center gap-2 pb-2">
              <span aria-hidden className="block w-10 h-1 rounded-full bg-slate-400/60" />
              <div className="w-full flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  {isAuthenticated ? (
                    <>
                      <span className="w-9 h-9 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center text-sm font-black text-white shadow-[0_0_12px_rgba(249,115,22,0.4)]">
                        {user?.name?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                      <span className="text-sm font-black text-slate-900 dark:text-white truncate">
                        {user?.name || 'Account'}
                      </span>
                    </>
                  ) : (
                    <Brand size="sm" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={closeSheet}
                  aria-label="Close"
                  className="p-2 rounded-full text-slate-700 dark:text-slate-200 hover:bg-white/60 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto overscroll-contain pr-1 -mr-1 space-y-3">
              {/* Browse */}
              <div>
                <SectionLabel>Browse</SectionLabel>
                <div className="space-y-1">
                  {[...links.primary, ...links.browse].map((l) => (
                    <LinkRow key={l.to} {...l} onClick={closeSheet} />
                  ))}
                </div>
              </div>

              {/* Account */}
              {isAuthenticated && (
                <div>
                  <SectionLabel>My account</SectionLabel>
                  <div className="space-y-1">
                    {links.account.map((l) => (
                      <LinkRow key={l.to} {...l} onClick={closeSheet} />
                    ))}
                  </div>
                </div>
              )}

              {/* Info */}
              <div>
                <SectionLabel>Info</SectionLabel>
                <div className="space-y-1">
                  {links.info.map((l) => (
                    <LinkRow key={l.to} {...l} onClick={closeSheet} />
                  ))}
                </div>
              </div>

              {/* Role accordions — collapsible to preserve vertical space */}
              {links.roleGroups.length > 0 && (
                <div className="space-y-2">
                  <SectionLabel>Tools &amp; access</SectionLabel>
                  {links.roleGroups.map((group) => (
                    <Accordion key={group.key} id={group.key} label={group.label} icon={group.icon} defaultOpen={false}>
                      {group.links.map((l) => (
                        <LinkRow key={l.to} {...l} onClick={closeSheet} />
                      ))}
                    </Accordion>
                  ))}
                </div>
              )}
            </div>

            {/* Sticky footer: auth actions */}
            <div className="pt-3 mt-2 border-t border-white/40 dark:border-white/10">
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => { closeSheet(); onLogout() }}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-300 text-sm font-black focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  <LogOut size={16} /> {t('nav.logout') || 'Log out'}
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    to="/login"
                    onClick={closeSheet}
                    className="text-center py-3 rounded-2xl bg-white/50 hover:bg-white/70 border border-white/40 text-sm font-bold text-slate-900 transition-colors motion-reduce:transition-none"
                  >
                    {t('nav.login') || 'Log in'}
                  </Link>
                  <Link
                    to="/register"
                    onClick={closeSheet}
                    className="text-center py-3 rounded-2xl bg-orange-500 hover:bg-orange-400 text-sm font-black text-slate-900 transition-colors motion-reduce:transition-none shadow-[0_0_18px_rgba(249,115,22,0.35)]"
                  >
                    {t('nav.register') || 'Register'}
                  </Link>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// DesktopLayout
// ══════════════════════════════════════════════════════════════════════════

const DesktopLayout = ({ links, isAuthenticated, user, isAdmin, onLogout, t }) => {
  const [open, setOpen]               = useState(false)
  const [hoverGroup, setHoverGroup]   = useState(null)  // role-group key
  const triggerRef = useRef(null)
  const panelRef   = useRef(null)
  const location   = useLocation()

  const close = useCallback(() => { setOpen(false); setHoverGroup(null) }, [])
  useEffect(() => { close() }, [location.pathname, close])
  useEscape(open, close)

  // Click-outside dismiss
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      const t = e.target
      if (panelRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, close])

  return (
    <header
      className={[
        'fixed top-0 inset-x-0 z-50',
        'flex items-center justify-between gap-6 px-6 lg:px-10',
        'h-16 transform-gpu',
        SURFACE_THIN,
      ].join(' ')}
    >
      <Brand size="lg" />

      <div className="flex items-center gap-4">
        {isAuthenticated ? (
          <div className="relative">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="group flex items-center gap-2 bg-white/30 dark:bg-white/10 hover:bg-white/50 dark:hover:bg-white/15 border border-white/30 dark:border-white/10 backdrop-blur-md pl-1.5 pr-3 py-1 rounded-full transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              <span className="w-8 h-8 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center text-xs font-black text-white shadow-[0_0_12px_rgba(249,115,22,0.4)]">
                {user?.name?.charAt(0)?.toUpperCase() || '?'}
              </span>
              <span className="max-w-[10rem] truncate text-sm font-bold text-slate-900 dark:text-white text-shadow">
                {user?.name}
              </span>
              <ChevronDown
                size={14}
                className={`text-slate-700 dark:text-slate-300 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>

            {open && (
              <div
                ref={panelRef}
                role="menu"
                aria-label="Account &amp; navigation"
                className={[
                  'absolute right-0 top-[calc(100%+0.75rem)]',
                  'w-[40rem] max-w-[calc(100vw-2rem)]',
                  'max-h-[calc(100dvh-5rem)] overflow-visible',
                  'rounded-3xl p-4 z-[60] origin-top-right animate-fade-in',
                  'transform-gpu will-change-transform',
                  SURFACE_DROPDOWN,
                ].join(' ')}
              >
                <div className="grid grid-cols-2 gap-4">
                  {/* Column 1 — global navigation */}
                  <div>
                    <SectionLabel>Navigate</SectionLabel>
                    <div className="space-y-1">
                      {[...links.primary, ...links.browse].map((l) => (
                        <LinkRow key={l.to} {...l} onClick={close} />
                      ))}
                    </div>
                    <div className="pt-2 mt-2 border-t border-white/40 dark:border-white/10">
                      <SectionLabel>Info</SectionLabel>
                      <div className="space-y-1">
                        {links.info.map((l) => (
                          <LinkRow key={l.to} {...l} onClick={close} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Column 2 — account, role groups, logout */}
                  <div className="flex flex-col">
                    <SectionLabel>My account</SectionLabel>
                    <div className="space-y-1">
                      {links.account.map((l) => (
                        <LinkRow key={l.to} {...l} onClick={close} />
                      ))}
                    </div>

                    {/* Role groups — each is a hover trigger that opens a
                        secondary fly-out to the LEFT of the dropdown panel. */}
                    {links.roleGroups.length > 0 && (
                      <div className="pt-2 mt-2 border-t border-white/40 dark:border-white/10">
                        <SectionLabel>Tools &amp; access</SectionLabel>
                        <div className="space-y-1">
                          {links.roleGroups.map((group) => {
                            const Icon = group.icon
                            const active = hoverGroup === group.key
                            return (
                              <div
                                key={group.key}
                                className="relative"
                                onMouseEnter={() => setHoverGroup(group.key)}
                                onMouseLeave={() => setHoverGroup((g) => (g === group.key ? null : g))}
                              >
                                <button
                                  type="button"
                                  onFocus={() => setHoverGroup(group.key)}
                                  onClick={() => setHoverGroup((g) => (g === group.key ? null : group.key))}
                                  aria-haspopup="menu"
                                  aria-expanded={active}
                                  className={`flex items-center justify-between gap-2 w-full px-3 py-2 rounded-2xl text-sm font-semibold text-slate-700 dark:text-slate-100 transition-colors motion-reduce:transition-none hover:bg-white/60 dark:hover:bg-white/10 hover:text-[#1e3a5f] dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${active ? 'bg-white/60 dark:bg-white/10 text-[#1e3a5f] dark:text-white' : ''}`}
                                >
                                  <span className="flex items-center gap-3 min-w-0">
                                    {Icon && <Icon size={16} className="text-orange-500 shrink-0" aria-hidden />}
                                    <span className="truncate">{group.label}</span>
                                  </span>
                                  <ChevronRight size={14} aria-hidden className="text-slate-500" />
                                </button>

                                {active && (
                                  <div
                                    role="menu"
                                    aria-label={`${group.label} menu`}
                                    className={[
                                      'absolute right-full top-0 mr-3',
                                      'w-64 rounded-2xl p-2 z-[70]',
                                      'animate-fade-in transform-gpu will-change-transform',
                                      SURFACE_DROPDOWN,
                                    ].join(' ')}
                                  >
                                    <SectionLabel>{group.label}</SectionLabel>
                                    <div className="space-y-1">
                                      {group.links.map((l) => (
                                        <LinkRow key={l.to} {...l} onClick={close} />
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div className="pt-2 mt-auto border-t border-white/40 dark:border-white/10">
                      <button
                        type="button"
                        onClick={() => { close(); onLogout() }}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-2xl text-sm font-bold text-red-600 hover:bg-red-50/80 dark:hover:bg-red-500/10 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                      >
                        <LogOut size={16} /> {t('nav.logout') || 'Log out'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="px-4 py-2 bg-white/30 hover:bg-white/50 backdrop-blur-md border border-white/30 rounded-full text-xs font-bold text-slate-900 dark:text-white transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              {t('nav.login') || 'Log in'}
            </Link>
            <Link
              to="/register"
              className="px-4 py-2 bg-orange-500 hover:bg-orange-400 rounded-full text-xs font-black tracking-tight text-slate-900 transition-colors motion-reduce:transition-none shadow-[0_0_18px_rgba(249,115,22,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              {t('nav.register') || 'Register'}
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// Root — picks layout from a synchronously-resolved media query
// ══════════════════════════════════════════════════════════════════════════

export const LiquidGlassNav = () => {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const { isAuthenticated, user, isAdmin, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const onLogout = useCallback(() => {
    logout()
    navigate('/')
  }, [logout, navigate])

  const links = useMemo(
    () => buildLinkSets({ isAuthenticated, isAdmin, role: user?.role, t }),
    [isAuthenticated, isAdmin, user?.role, t]
  )

  const Layout = isDesktop ? DesktopLayout : MobileLayout
  return (
    <Layout
      links={links}
      isAuthenticated={isAuthenticated}
      user={user}
      isAdmin={isAdmin}
      onLogout={onLogout}
      t={t}
    />
  )
}

export default LiquidGlassNav
