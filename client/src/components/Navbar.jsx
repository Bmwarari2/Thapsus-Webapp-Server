import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Menu, X, LogOut, Settings, BarChart3 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'

export const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userDropdownOpen, setUserDropdownOpen] = useState(false)
  const [navBackground, setNavBackground] = useState('bg-[#0f172a]/80')
  const { isAuthenticated, user, isAdmin, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  useEffect(() => {
    setNavBackground(mobileMenuOpen ? 'bg-[#0f172a]/100' : 'bg-[#0f172a]/80')
  }, [mobileMenuOpen])

  const navLinks = [
    { label: t('nav.home'),      href: '/' },
    isAuthenticated && { label: t('nav.dashboard'), href: '/dashboard' },
    { label: t('nav.track'),     href: '/track' },
    { label: t('nav.pricing'),   href: '/pricing' },
    isAuthenticated && { label: t('nav.wallet'),    href: '/wallet' },
  ].filter(Boolean)

  return (
    <nav className={`sticky top-0 z-50 ${navBackground} backdrop-blur-3xl border-b border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.15)] font-sans transition-all duration-500`}>
      <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 py-4 relative z-10">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <Link to="/" className="group flex items-center gap-2 font-black text-2xl md:text-3xl tracking-tighter leading-none transition-transform duration-300 hover:scale-105">
            <img src="/logo.png" alt="Thapsus Cargo" className="h-9 md:h-11 w-auto drop-shadow-[0_0_12px_rgba(249,115,22,0.3)]" />
            <div className="flex items-center gap-1">
              <span className="text-white drop-shadow-md">Thapsus</span>
              <span className="text-orange-500 drop-shadow-[0_0_15px_rgba(249,115,22,0.4)]">Cargo</span>
            </div>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="relative group text-xs font-bold uppercase tracking-widest text-slate-300 hover:text-white transition-colors py-2"
              >
                {link.label}
                <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-300 group-hover:w-full rounded-full shadow-[0_0_10px_rgba(249,115,22,0.5)]" />
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="hidden lg:flex items-center gap-5">
            {isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="group flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur-md px-2 py-1.5 pr-4 rounded-2xl transition-all duration-300"
                >
                  <div className="w-9 h-9 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center text-sm font-black text-white shadow-[0_0_15px_rgba(249,115,22,0.4)] group-hover:scale-105 transition-transform">
                    {user?.name?.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden sm:block text-sm font-bold text-white tracking-tight">{user?.name}</span>
                </button>

                {userDropdownOpen && (
                  <div className="absolute right-0 mt-4 w-56 bg-white/80 backdrop-blur-3xl border border-white/60 rounded-[20px] shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-2 z-50 animate-fade-in origin-top-right glass-sheen">
                    <Link
                      to="/dashboard"
                      className="block px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-white/60 hover:text-[#1e3a5f] transition-all"
                      onClick={() => setUserDropdownOpen(false)}
                    >
                      {t('nav.dashboard')}
                    </Link>
                    <Link
                      to="/wallet"
                      className="block px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-white/60 hover:text-[#1e3a5f] transition-all"
                      onClick={() => setUserDropdownOpen(false)}
                    >
                      {t('nav.wallet')}
                    </Link>
                    {isAdmin && (
                      <div className="my-1 border-t border-white/40">
                        <Link
                          to="/admin"
                          className="mt-1 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-white/60 hover:text-[#1e3a5f] transition-all"
                          onClick={() => setUserDropdownOpen(false)}
                        >
                          <BarChart3 size={16} className="text-orange-500" />
                          {t('nav.admin')}
                        </Link>
                      </div>
                    )}
                    <div className="my-1 border-t border-white/40">
                      <button
                        onClick={handleLogout}
                        className="mt-1 w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50/80 transition-all flex items-center gap-2"
                      >
                        <LogOut size={16} />
                        {t('nav.logout')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex gap-3">
                <Link to="/login" className="px-5 py-2.5 bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 rounded-xl text-sm font-bold text-white transition-all hover:shadow-lg active:scale-95">
                  {t('nav.login')}
                </Link>
                <Link to="/register" className="group relative overflow-hidden px-5 py-2.5 bg-orange-500 hover:bg-orange-400 rounded-xl text-sm font-black tracking-tight text-slate-900 transition-all shadow-[0_0_20px_rgba(249,115,22,0.3)] hover:shadow-[0_0_25px_rgba(249,115,22,0.5)] hover:-translate-y-0.5 active:scale-95 glass-sheen">
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                  <span className="relative z-10">{t('nav.register')}</span>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile hamburger button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            className="lg:hidden p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-300 hover:text-white transition-all backdrop-blur-md active:scale-95"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden absolute top-full left-0 w-full bg-[#0f172a]/95 backdrop-blur-3xl border-t border-white/10 shadow-2xl animate-fade-in z-50">
            <div className="p-6 flex flex-col gap-4">
              <div className="space-y-2">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    to={link.href}
                    className="block px-4 py-3 bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10 rounded-xl text-sm font-bold uppercase tracking-widest text-white transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>

              {isAuthenticated ? (
                <div className="space-y-2 pt-4 border-t border-white/10">
                  <Link
                    to="/dashboard"
                    className="block px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold uppercase tracking-widest text-slate-300 hover:text-white transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {t('nav.dashboard')}
                  </Link>
                  {isAdmin && (
                    <Link
                      to="/admin"
                      className="flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold uppercase tracking-widest text-orange-400 hover:text-orange-300 transition-all"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <BarChart3 size={16} />
                      {t('nav.admin')}
                    </Link>
                  )}
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-sm font-bold uppercase tracking-widest text-red-400 transition-all flex items-center gap-2 mt-2"
                  >
                    <LogOut size={16} />
                    {t('nav.logout')}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-white/10">
                  <Link
                    to="/login"
                    className="flex-1 py-3.5 bg-white/5 backdrop-blur-md border border-white/20 rounded-xl text-sm font-bold text-white text-center hover:bg-white/10 transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {t('nav.login')}
                  </Link>
                  <Link
                    to="/register"
                    className="group relative overflow-hidden flex-1 py-3.5 bg-orange-500 rounded-xl text-sm font-black tracking-tight text-slate-900 text-center shadow-[0_0_15px_rgba(249,115,22,0.3)] glass-sheen"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                    <span className="relative z-10">{t('nav.register')}</span>
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
