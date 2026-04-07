import React from 'react'
import { Link } from 'react-router-dom'
import { 
  ArrowRight, Package, Truck, MapPin, Star, ChevronRight, 
  Globe, ShieldCheck, Zap, ShoppingBag, Headphones, Sparkles, 
  Bell, Store, CreditCard, Search, Box, Plane, CheckCircle2
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'

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
  // Triple the list to ensure the gap is never visible during the infinite scroll
  const tripleRetailers = [...retailers, ...retailers, ...retailers];
  
  return (
    <div className="py-10 bg-white/30 backdrop-blur-md border-y border-white/50 overflow-hidden select-none">
      <div className="flex whitespace-nowrap animate-scroll">
        {tripleRetailers.map((r, i) => (
          <div 
            key={i} 
            className="inline-flex items-center space-x-4 mx-12 text-slate-400 font-bold hover:text-orange-500 transition-all cursor-default group"
          >
            <div className="p-3 bg-white rounded-2xl shadow-sm group-hover:scale-110 group-hover:shadow-orange-100 transition-transform">
              {r.icon}
            </div>
            <span className="text-2xl tracking-tighter uppercase font-black">{r.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export const Home = () => {
  const { t } = useLanguage()
  const { isAuthenticated } = useAuth()

  const retailers = [
    { name: 'Shein', icon: <ShoppingBag size={24} className="text-pink-500" /> },
    { name: 'Amazon', icon: <Box size={24} className="text-orange-500" /> },
    { name: 'Walmart', icon: <Store size={24} className="text-blue-500" /> },
    { name: 'AliExpress', icon: <Zap size={24} className="text-red-500" /> },
    { name: 'Next', icon: <ShoppingBag size={24} className="text-slate-800" /> },
    { name: 'eBay', icon: <Package size={24} className="text-blue-600" /> },
    { name: 'ZARA', icon: <ShoppingBag size={24} className="text-slate-900" /> },
    { name: 'Target', icon: <CheckCircle2 size={24} className="text-red-600" /> },
    { name: 'Alibaba', icon: <Globe size={24} className="text-orange-600" /> },
    { name: 'Temu', icon: <Zap size={24} className="text-orange-400" /> },
  ]

  const markets = [
    { 
        name: 'United Kingdom', 
        icon: <div className="w-12 h-8 bg-blue-900 rounded-sm relative overflow-hidden flex items-center justify-center text-white text-[10px] font-bold">UK</div>, 
        desc: '3-5 Day Express' 
    },
    { 
        name: 'United States', 
        icon: <div className="w-12 h-8 bg-red-600 rounded-sm relative overflow-hidden flex items-center justify-center text-white text-[10px] font-bold">USA</div>, 
        desc: 'Direct Air Freight' 
    },
    { 
        name: 'China', 
        icon: <div className="w-12 h-8 bg-yellow-500 rounded-sm relative overflow-hidden flex items-center justify-center text-white text-[10px] font-bold">CHN</div>, 
        desc: 'Economy Logistics' 
    },
  ]

  const testimonials = [
    {
      name: 'John Kimani',
      text: 'Thapsus Cargo made shopping international so easy. My packages arrived quickly and in perfect condition!',
      avatar: <div className="w-full h-full bg-orange-100 flex items-center justify-center text-orange-600"><MapPin size={24}/></div>,
      color: 'bg-orange-50',
    },
    {
      name: 'Sarah Omondi',
      text: 'Best shipping service I have used. Transparent pricing and excellent customer support throughout.',
      avatar: <div className="w-full h-full bg-blue-100 flex items-center justify-center text-blue-600"><CheckCircle2 size={24}/></div>,
      color: 'bg-blue-50',
    },
    {
      name: 'Michael Kipchoge',
      text: 'Reliable and affordable. I have sent multiple packages and every single one arrived on time.',
      avatar: <div className="w-full h-full bg-purple-100 flex items-center justify-center text-purple-600"><ShieldCheck size={24}/></div>,
      color: 'bg-purple-50',
    },
  ]

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-x-hidden">
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

      {/* --- HERO SECTION --- */}
      <section className="relative pt-16 pb-12 lg:pt-24 lg:pb-20 overflow-hidden">
        <LiquidBlob className="top-[-15%] left-[-5%] w-[500px] h-[500px]" color="bg-orange-200" />
        <LiquidBlob className="bottom-[5%] right-[-5%] w-[600px] h-[600px]" color="bg-blue-200" />
        <div className="absolute inset-0 bg-white/30 backdrop-blur-[4px]" />

        <div className="container mx-auto px-6 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="lg:w-1/2 space-y-8">
              <div className="inline-flex items-center space-x-3 px-4 py-2 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/50 shadow-sm">
                <div className="p-1 bg-orange-500 rounded-lg text-white">
                    <Sparkles size={14}/>
                </div>
                <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Global Logistics Redefined</span>
              </div>
              
              <h1 className="text-6xl lg:text-8xl font-black tracking-tighter text-[#0f172a] leading-[0.9]">
                {t('home.hero.title')}
              </h1>
              
              <p className="text-xl text-slate-600 max-w-lg leading-relaxed font-medium">
                {t('home.hero.subtitle')}
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <Link
                  to={isAuthenticated ? '/orders/new' : '/register'}
                  className="glass-sheen px-10 py-5 bg-[#0f172a] hover:bg-slate-800 text-white rounded-[2rem] font-black shadow-2xl transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3 group text-lg"
                >
                  {t('home.hero.cta')}
                  <ArrowRight size={22} className="group-hover:translate-x-1 transition-transform" />
                </Link>
                <div className="relative group max-w-sm flex-grow">
                   <div className="absolute -inset-1 bg-gradient-to-r from-orange-400 to-blue-400 rounded-[2rem] blur opacity-10 group-hover:opacity-25 transition duration-1000"></div>
                   <div className="relative flex items-center bg-white/80 backdrop-blur-xl border border-white/50 rounded-[2rem] px-2 shadow-xl">
                       <Search size={20} className="ml-4 text-slate-400" />
                       <input 
                        type="text" 
                        placeholder="Tracking ID..." 
                        className="w-full px-4 py-5 bg-transparent outline-none text-sm font-bold"
                       />
                       <button className="px-6 py-3 bg-orange-500 text-white rounded-full text-xs font-black hover:bg-orange-600 transition-colors">
                         TRACK
                       </button>
                   </div>
                </div>
              </div>

              <div className="flex items-center gap-8 pt-8 border-t border-slate-200">
                <div className="text-sm">
                  <div className="flex text-orange-500 mb-1">
                    {[...Array(5)].map((_, i) => <Star key={i} size={16} fill="currentColor"/>)}
                  </div>
                  <p className="font-black text-[#0f172a] text-xs uppercase tracking-widest">Industry Leader</p>
                </div>
                <div className="h-10 w-[1px] bg-slate-200" />
                <p className="text-xs text-slate-500 font-bold max-w-[200px] leading-relaxed">
                  Trusted by <span className="text-slate-900">12,000+</span> businesses and individuals across East Africa.
                </p>
              </div>
            </div>

            <div className="lg:w-1/2 relative w-full">
              <GlassCard className="p-2 transform lg:rotate-3 hover:rotate-0 transition-all duration-700 group shadow-[0_50px_100px_-20px_rgba(0,0,0,0.15)]">
                <div className="bg-slate-900/5 rounded-[2.2rem] p-10">
                  <div className="flex justify-between items-center mb-12">
                    <div className="p-4 bg-white rounded-2xl shadow-xl text-orange-500 group-hover:scale-110 transition-transform"><Plane size={32}/></div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 shadow-sm border border-white/50">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      Live Monitoring
                    </div>
                  </div>
                  <div className="space-y-10">
                    <div className="relative h-4 w-full bg-white/50 rounded-full overflow-hidden p-1 shadow-inner">
                       <div className="glass-sheen h-full w-2/3 bg-gradient-to-r from-orange-500 to-orange-400 rounded-full shadow-lg" />
                    </div>
                    <div className="flex justify-between">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">In Transit From</p>
                        <p className="text-xl font-black text-[#0f172a]">London Heathrow</p>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estimated To</p>
                        <p className="text-xl font-black text-[#0f172a]">JKIA Nairobi</p>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>
              
              {/* Floating Accent */}
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-orange-400/10 backdrop-blur-3xl rounded-full border border-white/20 -z-10 animate-pulse" />
            </div>
          </div>
        </div>
      </section>

      <MarqueeRetailers retailers={retailers} />

      {/* --- BENTO PROCESS GRID --- */}
      <section className="py-24 lg:py-40 px-6">
        <div className="container mx-auto">
          <div className="max-w-xl mb-20 space-y-6">
            <span className="text-orange-500 font-black uppercase tracking-[0.4em] text-xs">Our Workflow</span>
            <h2 className="text-5xl lg:text-7xl font-black text-[#0f172a] leading-none tracking-tighter uppercase">{t('home.howitworks')}</h2>
            <div className="h-2 w-24 bg-orange-500 rounded-full" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8">
            <GlassCard className="p-10 flex flex-col justify-between group hover:shadow-orange-100 transition-all">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl flex items-center justify-center text-white shadow-xl mb-10 group-hover:rotate-12 transition-transform"><ShoppingBag size={32}/></div>
              <div>
                <h3 className="text-2xl font-black mb-4 text-slate-900 leading-tight">01. {t('home.step1')}</h3>
                <p className="text-slate-500 text-sm font-bold leading-relaxed">Shop any brand in the US, UK, or China. Use our address as yours.</p>
              </div>
            </GlassCard>

            <div className="lg:col-span-2 relative group overflow-hidden rounded-[2.5rem] bg-[#0f172a] p-12 text-white shadow-2xl flex flex-col justify-between transition-all hover:scale-[1.02]">
               <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/10 blur-[120px] -z-0" />
               <div className="relative z-10 flex items-start justify-between">
                  <div className="space-y-6 max-w-[65%]">
                    <h3 className="text-3xl font-black leading-none uppercase tracking-tighter">02. {t('home.step2')}</h3>
                    <p className="text-slate-400 font-bold">We handle the heavy lifting. Your package is safely received and cataloged.</p>
                  </div>
                  <div className="w-20 h-20 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl flex items-center justify-center shadow-2xl"><Bell className="text-orange-400" size={36}/></div>
               </div>
               <div className="relative z-10 flex items-center gap-6 mt-16">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="h-16 w-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-orange-400/50"><Box size={28}/></div>
                  ))}
               </div>
            </div>

            <GlassCard className="p-10 flex flex-col justify-between hover:shadow-blue-100 transition-all">
               <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center mb-10 shadow-xl shadow-blue-100"><Plane size={32}/></div>
               <div>
                <h3 className="text-2xl font-black mb-4 text-slate-900 leading-tight">03. {t('home.step3')}</h3>
                <p className="text-slate-500 text-sm font-bold leading-relaxed">Seamless air and sea transit with specialized customs clearance.</p>
              </div>
            </GlassCard>

            <div className="lg:col-span-2 p-1 bg-gradient-to-br from-orange-400 to-blue-400 rounded-[2.5rem] shadow-2xl group">
               <div className="h-full w-full bg-white/95 backdrop-blur-3xl rounded-[2.4rem] p-10 flex items-center gap-10">
                  <div className="w-24 h-24 shrink-0 bg-slate-900 rounded-3xl flex items-center justify-center text-white group-hover:scale-110 transition-transform"><Truck size={40}/></div>
                  <div>
                    <h3 className="text-3xl font-black mb-3 text-[#0f172a] uppercase tracking-tighter">04. {t('home.step4')}</h3>
                    <p className="text-slate-500 font-bold">Courier delivery to your doorstep across Kenya or local pickup.</p>
                  </div>
               </div>
            </div>

            <GlassCard className="lg:col-span-2 p-10 flex items-center justify-between group overflow-hidden">
                <div className="z-10 space-y-6">
                  <h3 className="text-2xl font-black text-slate-900 uppercase">Global Hubs</h3>
                  <div className="flex gap-8">
                    {markets.map(m => (
                      <div key={m.name} className="space-y-2">
                        {m.icon}
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{m.name.split(' ')[1] || m.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-slate-100 absolute -right-8 rotate-12 group-hover:rotate-0 transition-transform duration-1000 -z-0">
                  <Globe size={240} className="opacity-20" />
                </div>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* --- PRICING CTA --- */}
      <section className="py-24 lg:py-40 px-6">
        <div className="container mx-auto">
          <div className="relative overflow-hidden rounded-[4rem] bg-[#0f172a] p-12 lg:p-28 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)]">
            <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-orange-500/20 blur-[150px] animate-morph" />
            <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-500/20 blur-[150px]" />
            
            <div className="relative z-10 grid lg:grid-cols-2 gap-20 items-center">
              <div className="space-y-10 text-center lg:text-left">
                 <h2 className="text-5xl lg:text-8xl font-black text-white leading-none tracking-tighter uppercase">{t('home.pricing.title')}</h2>
                 <p className="text-xl text-slate-400 font-bold max-w-md mx-auto lg:mx-0">{t('home.pricing.description')}</p>
                 <Link
                   to="/pricing"
                   className="inline-block glass-sheen px-12 py-6 bg-white text-[#0f172a] rounded-[2rem] font-black text-xl shadow-2xl hover:scale-105 transition-transform"
                 >
                   {t('home.pricing.calculate')}
                 </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <GlassCard className="p-10 bg-white/5 border-white/10 group hover:bg-white/10 transition-all">
                  <div className="text-orange-400 mb-8"><Plane size={40}/></div>
                  <h4 className="text-white font-black text-2xl mb-2">Air Cargo</h4>
                  <p className="text-slate-400 text-xs mb-8 font-bold leading-relaxed">Fastest route. Weekly consolidation.</p>
                  <p className="text-4xl font-black text-white">$12.00<small className="text-sm opacity-50 ml-2">/kg</small></p>
                </GlassCard>
                <GlassCard className="p-10 bg-white/5 border-white/10 group hover:bg-white/10 transition-all">
                  <div className="text-blue-400 mb-8"><Truck size={40}/></div>
                  <h4 className="text-white font-black text-2xl mb-2">Sea Freight</h4>
                  <p className="text-slate-400 text-xs mb-8 font-bold leading-relaxed">Bulky & heavy items. 45-60 Days.</p>
                  <p className="text-4xl font-black text-white">$450.00<small className="text-sm opacity-50 ml-2">/CBM</small></p>
                </GlassCard>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- TESTIMONIALS --- */}
      <section className="py-24 lg:py-40 px-6">
        <div className="container mx-auto">
          <div className="mb-20 space-y-4">
            <span className="text-orange-500 font-black uppercase tracking-[0.4em] text-xs">Customer Stories</span>
            <h2 className="text-5xl lg:text-7xl font-black text-[#0f172a] tracking-tighter uppercase">{t('home.testimonials')}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {testimonials.map((test, idx) => (
              <GlassCard key={idx} className="p-12 group hover:-translate-y-3 transition-all duration-500">
                <div className="flex text-orange-400 mb-10">
                  {[...Array(5)].map((_, i) => <Star key={i} size={18} fill="currentColor"/>)}
                </div>
                <p className="text-slate-600 font-bold text-lg italic leading-relaxed mb-10">"{test.text}"</p>
                <div className="flex items-center gap-5 pt-10 border-t border-slate-100">
                  <div className={`w-16 h-16 rounded-3xl overflow-hidden shadow-inner ${test.color}`}>
                    {test.avatar}
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 text-base">{test.name}</h4>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Verified Client</p>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      {/* --- FOOTER CTA --- */}
      <footer className="relative py-32 lg:py-48 px-6 overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-white">
          <LiquidBlob className="bottom-[-20%] left-[30%] w-[900px] h-[900px]" color="bg-orange-100" />
        </div>
        <div className="container mx-auto max-w-5xl text-center space-y-12">
           <div className="w-24 h-24 bg-gradient-to-br from-orange-400 to-orange-600 rounded-[2.5rem] flex items-center justify-center text-white mx-auto shadow-2xl animate-pulse">
             <Sparkles size={48}/>
           </div>
           <h2 className="text-6xl lg:text-9xl font-black text-[#0f172a] leading-none tracking-tighter uppercase">Start shipping today.</h2>
           <p className="text-xl lg:text-2xl text-slate-500 font-bold max-w-3xl mx-auto">Join the new era of cross-border commerce. No borders, no limits, just seamless logistics.</p>
           
           <div className="flex flex-col sm:flex-row justify-center gap-6 pt-6">
             <Link
               to={isAuthenticated ? '/orders/new' : '/register'}
               className="glass-sheen px-12 py-6 bg-orange-500 text-white rounded-[2rem] font-black text-xl shadow-[0_20px_50px_rgba(249,115,22,0.3)] hover:bg-orange-600 hover:scale-105 transition-all"
             >
               {t('home.hero.cta')}
             </Link>
             <button className="px-12 py-6 bg-[#0f172a] text-white rounded-[2rem] font-black text-xl shadow-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-4">
               <Headphones size={24}/> Help Center
             </button>
           </div>

           <div className="pt-32 flex flex-col md:flex-row items-center justify-between gap-10 border-t border-slate-200 text-slate-400 font-black text-[10px] uppercase tracking-[0.4em]">
             <p>© {new Date().getFullYear()} Thapsus Cargo Global</p>
             <div className="flex gap-10">
               <span className="hover:text-slate-900 cursor-pointer transition-colors">Privacy Policy</span>
               <span className="hover:text-slate-900 cursor-pointer transition-colors">Terms of Service</span>
               <span className="hover:text-slate-900 cursor-pointer transition-colors">Compliance</span>
             </div>
           </div>
        </div>
      </footer>
    </div>
  )
}
