import React, { useState, useEffect } from 'react'
import { ArrowRightLeft, TrendingUp, Globe, Zap } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { pricingApi } from '../api'
import toast from 'react-hot-toast'

// --- CUSTOM STYLES & GLASS COMPONENTS ---
const ExchangeRateStyles = () => (
  <style>{`
    @keyframes morph {
      0% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: translate(0, 0) scale(1); }
      33% { transform: translate(30px, -50px) scale(1.05); }
      66% { transform: translate(-20px, 20px) scale(0.95); }
      100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: translate(0, 0) scale(1); }
    }
    .animate-morph { animation: morph 15s ease-in-out infinite; }
    
    @keyframes sheen {
      0% { transform: translateX(-100%) skewX(-15deg); }
      100% { transform: translateX(200%) skewX(-15deg); }
    }
    .glass-sheen { position: relative; overflow: hidden; }
    .glass-sheen::after {
      content: ''; position: absolute; top: 0; left: 0; width: 50%; height: 100%;
      background: linear-gradient(to right, transparent, rgba(255,255,255,0.3), transparent);
      animation: sheen 4s infinite;
    }
  `}</style>
);

const LiquidBlob = ({ className, color }) => (
  <div className={`absolute blur-[100px] md:blur-[120px] rounded-full mix-blend-multiply opacity-60 animate-morph pointer-events-none ${className} ${color}`} />
);

