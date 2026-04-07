import React, { useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ShoppingBag, MapPin, Phone, Mail, Package, ChevronLeft,
  ChevronRight, Globe, Zap, Box, Store, Copy, CheckCircle2,
  MessageCircle, ArrowRight, Truck, Star
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

/* ─── Retailer Data ─────────────────────────────────────────────────────── */
const RETAILERS = [
  { name: 'Amazon',       url: 'https://www.amazon.co.uk',          icon: <Box         size={28} className="text-orange-500" />, flag: '🇬🇧', color: 'from-orange-50 to-amber-50',   border: 'border-orange-200/60' },
  { name: 'ASOS',         url: 'https://www.asos.com',              icon: <ShoppingBag size={28} className="text-slate-900"  />, flag: '🇬🇧', color: 'from-slate-50 to-gray-50',    border: 'border-slate-200/60'  },
  { name: 'Next',         url: 'https://www.next.co.uk',            icon: <ShoppingBag size={28} className="text-slate-800"  />, flag: '🇬🇧', color: 'from-slate-50 to-zinc-50',    border: 'border-slate-200/60'  },
  { name: 'ZARA',         url: 'https://www.zara.com',              icon: <ShoppingBag size={28} className="text-slate-900"  />, flag: '🇬🇧', color: 'from-zinc-50 to-stone-50',    border: 'border-zinc-200/60'   },
  { name: 'Marks & Spencer', url: 'https://www.marksandspencer.com', icon: <Store      size={28} className="text-green-700"  />, flag: '🇬🇧', color: 'from-green-50 to-emerald-50', border: 'border-green-200/60'  },
  { name: 'eBay',         url: 'https://www.ebay.co.uk',            icon: <Package     size={28} className="text-blue-600"   />, flag: '🇬🇧', color: 'from-blue-50 to-sky-50',      border: 'border-blue-200/60'   },
  { name: 'Shein',        url: 'https://www.shein.com',             icon: <ShoppingBag size={28} className="text-pink-500"   />, flag: '🌐', color: 'from-pink-50 to-rose-50',     border: 'border-pink-200/60'   },
  { name: 'AliExpress',   url: 'https://www.aliexpress.com',        icon: <Zap         size={28} className="text-red-500"    />, flag: '🇨🇳', color: 'from-red-50 to-orange-50',    border: 'border-red-200/60'    },
  { name: 'Alibaba',      url: 'https://www.alibaba.com',           icon: <Globe       size={28} className="text-orange-600" />, flag: '🇨🇳', color: 'from-orange-50 to-yellow-50', border: 'border-orange-200/60' },
  { name: 'Temu',         url: 'https://www.temu.com',              icon: <Zap         size={28} className="text-orange-400" />, flag: '🇨🇳', color: 'from-amber-50 to-orange-50',  border: 'border-amber-200/60'  },
]

/* ─── Warehouse Address ─────────────────────────────────────────────────── */
const UK_WAREHOUSE = {
  line1: '123 Commerce Street',
  line2: 'London',
  postcode: 'E1 6RF',
  country: 'United Kingdom',
}

/* ─── Helper: copy text ─────────────────────────────────────────────────── */
function copyToClipboard(text, label) {
  navigator.clipboard.writeText(text).then(() => {
    toast.success(`${label} copied!`, { duration: 2000, icon: '📋' })
  }).catch(() => {
    toast.error('Copy failed — please copy manually')
  })
}

/* ─── Retailer Carousel ─────────────────────────────────────────────────── */
const RetailerCarousel = () => {
  const scrollRef = useRef(null)

  const scroll = (dir) => {
    if (!scrollRef.current) return
    const amount = 280
    scrollRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-white/80 to-transparent z-10 pointer-events-none rounded-l-2xl" />
      <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-white/80 to-transparent z-10 pointer-events-none rounded-r-2xl" />

      {/* Scroll buttons */}
      <button
        onClick={() => scroll('left')}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-20 w-9 h-9 bg-white/80 backdrop-blur-md border border-white/60 shadow-md rounded-full flex items-center justify-center text-slate-600 hover:bg-white hover:text-orange-500 transition-all active:scale-95"
        aria-label="Scroll left"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        onClick={() => scroll('right')}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-20 w-9 h-9 bg-white/80 backdrop-blur-md border border-white/60 shadow-md rounded-full flex items-center justify-center text-slate-600 hover:bg-white hover:text-orange-500 transition-all active:scale-95"
        aria-label="Scroll right"
      >
        <ChevronRight size={18} />
      </button>

      {/* Cards */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory px-2 py-2 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {RETAILERS.map((r) => (
          <a
            key={r.name}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex-none snap-start w-[220px] bg-gradient-to-br ${r.color} border ${r.border} backdrop-blur-md rounded-2xl p-5 flex flex-col items-center gap-3 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200 group`}
          >
            <div className="w-14 h-14 bg-white/70 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
              {r.icon}
            </div>
            <div className="text-center">
              <p className="font-black text-slate-800 tracking-tight text-sm leading-tight">{r.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{r.flag}</p>
            </div>
            <span className="text-[10px] font-bold text-orange-500 bg-orange-50 border border-orange-200/50 px-2 py-0.5 rounded-full flex items-center gap-1">
              Shop now <ArrowRight size={9} />
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

/* ─── Address Card ──────────────────────────────────────────────────────── */
const AddressCard = ({ user }) => {
  const userName    = user?.name || 'Your Name'
  const warehouseId = user?.warehouse_id || 'TC-XXXX'

  const fullAddress = [
    `${userName} — ${warehouseId}`,
    UK_WAREHOUSE.line1,
    UK_WAREHOUSE.line2,
    UK_WAREHOUSE.postcode,
    UK_WAREHOUSE.country,
  ].join('\n')

  return (
    <div className="bg-white/50 backdrop-blur-xl border border-white/60 rounded-2xl p-6 shadow-[0_4px_20px_rgb(0,0,0,0.04)] relative overflow-hidden">
      {/* Accent blob */}
      <div className="absolute -top-8 -right-8 w-32 h-32 bg-orange-300/20 rounded-full blur-[40px] pointer-events-none" />

      <div className="flex items-start justify-between gap-4 relative z-10">
        <div className="space-y-1.5">
          {/* Name + ID */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-[#1e3a5f] text-lg tracking-tight leading-tight">{userName}</span>
            <span className="bg-orange-100 text-orange-600 border border-orange-200/60 font-black text-xs px-2 py-0.5 rounded-full tracking-wide">
              {warehouseId}
            </span>
          </div>
          {/* Street */}
          <p className="text-slate-700 font-semibold text-sm">{UK_WAREHOUSE.line1}</p>
          <p className="text-slate-700 font-semibold text-sm">{UK_WAREHOUSE.line2}</p>
          <p className="text-slate-700 font-semibold text-sm">{UK_WAREHOUSE.postcode}</p>
          <p className="text-slate-600 font-medium text-sm">{UK_WAREHOUSE.country}</p>
        </div>

        {/* Copy button */}
        <button
          onClick={() => copyToClipboard(fullAddress, 'Address')}
          className="flex-none flex items-center gap-1.5 text-xs font-black text-slate-600 bg-white/70 hover:bg-orange-50 hover:text-orange-500 border border-white/60 hover:border-orange-200/60 px-3 py-2 rounded-xl transition-all active:scale-95 shadow-sm"
        >
          <Copy size={13} />
          Copy
        </button>
      </div>

      {/* Important note */}
      <div className="mt-4 bg-orange-50/80 border border-orange-200/50 rounded-xl p-3 flex gap-2.5 items-start relative z-10">
        <Star size={14} className="text-orange-500 mt-0.5 flex-none" />
        <p className="text-xs font-semibold text-orange-700 leading-relaxed">
          Always include your full name and warehouse code <strong>{warehouseId}</strong> exactly as shown — this is how we match your parcel to your account.
        </p>
      </div>
    </div>
  )
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */
export const ShipInstructions = () => {
  const { user } = useAuth()

  const steps = [
    {
      number: '01',
      title: 'Choose your retailer',
      description: 'Browse and shop from any of our supported UK or China retailers. Add items to your cart as normal.',
      icon: <ShoppingBag size={22} className="text-orange-500" />,
      color: 'from-orange-50 to-amber-50',
      accent: 'border-orange-200/60',
    },
    {
      number: '02',
      title: 'Ship to your warehouse address',
      description: 'At checkout, enter the UK warehouse address below as the delivery address. Make sure your name and warehouse code are included exactly as shown.',
      icon: <MapPin size={22} className="text-blue-500" />,
      color: 'from-blue-50 to-sky-50',
      accent: 'border-blue-200/60',
    },
    {
      number: '03',
      title: 'Tell us about your order',
      description: 'Once you have placed your order, contact us via WhatsApp or create a new order in your dashboard so we can prepare for your parcel\'s arrival.',
      icon: <MessageCircle size={22} className="text-green-500" />,
      color: 'from-green-50 to-emerald-50',
      accent: 'border-green-200/60',
    },
    {
      number: '04',
      title: 'We handle the rest',
      description: 'We receive, consolidate, and ship your parcels to Kenya. You\'ll get real-time tracking updates at every step of the journey.',
      icon: <Truck size={22} className="text-purple-500" />,
      color: 'from-purple-50 to-violet-50',
      accent: 'border-purple-200/60',
    },
  ]

  return (
    <div className="min-h-screen relative bg-slate-50 overflow-x-hidden py-8 px-4 font-sans">
      {/* Liquid blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] max-w-[500px] max-h-[500px] bg-blue-300/25 rounded-full blur-[100px] animate-morph mix-blend-multiply pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] max-w-[500px] max-h-[500px] bg-orange-300/20 rounded-full blur-[100px] animate-morph mix-blend-multiply pointer-events-none" />
      <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[40vw] h-[40vw] max-w-[350px] max-h-[350px] bg-indigo-200/15 rounded-full blur-[120px] animate-morph mix-blend-multiply pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10">

        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-orange-500 transition-colors mb-8"
        >
          <ChevronLeft size={16} />
          Back to Home
        </Link>

        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 bg-orange-100/80 text-orange-600 border border-orange-200/60 px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase mb-4">
            <Package size={12} />
            How to ship
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-[#1e3a5f] leading-none tracking-tighter mb-3">
            Start Shipping
          </h1>
          <p className="text-slate-600 font-medium text-lg max-w-xl">
            Four simple steps to get your international parcels delivered to Kenya.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {steps.map((step, i) => (
            <div
              key={i}
              className={`bg-gradient-to-br ${step.color} border ${step.accent} backdrop-blur-md rounded-2xl p-6 relative overflow-hidden shadow-sm hover:shadow-md transition-shadow`}
            >
              <div className="absolute top-4 right-4 text-5xl font-black text-black/5 leading-none select-none">
                {step.number}
              </div>
              <div className="w-10 h-10 bg-white/70 rounded-xl flex items-center justify-center shadow-sm mb-4">
                {step.icon}
              </div>
              <h3 className="font-black text-[#1e3a5f] tracking-tight text-base mb-1.5">
                {step.title}
              </h3>
              <p className="text-slate-600 font-medium text-sm leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        {/* Warehouse Address */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={18} className="text-[#1e3a5f]" />
            <h2 className="text-xl font-black text-[#1e3a5f] tracking-tighter">
              Your Warehouse Address
            </h2>
          </div>
          <AddressCard user={user} />
        </div>

        {/* Contact Us */}
        <div className="bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-6 mb-10 relative overflow-hidden glass-sheen">
          <div className="absolute top-0 right-0 w-48 h-48 bg-blue-400/10 rounded-full blur-[60px] pointer-events-none" />
          <div className="relative z-10">
            <h2 className="text-xl font-black text-[#1e3a5f] tracking-tighter mb-1">Contact Us</h2>
            <p className="text-slate-600 font-medium text-sm mb-5">
              Once you have placed your order, let us know via WhatsApp or email so we can log it.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              {/* WhatsApp */}
              <a
                href="https://wa.me/447424531483"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-green-50 hover:bg-green-100/70 border border-green-200/60 text-green-700 px-5 py-3.5 rounded-2xl font-black transition-all hover:-translate-y-0.5 shadow-sm hover:shadow-md active:scale-95 flex-1"
              >
                <div className="w-9 h-9 bg-green-500 rounded-xl flex items-center justify-center shadow-sm">
                  <MessageCircle size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-bold text-green-600 tracking-wide uppercase leading-none mb-0.5">WhatsApp</p>
                  <p className="font-black tracking-tight">+44 7424 531483</p>
                </div>
              </a>

              {/* Email */}
              <a
                href="mailto:support@thapsus.uk"
                className="flex items-center gap-3 bg-blue-50 hover:bg-blue-100/70 border border-blue-200/60 text-blue-700 px-5 py-3.5 rounded-2xl font-black transition-all hover:-translate-y-0.5 shadow-sm hover:shadow-md active:scale-95 flex-1"
              >
                <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center shadow-sm">
                  <Mail size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-bold text-blue-600 tracking-wide uppercase leading-none mb-0.5">Email</p>
                  <p className="font-black tracking-tight">support@thapsus.uk</p>
                </div>
              </a>
            </div>
          </div>
        </div>

        {/* Retailer Carousel */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingBag size={18} className="text-[#1e3a5f]" />
            <h2 className="text-xl font-black text-[#1e3a5f] tracking-tighter">
              Trusted Retailers
            </h2>
          </div>
          <p className="text-slate-600 font-medium text-sm mb-5">
            We support shipping from all major UK and China retailers. Tap a retailer to start shopping.
          </p>
          <div className="bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-6 relative overflow-hidden">
            <RetailerCarousel />
          </div>
        </div>

        {/* CTA — create order */}
        <div className="rounded-2xl p-[1px] bg-gradient-to-br from-blue-300/60 via-white/20 to-orange-300/60 shadow-lg">
          <div className="bg-white/60 backdrop-blur-3xl rounded-[15px] p-8 text-center relative overflow-hidden glass-sheen">
            <div className="absolute top-0 right-0 w-48 h-48 bg-orange-400/10 rounded-full blur-[50px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-400/10 rounded-full blur-[50px] pointer-events-none" />
            <div className="relative z-10">
              <div className="w-14 h-14 bg-white/60 backdrop-blur-xl border border-white/60 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <CheckCircle2 size={28} className="text-orange-500" />
              </div>
              <h3 className="text-2xl font-black text-[#1e3a5f] tracking-tighter mb-2">Ready to go?</h3>
              <p className="text-slate-600 font-medium mb-6 max-w-sm mx-auto text-sm">
                Create an order in your dashboard to let us know what's on its way.
              </p>
              <Link
                to="/orders/new"
                className="group relative overflow-hidden inline-flex items-center gap-2 bg-[#1e3a5f] text-white px-8 py-4 rounded-2xl font-black tracking-tight transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1"
              >
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                <Package size={18} className="drop-shadow-sm" />
                <span className="relative z-10">Create New Order</span>
                <ArrowRight size={16} className="relative z-10" />
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
