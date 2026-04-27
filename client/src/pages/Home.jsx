import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight, Package, Truck, MapPin, Star, ChevronRight,
  Globe, ShieldCheck, Zap, ShoppingBag, Headphones, Sparkles,
  Bell, Store, CreditCard, Search, Box, Plane, CheckCircle2
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { SEO } from '../components/SEO'
import { CutoffBanner } from '../components/CutoffBanner'

/**
 * LIQUID GLASS UI COMPONENTS
 */
const LiquidBlob = ({ className, color }) => (
  <div className={`absolute blur-[120px] rounded-full mix-blend-multiply opacity-60 animate-morph ${className} ${color}`} />
)

const GlassCard = ({ children, className = "" }) => (
  <div className={`relative overflow-hidden rounded-[2.5rem] bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
    {children}
  </div>
)

const MarqueeRetailers = ({ retailers }) => {
  const tripleRetailers = [...retailers, ...retailers, ...retailers];
  
  return (
    <div className="py-8 md:py-10 bg-white/30 backdrop-blur-md border-y border-white/50 overflow-hidden select-none">
      <div className="flex whitespace-nowrap animate-scroll">
        {tripleRetailers.map((r, i) => (
          <a 
            key={i} 
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-3 md:space-x-4 mx-8 md:mx-12 text-slate-600 font-bold hover:text-orange-700 transition-all group"
          >
            <div className="p-2 md:p-3 bg-white rounded-2xl shadow-sm group-hover:scale-110 group-hover:shadow-orange-100 transition-transform">
              {r.icon}
            </div>
            <span className="text-xl md:text-2xl tracking-tighter uppercase font-black">{r.name}</span>
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
    if (q) navigate(`/track?q=${encodeURIComponent(q)}`)
    else navigate('/track')
  }

  const retailers = [
    { name: 'Shein',      url: 'https://www.shein.com',      icon: <ShoppingBag size={24} className="text-pink-500"   /> },
    { name: 'Amazon',     url: 'https://www.amazon.co.uk',   icon: <Box          size={24} className="text-orange-700" /> },
    { name: 'AliExpress', url: 'https://www.aliexpress.com', icon: <Zap          size={24} className="text-red-500"    /> },
    { name: 'Next',       url: 'https://www.next.co.uk',     icon: <ShoppingBag  size={24} className="text-slate-800"  /> },
    { name: 'eBay',       url: 'https://www.ebay.co.uk',     icon: <Package      size={24} className="text-blue-600"   /> },
    { name: 'ZARA',       url: 'https://www.zara.com',       icon: <ShoppingBag  size={24} className="text-slate-900"  /> },
    { name: 'Alibaba',    url: 'https://www.alibaba.com',    icon: <Globe        size={24} className="text-orange-600" /> },
    { name: 'Temu',       url: 'https://www.temu.com',       icon: <Zap          size={24} className="text-orange-400" /> },
    { name: 'ASOS',       url: 'https://www.asos.com',       icon: <ShoppingBag  size={24} className="text-black"      /> },
    { name: 'Marks & Spencer', url: 'https://www.marksandspencer.com', icon: <Store size={24} className="text-green-700" /> },
  ]

  const markets = [
    {
        name: 'United Kingdom',
        flag: '🇬🇧',
        icon: <div className="w-10 h-7 md:w-12 md:h-8 bg-blue-900 rounded-sm relative overflow-hidden flex items-center justify-center text-white text-[9px] md:text-[10px] font-bold">UK</div>,
        address: '31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB',
        desc: 'Air: 7–14 days · From £9/kg',
        processing: 'Weekly consolidation',
    },
    {
        name: 'China',
        flag: '🇨🇳',
        icon: <div className="w-10 h-7 md:w-12 md:h-8 bg-red-600 rounded-sm relative overflow-hidden flex items-center justify-center text-white text-[9px] md:text-[10px] font-bold">CHN</div>,
        address: 'Thapsus Cargo Warehouse, Shanghai, China',
        desc: 'Air & Sea available',
        processing: 'Bi-weekly consolidation',
    },
  ]

  const testimonials = [
    {
      name: 'John Kimani',
      location: 'Nairobi CBD',
      text: 'Thapsus Cargo made shopping from Amazon UK so easy. My packages arrived in perfect condition within 10 days — way faster than I expected!',
      avatar: <div className="w-full h-full bg-orange-100 flex items-center justify-center text-orange-600"><MapPin size={24}/></div>,
      color: 'bg-orange-50',
    },
    {
      name: 'Sarah Omondi',
      location: 'Mombasa',
      text: 'I ordered electronics from the UK and the team handled everything including customs. Transparent pricing — no hidden surprises at all.',
      avatar: <div className="w-full h-full bg-blue-100 flex items-center justify-center text-blue-600"><CheckCircle2 size={24}/></div>,
      color: 'bg-blue-50',
    },
    {
      name: 'Michael Kipchoge',
      location: 'Eldoret',
      text: 'Reliable and affordable. I consolidate my Shein and AliExpress orders every month and always get a good rate. Highly recommend!',
      avatar: <div className="w-full h-full bg-purple-100 flex items-center justify-center text-purple-600"><ShieldCheck size={24}/></div>,
      color: 'bg-purple-50',
    },
    {
      name: 'Grace Wanjiru',
      location: 'Thika',
      text: 'The TC code system is brilliant. I ship from multiple UK stores and everything gets consolidated into one affordable shipment to Kenya.',
      avatar: <div className="w-full h-full bg-green-100 flex items-center justify-center text-green-600"><Star size={24} fill="currentColor"/></div>,
      color: 'bg-green-50',
    },
    {
      name: 'David Otieno',
      location: 'Kisumu',
      text: 'I was nervous about shipping from China but the team walked me through everything. My order arrived safely and the tracking updates were great.',
      avatar: <div className="w-full h-full bg-amber-100 flex items-center justify-center text-amber-600"><Package size={24}/></div>,
      color: 'bg-amber-50',
    },
    {
      name: 'Fatuma Hassan',
      location: 'Nakuru',
      text: 'Best forwarding service in Kenya. The CBD collection point is super convenient and the staff are always helpful. Will keep using Thapsus!',
      avatar: <div className="w-full h-full bg-pink-100 flex items-center justify-center text-pink-600"><Sparkles size={24}/></div>,
      color: 'bg-pink-50',
    },
  ]

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-x-hidden">
      <SEO
        title="Ship from UK & China to Kenya"
        description="Thapsus Cargo offers affordable, reliable shipping and forwarding from the UK and China to Kenya. Track packages, calculate instant quotes, and enjoy door-to-door delivery."
      />
      <style>{`
        @keyframes morph {
          0% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.33%); }
        }
        @keyframes sheen {
          0% { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(200%) skewX(-15deg); }
        }
        .animate-morph { animation: morph 12s ease-in-out infinite; }
        .animate-scroll { 
            display: flex; 
            width: max-content; 
            animation: scroll 30s linear infinite; 
        }
        .animate-scroll:hover { animation-play-state: paused; }
        .glass-sheen { position: relative; overflow: hidden; }
        .glass-sheen::after {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 50%; height: 100%;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.3), transparent);
          animation: sheen 4s infinite;
        }
      `}</style>

      {/* --- WEEKLY CUT-OFF COUNTDOWN BANNER --- */}
      <div className="container mx-auto px-4 md:px-6 pt-6">
        <CutoffBanner />
      </div>

      {/* --- HERO SECTION --- */}
      <section className="relative pt-10 pb-10 md:pt-16 md:pb-12 lg:pt-24 lg:pb-20 overflow-hidden">
        <LiquidBlob className="top-[-15%] left-[-5%] w-[300px] h-[300px] md:w-[500px] md:h-[500px]" color="bg-orange-200" />
        <LiquidBlob className="bottom-[5%] right-[-5%] w-[350px] h-[350px] md:w-[600px] md:h-[600px]" color="bg-blue-200" />
        <div className="absolute inset-0 bg-white/30 backdrop-blur-[4px]" />

        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-10 md:gap-16">
            <div className="lg:w-1/2 space-y-6 md:space-y-8 text-center lg:text-left">
              <div className="inline-flex items-center space-x-3 px-3 py-1.5 md:px-4 md:py-2 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/50 shadow-sm mx-auto lg:mx-0">
                <div className="p-1 bg-orange-500 rounded-lg text-white">
                    <Sparkles size={12} className="md:w-3.5 md:h-3.5"/>
                </div>
                <span className="text-[10px] md:text-xs font-black text-slate-700 uppercase tracking-widest">Global Logistics Redefined</span>
              </div>
              
              <h1 className="text-4xl md:text-6xl lg:text-8xl font-black tracking-tighter text-[#0f172a] leading-[1.1] lg:leading-[0.9]">
                {t('home.hero.title')}
              </h1>
              
              <p className="text-base md:text-xl text-slate-600 max-w-lg leading-relaxed font-medium mx-auto lg:mx-0">
                {t('home.hero.subtitle')}
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-4">
                <Link
                  to={isAuthenticated ? '/ship-instructions' : '/register'}
                  className="glass-sheen px-8 py-4 md:px-10 md:py-5 bg-[#0f172a] hover:bg-slate-800 text-white rounded-[1.5rem] md:rounded-[2rem] font-black shadow-2xl transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3 group text-base md:text-lg"
                >
                  {t('home.hero.cta')}
                  <ArrowRight size={20} className="md:w-[22px] md:h-[22px] group-hover:translate-x-1 transition-transform" />
                </Link>
                {/* WhatsApp Chat Button */}
                <a
                  href="https://wa.me/447424531483?text=Hi%2C%20I%27d%20like%20to%20enquire%20about%20Thapsus%20Cargo%20shipping%20services."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-sheen px-8 py-4 md:px-10 md:py-5 bg-[#25D366] hover:bg-[#1ebe5b] text-white rounded-[1.5rem] md:rounded-[2rem] font-black shadow-2xl transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3 group text-base md:text-lg"
                >
                  <svg viewBox="0 0 32 32" width="22" height="22" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M16 0C7.163 0 0 7.163 0 16c0 2.824.737 5.479 2.027 7.793L0 32l8.455-2.005A15.931 15.931 0 0016 32c8.837 0 16-7.163 16-16S24.837 0 16 0zm0 29.333a13.29 13.29 0 01-6.781-1.853l-.487-.29-5.013 1.189 1.213-4.877-.317-.5A13.267 13.267 0 012.667 16C2.667 8.636 8.636 2.667 16 2.667S29.333 8.636 29.333 16 23.364 29.333 16 29.333zm7.28-9.947c-.397-.199-2.35-1.158-2.714-1.29-.365-.132-.63-.199-.896.199-.265.397-1.03 1.29-1.261 1.556-.232.265-.464.298-.861.1-.397-.2-1.675-.617-3.19-1.967-1.179-1.05-1.976-2.346-2.207-2.744-.232-.397-.025-.612.174-.81.178-.178.397-.464.596-.696.199-.232.265-.397.397-.662.132-.265.066-.497-.033-.696-.1-.199-.896-2.162-1.228-2.959-.323-.777-.65-.672-.896-.684l-.762-.013c-.265 0-.696.1-1.06.497-.365.397-1.394 1.362-1.394 3.324s1.427 3.855 1.626 4.12c.199.265 2.808 4.288 6.804 6.012.951.41 1.694.655 2.273.839.955.304 1.825.261 2.512.158.766-.114 2.35-.96 2.681-1.888.332-.928.332-1.723.232-1.888-.1-.166-.365-.265-.762-.464z"/></svg>
                  Chat on WhatsApp
                </a>
                <form onSubmit={handleTrack} className="relative group max-w-sm flex-grow">
                   <div className="relative flex items-center bg-white/60 hover:bg-white/90 backdrop-blur-2xl border border-white/40 focus-within:border-orange-400/50 rounded-[1.5rem] md:rounded-[2rem] px-1.5 md:px-2 shadow-2xl transition-all duration-500">
                       <Search size={18} className="ml-3 md:ml-4 text-slate-400" />
                       <input
                        type="text"
                        value={trackingInput}
                        onChange={(e) => setTrackingInput(e.target.value)}
                        placeholder="Tracking ID..."
                        aria-label="Enter your tracking ID"
                        className="w-full px-3 py-4 md:px-4 md:py-5 bg-transparent border-none outline-none focus:ring-0 text-xs md:text-sm font-bold placeholder:text-slate-400"
                       />
                       <button type="submit" className="px-5 py-2.5 md:px-6 md:py-3 bg-orange-700 text-white rounded-full text-[10px] md:text-xs font-black hover:bg-orange-600 transition-all shadow-lg hover:shadow-orange-200 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
                         TRACK
                       </button>
                   </div>
                </form>
              </div>

              <div className="flex items-center justify-center lg:justify-start gap-6 md:gap-8 pt-6 md:pt-8 border-t border-slate-200">
                <div className="text-sm">
                  <div className="flex text-orange-700 mb-1 justify-center lg:justify-start">
                    {[...Array(5)].map((_, i) => <Star key={i} size={14} className="md:w-4 md:h-4" fill="currentColor"/>)}
                  </div>
                  <p className="font-black text-[#0f172a] text-[10px] md:text-xs uppercase tracking-widest">Industry Leader</p>
                </div>
                <div className="h-8 md:h-10 w-[1px] bg-slate-200" />
                <p className="text-[10px] md:text-xs text-slate-500 font-bold max-w-[150px] md:max-w-[200px] leading-relaxed text-left">
                  Over <span className="text-slate-900">12,000+</span> shipments delivered across East Africa.
                </p>
              </div>
            </div>

            <div className="lg:w-1/2 relative w-full px-2 md:px-0">
              <GlassCard className="p-1.5 md:p-2 transform lg:rotate-3 hover:rotate-0 transition-all duration-700 group shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] md:shadow-[0_50px_100px_-20px_rgba(0,0,0,0.15)]">
                <div className="bg-slate-900/5 rounded-[2rem] md:rounded-[2.2rem] p-6 md:p-10">
                  <div className="flex justify-between items-center mb-8 md:mb-12">
                    <div className="p-3 md:p-4 bg-white rounded-2xl shadow-xl text-orange-700 group-hover:scale-110 transition-transform"><Plane size={24} className="md:w-8 md:h-8"/></div>
                    <div className="flex items-center gap-1.5 md:gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-white/80 backdrop-blur-md rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 shadow-sm border border-white/50">
                      <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-green-500 animate-pulse" />
                      Live Monitoring
                    </div>
                  </div>
                  <div className="space-y-6 md:space-y-10">
                    <div className="relative h-3 md:h-4 w-full bg-white/50 rounded-full overflow-hidden p-0.5 md:p-1 shadow-inner">
                       <div className="glass-sheen h-full w-2/3 bg-gradient-to-r from-orange-500 to-orange-400 rounded-full shadow-lg" />
                    </div>
                    <div className="flex justify-between">
                      <div className="space-y-0.5 md:space-y-1">
                        <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">In Transit From</p>
                        <p className="text-sm md:text-xl font-black text-[#0f172a]">London Heathrow</p>
                      </div>
                      <div className="text-right space-y-0.5 md:space-y-1">
                        <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Estimated To</p>
                        <p className="text-sm md:text-xl font-black text-[#0f172a]">JKIA Nairobi</p>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>
              
              <div className="absolute -top-6 md:-top-10 -right-6 md:-right-10 w-24 h-24 md:w-40 md:h-40 bg-orange-400/10 backdrop-blur-3xl rounded-full border border-white/20 -z-10 animate-pulse" />
            </div>
          </div>
        </div>
      </section>

      <MarqueeRetailers retailers={retailers} />

      {/* --- BENTO PROCESS GRID --- */}
      <section className="py-16 md:py-24 lg:py-40 px-4 md:px-6">
        <div className="container mx-auto">
          <div className="max-w-xl mb-12 md:mb-20 space-y-4 md:space-y-6 text-center md:text-left mx-auto md:mx-0">
            <span className="text-orange-700 font-black uppercase tracking-[0.4em] text-[10px] md:text-xs">Our Workflow</span>
            <h2 className="text-3xl md:text-5xl lg:text-7xl font-black text-[#0f172a] leading-none tracking-tighter uppercase">{t('home.howitworks')}</h2>
            <div className="h-1.5 md:h-2 w-16 md:w-24 bg-orange-500 rounded-full mx-auto md:mx-0" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            <GlassCard className="p-8 md:p-10 flex flex-col justify-between group hover:shadow-orange-100 transition-all">
              <div className="w-14 h-14 md:w-16 md:h-16 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl flex items-center justify-center text-white shadow-xl mb-8 md:mb-10 group-hover:rotate-12 transition-transform"><ShoppingBag size={28} className="md:w-8 md:h-8"/></div>
              <div>
                <h3 className="text-xl md:text-2xl font-black mb-3 md:mb-4 text-slate-900 leading-tight">01. {t('home.step1')}</h3>
                <p className="text-slate-500 text-xs md:text-sm font-bold leading-relaxed">Shop any brand in the UK or China. Use our warehouse address as yours.</p>
              </div>
            </GlassCard>

            <div className="md:col-span-1 lg:col-span-2 relative group overflow-hidden rounded-[2.5rem] bg-[#0f172a] p-8 md:p-12 text-white shadow-2xl flex flex-col justify-between transition-all hover:scale-[1.02]">
               <div className="absolute top-0 right-0 w-60 md:w-80 h-60 md:h-80 bg-orange-500/10 blur-[100px] md:blur-[120px] -z-0" />
               <div className="relative z-10 flex items-start justify-between">
                  <div className="space-y-4 md:space-y-6 max-w-[70%]">
                    <h3 className="text-2xl md:text-3xl font-black leading-none uppercase tracking-tighter">02. {t('home.step2')}</h3>
                    <p className="text-slate-400 text-xs md:text-sm font-bold">We handle the heavy lifting. Your package is safely received and cataloged.</p>
                  </div>
                  <div className="w-16 h-16 md:w-20 md:h-20 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl md:rounded-3xl flex items-center justify-center shadow-2xl"><Bell className="text-orange-400 md:w-9 md:h-9" size={30} /></div>
               </div>
               <div className="relative z-10 flex items-center gap-4 md:gap-6 mt-10 md:mt-16 overflow-x-hidden">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-14 w-14 md:h-16 md:w-16 bg-white/5 border border-white/10 rounded-xl md:rounded-2xl flex items-center justify-center text-orange-400/50 shrink-0"><Box size={24} className="md:w-7 md:h-7"/></div>
                  ))}
               </div>
            </div>

            <GlassCard className="p-8 md:p-10 flex flex-col justify-between group hover:shadow-blue-100 transition-all">
               <div className="w-14 h-14 md:w-16 md:h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center mb-8 md:mb-10 shadow-xl shadow-blue-100 group-hover:rotate-12 transition-transform"><Plane size={28} className="md:w-8 md:h-8"/></div>
               <div>
                <h3 className="text-xl md:text-2xl font-black mb-3 md:mb-4 text-slate-900 leading-tight">03. {t('home.step3')}</h3>
                <p className="text-slate-500 text-xs md:text-sm font-bold leading-relaxed">Seamless air and sea transit with specialized customs clearance.</p>
              </div>
            </GlassCard>

            <div className="md:col-span-1 lg:col-span-2 p-0.5 bg-gradient-to-br from-orange-400 to-blue-400 rounded-[2.5rem] shadow-2xl group">
               <div className="h-full w-full bg-white/95 backdrop-blur-3xl rounded-[2.4rem] p-8 md:p-10 flex flex-col sm:flex-row items-center gap-6 md:gap-10 text-center sm:text-left">
                  <div className="w-20 h-20 md:w-24 md:h-24 shrink-0 bg-slate-900 rounded-2xl md:rounded-3xl flex items-center justify-center text-white group-hover:scale-110 transition-transform"><Truck size={36} className="md:w-10 md:h-10"/></div>
                  <div>
                    <h3 className="text-2xl md:text-3xl font-black mb-2 md:mb-3 text-[#0f172a] uppercase tracking-tighter">04. {t('home.step4')}</h3>
                    <p className="text-slate-500 text-xs md:text-sm font-bold">Collect from our Nairobi CBD collection point, or we deliver using your preferred courier anywhere in Kenya.</p>
                  </div>
               </div>
            </div>

            <GlassCard className="md:col-span-1 lg:col-span-2 p-8 md:p-10 group overflow-hidden">
                <div className="z-10 space-y-6">
                  <h3 className="text-xl md:text-2xl font-black text-slate-900 uppercase">Global Hubs</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {markets.map(m => (
                      <div key={m.name} className="bg-white/60 rounded-2xl p-4 border border-white/50 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{m.flag}</span>
                          <p className="text-sm font-black text-slate-800">{m.name}</p>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 leading-snug">{m.address}</p>
                        <div className="flex gap-2 flex-wrap">
                          <span className="text-[9px] font-black uppercase tracking-wider text-orange-600 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full">{m.desc}</span>
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full">{m.processing}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-slate-100 absolute -right-4 md:-right-8 rotate-12 group-hover:rotate-0 transition-transform duration-1000 -z-0 top-0">
                  <Globe size={180} className="md:w-[240px] md:h-[240px] opacity-10" />
                </div>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* --- PRICING CTA --- */}
      <section className="py-16 md:py-24 lg:py-40 px-4 md:px-6">
        <div className="container mx-auto">
          <div className="relative overflow-hidden rounded-[2.5rem] md:rounded-[4rem] bg-[#0f172a] p-8 md:p-12 lg:p-20 xl:p-28 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.2)] md:shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)]">
            <div className="absolute top-[-20%] right-[-10%] w-[300px] md:w-[600px] h-[300px] md:h-[600px] bg-orange-500/20 blur-[100px] md:blur-[150px] animate-morph" />
            <div className="absolute bottom-[-20%] left-[-10%] w-[250px] md:w-[500px] h-[250px] md:h-[500px] bg-blue-500/20 blur-[100px] md:blur-[150px]" />
            
            <div className="relative z-10 grid lg:grid-cols-2 gap-12 md:gap-16 lg:gap-20 items-center">
              <div className="space-y-6 md:space-y-10 text-center lg:text-left">
                 <h2 className="text-3xl md:text-5xl lg:text-8xl font-black text-white leading-tight md:leading-none tracking-tighter uppercase">{t('home.pricing.title')}</h2>
                 <p className="text-sm md:text-xl text-slate-400 font-bold max-w-md mx-auto lg:mx-0">{t('home.pricing.description')}</p>
                 <Link
                   to="/pricing"
                   className="inline-block glass-sheen px-8 py-4 md:px-12 md:py-6 bg-white text-[#0f172a] rounded-[1.5rem] md:rounded-[2rem] font-black text-base md:text-xl shadow-2xl hover:scale-105 transition-transform"
                 >
                   {t('home.pricing.calculate')}
                 </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
                <GlassCard className="p-8 md:p-10 bg-white/5 border-white/10 group hover:bg-white/10 transition-all flex flex-col justify-center min-h-[220px]">
                  <div className="text-orange-400 mb-6 md:mb-8"><Plane size={32} className="md:w-10 md:h-10"/></div>
                  <h3 className="text-white font-black text-xl md:text-2xl mb-2">Air Cargo</h3>
                  <p className="text-slate-400 text-[10px] md:text-xs mb-6 md:mb-8 font-bold leading-relaxed">Fastest route. Weekly consolidation.</p>
                  <p className="text-3xl md:text-4xl font-black text-white">From £9<small className="text-[10px] md:text-sm opacity-50 ml-2">/kg</small></p>
                </GlassCard>
                <GlassCard className="p-8 md:p-10 bg-white/5 border-white/10 group hover:bg-white/10 transition-all flex flex-col justify-center min-h-[220px]">
                  <div className="text-blue-400 mb-6 md:mb-8"><Truck size={32} className="md:w-10 md:h-10"/></div>
                  <h3 className="text-white font-black text-xl md:text-2xl mb-2">Sea Freight</h3>
                  <p className="text-slate-400 text-[10px] md:text-xs mb-6 md:mb-8 font-bold leading-relaxed">Bulky & heavy items. 45-60 Days.</p>
                  <p className="text-3xl md:text-4xl font-black text-white">$450.00<small className="text-[10px] md:text-sm opacity-50 ml-2">/CBM</small></p>
                </GlassCard>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- TESTIMONIALS --- */}
      <section className="py-16 md:py-24 lg:py-40 px-4 md:px-6">
        <div className="container mx-auto">
          <div className="mb-12 md:mb-20 space-y-3 md:space-y-4 text-center md:text-left">
            <span className="text-orange-700 font-black uppercase tracking-[0.4em] text-[10px] md:text-xs">Customer Stories</span>
            <h2 className="text-3xl md:text-5xl lg:text-7xl font-black text-[#0f172a] tracking-tighter uppercase">{t('home.testimonials')}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10">
            {testimonials.map((test, idx) => (
              <GlassCard key={idx} className="p-8 md:p-12 group hover:-translate-y-3 transition-all duration-500">
                <div className="flex text-orange-400 mb-6 md:mb-10 justify-center md:justify-start">
                  {[...Array(5)].map((_, i) => <Star key={i} size={14} className="md:w-[18px] md:h-[18px]" fill="currentColor"/>)}
                </div>
                <p className="text-slate-600 font-bold text-sm md:text-lg italic leading-relaxed mb-8 md:mb-10">"{test.text}"</p>
                <div className="flex items-center gap-4 md:gap-5 pt-8 md:pt-10 border-t border-slate-100">
                  <div className={`w-12 h-12 md:w-16 md:h-16 rounded-2xl md:rounded-3xl overflow-hidden shadow-inner shrink-0 ${test.color}`}>
                    {test.avatar}
                  </div>
                  <div>
                    {/* Heading-outline fix: previous element was an h2
                        ("Testimonials"), so this user-name was an h4 with
                        no intervening h3 — a WCAG 1.3.1 outline skip.
                        Promoting to h3 fixes the sequence; visual sizing
                        is preserved via the same Tailwind classes. */}
                    <h3 className="font-black text-slate-900 text-sm md:text-base">{test.name}</h3>
                    <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">{test.location} · Verified Client</p>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      {/* --- FOOTER CTA --- */}
      <footer className="relative py-20 lg:py-48 px-4 md:px-6 overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-white">
          <LiquidBlob className="bottom-[-20%] left-[30%] w-[500px] md:w-[900px] h-[500px] md:h-[900px]" color="bg-orange-100" />
        </div>
        <div className="container mx-auto max-w-5xl text-center space-y-10 md:space-y-12">
           <div className="w-16 h-16 md:w-24 md:h-24 bg-gradient-to-br from-orange-400 to-orange-600 rounded-[1.8rem] md:rounded-[2.5rem] flex items-center justify-center text-white mx-auto shadow-2xl animate-pulse">
             <Sparkles size={32} className="md:w-12 md:h-12"/>
           </div>
           <h2 className="text-4xl md:text-6xl lg:text-9xl font-black text-[#0f172a] leading-none tracking-tighter uppercase">Start shipping today.</h2>
           <p className="text-base md:text-xl lg:text-2xl text-slate-500 font-bold max-w-3xl mx-auto">Join the new era of cross-border commerce. No borders, no limits, just seamless logistics.</p>
           
           <div className="flex flex-col sm:flex-row justify-center gap-4 md:gap-6 pt-4">
             <Link
               to={isAuthenticated ? '/ship-instructions' : '/register'}
               className="glass-sheen px-10 py-5 md:px-12 md:py-6 bg-orange-500 text-white rounded-[1.5rem] md:rounded-[2rem] font-black text-lg shadow-[0_20px_50px_rgba(249,115,22,0.3)] hover:bg-orange-600 hover:scale-105 transition-all"
             >
               {t('home.hero.cta')}
             </Link>
             <Link to="/faq" className="px-10 py-5 md:px-12 md:py-6 bg-[#0f172a] text-white rounded-[1.5rem] md:rounded-[2rem] font-black text-lg shadow-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-3 md:gap-4">
               <Headphones size={20} className="md:w-6 md:h-6"/> Help Centre
             </Link>
           </div>

           <div className="pt-20 md:pt-32 flex flex-col md:flex-row items-center justify-between gap-8 md:gap-10 border-t border-slate-200 text-slate-400 font-black text-[8px] md:text-[10px] uppercase tracking-[0.4em]">
             <p>© {new Date().getFullYear()} Thapsus Cargo Global</p>
             <div className="flex gap-6 md:gap-10">
               <Link to="/privacy" className="hover:text-slate-900 transition-colors">Privacy Policy</Link>
               <Link to="/terms"   className="hover:text-slate-900 transition-colors">Terms of Service</Link>
             </div>
           </div>
        </div>
      </footer>
    </div>
  )
}

export default function App() {
  return <Home />;
}