const GlassCard = ({ children, className = "" }) => (
  <div className={`relative overflow-hidden rounded-[2.5rem] bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />
    <div className="relative z-10">{children}</div>
  </div>
);

export const ExchangeRate = () => {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [rates, setRates] = useState({
    usdToKes: 0,
    gbpToKes: 0,
  })
  const [usdAmount, setUsdAmount] = useState('1')
  const [gbpAmount, setGbpAmount] = useState('1')

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const response = await pricingApi.getExchangeRates()
        const payload = response.data?.data || {}
        setRates({
          usdToKes: Number(payload.USD_KES) || 0,
          gbpToKes: Number(payload.GBP_KES) || 0,
        })
      } catch (err) {
        toast.error('Failed to load exchange rates')
      } finally {
        setLoading(false)
      }
    }

    fetchRates()
  }, [])

  const handleSwapUSD = () => {
    const kes = usdAmount * rates.usdToKes
    setUsdAmount(kes.toString())
  }

  const handleSwapGBP = () => {
    const kes = gbpAmount * rates.gbpToKes
    setGbpAmount(kes.toString())
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f8fafc]">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-x-hidden relative pb-24">
      <ExchangeRateStyles />
      
      {/* --- LIQUID BACKGROUNDS --- */}
      <LiquidBlob className="top-[-5%] left-[-10%] w-[400px] h-[400px] md:w-[600px] md:h-[600px]" color="bg-blue-200" />
      <LiquidBlob className="bottom-[10%] right-[-5%] w-[350px] h-[350px] md:w-[500px] md:h-[500px]" color="bg-orange-200" />
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px] pointer-events-none" />

      <div className="max-w-5xl mx-auto px-6 py-12 relative z-10">
        
        {/* Header */}
        <div className="text-center mb-12 lg:mb-16">
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-white/60 backdrop-blur-md border border-white/50 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 shadow-sm mb-4">
            <Zap size={12} className="text-orange-700" />
            Live Market Data
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-[#0f172a] tracking-tighter uppercase leading-none mb-4">
            {t('exchange.title')}
          </h1>
          <p className="text-slate-500 font-bold max-w-lg mx-auto">
            Real-time currency engine for accurate global shipment pricing.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          
          {/* USD to KES - Interactive Tilted Card */}
          <div className="transform lg:-rotate-1 hover:rotate-0 transition-all duration-700 perspective-1000">
            <GlassCard className="p-8 md:p-10 group hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] transition-all h-full flex flex-col">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center shadow-inner">
                  <Globe size={28} className="text-green-600" />
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-[#0f172a] uppercase tracking-tighter">
                  {t('exchange.usdToKes')}
                </h2>
              </div>

              <div className="space-y-6 flex-1 flex flex-col justify-between">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-2">
                    USD Amount
                  </label>
                  <input
                    type="number"
                    value={usdAmount}
                    onChange={(e) => setUsdAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="w-full px-6 py-4 bg-white/60 backdrop-blur-md border border-white/50 rounded-[1.5rem] focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 text-slate-800 font-black text-xl transition-all shadow-sm"
                  />
                </div>

                {/* Border Gradient styling for current rate */}
                <div className="p-1 bg-gradient-to-br from-green-400 via-emerald-300 to-blue-400 rounded-[2rem] shadow-lg">
                  <div className="bg-white/95 backdrop-blur-3xl p-6 rounded-[1.9rem] text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Current Rate</p>
                    <p className="text-3xl md:text-4xl font-black text-[#0f172a] tracking-tighter">
                      1 USD = <span className="text-green-500">{rates.usdToKes.toFixed(2)}</span> KES
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-2">
                    KES Equivalent
                  </label>
                  <div className="bg-slate-900/5 border border-white/50 rounded-[1.5rem] p-6 shadow-inner text-center">
                    <p className="text-4xl md:text-5xl font-black text-[#0f172a] tracking-tighter">
                      KES {(usdAmount * rates.usdToKes).toLocaleString('en-US', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleSwapUSD}
                  className="glass-sheen w-full bg-[#0f172a] hover:bg-slate-800 text-white py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-3 shadow-xl hover:-translate-y-1 mt-2"
                >
                  <ArrowRightLeft size={18} />
                  {t('exchange.swap')}
                </button>
              </div>
            </GlassCard>
          </div>

          {/* GBP to KES - Interactive Tilted Card */}
          <div className="transform lg:rotate-1 hover:rotate-0 transition-all duration-700 perspective-1000">
            <GlassCard className="p-8 md:p-10 group hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] transition-all h-full flex flex-col">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center shadow-inner">
                  <Globe size={28} className="text-blue-600" />
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-[#0f172a] uppercase tracking-tighter">
                  {t('exchange.gbpToKes')}
                </h2>
              </div>

              <div className="space-y-6 flex-1 flex flex-col justify-between">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-2">
                    GBP Amount
                  </label>
                  <input
                    type="number"
                    value={gbpAmount}
                    onChange={(e) => setGbpAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="w-full px-6 py-4 bg-white/60 backdrop-blur-md border border-white/50 rounded-[1.5rem] focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-slate-800 font-black text-xl transition-all shadow-sm"
                  />
                </div>

                {/* Border Gradient styling for current rate */}
                <div className="p-1 bg-gradient-to-br from-blue-400 via-indigo-300 to-purple-400 rounded-[2rem] shadow-lg">
                  <div className="bg-white/95 backdrop-blur-3xl p-6 rounded-[1.9rem] text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Current Rate</p>
                    <p className="text-3xl md:text-4xl font-black text-[#0f172a] tracking-tighter">
                      1 GBP = <span className="text-blue-500">{rates.gbpToKes.toFixed(2)}</span> KES
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-2">
                    KES Equivalent
                  </label>
                  <div className="bg-slate-900/5 border border-white/50 rounded-[1.5rem] p-6 shadow-inner text-center">
                    <p className="text-4xl md:text-5xl font-black text-[#0f172a] tracking-tighter">
                      KES {(gbpAmount * rates.gbpToKes).toLocaleString('en-US', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleSwapGBP}
                  className="glass-sheen w-full bg-[#0f172a] hover:bg-slate-800 text-white py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-3 shadow-xl hover:-translate-y-1 mt-2"
                >
                  <ArrowRightLeft size={18} />
                  {t('exchange.swap')}
                </button>
              </div>
            </GlassCard>
          </div>
        </div>

        {/* Info Card - Dark Glass Bento */}
        <div className="relative group overflow-hidden rounded-[2.5rem] bg-[#0f172a] p-8 md:p-12 text-white shadow-2xl flex flex-col transition-all hover:scale-[1.01] mt-8">
          <div className="absolute top-[-20%] left-[-10%] w-64 h-64 bg-orange-500/20 blur-[80px] -z-0 pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
            <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center shrink-0 shadow-inner border border-white/10">
              <TrendingUp className="text-orange-400" size={32} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-3">
                {t('exchange.historicalNote')}
              </h3>
              <p className="text-slate-400 font-medium leading-relaxed max-w-3xl">
                Exchange rates are updated in real-time. Actual rates may vary slightly based on your bank or payment provider. Always confirm the final amount before making a transaction.
              </p>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  )
}
