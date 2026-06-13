import React, { useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ShoppingBag, MapPin, Package, ChevronLeft, ChevronRight, Box, Store, Copy,
  MessageCircle, ArrowRight, Truck, Zap,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { PillLabel, EmberIcon } from '../components/ui'
import { Reveal } from '../components/motion'

const iconCls = 'text-white/75'
const RETAILERS = [
  { name: 'Amazon', url: 'https://www.amazon.co.uk', icon: <Box size={26} className={iconCls} /> },
  { name: 'ASOS', url: 'https://www.asos.com', icon: <ShoppingBag size={26} className={iconCls} /> },
  { name: 'Next', url: 'https://www.next.co.uk', icon: <ShoppingBag size={26} className={iconCls} /> },
  { name: 'ZARA', url: 'https://www.zara.com', icon: <ShoppingBag size={26} className={iconCls} /> },
  { name: 'Marks & Spencer', url: 'https://www.marksandspencer.com', icon: <Store size={26} className={iconCls} /> },
  { name: 'eBay', url: 'https://www.ebay.co.uk', icon: <Package size={26} className={iconCls} /> },
  { name: 'Shein', url: 'https://www.shein.com', icon: <ShoppingBag size={26} className={iconCls} /> },
  { name: 'Temu', url: 'https://www.temu.com', icon: <Zap size={26} className={iconCls} /> },
]

const UK_WAREHOUSE = {
  line1: '31 Collingwood Close',
  line2: 'Hazel Grove, Stockport',
  postcode: 'SK7 4LB',
  country: 'United Kingdom',
}

function copyToClipboard(text, label) {
  navigator.clipboard.writeText(text)
    .then(() => toast.success(`${label} copied!`, { duration: 2000 }))
    .catch(() => toast.error('Copy failed — please copy manually'))
}

const RetailerCarousel = () => {
  const scrollRef = useRef(null)
  const scroll = (dir) => {
    if (!scrollRef.current) return
    scrollRef.current.scrollBy({ left: dir === 'left' ? -280 : 280, behavior: 'smooth' })
  }
  return (
    <div className="relative">
      <button onClick={() => scroll('left')} aria-label="Scroll left"
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-20 w-10 h-10 bg-surface-2 border border-line rounded-full grid place-items-center text-white hover:border-line-strong transition-colors"><ChevronLeft size={20} /></button>
      <button onClick={() => scroll('right')} aria-label="Scroll right"
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-20 w-10 h-10 bg-surface-2 border border-line rounded-full grid place-items-center text-white hover:border-line-strong transition-colors"><ChevronRight size={20} /></button>
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto scroll-smooth px-2 py-2 no-scrollbar">
        {RETAILERS.map((r) => (
          <a key={r.name} href={r.url} target="_blank" rel="noopener noreferrer"
            className="flex-none w-[180px] card p-6 flex flex-col items-center gap-4">
            <span className="w-16 h-16 rounded-2xl bg-surface-2 border border-line grid place-items-center">{r.icon}</span>
            <p className="font-bold text-white text-sm">{r.name}</p>
          </a>
        ))}
      </div>
    </div>
  )
}

const AddressCard = ({ user }) => {
  const userName = user?.name || 'Your Name'
  const warehouseId = user?.warehouse_id || 'TC-XXXX'
  const fullAddress = [`${userName} — ${warehouseId}`, UK_WAREHOUSE.line1, UK_WAREHOUSE.line2, UK_WAREHOUSE.postcode, UK_WAREHOUSE.country].join('\n')
  return (
    <div className="glow-card p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-bold text-3xl text-white tracking-tight">{userName}</span>
            <span className="badge-ember">{warehouseId}</span>
          </div>
          <div className="text-white/80 text-lg">
            <p>{UK_WAREHOUSE.line1}</p>
            <p>{UK_WAREHOUSE.line2}</p>
            <p>{UK_WAREHOUSE.postcode}</p>
            <p className="text-ember-400 uppercase text-sm mt-1 tracking-widest">{UK_WAREHOUSE.country}</p>
          </div>
        </div>
        <button onClick={() => copyToClipboard(fullAddress, 'Address')} className="btn-primary glass-sheen shrink-0">
          <Copy size={16} /> Copy address
        </button>
      </div>
    </div>
  )
}

export const ShipInstructions = () => {
  const { user } = useAuth()
  const steps = [
    { number: '01', title: 'Choose your retailer', description: 'Browse and shop from any of our supported UK retailers.', icon: ShoppingBag },
    { number: '02', title: 'Ship to warehouse', description: 'At checkout, use our Stockport warehouse address with your unique ID.', icon: MapPin },
    { number: '03', title: 'Tell us about it', description: 'Log your order in the dashboard or via WhatsApp.', icon: MessageCircle },
    { number: '04', title: 'We handle the rest', description: 'We consolidate and ship your parcels directly to Kenya.', icon: Truck },
  ]

  return (
    <div className="relative overflow-x-hidden py-12 px-4 md:px-6">
      <div className="absolute -top-24 right-0 w-[44rem] h-[44rem] bg-ember-radial blur-2xl pointer-events-none" />

      <div className="max-w-6xl mx-auto relative">
        <Link to="/" className="inline-flex items-center gap-2 text-xs font-semibold text-mute hover:text-white transition-colors mb-10 uppercase tracking-widest">
          <ChevronLeft size={14} /> Back home
        </Link>

        {/* Hero */}
        <Reveal as="header" className="mb-16 space-y-5">
          <PillLabel>Global shipping</PillLabel>
          <h1 className="text-5xl md:text-7xl font-bold text-white leading-[0.95] tracking-tight">
            Faster.<br />Simpler.<br /><span className="text-ember-gradient">Reliable.</span>
          </h1>
          <p className="text-mute text-xl max-w-lg">The next evolution of package forwarding from the UK to Kenya.</p>
        </Reveal>

        {/* Steps */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {steps.map((step, i) => (
            <Reveal as="div" key={i} delay={i * 90} className="glow-card p-7 flex flex-col justify-between min-h-[14rem]">
              <div>
                <EmberIcon icon={step.icon} wrap="w-12 h-12" />
                <h3 className="font-bold text-white text-xl mt-6 mb-2">{step.title}</h3>
                <p className="text-mute text-sm leading-snug">{step.description}</p>
              </div>
              <div className="mt-8 text-5xl font-bold text-white/[0.06]">{step.number}</div>
            </Reveal>
          ))}
        </div>

        {/* Warehouse */}
        <Reveal className="mb-16">
          <h2 className="eyebrow !tracking-widest mb-6 flex items-center gap-3"><span className="w-1.5 h-1.5 bg-ember-500 rounded-full" /> Your shipping hub</h2>
          <AddressCard user={user} />
        </Reveal>

        {/* Retailers */}
        <Reveal className="mb-16">
          <div className="card p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white">UK catalog</h2>
              <p className="text-mute mt-1">Shop any UK store. We handle the rest.</p>
            </div>
            <RetailerCarousel />
          </div>
        </Reveal>

        {/* CTA */}
        <Reveal>
          <div className="relative overflow-hidden rounded-5xl border border-line bg-surface p-10 md:p-16 text-center">
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[36rem] h-[36rem] bg-ember-radial blur-2xl pointer-events-none" />
            <div className="relative space-y-6">
              <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">Ready to ship?</h2>
              <p className="text-mute text-lg max-w-md mx-auto">Join thousands of Kenyans shopping globally with zero stress.</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link to="/orders/new" className="btn-primary glass-sheen btn-lg">
                  <Package size={20} /> Create new order <ArrowRight size={18} />
                </Link>
                <a href="https://wa.me/447424531483?text=Hi%2C%20I%27d%20like%20to%20get%20started%20with%20Thapsus%20Cargo."
                  target="_blank" rel="noopener noreferrer" className="btn bg-[#25D366] hover:bg-[#1ebe5b] text-white btn-lg">
                  <svg viewBox="0 0 32 32" width="20" height="20" fill="currentColor"><path d="M16 0C7.163 0 0 7.163 0 16c0 2.824.737 5.479 2.027 7.793L0 32l8.455-2.005A15.931 15.931 0 0016 32c8.837 0 16-7.163 16-16S24.837 0 16 0zm0 29.333a13.29 13.29 0 01-6.781-1.853l-.487-.29-5.013 1.189 1.213-4.877-.317-.5A13.267 13.267 0 012.667 16C2.667 8.636 8.636 2.667 16 2.667S29.333 8.636 29.333 16 23.364 29.333 16 29.333z"/></svg>
                  Chat on WhatsApp
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
