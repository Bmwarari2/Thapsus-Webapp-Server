import React from 'react'
import { Link } from 'react-router-dom'
import { 
  ArrowRight, Package, Truck, MapPin, Star, ChevronRight, 
  Globe, ShieldCheck, Zap, ShoppingBag, Headphones, Sparkles, Bell 
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'

/**
 * HELPER COMPONENTS FOR THE LIQUID GLASS THEME
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
  return (
    <div className="py-8 bg-white/30 backdrop-blur-md border-y border-white/50 overflow-hidden select-none">
      <div className="flex space-x-16 animate-scroll">
        {[...retailers, ...retailers].map((r, i) => (
          <div 
            key={i} 
            className="flex items-center space-x-3 text-slate-400 font-bold hover:text-orange-500 transition-all cursor-default group"
          >
            <div className="p-2 bg-white rounded-lg shadow-sm group-hover:scale-110 group-hover:shadow-orange-100 transition-transform">
              <span className="text-xl">{r.emoji}</span>
            </div>
            <span className="text-xl tracking-tight uppercase">{r.name}</span>
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
    { name: 'United Kingdom', flag: '🇬🇧', desc: '3-5 Day Express' },
    { name: 'United States', flag: '🇺🇸', desc: 'Direct Air Freight' },
    { name: 'China', flag: '🇨🇳', desc: 'Lowest Economy Rates' },
  ]

  const testimonials = [
    {
      name: 'John Kimani',
      text: 'Thapsus Cargo made shopping international so easy. My packages arrived quickly and in perfect condition!',
      icon: '👨🏾‍💼',
      color: 'bg-orange-50',
    },
    {
      name: 'Sarah Omondi',
      text: 'Best shipping service I have used. Transparent pricing and excellent customer support throughout.',
      icon: '👩🏾‍💻',
      color: 'bg-blue-50',
    },
    {
      name: 'Michael Kipchoge',
      text: 'Reliable and affordable. I have sent multiple packages and every single one arrived on time.',
      icon: '👨🏾‍🎨',
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
          100% { transform: translateX(-50%); }
        }
        @keyframes sheen {
          0% { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(200%) skewX(-15deg); }
        }
        .animate-morph { animation: morph 12s ease-in-out infinite; }
        .animate-scroll { display: flex; width: max-content; animation: scroll 40s linear infinite; }
        .animate-scroll:hover { animation-play-state: paused; }
        .glass-sheen { position: relative; overflow: hidden; }
        .glass-sheen::after {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 50%; height: 100%;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.3), transparent);
          animation: sheen 4s infinite;
        }
        .animate-bounce-slow { animation: bounce 3s infinite; }
      `}</style>

      {/* --- HERO SECTION --- */}
      <section className="relative pt-12 pb-12 lg:pt-20 lg:pb-16 overflow-hidden">
        <LiquidBlob className="top-[-15%] left-[-5%] w-[450px] h-[450px]" color="bg-orange-200" />
        <LiquidBlob className="bottom-[5%] right-[-5%] w-[550px] h-[550px]" color="bg-blue-200" />
        <div className="absolute inset-0 bg-white/20 backdrop-blur-[2px]" />

        <div className="container mx-auto px-6 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
            <div className="lg:w-1/2 space-y-6 lg:space-y-8">
              <div className="inline-flex items-center space-x-3 px-4 py-1.5 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/50 shadow-sm">
                <div className="flex -space-x-2">
                  <div className="w-5 h-5 rounded-full bg-orange-500 border-2 border-white" />
                  <div className="w-5 h-5 rounded-full bg-blue-500 border-2 border-white" />
                </div>
                <span className="text-xs font-bold text-slate-700">Seamless Global Forwarding</span>
              </div>
              
              <h1 className="text-5xl lg:text-7xl font-black tracking-tight text-[#0f172a] leading-[0.95]">
                {t('home.hero.title')}
              </h1>
              
              <p className="text-lg lg:text-xl text-slate-600 max-w-lg leading-relaxed font-medium">
                {t('home.hero.subtitle')}
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <Link
                  to={isAuthenticated ? '/orders/new' : '/register'}
                  className="glass-sheen px-8 py-4 bg-[#0f172a] hover:bg-slate-800 text-white rounded-[1.5rem] font-bold shadow-xl transition-all transform hover:-translate-y-1 flex items-center justify-center gap-3 group"
                >
                  {t('home.hero.cta')}
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  to="/track"
                  className="px-8 py-4 bg-white/80 backdrop-blur-xl border border-white/50 text-[#0f172a] rounded-[1.5rem] font-bold shadow-lg hover:bg-white transition-all text-center"
                >
                  {t('home.hero.track')}
                </Link>
              </div>

              <div className="flex items-center gap-8 pt-6 border-t border-slate-200/50">
                <div className="text-sm space-y-0.5">
                  <div className="flex text-orange-500">
                    {[...Array(5)].map((_, i) => <Star key={i} size={14} fill="currentColor"/>)}
                  </div>
                  <p className="font-black text-[#0f172a] text-sm uppercase tracking-wider">Top Rated</p>
                </div>
                <div className="h-8 w-[1px] bg-slate-200" />
                <p className="text-xs text-slate-500 font-medium max-w-[180px]">Trusted by <span className="text-slate-900 font-bold">12,000+</span> regular shoppers.</p>
              </div>
            </div>

            <div className="lg:w-1/2 relative w-full max-w-lg lg:max-w-none">
              <GlassCard className="p-1 transform lg:rotate-2 hover:rotate-0 transition-transform duration-1000 group shadow-2xl">
                <div className="bg-slate-900/5 rounded-[2.2rem] p-8 lg:p-10">
                  <div className="flex justify-between items-center mb-8 lg:mb-12">
                    <div className="p-3 lg:p-4 bg-white rounded-2xl shadow-xl text-orange-500 scale-100 lg:scale-110"><Package size={28}/></div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/60 backdrop-blur-md rounded-full text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 shadow-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      Live Network
                    </div>
                  </div>
                  <div className="space-y-6 lg:space-y-8">
                    <div className="relative h-3 w-full bg-white/40 rounded-full overflow-hidden">
                       <div className="glass-sheen absolute top-0 left-0 h-full w-3/4 bg-gradient-to-r from-orange-500 to-orange-400 rounded-full" />
                    </div>
                    <div className="flex justify-between">
                      <div className="space-y-0.5">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Origin</p>
                        <p className="text-base lg:text-lg font-black text-[#0f172a]">London / NY / Guangzhou</p>
                      </div>
                      <div className="text-right space-y-0.5">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Destination</p>
                        <p className="text-base lg:text-lg font-black text-[#0f172a]">Nairobi, KE</p>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>
              <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-white/40 backdrop-blur-3xl rounded-[2.5rem] border border-white/50 shadow-2xl p-4 hidden xl:block animate-bounce-slow">
                 <div className="w-full h-full bg-orange-100 rounded-[1.8rem] flex items-center justify-center text-3xl">📦</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarqueeRetailers retailers={retailers} />

      {/* --- BENTO GRID PROCESS SECTION --- */}
      <section className="py-24 lg:py-32 px-6">
        <div className="container mx-auto">
          <div className="max-w-xl mb-16 lg:mb-20 space-y-6">
            <h2 className="text-4xl lg:text-5xl font-black text-[#0f172a] leading-tight tracking-tighter uppercase">{t('home.howitworks')}</h2>
            <div className="h-1.5 w-16 bg-orange-500 rounded-full" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 lg:gap-8">
            {/* Step 1 */}
            <GlassCard className="p-8 lg:p-10 flex flex-col justify-between group hover:shadow-orange-100 transition-all">
              <div className="w-14 h-14 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl flex items-center justify-center text-white shadow-lg mb-8 group-hover:rotate-6 transition-transform"><ShoppingBag size={28}/></div>
              <div>
                <h3 className="text-xl lg:text-2xl font-black mb-4 text-slate-900 leading-tight">01.<br/>{t('home.step1')}</h3>
                <p className="text-slate-500 text-sm leading-relaxed font-medium">Shop any global store and use our warehouse addresses.</p>
              </div>
            </GlassCard>

            {/* Step 2 (Wide) */}
            <div className="lg:col-span-2 relative group overflow-hidden rounded-[2.5rem] bg-[#0f172a] p-10 lg:p-12 text-white shadow-2xl flex flex-col justify-between transition-transform hover:scale-[1.01] duration-500">
               <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/20 blur-[100px] -z-0" />
               <div className="relative z-10 flex items-start justify-between">
                  <div className="space-y-4 max-w-[60%]">
                    <h3 className="text-2xl lg:text-3xl font-black leading-none uppercase tracking-tighter">02. {t('home.step2')}</h3>
                    <p className="text-slate-400 text-sm font-medium">We receive, inspect, and notify you the moment it arrives.</p>
                  </div>
                  <div className="w-16 h-16 bg-white/10 backdrop-blur-xl rounded-2xl flex items-center justify-center"><Bell className="text-orange-400" size={28}/></div>
               </div>
               <div className="relative z-10 flex items-center gap-4 mt-10 overflow-hidden">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-14 w-14 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-2xl">📦</div>
                  ))}
               </div>
            </div>

            {/* Step 3 */}
            <GlassCard className="p-8 lg:p-10 flex flex-col justify-between hover:shadow-blue-100 transition-all">
               <div className="w-14 h-14 bg-blue-500 text-white rounded-2xl flex items-center justify-center mb-8 shadow-lg shadow-blue-100"><Globe size={28}/></div>
               <div>
                <h3 className="text-xl lg:text-2xl font-black mb-4 text-slate-900 leading-tight">03.<br/>{t('home.step3')}</h3>
                <p className="text-slate-500 text-sm leading-relaxed font-medium">Consolidated air and sea transit with full customs clearance.</p>
              </div>
            </GlassCard>

            {/* Step 4 (Wide) */}
            <div className="lg:col-span-2 p-0.5 bg-gradient-to-br from-orange-400 to-blue-400 rounded-[2.5rem] shadow-xl group">
               <div className="h-full w-full bg-white/90 backdrop-blur-3xl rounded-[2.4rem] p-8 lg:p-10 flex items-center gap-6 lg:gap-10">
                  <div className="w-20 h-20 shrink-0 bg-slate-900 rounded-[1.8rem] flex items-center justify-center text-white group-hover:scale-110 transition-transform"><Truck size={36}/></div>
                  <div>
                    <h3 className="text-2xl lg:text-3xl font-black mb-2 text-[#0f172a] uppercase tracking-tighter">04. {t('home.step4')}</h3>
                    <p className="text-slate-500 text-sm lg:text-base font-medium">Final mile delivery to your doorstep or CBD collection points.</p>
                  </div>
               </div>
            </div>

            {/* Markets Grid */}
            <GlassCard className="lg:col-span-2 p-8 lg:p-10 flex items-center justify-between group overflow-hidden">
                <div className="z-10 space-y-4">
                  <h3 className="text-xl lg:text-2xl font-black text-slate-900">{t('home.markets')}</h3>
                  <div className="flex gap-4">
                    {markets.map(m => (
                      <div key={m.name} className="text-center">
                        <div className="text-3xl mb-1">{m.flag}</div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{m.name.split(' ')[1] || m.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-slate-100 absolute -right-4 rotate-12 group-hover:rotate-0 transition-transform duration-700 -z-0">
                  <ShieldCheck size={150} className="lg:w-[180px] lg:h-[180px]" />
                </div>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* --- PRICING SECTION --- */}
      <section className="py-24 lg:py-32 px-6">
        <div className="container mx-auto">
          <div className="relative overflow-hidden rounded-[3rem] lg:rounded-[4rem] bg-[#0f172a] p-10 lg:p-24 shadow-2xl">
            <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-orange-500/20 blur-[120px] animate-morph" />
            <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] bg-blue-500/20 blur-[120px]" />
            
            <div className="relative z-10 grid lg:grid-cols-2 gap-16 lg:gap-20 items-center">
              <div className="space-y-8 text-center lg:text-left">
                 <h2 className="text-4xl lg:text-7xl font-black text-white leading-none tracking-tighter uppercase">{t('home.pricing.title')}</h2>
                 <p className="text-lg lg:text-xl text-slate-400 font-medium max-w-md mx-auto lg:mx-0">{t('home.pricing.description')}</p>
                 <Link
                   to="/pricing"
                   className="inline-block glass-sheen px-10 py-5 lg:px-12 lg:py-6 bg-white text-[#0f172a] rounded-[1.8rem] lg:rounded-[2rem] font-black text-lg shadow-2xl hover:scale-105 transition-transform"
                 >
                   {t('home.pricing.calculate')}
                 </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <GlassCard className="p-8 bg-white/5 border-white/10 group hover:bg-white/10 transition-colors">
                  <div className="text-orange-400 mb-6"><Zap size={32}/></div>
                  <h4 className="text-white font-black text-xl mb-2">Air Freight</h4>
                  <p className="text-slate-400 text-xs mb-6 font-medium leading-relaxed">Weekly flights. 7-10 days delivery.</p>
                  <p className="text-3xl font-black text-white">$12<small className="text-sm opacity-50 ml-1">/kg</small></p>
                </GlassCard>
                <GlassCard className="p-8 bg-white/5 border-white/10 group hover:bg-white/10 transition-colors">
                  <div className="text-blue-400 mb-6"><Truck size={32}/></div>
                  <h4 className="text-white font-black text-xl mb-2">Sea Freight</h4>
                  <p className="text-slate-400 text-xs mb-6 font-medium leading-relaxed">Cost-effective for bulky items. 45-60 days.</p>
                  <p className="text-3xl font-black text-white">$450<small className="text-sm opacity-50 ml-1">/CBM</small></p>
                </GlassCard>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- TESTIMONIALS --- */}
      <section className="py-24 lg:py-32 px-6">
        <div className="container mx-auto">
          <div className="mb-16 lg:mb-20 space-y-4">
            <span className="text-orange-500 font-black uppercase tracking-[0.3em] text-xs">Customer Reviews</span>
            <h2 className="text-4xl lg:text-5xl font-black text-[#0f172a] tracking-tighter uppercase">{t('home.testimonials')}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-10">
            {testimonials.map((test, idx) => (
              <GlassCard key={idx} className="p-8 lg:p-10 group hover:-translate-y-2 transition-all">
                <div className="flex text-orange-400 mb-6">
                  {[...Array(5)].map((_, i) => <Star key={i} size={14} fill="currentColor"/>)}
                </div>
                <p className="text-slate-600 font-medium text-base italic leading-relaxed mb-8">"{test.text}"</p>
                <div className="flex items-center gap-4 pt-6 border-t border-slate-100">
                  <div className={`w-12 h-12 rounded-2xl ${test.color} flex items-center justify-center text-2xl shadow-inner`}>{test.icon}</div>
                  <div>
                    <h4 className="font-black text-slate-900 text-sm">{test.name}</h4>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Verified Client</p>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      {/* --- FINAL CTA FOOTER --- */}
      <footer className="relative py-24 lg:py-32 px-6 overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-white">
          <LiquidBlob className="bottom-[-20%] left-[30%] w-[800px] h-[800px]" color="bg-orange-100" />
        </div>
        <div className="container mx-auto max-w-4xl text-center space-y-10">
           <div className="w-20 h-20 bg-gradient-to-br from-orange-400 to-orange-600 rounded-[1.8rem] flex items-center justify-center text-white mx-auto shadow-2xl animate-pulse"><Sparkles size={40}/></div>
           <h2 className="text-5xl lg:text-8xl font-black text-[#0f172a] leading-none tracking-tighter uppercase">Ready to ship?</h2>
           <p className="text-lg lg:text-xl text-slate-500 font-medium max-w-2xl mx-auto">Join thousands of satisfied customers shipping with Thapsus Cargo Global.</p>
           <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
             <Link
               to={isAuthenticated ? '/orders/new' : '/register'}
               className="glass-sheen px-10 py-5 bg-orange-500 text-white rounded-[1.8rem] font-black text-lg shadow-2xl hover:bg-orange-600 hover:scale-105 transition-all"
             >
               {t('home.hero.cta')}
             </Link>
             <button className="px-10 py-5 bg-[#0f172a] text-white rounded-[1.8rem] font-black text-lg shadow-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
               <Headphones size={20}/> Contact Support
             </button>
           </div>
           <div className="pt-20 flex flex-col md:flex-row items-center justify-between gap-8 border-t border-slate-200 text-slate-400 font-bold text-[9px] uppercase tracking-[0.3em]">
             <p>© {new Date().getFullYear()} Thapsus Cargo Global</p>
             <div className="flex gap-8">
               <span className="hover:text-slate-900 cursor-pointer transition-colors">Privacy</span>
               <span className="hover:text-slate-900 cursor-pointer transition-colors">Terms</span>
               <span className="hover:text-slate-900 cursor-pointer transition-colors">Help</span>
             </div>
           </div>
        </div>
      </footer>
    </div>
  )
}
