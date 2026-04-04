import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Menu, X, LogOut, Settings, BarChart3 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'

export const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userDropdownOpen, setUserDropdownOpen] = useState(false)
  const { isAuthenticated, user, isAdmin, logout } = useAuth()
  const { language, changeLanguage, t } = useLanguage()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const navLinks = [
    { label: t('nav.home'), href: '/' },
    isAuthenticated && { label: t('nav.dashboard'), href: '/dashboard' },
    { label: t('nav.track'), href: '/track' },
    { label: t('nav.pricing'), href: '/pricing' },
    isAuthenticated && { label: t('nav.wallet'), href: '/wallet' },
  ].filter(Boolean)

  return (
    <nav className="bg-[#1e3a5f] text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 font-bold text-2xl">
            <span className="text-white">Swift</span>
            <span className="text-orange-500">Cargo</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="hover:text-orange-500 transition-colors font-medium"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right Side */}
          <div className="hidden lg:flex items-center gap-6">
            {/* Language Switcher */}
            <div className="flex gap-2 bg-[#152d4a] px-3 py-1 rounded-lg">
              <button
                onClick={() => changeLanguage('en')}
                className={`px-2 py-1 rounded ${
                  language === 'en'
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                EN
              </button>
              <button
                onClick={() => changeLanguage('sw')}
                className={`px-2 py-1 rounded ${
                  language === 'sw'
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                SW
              </button>
            </div>

            {isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2 hover:text-orange-500 transition-colors"
                >
                  <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-sm font-bold">
                    {user?.name?.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden sm:inline">{user?.name}</span>
                </button>

                {/* Dropdown Menu */}
                {userDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white text-[#1e3a5f] rounded-lg shadow-xl overflow-hidden">
                    <Link
                      to="/dashboard"
                      className="block px-4 py-2 hover:bg-gray-100 transition-colors"
                      onClick={() => setUserDropdownOpen(false)}
                    >
                      {t('nav.dashboard')}
                    </Link>
                    <Link
                      to="/wallet"
                      className="block px-4 py-2 hover:bg-gray-100 transition-colors"
                      onClick={() => setUserDropdownOpen(false)}
                    >
                      {t('nav.wallet')}
                    </Link>
                    <Link
                      to="/referral"
                      className="block px-4 py-2 hover:bg-gray-100 transition-colors"
                      onClick={() => setUserDropdownOpen(false)}
                    >
                      {t('nav.referral')}
                    </Link>
                    {isAdmin && (
                      <Link
                        to="/admin"
                        className="block px-4 py-2 hover:bg-gray-100 transition-colors border-t border-gray-200 flex items-center gap-2"
                        onClick={() => setUserDropdownOpen(false)}
                      >
                        <BarChart3 size={16} />
                        {t('nav.admin')}
                      </Link>
                    )}
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 hover:bg-red-100 transition-colors border-t border-gray-200 flex items-center gap-2 text-red-600"
                    >
                      <LogOut size={16} />
                      {t('nav.logout')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex gap-3">
                <Link
                  to="/login"
                  className="px-4 py-2 hover:text-orange-500 transition-colors"
                >
                  {t('nav.login')}
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg font-bold transition-colors"
                >
                  {t('nav.register')}
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 hover:bg-[#152d4a] rounded-lg"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-4 space-y-2 border-t border-[#152d4a] pt-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="block px-4 py-2 hover:bg-[#152d4a] rounded transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}

            {/* Mobile Language Switcher */}
            <div className="flex gap-2 bg-[#152d4a] px-3 py-2 rounded mx-4">
              <button
                onClick={() => {
                  changeLanguage('en')
                  setMobileMenuOpen(false)
                }}
                className={`flex-1 px-2 py-1 rounded text-sm ${
                  language === 'en'
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                EN
              </button>
              <button
                onClick={() => {
                  changeLanguage('sw')
                  setMobileMenuOpen(false)
                }}
                className={`flex-1 px-2 py-1 rounded text-sm ${
                  language === 'sw'
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                SW
              </button>
            </div>

            {isAuthenticated ? (
              <>
                <Link
                  to="/dashboard"
                  className="block px-4 py-2 hover:bg-[#152d4a] rounded transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('nav.dashboard')}
                </Link>
                <Link
                  to="/referral"
                  className="block px-4 py-2 hover:bg-[#152d4a] rounded transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('nav.referral')}
                </Link>
                {isAdmin && (
                  <Link
                    to="/admin"
                    className="block px-4 py-2 hover:bg-[#152d4a] rounded transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {t('nav.admin')}
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 hover:bg-red-900 rounded transition-colors text-red-400"
                >
                  {t('nav.logout')}
                </button>
              </>
            ) : (
              <div className="flex gap-2 px-4">
                <Link
                  to="/login"
                  className="flex-1 px-4 py-2 border border-orange-500 text-orange-500 rounded hover:bg-orange-500 hover:text-white transition-colors text-center"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('nav.login')}
                </Link>
                <Link
                  to="/register"
                  className="flex-1 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors text-center font-bold"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('nav.register')}
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
