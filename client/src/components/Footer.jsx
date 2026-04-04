import React from 'react'
import { Mail, Phone, MapPin, Facebook, Twitter, Linkedin, Instagram } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'

export const Footer = () => {
  const { t } = useLanguage()

  return (
    <footer className="bg-[#1e3a5f] text-white mt-16">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Company Info */}
          <div>
            <h3 className="text-2xl font-bold mb-4">
              <span className="text-white">Swift</span>
              <span className="text-orange-500">Cargo</span>
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              Your trusted shipping and forwarding partner for goods from UK, USA, and China to Kenya.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-bold text-lg mb-4 text-orange-500">{t('nav.home')}</h4>
            <ul className="space-y-2 text-sm text-gray-300">
              <li><a href="/" className="hover:text-orange-500 transition-colors">{t('common.about')}</a></li>
              <li><a href="/pricing" className="hover:text-orange-500 transition-colors">{t('nav.pricing')}</a></li>
              <li><a href="/track" className="hover:text-orange-500 transition-colors">{t('nav.track')}</a></li>
              <li><a href="/support" className="hover:text-orange-500 transition-colors">{t('nav.support')}</a></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-bold text-lg mb-4 text-orange-500">{t('common.contactUs')}</h4>
            <ul className="space-y-3 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <MapPin size={16} className="mt-1 flex-shrink-0 text-orange-500" />
                <span>31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB, UK</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail size={16} className="text-orange-500" />
                <a href="mailto:support@swiftcargo.com" className="hover:text-orange-500 transition-colors">
                  support@swiftcargo.com
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Phone size={16} className="text-orange-500" />
                <a href="tel:+441614496000" className="hover:text-orange-500 transition-colors">
                  +44 161 449 6000
                </a>
              </li>
            </ul>
          </div>

          {/* Follow Us */}
          <div>
            <h4 className="font-bold text-lg mb-4 text-orange-500">{t('common.followUs')}</h4>
            <div className="flex gap-4">
              <a href="#" className="p-2 bg-[#152d4a] hover:bg-orange-500 rounded-full transition-colors">
                <Facebook size={20} />
              </a>
              <a href="#" className="p-2 bg-[#152d4a] hover:bg-orange-500 rounded-full transition-colors">
                <Twitter size={20} />
              </a>
              <a href="#" className="p-2 bg-[#152d4a] hover:bg-orange-500 rounded-full transition-colors">
                <Linkedin size={20} />
              </a>
              <a href="#" className="p-2 bg-[#152d4a] hover:bg-orange-500 rounded-full transition-colors">
                <Instagram size={20} />
              </a>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[#152d4a] py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-400 text-sm">
              {t('common.copyright')}
            </p>
            <div className="flex gap-6 text-sm text-gray-400">
              <a href="#" className="hover:text-orange-500 transition-colors">
                {t('common.privacy')}
              </a>
              <a href="#" className="hover:text-orange-500 transition-colors">
                {t('common.terms')}
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
