import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, AlertCircle, Zap } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { ordersApi } from '../api'
import { SEO } from '../components/SEO'
import toast from 'react-hot-toast'

// --- CUSTOM STYLES & GLASS COMPONENTS ---
const NewOrderStyles = () => (
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

export const NewOrder = () => {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [formData, setFormData] = useState({
    market: 'UK',
    retailer: '',
    retailerOther: '',
    description: '',
    insurance: false,
    declaredValue: '',
  })
  const [estimate, setEstimate] = useState(null)

  const retailers = ['Shein', 'Amazon', 'Next', 'Asos', 'Superdrug', 'eBay', 'ZARA', 'H&M']

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleCalculateEstimate = async () => {
    setError(null)
    toast('Weight & dimensions will be added by our warehouse team after receiving your package.', { icon: 'ℹ️' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!formData.market) { setError(t('common.required')); return }
    if (!formData.retailer && !formData.retailerOther) { setError(t('common.required')); return }
    if (!formData.description) { setError(t('common.required')); return }

    try {
      setLoading(true)
      const retailerName = formData.retailer === 'other' ? formData.retailerOther : formData.retailer
      const response = await ordersApi.create({
        market: formData.market,
        retailer: retailerName,
        description: formData.description,
        shipping_speed: 'economy',
        insurance: formData.insurance,
        declared_value: formData.insurance ? parseFloat(formData.declaredValue) || 0 : 0,
      })

      toast.success('Order created successfully!')
      navigate('/orders/confirmation', {
        replace: true,
        state: {
          order: response.data.order,
          pricing: estimate,
        },
      })
    } catch (err) {
      const msg = err.message || 'Failed to create order'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full px-6 py-4 bg-white/60 backdrop-blur-md border border-white/50 rounded-[1.5rem] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 text-slate-800 font-bold placeholder-slate-400 transition-all shadow-sm";
  const labelClass = "block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-2";

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-x-hidden relative pb-24">
      <SEO title="Create New Order" description="Place a new shipping order from the UK or China to Kenya with Thapsus Cargo. Get instant cost estimates and track your shipment." />
      <NewOrderStyles />
      
      {/* --- LIQUID BACKGROUNDS --- */}
      <LiquidBlob className="top-[-5%] left-[-10%] w-[400px] h-[400px] md:w-[600px] md:h-[600px]" color="bg-blue-200" />
      <LiquidBlob className="bottom-[10%] right-[-5%] w-[350px] h-[350px] md:w-[500px] md:h-[500px]" color="bg-orange-200" />
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-6 py-12 relative z-10">
        
        {/* Header */}
        <div className="text-center mb-12 lg:mb-16">
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-white/60 backdrop-blur-md border border-white/50 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 shadow-sm mb-4">
            <Zap size={12} className="text-orange-700" />
            Dispatch Order
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-[#0f172a] tracking-tighter uppercase leading-none mb-4">
            {t('neworder.title')}
          </h1>
          <p className="text-slate-500 font-bold max-w-lg mx-auto">
            Provide your package details to initialize a new shipment manifest.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* --- LEFT FORM (Tilted Interactive Card) --- */}
          <div className="lg:col-span-8 transform lg:-rotate-1 hover:rotate-0 transition-all duration-700 perspective-1000">
            <GlassCard className="p-8 md:p-12 group hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] transition-shadow duration-700">
              
              {error && (
                <div className="mb-8 p-4 bg-red-50/80 backdrop-blur-md border border-red-200/50 rounded-2xl flex items-start gap-3 shadow-sm animate-in fade-in zoom-in duration-300">
                  <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-red-700 text-sm font-bold">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Market */}
                  <div>
                    <label className={labelClass}>{t('neworder.market')} *</label>
                    <select name="market" value={formData.market} onChange={handleChange} required className={inputClass}>
                      <option value="UK">United Kingdom</option>
                      <option value="China">China</option>
                    </select>
                  </div>

                  {/* Retailer */}
                  <div>
                    <label className={labelClass}>{t('neworder.retailer')} *</label>
                    <select name="retailer" value={formData.retailer} onChange={handleChange} required className={inputClass}>
                      <option value="">{t('neworder.retailerPlaceholder')}</option>
                      {retailers.map((r) => <option key={r} value={r}>{r}</option>)}
                      <option value="other">{t('neworder.other')}</option>
                    </select>
                  </div>
                </div>

                {formData.retailer === 'other' && (
                  <div className="animate-in fade-in slide-in-from-top-2">
                    <label className={labelClass}>Retailer Name *</label>
                    <input type="text" name="retailerOther" value={formData.retailerOther}
                      onChange={handleChange} placeholder="Enter retailer name" className={inputClass} />
                  </div>
                )}

                {/* Description */}
                <div>
                  <label className={labelClass}>{t('neworder.description')} *</label>
                  <textarea name="description" value={formData.description} onChange={handleChange}
                    placeholder="e.g., Blue hoodie size M, black shoes size 10" rows="3" required
                    className={`${inputClass} resize-none`} />
                </div>

                {/* Info notice about weight/dimensions */}
                <div className="relative overflow-hidden rounded-2xl bg-blue-50/60 backdrop-blur-md border border-blue-200/40 p-4 flex items-start gap-3">
                  <div className="absolute inset-0 bg-gradient-to-tr from-blue-100/20 to-transparent pointer-events-none" />
                  <AlertCircle className="text-blue-500 flex-shrink-0 mt-0.5 relative z-10" size={18} />
                  <p className="text-blue-700 text-sm font-bold relative z-10">Weight and dimensions will be measured by our warehouse team once your package arrives. You'll be notified with the final cost.</p>
                </div>

                <div className="h-px bg-slate-200/50 w-full my-8" />

                {/* Insurance / Protection */}
                <div>
                  <label className={labelClass}>Protection</label>
                  <div className="flex flex-col gap-3 mt-3">
                    <label className="flex items-center gap-3 cursor-pointer p-3 rounded-2xl border border-white/50 bg-white/40 hover:bg-white/60 transition-colors">
                      <input type="checkbox" name="insurance" checked={formData.insurance}
                        onChange={handleChange} className="w-5 h-5 rounded accent-[#0f172a]" />
                      <span className="text-slate-800 font-bold text-sm">{t('neworder.insurance')}</span>
                    </label>
                    {formData.insurance && (
                      <div className="animate-in fade-in zoom-in-95 duration-200 mt-2">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-2">Declared Value (KES)</label>
                        <input type="number" name="declaredValue" value={formData.declaredValue}
                          onChange={handleChange} min="0" placeholder="0" className={inputClass} />
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-6">
                  <button type="submit" disabled={loading}
                    className="w-full glass-sheen bg-[#0f172a] hover:bg-slate-800 text-white px-6 py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl hover:-translate-y-1 flex items-center justify-center gap-2">
                    {loading ? (
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                      </svg>
                    ) : (
                      <Package size={16} />
                    )}
                    {loading ? t('common.loading') : t('neworder.submit')}
                  </button>
                </div>
              </form>
            </GlassCard>
          </div>

          {/* --- RIGHT SIDEBAR: ESTIMATE (Dark Glass Bento) --- */}
          <div className="lg:col-span-4">
            {estimate ? (
              <div className="relative group overflow-hidden rounded-[2.5rem] bg-[#0f172a] p-8 md:p-10 text-white shadow-2xl flex flex-col transition-all hover:scale-[1.01] h-fit sticky top-24">
                <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-orange-500/20 blur-[80px] -z-0 pointer-events-none animate-pulse" />
                <div className="relative z-10 flex flex-col">
                  <h3 className="text-xl md:text-2xl font-black text-white uppercase tracking-tighter mb-8 flex items-center gap-3">
                    <Calculator className="text-orange-400" size={24} /> {t('neworder.costEstimate')}
                  </h3>
                  
                  <div className="space-y-4 flex-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Base Shipping</span>
                      <span className="font-black text-sm text-white">KES {estimate.breakdown?.base_shipping?.amount?.toLocaleString()}</span>
                    </div>
                    
                    {estimate.breakdown?.handling_fee?.amount > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Handling Fee</span>
                        <span className="font-black text-sm text-white">KES {estimate.breakdown?.handling_fee?.amount?.toLocaleString()}</span>
                      </div>
                    )}
                    
                    {estimate.breakdown?.insurance?.included && (
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Insurance</span>
                        <span className="font-black text-sm text-white">KES {estimate.breakdown?.insurance?.amount?.toLocaleString()}</span>
                      </div>
                    )}
                    
                    <div className="flex justify-between items-center pb-6 border-b border-slate-700/50">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Customs Est.</span>
                      <span className="font-black text-sm text-white">KES {estimate.breakdown?.customs_estimate?.amount?.toLocaleString()}</span>
                    </div>
                    
                    <div className="pt-2 flex justify-between items-end">
                      <span className="text-xs font-black uppercase tracking-widest text-orange-400">Total</span>
                      <div className="text-right">
                        <p className="text-3xl md:text-4xl font-black text-white leading-none">KES {(estimate.total || 0).toLocaleString()}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2">{estimate.notes?.delivery_time}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-[2.5rem] bg-white/20 backdrop-blur-md border border-white/40 p-8 md:p-10 text-center flex flex-col items-center justify-center h-64 sticky top-24 shadow-sm">
                <Package size={40} className="text-slate-300 mb-4 opacity-50" />
                <p className="text-slate-500 font-bold text-sm">Your final cost will be calculated once our warehouse team measures and weighs your package.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
