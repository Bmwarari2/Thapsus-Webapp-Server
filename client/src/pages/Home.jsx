import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight, Truck, Star, Globe, Zap, ShoppingBag, Headphones, Box,
  Bell, Store, Search, Plane, CheckCircle2, Package, MapPin, ShieldCheck, Sparkles,
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { SEO } from '../components/SEO'
import { CutoffBanner } from '../components/CutoffBanner'
import { PillLabel, EmberIcon, ArcDecoration } from '../components/ui'
import { Reveal, FocusText, CountUp, DataCore } from '../components/motion'

const MarqueeRetailers = ({ retailers }) => {
  const triple = [...retailers, ...retailers, ...retailers]
  return (
    <div className="py-8 border-y border-line bg-white/[0.02] overflow-hidden select-none">
      <div className="animate-scroll">
        {triple.map((r, i) => (
          <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-3 mx-8 md:mx-10 text-mute hover:text-white transition-colors group">
            <span className="p-2.5 rounded-2xl bg-surface-2 border border-line group-hover:border-ember-500/40 transition-colors">
              {r.icon}
            </span>
            <span className="text-lg md:text-xl font-bold tracking-tight">{r.name}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

export const Home = () => {
  const { t } = useLanguage()
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [trackingInput, setTrackingInput] = useState('')

  const handleTrack = (e) => {
    e.preventDefault()
    const q = trackingInput.trim()
    navigate(q ? `/track?q=${encodeURIComponent(q)}` : '/track')
  }

  const iconCls = 'text-white/70'
  const retailers = [
    { name: 'Shein',  url: 'https://www.shein.com',    icon: <ShoppingBag size={22} className={iconCls} /> },
    { name: 'Amazon', url: 'https://www.amazon.co.uk', icon: <Box size={22} className={iconCls} /> },
    { name: 'Next',   url: 'https://www.next.co.uk',   icon: <ShoppingBag size={22} className={iconCls} /> },
    { name: 'eBay',   url: 'https://www.ebay.co.uk',   icon: <Package size={22} className={iconCls} /> },
    { name: 'ZARA',   url: 'https://www.zara.com',     icon: <ShoppingBag size={22} className={iconCls} /> },
    { name: 'Temu',   url: 'https://www.temu.com',     icon: <Zap size={22} className={iconCls} /> },
    { name: 'ASOS',   url: 'https://www.asos.com',     icon: <ShoppingBag size={22} className={iconCls} /> },
    { name: 'Marks & Spencer', url: 'https://www.marksandspencer.com', icon: <Store size={22} className={iconCls} /> },
  ]

  const steps = [
    { n: '01', icon: ShoppingBag, title: t('home.step1') || 'Send us a retailer link', desc: 'Shop any UK brand — or just send us the product link and let us handle it.' },
    { n: '02', icon: Bell,        title: t('home.step2') || 'We buy on your behalf', desc: 'We purchase, receive and catalogue your parcel at our UK warehouse.' },
    { n: '03', icon: Plane,       title: t('home.step3') || 'UK warehouse & air freight', desc: 'Weekly consolidation and air freight with specialised customs clearance.' },
    { n: '04', icon: Truck,       title: t('home.step4') || 'Door-step delivery in Kenya', desc: 'Collect from our Nairobi CBD point, or we deliver anywhere in Kenya.' },
  ]

  const testimonials = [
    { name: 'John Kimani',     location: 'Nairobi CBD', icon: MapPin,      text: 'Thapsus Cargo made shopping from Amazon UK so easy. My packages arrived in perfect condition within 10 days — way faster than I expected!' },
    { name: 'Sarah Omondi',    location: 'Mombasa',     icon: CheckCircle2, text: 'I ordered electronics from the UK and the team handled everything including customs. Transparent pricing — no hidden surprises at all.' },
    { name: 'Michael Kipchoge',location: 'Eldoret',     icon: ShieldCheck, text: 'Reliable and affordable. I consolidate my Shein and AliExpress orders every month and always get a good rate. Highly recommend!' },
    { name: 'Grace Wanjiru',   location: 'Thika',       icon: Star,        text: 'The TC code system is brilliant. I ship from multiple UK stores and everything gets consolidated into one affordable shipment to Kenya.' },
    { name: 'David Otieno',    location: 'Kisumu',      icon: Package,     text: 'I was nervous about international shipping but the team walked me through everything. My order arrived safely with great tracking updates.' },
    { name: 'Fatuma Hassan',   location: 'Nakuru',      icon: Sparkles,    text: 'Best forwarding service in Kenya. The CBD collection point is super convenient and the staff are always helpful. Will keep using Thapsus!' },
  ]

  return (
    <div className="overflow-x-hidden">
      <SEO
        title="UK→Kenya concierge shopping & shipping"
        description="Send us a link from any UK retailer — Thapsus Cargo buys it, ships it, and delivers to your door in Kenya. Pre-register parcels you already bought, or get instant shipping quotes."
      />

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative">
        <div className="absolute -top-24 right-0 w-[44rem] h-[44rem] bg-ember-radial blur-2xl pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-8 md:pt-14">
          <CutoffBanner />
        </div>

        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-8 md:pt-12 pb-16 md:pb-24 relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <Reveal className="space-y-7 text-center lg:text-left">
              <div className="flex justify-center lg:justify-start"><PillLabel>{t('home.hero.eyebrow') || 'Shop UK · receive Kenya'}</PillLabel></div>

              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] text-white">
                We shop the UK,<br />
                <span className="text-ember-gradient">you receive in Kenya</span>
              </h1>

              <p className="text-base md:text-xl text-mute max-w-lg mx-auto lg:mx-0 leading-relaxed">
                {t('home.hero.subtitle') || 'Send us a link from any UK retailer and we buy, ship, and deliver to your door.'}
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3 flex-wrap">
                <Link to={isAuthenticated ? '/buy-for-me' : '/register?next=/buy-for-me'} className="btn-primary glass-sheen btn-lg">
                  {t('home.hero.cta') || 'Have us shop & ship for you'}
                  <ArrowRight size={20} />
                </Link>
                <Link to={isAuthenticated ? '/new-order' : '/register?next=/new-order'} className="btn-secondary btn-lg">
                  {t('home.hero.cta_secondary') || 'Pre-register a parcel'}
                </Link>
              </div>

              {/* Track + WhatsApp */}
              <div className="flex flex-col sm:flex-row items-stretch gap-3 max-w-lg mx-auto lg:mx-0">
                <form onSubmit={handleTrack} className="relative flex-grow">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                  <input type="text" value={trackingInput} onChange={(e) => setTrackingInput(e.target.value)}
                    placeholder="Tracking ID…" aria-label="Enter your tracking ID"
                    className="form-input pl-11 pr-24 !rounded-full" />
                  <button type="submit"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-primary btn-sm">Track</button>
                </form>
                <a href="https://wa.me/447424531483?text=Hi%2C%20I%27d%20like%20to%20enquire%20about%20Thapsus%20Cargo%20shipping%20services."
                  target="_blank" rel="noopener noreferrer"
                  className="btn bg-[#25D366] hover:bg-[#1ebe5b] text-white shrink-0">
                  <svg viewBox="0 0 32 32" width="20" height="20" fill="currentColor"><path d="M16 0C7.163 0 0 7.163 0 16c0 2.824.737 5.479 2.027 7.793L0 32l8.455-2.005A15.931 15.931 0 0016 32c8.837 0 16-7.163 16-16S24.837 0 16 0zm0 29.333a13.29 13.29 0 01-6.781-1.853l-.487-.29-5.013 1.189 1.213-4.877-.317-.5A13.267 13.267 0 012.667 16C2.667 8.636 8.636 2.667 16 2.667S29.333 8.636 29.333 16 23.364 29.333 16 29.333z"/></svg>
                  WhatsApp
                </a>
              </div>

              <div className="flex items-center justify-center lg:justify-start gap-6 pt-6 border-t border-line">
                <div>
                  <div className="flex text-ember-400 mb-1 justify-center lg:justify-start">
                    {[...Array(5)].map((_, i) => <Star key={i} size={15} fill="currentColor" />)}
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/80">Industry leader</p>
                </div>
                <div className="h-9 w-px bg-line" />
                <p className="text-xs text-mute max-w-[200px] leading-relaxed text-left">
                  Over <span className="text-white font-semibold"><CountUp to={12000} suffix="+" /></span> shipments delivered across East Africa.
                </p>
              </div>
            </Reveal>

            {/* Hero visual: live shipment card + ambient data-core behind it */}
            <Reveal variant="scale" delay={120} className="relative">
              <div className="hidden md:block pointer-events-none"
                style={{ position: 'absolute', top: '-92px', right: '-56px', zIndex: 0, opacity: 0.75 }}>
                <DataCore />
              </div>
              <div className="relative glow-border p-6 md:p-8 overflow-hidden">
                <ArcDecoration className="top-0 right-0 w-72 h-72 opacity-70" />
                <div className="flex justify-between items-center mb-10">
                  <EmberIcon icon={Plane} wrap="w-12 h-12" />
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.05] border border-line text-[10px] font-semibold uppercase tracking-[0.2em] text-mute">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Live monitoring
                  </div>
                </div>
                <div className="space-y-8">
                  <div className="progress-bar h-3"><div className="progress-fill glass-sheen" style={{ width: '66%' }} /></div>
                  <div className="flex justify-between">
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-mute uppercase tracking-widest">In transit from</p>
                      <p className="text-base md:text-xl font-bold text-white">London Heathrow</p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-[10px] font-semibold text-mute uppercase tracking-widest">Estimated to</p>
                      <p className="text-base md:text-xl font-bold text-white">JKIA Nairobi</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-2">
                    {[['Air', '7–14d'], ['From', '£9/kg'], ['Cleared', 'Customs']].map(([k, v]) => (
                      <div key={k} className="rounded-2xl bg-white/[0.03] border border-line p-3 text-center">
                        <p className="text-[10px] uppercase tracking-widest text-mute">{k}</p>
                        <p className="text-sm font-bold text-white mt-1">{v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <MarqueeRetailers retailers={retailers} />

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 py-20 md:py-28">
        <Reveal className="mb-14 space-y-5">
          <PillLabel>Our workflow</PillLabel>
          <FocusText as="h2" text={t('home.howitworks') || 'How it works'} className="text-3xl md:text-5xl font-bold tracking-tight text-white" />
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((s, i) => (
            <Reveal as="div" key={s.n} delay={i * 90} className="glow-card p-7 flex flex-col gap-6 min-h-[15rem]">
              <div className="flex items-center justify-between">
                <EmberIcon icon={s.icon} wrap="w-12 h-12" />
                <span className="text-2xl font-bold text-white/15">{s.n}</span>
              </div>
              <div className="mt-auto">
                <h3 className="text-lg font-bold text-white mb-2">{s.title}</h3>
                <p className="text-sm text-mute leading-relaxed">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── PRICING CTA ───────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 pb-20 md:pb-28">
        <div className="relative overflow-hidden rounded-5xl border border-line bg-surface p-8 md:p-14 lg:p-20">
          <div className="absolute -top-32 -right-20 w-[36rem] h-[36rem] bg-ember-radial blur-2xl pointer-events-none" />
          <div className="relative grid lg:grid-cols-2 gap-12 items-center">
            <Reveal variant="left" className="space-y-6 text-center lg:text-left">
              <PillLabel>Pricing</PillLabel>
              <FocusText as="h2" text={t('home.pricing.title') || 'Transparent pricing'}
                className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight" />
              <p className="text-mute text-base md:text-lg max-w-md mx-auto lg:mx-0">
                {t('home.pricing.description') || 'See exactly what you pay before you ship.'}
              </p>
              <Link to="/pricing" className="btn-primary glass-sheen btn-lg">
                {t('home.pricing.calculate') || 'Calculate now'} <ArrowRight size={18} />
              </Link>
            </Reveal>
            <Reveal variant="right" delay={120} className="grid sm:grid-cols-2 gap-5">
              <div className="card flex flex-col justify-between min-h-[14rem]">
                <EmberIcon icon={Plane} wrap="w-12 h-12" />
                <div>
                  <h3 className="text-xl font-bold text-white mt-6">Air cargo</h3>
                  <p className="text-xs text-mute mt-1 mb-4">Fastest route · weekly consolidation</p>
                  <p className="text-3xl font-bold text-white">From £9<small className="text-sm text-mute font-medium ml-1.5">/kg</small></p>
                </div>
              </div>
              <div className="card flex flex-col justify-between min-h-[14rem]">
                <span className="ember-badge w-12 h-12 !bg-white/[0.06] !shadow-none border border-line text-ember-400"><Truck size={22} /></span>
                <div>
                  <h3 className="text-xl font-bold text-white mt-6">Sea freight</h3>
                  <p className="text-xs text-mute mt-1 mb-4">Bulky & heavy items · 45–60 days</p>
                  <p className="text-3xl font-bold text-white">$450<small className="text-sm text-mute font-medium ml-1.5">/CBM</small></p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ──────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 pb-20 md:pb-28">
        <Reveal className="mb-14 space-y-5">
          <PillLabel>Customer stories</PillLabel>
          <FocusText as="h2" text={t('home.testimonials') || 'What our customers say'} className="text-3xl md:text-5xl font-bold tracking-tight text-white" />
        </Reveal>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.map((test, i) => (
            <Reveal as="div" key={test.name} delay={(i % 3) * 100} className="card flex flex-col">
              <div className="flex text-ember-400 mb-6">
                {[...Array(5)].map((_, i) => <Star key={i} size={16} fill="currentColor" />)}
              </div>
              <p className="text-white/80 text-sm md:text-base leading-relaxed mb-8 flex-1">"{test.text}"</p>
              <div className="flex items-center gap-4 pt-6 border-t border-line">
                <span className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-line grid place-items-center text-ember-400 shrink-0">
                  <test.icon size={22} />
                </span>
                <div>
                  <h3 className="font-semibold text-white text-sm">{test.name}</h3>
                  <p className="text-[11px] font-medium text-mute uppercase tracking-widest">{test.location} · Verified</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────────────── */}
      <section className="relative max-w-7xl mx-auto px-4 md:px-6 pb-24">
        <div className="relative overflow-hidden rounded-5xl border border-line bg-surface p-10 md:p-20 text-center">
          <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] bg-ember-radial blur-2xl pointer-events-none" />
          <Reveal className="relative space-y-8 max-w-3xl mx-auto">
            <div className="flex justify-center"><EmberIcon icon={Sparkles} size={30} wrap="w-16 h-16 rounded-3xl animate-float" /></div>
            <FocusText as="h2" text="Start shipping today." className="text-4xl md:text-6xl font-bold tracking-tight text-white leading-[1.05]" />
            <p className="text-mute text-base md:text-xl">
              Join the new era of cross-border commerce. No borders, no limits — just seamless logistics.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <Link to={isAuthenticated ? '/buy-for-me' : '/register?next=/buy-for-me'} className="btn-primary glass-sheen btn-lg">
                {t('home.hero.cta') || 'Have us shop & ship for you'}
              </Link>
              <Link to="/faq" className="btn-secondary btn-lg"><Headphones size={20} /> Help centre</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  )
}

export default Home
