import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Menu, X, LogOut, Settings, BarChart3, Truck, Plane, Bike, ShoppingBag,
  Activity, Home as HomeIcon, Search, Calculator, LayoutDashboard, LogIn,
  Wallet as WalletIcon, FileText, ShieldAlert, Database, Receipt,
  Warehouse as WarehouseIcon, LifeBuoy, BookOpen, ScrollText, History,
  Bell, Gift, Trash2, User, ChevronDown, ArrowRight,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import brandMark1x from '../assets/brand-mark.webp'
import brandMark2x from '../assets/brand-mark@2x.webp'

/* ── Brand mark + wordmark ─────────────────────────────────────────────────── */
const Brand = ({ onClick }) => (
  <Link
    to="/"
    onClick={onClick}
    aria-label="Thapsus Cargo"
    className="flex items-center gap-2.5 font-bold tracking-tight leading-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-500"
  >
    <img
      src={brandMark1x}
      srcSet={`${brandMark1x} 1x, ${brandMark2x} 2x`}
      alt="" width="32" height="32"
      className="h-8 w-8 drop-shadow-[0_0_12px_rgba(242,100,24,0.35)]"
    />
    <span className="text-lg">
      <span className="text-white">Thapsus</span>
      <span className="text-ember-gradient"> Cargo</span>
    </span>
  </Link>
)

/* ── Link-set builder (mirrors the original nav's structure + roles) ───────── */
function buildLinkSets({ isAuthenticated, isAdmin, role }) {
  const primary = [
    { to: '/',        label: 'Home',    icon: HomeIcon },
    { to: '/track',   label: 'Track',   icon: Search },
    { to: '/pricing', label: 'Pricing', icon: Calculator },
  ]
  const browse = [
    { to: '/faq',        label: 'FAQ',             icon: BookOpen },
    { to: '/prohibited', label: 'Prohibited items', icon: ShieldAlert },
  ]
  const account = isAuthenticated ? [
    { to: '/dashboard',    label: 'Dashboard',        icon: LayoutDashboard },
    { to: '/account',      label: 'My account',       icon: User },
    { to: '/buy-for-me',   label: 'Shop & ship',      icon: ShoppingBag },
    { to: '/orders',       label: 'Parcel tracking',  icon: Receipt },
    { to: '/activity',     label: 'Activity',         icon: Activity },
    { to: '/credit',       label: 'My credit',        icon: WalletIcon },
    { to: '/referral',     label: 'Refer & earn',     icon: Gift },
    { to: '/transactions', label: 'Transactions',     icon: History },
    { to: '/notifications',label: 'Notifications',    icon: Bell },
    { to: '/support',      label: 'Support',          icon: LifeBuoy },
    { to: '/warehouse',    label: 'Warehouse address',icon: WarehouseIcon },
    { to: '/dsar',         label: 'My data',          icon: Database },
  ] : []
  const info = [
    { to: '/privacy', label: 'Privacy',          icon: ScrollText },
    { to: '/terms',   label: 'Terms of service', icon: FileText },
    ...(isAuthenticated ? [{ to: '/ship-instructions', label: 'How to ship', icon: BookOpen }] : []),
  ]
  const roleGroups = []
  if (role === 'operator' || isAdmin) {
    roleGroups.push({ key: 'operator', label: 'Operator tools', links: [
      { to: '/ops/buy-for-me',     label: 'Buy-for-me queue', icon: ShoppingBag },
      { to: '/ops',                label: 'Operator console', icon: Truck },
      { to: '/ops/consolidations', label: 'Consolidations',   icon: Plane },
      { to: '/ops/dispatch',       label: 'Dispatch board',   icon: Bike },
    ]})
  }
  if (role === 'clearing_agent') {
    roleGroups.push({ key: 'agent', label: 'Clearing agent', links: [
      { to: '/partner/agent',          label: 'Agent portal', icon: Plane },
      { to: '/partner/agent/invoices', label: 'My invoices',  icon: Receipt },
    ]})
  }
  if (role === 'rider') {
    roleGroups.push({ key: 'rider', label: 'Rider', links: [
      { to: '/partner/rider', label: "Today's runs", icon: Bike },
    ]})
  }
  if (isAdmin) {
    roleGroups.push({ key: 'admin', label: 'Admin tools', links: [
      { to: '/admin',                         label: 'Admin dashboard',         icon: BarChart3 },
      { to: '/admin/create-bfm',              label: 'Create Buy-for-me',       icon: ShoppingBag },
      { to: '/admin/customer-consolidations', label: 'Customer consolidations', icon: Receipt },
      { to: '/admin/issue-invoice',           label: 'Issue invoice',           icon: FileText },
      { to: '/admin/dsar',                    label: 'DSAR queue',              icon: Database },
      { to: '/kpi',                           label: 'KPI dashboard',           icon: Activity },
      { to: '/ops/settings',                  label: 'Pricing settings',        icon: Settings },
    ]})
  }
  return { primary, browse, account, info, roleGroups }
}

