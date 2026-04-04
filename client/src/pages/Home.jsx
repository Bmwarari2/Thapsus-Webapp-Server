import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Package, Truck, MapPin, Star, ChevronRight } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'

export const Home = () => {
  const { t } = useLanguage()
  const { isAuthenticated } = useAuth()

  const retailers = [
    { name: 'Shein', emoji: '👗' },
    { name: 'Amazon', emoji: '📦' },
    { name: 'Next', emoji: '🛍️' },
    { name: 'Asos', emoji: '👔' },
    { name: 'Superdrug', emoji: '💄' },
    { name: 'eBay', emoji: '🏪' },
    { name: 'ZARA', emoji: '👠' },
    { name: 'H&M', emoji: '👕' },
  ]

  const markets = [
    {
      name: 'United Kingdom',
      flag: '🇬🇧',
      description: 'Fast shipping from UK warehouses',
    },
    {
      name: 'United States',
      flag: '🇺🇸',
      description: 'Reliable USA forwarding service',
    },
    {
      name: 'China',
      flag: '🇨🇳',
      description: 'Affordable Chinese marketplace goods',
    },
  ]

  const steps = [
    { icon: <Package size={32} />, title: t('home.step1') },
    { icon: <Truck size={32} />, title: t('home.step2') },
    { icon: <MapPin size={32} />, title: t('home.step3') },
    { icon: <Package size={32} />, title: t('home.step4') },
  ]

  const testimonials = [
    {
      name: 'John Kimani',
      text: 'SwiftCargo made shopping international so easy. My packages arrived quickly and in perfect condition!',
      rating: 5,
    },
    {
      name: 'Sarah Omondi',
      text: 'Best shipping service I have used. Transparent pricing and excellent customer support throughout.',
      rating: 5,
    },
    {
      name: 'Michael Kipchoge',
      text: 'Reliable and affordable. I have sent multiple packages and every single one arrived on time.',
      rating: 5,
    },
  ]

  return (
    <div className="bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#1e3a5f] to-[#152d4a] text-white py-16 md:py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
                {t('home.hero.title')}
              </h1>
              <p className="text-lg text-gray-200 mb-8">
                {t('home.hero.subtitle')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  to={isAuthenticated ? '/orders/new' : '/register'}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  {t('home.hero.cta')}
                  <ArrowRight size={20} />
                </Link>
                <Link
                  to="/track"
                  className="border-2 border-orange-500 hover:bg-orange-500 text-white px-8 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  {t('home.hero.track')}
                </Link>
              </div>
            </div>
            <div className="hidden md:flex justify-center">
              <div className="text-6xl">📦</div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-[#1e3a5f]">
            {t('home.howitworks')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {steps.map((step, idx) => (
              <div key={idx} className="relative">
                <div className="bg-white rounded-xl shadow-lg p-8 text-center h-full flex flex-col items-center justify-center">
                  <div className="text-orange-500 mb-4">{step.icon}</div>
                  <p className="font-semibold text-gray-800">{step.title}</p>
                  {idx < steps.length - 1 && (
                    <ChevronRight className="hidden md:block absolute -right-8 top-1/2 -translate-y-1/2 text-orange-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Retailers */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-[#1e3a5f]">
            {t('home.retailers')}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {retailers.map((retailer) => (
              <div
                key={retailer.name}
                className="bg-white rounded-xl shadow-lg p-8 flex flex-col items-center justify-center hover:shadow-xl transition-shadow"
              >
                <span className="text-5xl mb-3">{retailer.emoji}</span>
                <p className="font-semibold text-gray-800 text-center">{retailer.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Markets */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-[#1e3a5f]">
            {t('home.markets')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {markets.map((market) => (
              <div key={market.name} className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow">
                <div className="text-6xl mb-4">{market.flag}</div>
                <h3 className="text-2xl font-bold text-[#1e3a5f] mb-2">{market.name}</h3>
                <p className="text-gray-600">{market.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-[#1e3a5f]">
            {t('home.testimonials')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, idx) => (
              <div key={idx} className="bg-white rounded-xl shadow-lg p-8">
                <div className="flex gap-1 mb-4">
                  {Array(testimonial.rating)
                    .fill(0)
                    .map((_, i) => (
                      <Star
                        key={i}
                        size={20}
                        className="fill-yellow-400 text-yellow-400"
                      />
                    ))}
                </div>
                <p className="text-gray-600 mb-4">"{testimonial.text}"</p>
                <p className="font-semibold text-gray-800">- {testimonial.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-r from-[#1e3a5f] to-[#152d4a] rounded-xl p-12 text-white text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t('home.pricing.title')}
            </h2>
            <p className="text-lg text-gray-200 mb-8">
              {t('home.pricing.description')}
            </p>
            <Link
              to="/pricing"
              className="inline-block bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-bold transition-colors"
            >
              {t('home.pricing.calculate')}
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-[#1e3a5f]">
            Ready to start shipping?
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Join thousands of satisfied customers shipping with SwiftCargo
          </p>
          <Link
            to={isAuthenticated ? '/orders/new' : '/register'}
            className="inline-block bg-orange-500 hover:bg-orange-600 text-white px-8 py-4 rounded-lg font-bold text-lg transition-colors"
          >
            {t('home.hero.cta')}
          </Link>
        </div>
      </section>
    </div>
  )
}
