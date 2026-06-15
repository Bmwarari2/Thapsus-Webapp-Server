import React from 'react'
import { Link } from 'react-router-dom'
import { Mail, Phone, MapPin } from 'lucide-react'
// Facebook + Instagram come from a local stub because Lucide v1 dropped
// brand icons. See client/src/components/icons/BrandIcons.jsx (audit F-19).
import { Facebook, Instagram } from './icons/BrandIcons'
import { useLanguage } from '../context/LanguageContext'

const TikTokIcon = ({ size = 20, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/>
  </svg>
)

export const Footer = () => {
  const { t } = useLanguage()

  return (
    <footer className="relative mt-16 overflow-hidden bg-ink-800 border-t border-line font-sans pt-16 pb-8">
      {/* Soft ember aura */}
      <div className="absolute -bottom-1/3 left-1/2 -translate-x-1/2 w-[60vw] h-[60vw] max-w-[700px] max-h-[700px] bg-ember-radial blur-2xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8 mb-12">
          {/* Company Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <img src="/iOS-ipad.png" alt="Thapsus Cargo" width="180" height="180" className="h-12 w-auto drop-shadow-[0_0_12px_rgba(242,100,24,0.3)]" />
              <h2 className="text-3xl font-black tracking-tighter leading-none">
                <span className="text-white drop-shadow-md">Thapsus</span>
                <span className="text-ember-400 drop-shadow-[0_0_15px_rgba(242,100,24,0.4)]">Cargo</span>
              </h2>
            </div>
            <p className="text-mute font-medium text-sm leading-relaxed max-w-xs">
              Your trusted premium shipping and forwarding partner for goods from the UK to Kenya.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-black text-xl mb-6 text-white tracking-tighter leading-none">{t('nav.home')}</h3>
            <ul className="space-y-3 text-sm font-semibold text-mute">
              <li><a href="/" className="hover:text-ember-400 hover:translate-x-1 inline-block transition-transform duration-300">{t('nav.home')}</a></li>
              <li><a href="/pricing" className="hover:text-ember-400 hover:translate-x-1 inline-block transition-transform duration-300">{t('nav.pricing')}</a></li>
              <li><a href="/track" className="hover:text-ember-400 hover:translate-x-1 inline-block transition-transform duration-300">{t('nav.track')}</a></li>
              <li><a href="/articles" className="hover:text-ember-400 hover:translate-x-1 inline-block transition-transform duration-300">Shipping guides</a></li>
              <li><a href="/support" className="hover:text-ember-400 hover:translate-x-1 inline-block transition-transform duration-300">{t('nav.support')}</a></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-black text-xl mb-6 text-white tracking-tighter leading-none">{t('common.contactUs')}</h3>
            <ul className="space-y-4 text-sm font-semibold text-mute">
              <li className="flex items-start gap-3 group">
                <div className="p-2 bg-white/[0.05] rounded-lg border border-line group-hover:border-ember-500/50 transition-colors">
                  <MapPin size={16} className="text-ember-400" />
                </div>
                <span className="mt-1">31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB, UK</span>
              </li>
              <li className="flex items-center gap-3 group">
                <div className="p-2 bg-white/[0.05] rounded-lg border border-line group-hover:border-ember-500/50 transition-colors">
                  <Mail size={16} className="text-ember-400" />
                </div>
                <a href="mailto:admin@thapsus.uk" className="hover:text-ember-400 transition-colors">
                  admin@thapsus.uk
                </a>
              </li>
              <li className="flex items-center gap-3 group">
                <div className="p-2 bg-white/[0.05] rounded-lg border border-line group-hover:border-ember-500/50 transition-colors">
                  <Phone size={16} className="text-ember-400" />
                </div>
                <a
                  href="https://wa.me/447424531483"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-ember-400 transition-colors flex items-center gap-1.5"
                >
                  +44 7424 531483
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">WhatsApp</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Follow Us */}
          <div>
            <h3 className="font-black text-xl mb-6 text-white tracking-tighter leading-none">{t('common.followUs')}</h3>
            <div className="flex gap-3">
              <a href="https://www.facebook.com/share/18Uq3aBzTF/?mibextid=wwXIfr" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="group relative overflow-hidden p-3 bg-white/[0.05] hover:bg-ember-500 rounded-xl border border-line transition-all duration-300 hover:shadow-[0_0_20px_rgba(242,100,24,0.4)] hover:-translate-y-1 glass-sheen">
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                <Facebook size={20} className="text-mute group-hover:text-white relative z-10 transition-colors" />
              </a>
              <a href="https://www.instagram.com/thapsus.uk" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="group relative overflow-hidden p-3 bg-white/[0.05] hover:bg-ember-500 rounded-xl border border-line transition-all duration-300 hover:shadow-[0_0_20px_rgba(242,100,24,0.4)] hover:-translate-y-1 glass-sheen">
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                <Instagram size={20} className="text-mute group-hover:text-white relative z-10 transition-colors" />
              </a>
              <a href="https://www.tiktok.com/@thapsus.uk" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="group relative overflow-hidden p-3 bg-white/[0.05] hover:bg-ember-500 rounded-xl border border-line transition-all duration-300 hover:shadow-[0_0_20px_rgba(242,100,24,0.4)] hover:-translate-y-1 glass-sheen">
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                <TikTokIcon size={20} className="text-mute group-hover:text-white relative z-10 transition-colors" />
              </a>
            </div>
          </div>
        </div>

        {/* Divider & Copyright */}
        <div className="border-t border-line pt-8 mt-4 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            {/* Audit a11y fix: text-slate-500 (#64748b) on the dark
                footer #202d48 was 2.88:1. Bumped to slate-300 (#cbd5e1)
                for 6.34:1 — clears AA easily. Same for the privacy /
                terms links (slate-400 → slate-300). */}
            <p className="text-mute text-sm font-semibold tracking-tight">
              {t('common.copyright')}
            </p>
            <div className="flex gap-6 text-sm font-bold text-mute">
              <Link to="/privacy" className="hover:text-ember-400 transition-colors">
                {t('common.privacy')}
              </Link>
              <Link to="/terms" className="hover:text-ember-400 transition-colors">
                {t('common.terms')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