const MenuItem = ({ to, label, icon: Icon, onClick }) => (
  <NavLink
    to={to}
    onClick={onClick}
    className={({ isActive }) =>
      `flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-colors duration-150 ${
        isActive ? 'bg-white/[0.08] text-white' : 'text-mute hover:text-white hover:bg-white/[0.05]'
      }`
    }
  >
    {Icon && <Icon size={17} className="shrink-0" />}
    <span className="truncate">{label}</span>
  </NavLink>
)

const Group = ({ label, links, onNavigate }) => (
  <div className="space-y-1">
    <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ember-500/90">{label}</p>
    {links.map((l) => <MenuItem key={l.to} {...l} onClick={onNavigate} />)}
  </div>
)

export function Nav() {
  const { user, logout } = useAuth()
  const { t } = useLanguage()
  const location = useLocation()
  const navigate = useNavigate()
  const isAuthenticated = !!user
  const isAdmin = user?.role === 'admin'
  const role = user?.role

  const [menuOpen, setMenuOpen] = useState(false)        // mobile drawer
  const [profileOpen, setProfileOpen] = useState(false)  // desktop dropdown
  const profileRef = useRef(null)

  const { primary, browse, account, info, roleGroups } = buildLinkSets({ isAuthenticated, isAdmin, role })

  // Close everything on route change
  useEffect(() => { setMenuOpen(false); setProfileOpen(false) }, [location.pathname])

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [menuOpen])

  // Dismiss desktop dropdown on outside click / Escape
  useEffect(() => {
    if (!profileOpen) return
    const onDown = (e) => { if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setProfileOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [profileOpen])

  const handleLogout = useCallback(() => { setProfileOpen(false); setMenuOpen(false); logout() }, [logout])
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  const firstName = user?.name?.split(' ')[0] || 'Account'
  const initials = (user?.name || 'U').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()

  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <div className="bg-ink/80 backdrop-blur-xl border-b border-line">
        <nav className="max-w-7xl mx-auto h-16 px-4 md:px-6 flex items-center justify-between gap-4">
          <Brand />

          {/* Desktop primary links */}
          <div className="hidden lg:flex items-center gap-1">
            {primary.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === '/'}
                className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}>
                {l.label}
              </NavLink>
            ))}
            {isAuthenticated && (
              <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}>
                Dashboard
              </NavLink>
            )}
          </div>

          {/* Right cluster */}
          <div className="flex items-center gap-2">
            {!isAuthenticated ? (
              <>
                <Link to="/login" className="hidden sm:inline-flex nav-link">
                  <LogIn size={16} /> Login
                </Link>
                <Link to="/register" className="btn-primary btn-sm hidden sm:inline-flex">
                  Get started <ArrowRight size={15} />
                </Link>
              </>
            ) : (
              <>
                <Link to="/notifications" aria-label="Notifications"
                  className="hidden lg:inline-flex p-2.5 rounded-full text-mute hover:text-white hover:bg-white/[0.06] transition-colors">
                  <Bell size={18} />
                </Link>
                {/* Desktop profile dropdown */}
                <div className="relative hidden lg:block" ref={profileRef}>
                  <button
                    onClick={() => setProfileOpen((v) => !v)}
                    className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-white/[0.05] border border-line hover:border-line-strong transition-colors"
                    aria-expanded={profileOpen} aria-haspopup="true"
                  >
                    <span className="w-7 h-7 rounded-full bg-ember-gradient text-white text-xs font-bold grid place-items-center">{initials}</span>
                    <span className="text-sm font-medium text-white max-w-[7rem] truncate">{firstName}</span>
                    <ChevronDown size={15} className={`text-mute transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {profileOpen && (
                    <div className="absolute right-0 mt-2 w-[20rem] max-h-[75vh] overflow-y-auto no-scrollbar rounded-3xl bg-surface border border-line shadow-card-hover p-2 animate-scale-in origin-top-right">
                      <div className="px-3 py-3 mb-1 border-b border-line">
                        <p className="text-sm font-semibold text-white truncate">{user?.name || 'My account'}</p>
                        <p className="text-xs text-mute truncate">{user?.email}</p>
                      </div>
                      <div className="grid grid-cols-1 gap-0.5">
                        {account.map((l) => <MenuItem key={l.to} {...l} onClick={() => setProfileOpen(false)} />)}
                      </div>
                      {roleGroups.map((g) => <Group key={g.key} label={g.label} links={g.links} onNavigate={() => setProfileOpen(false)} />)}
                      <div className="mt-1 pt-1 border-t border-line">
                        {info.map((l) => <MenuItem key={l.to} {...l} onClick={() => setProfileOpen(false)} />)}
                        <button onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium text-red-300 hover:bg-red-500/10 transition-colors">
                          <LogOut size={17} /> Log out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMenuOpen(true)}
              className="lg:hidden p-2.5 rounded-full text-white hover:bg-white/[0.06] transition-colors"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={closeMenu} />
          <div className="absolute right-0 top-0 h-full w-[88%] max-w-sm bg-surface border-l border-line shadow-card-hover flex flex-col animate-scale-in origin-right">
            <div className="flex items-center justify-between h-16 px-4 border-b border-line shrink-0">
              <Brand onClick={closeMenu} />
              <button onClick={closeMenu} aria-label="Close menu"
                className="p-2.5 rounded-full text-white hover:bg-white/[0.06]"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-1">
              {isAuthenticated && (
                <div className="flex items-center gap-3 px-3 py-3 mb-1 rounded-2xl bg-white/[0.04] border border-line">
                  <span className="w-9 h-9 rounded-full bg-ember-gradient text-white text-sm font-bold grid place-items-center">{initials}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{user?.name || 'My account'}</p>
                    <p className="text-xs text-mute truncate">{user?.email}</p>
                  </div>
                </div>
              )}

              <Group label="Browse" links={[...primary, ...browse]} onNavigate={closeMenu} />
              {isAuthenticated && <Group label="My account" links={account} onNavigate={closeMenu} />}
              {roleGroups.map((g) => <Group key={g.key} label={g.label} links={g.links} onNavigate={closeMenu} />)}
              <Group label="Info" links={info} onNavigate={closeMenu} />
            </div>

            <div className="p-3 border-t border-line shrink-0 safe-bottom">
              {isAuthenticated ? (
                <button onClick={handleLogout} className="btn-secondary w-full">
                  <LogOut size={17} /> Log out
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/login" onClick={closeMenu} className="btn-secondary w-full"><LogIn size={16} /> Login</Link>
                  <Link to="/register" onClick={closeMenu} className="btn-primary w-full">Get started</Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

export default Nav
