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
  { name: 'Amazon',       url: 'https://www.amazon.co.uk',          icon: <Box         size={28} className="text-orange-700" />, flag: '🇬🇧', color: 'from-orange-50 to-amber-50',   border: 'border-orange-200/60' },
  { name: 'ASOS',         url: 'https://www.asos.com',              icon: <ShoppingBag size={28} className="text-slate-900"  />, flag: '🇬🇧', color: 'from-slate-50 to-gray-50',    border: 'border-slate-200/60'  },
  { name: 'Next',         url: 'https://www.next.co.uk',            icon: <ShoppingBag size={28} className="text-slate-800"  />, flag: '🇬🇧', color: 'from-slate-50 to-zinc-50',    border: 'border-slate-200/60'  },
  { name: 'ZARA',         url: 'https://www.zara.com',              icon: <ShoppingBag size={28} className="text-slate-900"  />, flag: '🇬🇧', color: 'from-zinc-50 to-stone-50',    border: 'border-zinc-200/60'   },
  { name: 'Marks & Spencer', url: 'https://www.marksandspencer.com', icon: <Store      size={28} className="text-green-700"  />, flag: '🇬🇧', color: 'from-green-50 to-emerald-50', border: 'border-green-200/60'  },
  { name: 'eBay',         url: 'https://www.ebay.co.uk',            icon: <Package     size={28} className="text-blue-600"   />, flag: '🇬🇧', color: 'from-blue-50 to-sky-50',      border: 'border-blue-200/60'   },
  { name: 'Shein',        url: 'https://www.shein.com',             icon: <ShoppingBag size={28} className="text-pink-500"   />, flag: '🌐', color: 'from-pink-50 to-rose-50',     border: 'border-pink-200/60'   },
  { name: 'Temu',         url: 'https://www.temu.com',              icon: <Zap         size={28} className="text-orange-400" />, flag: '🌐', color: 'from-amber-50 to-orange-50',  border: 'border-amber-200/60'  },
]

/* ─── Warehouse Address ─────────────────────────────────────────────────── */
const UK_WAREHOUSE = {
  line1: '31 Collingwood Close',
  line2: 'Hazel Grove, Stockport',
  postcode: 'SK7 4LB',
  country: 'United Kingdom',
}

function copyToClipboard(text, label) {
  navigator.clipboard.writeText(text).then(() => {
    toast.success(`${label} copied!`, { duration: 2000, icon: '📋' })
  }).catch(() => {
    toast.error('Copy failed — please copy manually')
  })
}

