import React from 'react'
import { Link } from 'react-router-dom'
import { Mail, Phone, MapPin, Facebook, Twitter, Linkedin, Instagram } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'

export const Footer = () => {
  const { t } = useLanguage()

  return (
    <footer className="relative mt-16 overflow-hidden bg-[#0f172a]/95 backdrop-blur-3xl border-t border-white/10 font-sans pt-16 pb-8">
      {/* Liquid Backgrounds for Footer */}
      <div className="absolute top-[-50%] left-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-blue-500/10 rounded-full blur-[100px] animate-morph mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-50%] right-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-orange-500/10 rounded-full blur-[100px] animate-morph mix-blend-screen pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8 mb-12">
          {/* Company Info */}
          <div className="space-y-4">
            <h2 className="text-3xl font-black tracking-tighter leading-none mb-4">
              <span className="text-white drop-shadow-md">Thapsus</span>
              <span className="text-orange-500 drop-shadow-[0_0_15px_rgba(249,115,22,0.4)]">Cargo</span>
            </h2>
            <p className="text-slate-400 font-medium text-sm leading-relaxed max-w-xs">
              Your trusted premium shipping and forwarding partner for goods from UK and China to Kenya.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-black text-xl mb-6 text-white tracking-tighter leading-none">{t('nav.home')}</h3>
            <ul className="space-y-3 text-sm font-semibold text-slate-400">
              <li><a href="/" className="hover:text-orange-400 hover:translate-x-1 inline-block transition-transform duration-300">{t('common.about')}</a></li>
              <li><a href="/pricing" className="hover:text-orange-400 hover:translate-x-1 inline-block transition-transform duration-300">{t('nav.pricing')}</a></li>
              <li><a href="/track" className="hover:text-orange-400 hover:translate-x-1 inline-block transition-transform duration-300">{t('nav.track')}</a></li>
              <li><a href="/support" className="hover:text-orange-400 hover:translate-x-1 inline-block transition-transform duration-300">{t('nav.support')}</a></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-black text-xl mb-6 text-white tracking-tighter leading-none">{t('common.contactUs')}</h3>
            <ul className="space-y-4 text-sm font-semibold text-slate-400">
              <li className="flex items-start gap-3 group">
                <div className="p-2 bg-white/5 rounded-lg border border-white/10 group-hover:border-orange-500/50 transition-colors">
                  <MapPin size={16} className="text-orange-400" />
                </div>
                <span className="mt-1">31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB, UK</span>
              </li>
              <li className="flex items-center gap-3 group">
                <div className="p-2 bg-white/5 rounded-lg border border-white/10 group-hover:border-orange-500/50 transition-colors">
                  <Mail size={16} className="text-orange-400" />
                </div>
                <a href="mailto:support@thapsus.uk" className="hover:text-orange-400 transition-colors">
                  support@thapsus.uk
                </a>
              </li>
              <li className="flex items-center gap-3 group">
                <div className="p-2 bg-white/5 rounded-lg border border-white/10 group-hover:border-orange-500/50 transition-colors">
                  <Phone size={16} className="text-orange-400" />
                </div>
                <a
                  href="https://wa.me/447424531483"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-orange-400 transition-colors flex items-center gap-1.5"
                >
                  +44 7424 531483
                  <span className="text-[9px] font-black uppercase tracking-wider text-green-400 bg-green-400/10 border border-green-400/20 px-1.5 py-0.5 rounded-full">WhatsApp</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Follow Us */}
          <div>
            <h3 className="font-black text-xl mb-6 text-white tracking-tighter leading-none">{t('common.followUs')}</h3>
            <div className="flex gap-3">
              <a href="#" aria-label="Facebook" className="group relative overflow-hidden p-3 bg-white/5 hover:bg-orange-500 rounded-xl border border-white/10 transition-all duration-300 hover:shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:-translate-y-1 glass-sheen">
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                <Facebook size={20} className="text-slate-300 group-hover:text-white relative z-10 transition-colors" />
              </a>
              <a href="#" aria-label="Twitter" className="group relative overflow-hidden p-3 bg-white/5 hover:bg-orange-500 rounded-xl border border-white/10 transition-all duration-300 hover:shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:-translate-y-1 glass-sheen">
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                <Twitter size={20} className="text-slate-300 group-hover:text-white relative z-10 transition-colors" />
              </a>
              <a href="#" aria-label="LinkedIn" className="group relative overflow-hidden p-3 bg-white/5 hover:bg-orange-500 rounded-xl border border-white/10 transition-all duration-300 hover:shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:-translate-y-1 glass-sheen">
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                <Linkedin size={20} className="text-slate-300 group-hover:text-white relative z-10 transition-colors" />
              </a>
              <a href="#" aria-label="Instagram" className="group relative overflow-hidden p-3 bg-white/5 hover:bg-orange-500 rounded-xl border border-white/10 transition-all duration-300 hover:shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:-translate-y-1 glass-sheen">
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                <Instagram size={20} className="text-slate-300 group-hover:text-white relative z-10 transition-colors" />
              </a>
            </div>
          </div>
        </div>

        {/* Divider & Copyright */}
        <div className="border-t border-white/10 pt-8 mt-4 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-slate-500 text-sm font-semibold tracking-tight">
              {t('common.copyright')}
            </p>
            <div className="flex gap-6 text-sm font-bold text-slate-400">
              <Link to="/privacy" className="hover:text-orange-400 transition-colors">
                {t('common.privacy')}
              </Link>
              <Link to="/terms" className="hover:text-orange-400 transition-colors">
                {t('common.terms')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