const RetailerCarousel = () => {
  const scrollRef = useRef(null)
  const scroll = (dir) => {
    if (!scrollRef.current) return
    const amount = 280
    scrollRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-white/40 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white/40 to-transparent z-10 pointer-events-none" />
      
      <button onClick={() => scroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-20 w-10 h-10 bg-white/60 backdrop-blur-xl border border-white/40 shadow-xl rounded-full flex items-center justify-center text-slate-800 hover:scale-110 transition-all"><ChevronLeft size={20}/></button>
      <button onClick={() => scroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-20 w-10 h-10 bg-white/60 backdrop-blur-xl border border-white/40 shadow-xl rounded-full flex items-center justify-center text-slate-800 hover:scale-110 transition-all"><ChevronRight size={20}/></button>

      <div ref={scrollRef} className="flex gap-4 overflow-x-auto scroll-smooth px-2 py-4 scrollbar-hide">
        {RETAILERS.map((r) => (
          <a key={r.name} href={r.url} target="_blank" rel="noopener noreferrer" className={`flex-none w-[200px] bg-white/40 backdrop-blur-2xl border border-white/40 rounded-3xl p-6 flex flex-col items-center gap-4 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 glass-sheen`}>
            <div className="w-16 h-16 bg-white/80 rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">{r.icon}</div>
            <div className="text-center"><p className="font-black text-slate-900 tracking-tighter text-sm uppercase">{r.name}</p></div>
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
    <div className="group relative perspective-1000">
      <div className="bg-white/40 backdrop-blur-3xl border border-white/40 rounded-[2rem] p-8 shadow-2xl transition-all duration-500 hover:rotate-x-2 hover:rotate-y-2 glass-sheen relative overflow-hidden">
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-orange-400/10 rounded-full blur-[80px] pointer-events-none animate-morph" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="font-black text-4xl text-[#1e3a5f] tracking-tighter leading-none">{userName}</span>
              <span className="bg-[#1e3a5f] text-white font-black text-xs px-3 py-1 rounded-full tracking-widest">{warehouseId}</span>
            </div>
            <div className="text-slate-700 font-bold text-lg tracking-tight">
              <p>{UK_WAREHOUSE.line1}</p>
              <p>{UK_WAREHOUSE.line2}</p>
              <p>{UK_WAREHOUSE.postcode}</p>
              <p className="text-orange-600 uppercase text-sm mt-1 tracking-widest">{UK_WAREHOUSE.country}</p>
            </div>
          </div>
          <button onClick={() => copyToClipboard(fullAddress, 'Address')} className="bg-[#1e3a5f] text-white px-8 py-4 rounded-2xl font-black text-sm flex items-center gap-2 hover:scale-105 transition-all shadow-xl active:scale-95">
            <Copy size={16} /> COPY ADDRESS
          </button>
        </div>
      </div>
    </div>
  )
}

export const ShipInstructions = () => {
  const { user } = useAuth()
  const steps = [
    { number: '01', title: 'Choose your retailer', description: 'Browse and shop from any of our supported UK retailers.', icon: <ShoppingBag size={24} className="text-orange-700" /> },
    { number: '02', title: 'Ship to warehouse', description: 'At checkout, use our Stockport warehouse address with your unique ID.', icon: <MapPin size={24} className="text-blue-400" /> },
    { number: '03', title: 'Tell us about it', description: 'Log your order in the dashboard or via WhatsApp.', icon: <MessageCircle size={24} className="text-emerald-400" /> },
    { number: '04', title: 'We handle the rest', description: 'We consolidate and ship your parcels directly to Kenya.', icon: <Truck size={24} className="text-purple-400" /> },
  ]

  return (
    <div className="min-h-screen bg-[#f8fafc] py-12 px-6 font-sans overflow-x-hidden">
      <style>{`
        @keyframes morph {
          0%, 100% { border-radius: 40% 60% 70% 30% / 40% 40% 60% 50%; transform: translate(0,0) rotate(0deg); }
          33% { border-radius: 70% 30% 50% 50% / 30% 30% 70% 70%; transform: translate(20px, -30px) rotate(5deg); }
          66% { border-radius: 100% 60% 60% 100% / 100% 100% 60% 60%; transform: translate(-20px, 20px) rotate(-5deg); }
        }
        @keyframes sheen {
          0% { transform: translateX(-200%) skewX(-15deg); }
          100% { transform: translateX(300%) skewX(-15deg); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-morph { animation: morph 15s ease-in-out infinite; }
        .glass-sheen { position: relative; overflow: hidden; }
        .glass-sheen::after {
          content: ''; position: absolute; top: 0; left: 0; width: 40%; height: 100%;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.4), transparent);
          animation: sheen 6s infinite;
        }
        .perspective-1000 { perspective: 1000px; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Liquid Backgrounds */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[700px] h-[700px] bg-blue-400/10 rounded-full blur-[120px] animate-morph" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] bg-orange-400/10 rounded-full blur-[120px] animate-morph" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        <Link to="/" className="inline-flex items-center gap-2 text-xs font-black text-slate-400 hover:text-[#1e3a5f] transition-all mb-12 uppercase tracking-widest">
          <ChevronLeft size={14} /> Back to Dashboard
        </Link>

        {/* Hero Section */}
        <header className="mb-20">
          <div className="inline-block bg-orange-500 text-white text-[10px] font-black px-3 py-1 rounded-full tracking-[0.2em] uppercase mb-6 shadow-lg shadow-orange-500/20">
            Global Shipping
          </div>
          <h1 className="text-6xl md:text-8xl font-black text-[#1e3a5f] leading-[0.85] tracking-tighter mb-6">
            Faster.<br/>Simpler.<br/><span className="text-slate-400">Reliable.</span>
          </h1>
          <p className="text-slate-500 font-bold text-xl max-w-lg leading-tight tracking-tight">
            The next evolution of package forwarding from the UK to Kenya.
          </p>
        </header>

        {/* Bento Steps */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-20">
          {steps.map((step, i) => {
            if (i === 1) { // Step 2: Dark Glass
              return (
                <div key={i} className="md:col-span-1 relative group bg-slate-900/90 backdrop-blur-3xl border border-white/10 rounded-[2rem] p-8 overflow-hidden shadow-2xl transition-all duration-500 hover:-translate-y-2">
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-orange-500/30 rounded-full blur-[40px] animate-pulse" />
                  <div className="relative z-10 flex flex-col h-full justify-between">
                    <div>
                      <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-6">{step.icon}</div>
                      <h3 className="font-black text-white tracking-tighter text-2xl mb-2 leading-none">{step.title}</h3>
                      <p className="text-slate-400 font-medium text-sm leading-snug">{step.description}</p>
                    </div>
                    <div className="mt-8 text-5xl font-black text-white/5">{step.number}</div>
                  </div>
                </div>
              )
            }
            if (i === 3) { // Step 4: Border Gradient
              return (
                <div key={i} className="md:col-span-1 p-[1.5px] rounded-[2rem] bg-gradient-to-tr from-purple-500 via-blue-400 to-emerald-400 shadow-xl transition-all duration-500 hover:-translate-y-2">
                  <div className="h-full bg-white/60 backdrop-blur-2xl rounded-[1.9rem] p-8 flex flex-col justify-between">
                    <div>
                      <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center mb-6">{step.icon}</div>
                      <h3 className="font-black text-[#1e3a5f] tracking-tighter text-2xl mb-2 leading-none">{step.title}</h3>
                      <p className="text-slate-600 font-medium text-sm leading-snug">{step.description}</p>
                    </div>
                    <div className="mt-8 text-5xl font-black text-black/5">{step.number}</div>
                  </div>
                </div>
              )
            }
            return (
              <div key={i} className="bg-white/40 backdrop-blur-2xl border border-white/40 rounded-[2rem] p-8 shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-2 flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 bg-white/80 rounded-2xl flex items-center justify-center shadow-sm mb-6">{step.icon}</div>
                  <h3 className="font-black text-[#1e3a5f] tracking-tighter text-2xl mb-2 leading-none">{step.title}</h3>
                  <p className="text-slate-500 font-medium text-sm leading-snug">{step.description}</p>
                </div>
                <div className="mt-8 text-5xl font-black text-black/5">{step.number}</div>
              </div>
            )
          })}
        </div>

        {/* Warehouse Card */}
        <div className="mb-20">
          <h2 className="text-2xl font-black text-[#1e3a5f] tracking-tighter mb-8 flex items-center gap-3">
            <div className="w-2 h-2 bg-orange-500 rounded-full" /> YOUR SHIPPING HUB
          </h2>
          <AddressCard user={user} />
        </div>

        {/* Retailer Section */}
        <div className="mb-20">
          <div className="bg-white/40 backdrop-blur-3xl border border-white/40 rounded-[2.5rem] p-10 relative overflow-hidden">
             <div className="mb-8">
                <h2 className="text-3xl font-black text-[#1e3a5f] tracking-tighter leading-none">UK Catalog</h2>
                <p className="text-slate-500 font-bold mt-2">Shop any UK store. We handle the rest.</p>
             </div>
             <RetailerCarousel />
          </div>
        </div>

        {/* Footer CTA */}
        <footer className="relative group">
          <div className="p-[1.5px] rounded-[3rem] bg-gradient-to-r from-orange-400 via-[#1e3a5f] to-blue-500 shadow-2xl">
            <div className="bg-white/80 backdrop-blur-3xl rounded-[2.9rem] p-12 text-center relative overflow-hidden">
               <div className="absolute top-0 right-0 w-64 h-64 bg-blue-400/10 rounded-full blur-[80px] pointer-events-none animate-morph" />
               <h2 className="text-5xl md:text-6xl font-black text-[#1e3a5f] tracking-tighter mb-4 leading-none">Ready to Ship?</h2>
               <p className="text-slate-500 font-bold text-lg mb-10 max-w-md mx-auto leading-tight">Join thousands of Kenyans shopping globally with zero stress.</p>
               
               <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                 <Link to="/orders/new" className="group relative overflow-hidden inline-flex items-center gap-4 bg-[#1e3a5f] text-white px-12 py-6 rounded-3xl font-black tracking-widest text-sm transition-all hover:scale-105 active:scale-95 shadow-2xl">
                   <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                   <Package size={20} /> CREATE NEW ORDER <ArrowRight size={20} />
                 </Link>
                 <a
                   href="https://wa.me/447424531483?text=Hi%2C%20I%27d%20like%20to%20get%20started%20with%20Thapsus%20Cargo."
                   target="_blank"
                   rel="noopener noreferrer"
                   className="inline-flex items-center gap-3 bg-[#25D366] hover:bg-[#1ebe5b] text-white px-10 py-6 rounded-3xl font-black tracking-widest text-sm transition-all hover:scale-105 active:scale-95 shadow-2xl"
                 >
                   <svg viewBox="0 0 32 32" width="20" height="20" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M16 0C7.163 0 0 7.163 0 16c0 2.824.737 5.479 2.027 7.793L0 32l8.455-2.005A15.931 15.931 0 0016 32c8.837 0 16-7.163 16-16S24.837 0 16 0zm0 29.333a13.29 13.29 0 01-6.781-1.853l-.487-.29-5.013 1.189 1.213-4.877-.317-.5A13.267 13.267 0 012.667 16C2.667 8.636 8.636 2.667 16 2.667S29.333 8.636 29.333 16 23.364 29.333 16 29.333zm7.28-9.947c-.397-.199-2.35-1.158-2.714-1.29-.365-.132-.63-.199-.896.199-.265.397-1.03 1.29-1.261 1.556-.232.265-.464.298-.861.1-.397-.2-1.675-.617-3.19-1.967-1.179-1.05-1.976-2.346-2.207-2.744-.232-.397-.025-.612.174-.81.178-.178.397-.464.596-.696.199-.232.265-.397.397-.662.132-.265.066-.497-.033-.696-.1-.199-.896-2.162-1.228-2.959-.323-.777-.65-.672-.896-.684l-.762-.013c-.265 0-.696.1-1.06.497-.365.397-1.394 1.362-1.394 3.324s1.427 3.855 1.626 4.12c.199.265 2.808 4.288 6.804 6.012.951.41 1.694.655 2.273.839.955.304 1.825.261 2.512.158.766-.114 2.35-.96 2.681-1.888.332-.928.332-1.723.232-1.888-.1-.166-.365-.265-.762-.464z"/></svg>
                   CHAT ON WHATSAPP
                 </a>
               </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
