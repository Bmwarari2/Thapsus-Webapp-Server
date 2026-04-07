import React, { useState, useEffect } from 'react'
import { Calculator, Info, CheckCircle, AlertCircle } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { pricingApi } from '../api'
import toast from 'react-hot-toast'

// ── Electronics handling fee guide (mirrors server-side ELECTRONICS_HANDLING) ──
const ELECTRONICS_GUIDE = [
  {
    key: 'phone',
    label: 'Phone',
    fee_gbp: 75,
    detail:
      'Minimum £75 handling fee + 1 kg minimum weight. If total weight of phones exceeds 1 kg, the per-kg rate applies on top.',
  },
  {
    key: 'laptop',
    label: 'Laptop / Accessories',
    fee_gbp: 65,
    detail:
      'Minimum £65 handling fee + 1 kg minimum weight. Includes accessories, cases and bags. Per-kg rate applies above 1 kg.',
  },
  {
    key: 'tv_monitor',
    label: 'TV / Screen / Monitor',
    fee_gbp: 65,
    detail:
      'Minimum £65 handling fee charged based on actual weight and dimensions.',
  },
]

export const PricingCalculator = () => {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    market: 'UK',
    weight: '1',
    length: '10',
    width: '10',
    height: '10',
    shippingSpeed: 'economy',
    insurance: false,
    declaredValue: '0',
    electronics_item: '',
  })
  const [result, setResult] = useState(null)
  const [currentRates, setCurrentRates] = useState(null)

  const markets = ['UK', 'China']
  const shippingSpeeds = [
    { value: 'economy', label: t('pricing.economy') },
    { value: 'express', label: t('pricing.express') },
  ]

  // Fetch current per-kg rates for the info panel
  useEffect(() => {
    pricingApi
      .getRates()
      .then((res) => { if (res.data?.success) setCurrentRates(res.data.rates) })
      .catch(() => {})
  }, [])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleCalculate = async (e) => {
    e.preventDefault()
    if (!formData.weight || parseFloat(formData.weight) <= 0) {
      toast.error('Please enter a valid weight')
      return
    }
    try {
      setLoading(true)
      const response = await pricingApi.calculate(
        formData.market,
        parseFloat(formData.weight),
        {
          length: parseFloat(formData.length) || 0,
          width: parseFloat(formData.width) || 0,
          height: parseFloat(formData.height) || 0,
        },
        formData.shippingSpeed,
        formData.insurance
          ? { enabled: true, declaredValue: parseFloat(formData.declaredValue) || 0 }
          : { enabled: false },
        formData.electronics_item || null
      )
      if (response.data?.success && response.data?.pricing) {
        setResult(response.data.pricing)
      } else {
        toast.error('Unexpected response from pricing API')
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to calculate pricing')
    } finally {
      setLoading(false)
    }
  }

  const bd = result?.breakdown
  const sm = result?.summary || result
  const dimWeight = bd?.dimensional_weight
  const elec = bd?.electronics_handling

  return (
    <div className="relative min-h-screen bg-[#f8f9fa] py-12 px-4 overflow-hidden z-0">
      {/* ── Liquid Backgrounds (Blobs) ── */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-blue-400/20 rounded-full mix-blend-multiply filter blur-[100px] opacity-70 animate-morph pointer-events-none -z-10" />
      <div className="absolute top-[20%] right-[-10%] w-[40vw] h-[40vw] bg-orange-400/20 rounded-full mix-blend-multiply filter blur-[100px] opacity-70 animate-morph pointer-events-none -z-10" style={{ animationDelay: '2s' }} />
      <div className="absolute bottom-[-10%] left-[20%] w-[60vw] h-[60vw] bg-purple-400/20 rounded-full mix-blend-multiply filter blur-[100px] opacity-70 animate-morph pointer-events-none -z-10" style={{ animationDelay: '4s' }} />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header - Refined Typography */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-black text-[#1e3a5f] mb-4 tracking-tighter leading-none">
            {t('pricing.title')}
          </h1>
          <p className="text-gray-600/80 flex items-center justify-center gap-2 font-medium tracking-tight">
            <Calculator size={20} className="text-orange-500" />
            {t('pricing.description')}
          </p>
        </div>

        {/* ── Electronics Handling Fee Notice (Border Gradient) ── */}
        <div className="relative p-[1.5px] rounded-2xl bg-gradient-to-br from-amber-400/60 via-orange-300/40 to-amber-500/60 mb-8 overflow-hidden group shadow-lg">
          {/* Dynamic Sheen overlay on border */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent -translate-x-full group-hover:translate-x-[200%] transition-transform duration-[1500ms] ease-in-out pointer-events-none" />
          
          <div className="bg-white/60 backdrop-blur-2xl rounded-[14px] p-5">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="text-orange-600 flex-shrink-0 mt-0.5" size={24} />
              <div>
                <h2 className="font-black text-gray-900 text-lg mb-1 tracking-tight leading-none">
                  Electronics &amp; Special Handling
                </h2>
                <p className="text-sm text-gray-700/80 font-medium leading-relaxed">
                  Certain electronics carry an additional handling fee on top of the standard shipping
                  rate. If your shipment includes one of the items below, select it in the calculator
                  to include the correct handling fee in your estimate.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              {ELECTRONICS_GUIDE.map((item) => (
                <div key={item.key} className="bg-white/40 backdrop-blur-md border border-white/60 shadow-sm rounded-xl p-4 transition-transform hover:scale-[1.02]">
                  <p className="font-black text-gray-900 text-base tracking-tight leading-none mb-2">{item.label}</p>
                  <p className="text-orange-600 font-bold text-sm mb-2 bg-orange-100/50 inline-block px-2 py-1 rounded-md">£{item.fee_gbp} handling fee</p>
                  <p className="text-xs text-gray-600/90 leading-tight">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* ── Form Card (Crystal Borders & Interactive) ── */}
          <div className="bg-white/40 backdrop-blur-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[24px] p-8 relative group hover:[transform:perspective(1200px)_rotateX(1deg)_rotateY(-1deg)] transition-all duration-500 overflow-hidden">
            {/* Dynamic Sheen */}
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:translate-x-[200%] transition-transform duration-[2000ms] ease-in-out pointer-events-none" />
            
            <h2 className="text-3xl font-black text-[#1e3a5f] mb-8 tracking-tighter leading-none">{t('pricing.title')}</h2>
            
            <form onSubmit={handleCalculate} className="space-y-5 relative z-10">
              {/* Market */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2 tracking-tight">{t('pricing.market')}</label>
                <select
                  name="market"
                  value={formData.market}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-white/50 backdrop-blur-md border border-white/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/50 focus:bg-white transition-all shadow-sm"
                >
                  {markets.map((m) => (
                    <option key={m} value={m}>
                      {m === 'UK' ? 'United Kingdom' : m === 'USA' ? 'United States' : 'China'}
                    </option>
                  ))}
                </select>
                {currentRates && (
                  <p className="text-xs text-gray-500 font-medium mt-2">
                    Current rate for {formData.market}: £{currentRates[formData.market]?.toFixed(2) ?? '—'}/kg
                  </p>
                )}
              </div>

              {/* Electronics Item */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2 tracking-tight">
                  Electronics / Special Item <span className="text-gray-400 font-medium">(optional)</span>
                </label>
                <select
                  name="electronics_item"
                  value={formData.electronics_item}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-white/50 backdrop-blur-md border border-white/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/50 focus:bg-white transition-all shadow-sm"
                >
                  <option value="">— None / Standard shipment —</option>
                  {ELECTRONICS_GUIDE.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label} (+ £{item.fee_gbp} handling fee)
                    </option>
                  ))}
                </select>
                {formData.electronics_item && (
                  <div className="mt-2 text-xs font-medium text-orange-700 bg-orange-100/50 backdrop-blur-sm p-2 rounded-lg border border-orange-200/50">
                    ⚠ A £{ELECTRONICS_GUIDE.find((e) => e.key === formData.electronics_item)?.fee_gbp} handling fee will be added. Minimum chargeable weight: 1 kg.
                  </div>
                )}
              </div>

              {/* Weight */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2 tracking-tight">
                  {t('pricing.weight')} (kg) *
                </label>
                <input
                  type="number"
                  name="weight"
                  value={formData.weight}
                  onChange={handleChange}
                  step="0.1"
                  min="0.1"
                  required
                  className="w-full px-4 py-3 bg-white/50 backdrop-blur-md border border-white/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/50 focus:bg-white transition-all shadow-sm"
                />
              </div>

              {/* Dimensions */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2 tracking-tight">
                  {t('pricing.dimensions')} <span className="text-gray-400 font-medium">(cm)</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {['length','width','height'].map((dim) => (
                    <input
                      key={dim}
                      type="number"
                      name={dim}
                      placeholder={t(`pricing.${dim}`)}
                      value={formData[dim]}
                      onChange={handleChange}
                      step="0.1"
                      min="0"
                      className="w-full px-3 py-3 bg-white/50 backdrop-blur-md border border-white/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/50 focus:bg-white transition-all shadow-sm text-sm"
                    />
                  ))}
                </div>
              </div>

              {/* Shipping Speed */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-3 tracking-tight">{t('pricing.shipping')}</label>
                <div className="flex gap-6">
                  {shippingSpeeds.map((speed) => (
                    <label key={speed.value} className="flex items-center gap-3 cursor-pointer group/radio">
                      <div className="relative flex items-center justify-center">
                        <input
                          type="radio"
                          name="shippingSpeed"
                          value={speed.value}
                          checked={formData.shippingSpeed === speed.value}
                          onChange={handleChange}
                          className="peer sr-only"
                        />
                        <div className="w-5 h-5 rounded-full border-2 border-gray-300 peer-checked:border-[#1e3a5f] bg-white transition-colors"></div>
                        <div className="absolute w-2.5 h-2.5 rounded-full bg-[#1e3a5f] scale-0 peer-checked:scale-100 transition-transform"></div>
                      </div>
                      <span className="text-gray-800 font-medium group-hover/radio:text-[#1e3a5f] transition-colors">{speed.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Insurance */}
              <div className="pt-2">
                <label className="flex items-center gap-3 cursor-pointer group/check">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      name="insurance"
                      checked={formData.insurance}
                      onChange={handleChange}
                      className="peer sr-only"
                    />
                    <div className="w-5 h-5 rounded-md border-2 border-gray-300 peer-checked:border-[#1e3a5f] peer-checked:bg-[#1e3a5f] bg-white transition-colors flex items-center justify-center">
                      <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-gray-800 tracking-tight">{t('pricing.insurance')}</span>
                </label>
              </div>

              {formData.insurance && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="block text-sm font-bold text-gray-800 mb-2 tracking-tight">
                    {t('pricing.declaredValue')} <span className="text-gray-400 font-medium">(KES)</span>
                  </label>
                  <input
                    type="number"
                    name="declaredValue"
                    value={formData.declaredValue}
                    onChange={handleChange}
                    min="0"
                    className="w-full px-4 py-3 bg-white/50 backdrop-blur-md border border-white/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/50 focus:bg-white transition-all shadow-sm"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full relative overflow-hidden group bg-gradient-to-r from-[#1e3a5f] to-[#2a4d7a] text-white py-4 rounded-xl font-black text-lg tracking-tight transition-all hover:shadow-[0_10px_20px_-10px_rgba(30,58,95,0.5)] hover:-translate-y-0.5 disabled:opacity-50 mt-8 flex items-center justify-center gap-2 border border-white/10"
              >
                {/* Button Sheen */}
                <span className="absolute inset-0 w-full h-full -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:animate-[shimmer_1.5s_infinite] pointer-events-none transition-transform duration-1000 group-hover:translate-x-[200%]"></span>
                <Calculator size={22} className="relative z-10" />
                <span className="relative z-10">{loading ? t('common.loading') : t('pricing.calculate')}</span>
              </button>
            </form>
          </div>

          {/* ── Results Card (Dark Glass / Bento Evolution) ── */}
          <div className="h-full">
            {result ? (
              <div className="h-full bg-slate-900/80 backdrop-blur-3xl border border-slate-700/50 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-[24px] p-8 relative overflow-hidden group hover:[transform:perspective(1200px)_rotateX(1deg)_rotateY(1deg)] transition-all duration-500">
                {/* Dark Glass Orbs */}
                <div className="absolute -top-20 -right-20 w-64 h-64 bg-orange-500/20 rounded-full blur-[80px] pointer-events-none transition-transform group-hover:scale-110 duration-1000" />
                <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-500/20 rounded-full blur-[80px] pointer-events-none transition-transform group-hover:scale-110 duration-1000" />
                
                <div className="relative z-10 flex items-center gap-3 mb-8">
                  <CheckCircle className="text-orange-400" size={28} />
                  <h2 className="text-3xl font-black text-white tracking-tighter leading-none">{t('pricing.results')}</h2>
                </div>
                
                <div className="space-y-4 relative z-10">
                  {/* Weight Breakdown */}
                  {dimWeight && (
                    <div className="bg-slate-800/40 backdrop-blur-md border border-slate-700/50 rounded-xl p-5 transition-colors hover:bg-slate-800/60">
                      <p className="text-sm font-bold text-slate-300 mb-3 tracking-tight">Weight Calculation</p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 font-medium">Actual weight:</span>
                          <span className="font-bold text-white bg-slate-700/50 px-2 py-1 rounded-md">{dimWeight.actual_weight_kg} kg</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 font-medium">Volumetric weight:</span>
                          <span className="font-bold text-white bg-slate-700/50 px-2 py-1 rounded-md">{dimWeight.dimensional_weight_kg} kg</span>
                        </div>
                        <div className="flex justify-between items-center border-t border-slate-700 pt-3 mt-2">
                          <span className="text-orange-200 font-black tracking-tight">Chargeable weight:</span>
                          <span className="font-black text-orange-400 text-base">{dimWeight.chargeable_weight_kg} kg</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Base Shipping */}
                  <div className="flex justify-between items-center py-4 border-b border-slate-700/50 group/row hover:bg-slate-800/20 px-2 rounded-lg transition-colors -mx-2">
                    <div>
                      <span className="text-slate-200 font-bold tracking-tight">Base Shipping</span>
                      <p className="text-xs text-slate-400 mt-1 font-medium">{bd?.base_shipping?.description}</p>
                    </div>
                    <span className="font-black text-white text-lg tracking-tight">
                      KES {(bd?.base_shipping?.amount || 0).toLocaleString()}
                    </span>
                  </div>

                  {/* Electronics Handling Fee */}
                  {elec?.included && (
                    <div className="flex justify-between items-center py-4 border-b border-slate-700/50 group/row hover:bg-slate-800/20 px-2 rounded-lg transition-colors -mx-2">
                      <div>
                        <span className="text-slate-200 font-bold tracking-tight">Electronics Handling Fee</span>
                        <p className="text-xs text-slate-400 mt-1 font-medium">{elec.description}</p>
                      </div>
                      <span className="font-black text-orange-400 text-lg tracking-tight">
                        KES {(elec.amount || 0).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* General Handling Fee (non-electronics) */}
                  {!elec?.included && (bd?.handling_fee?.amount || 0) > 0 && (
                    <div className="flex justify-between items-center py-4 border-b border-slate-700/50 group/row hover:bg-slate-800/20 px-2 rounded-lg transition-colors -mx-2">
                      <div>
                        <span className="text-slate-200 font-bold tracking-tight">Handling Fee</span>
                        <p className="text-xs text-slate-400 mt-1 font-medium">{bd?.handling_fee?.description}</p>
                      </div>
                      <span className="font-black text-white text-lg tracking-tight">
                        KES {(bd?.handling_fee?.amount || 0).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* Insurance */}
                  {formData.insurance && (
                    <div className="flex justify-between items-center py-4 border-b border-slate-700/50 group/row hover:bg-slate-800/20 px-2 rounded-lg transition-colors -mx-2">
                      <span className="text-slate-200 font-bold tracking-tight">Insurance (3%)</span>
                      <span className="font-black text-white text-lg tracking-tight">
                        KES {(bd?.insurance?.amount || 0).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* Customs Estimate */}
                  {(bd?.customs_estimate?.amount || 0) > 0 && (
                    <div className="flex justify-between items-center py-4 border-b border-slate-700/50 group/row hover:bg-slate-800/20 px-2 rounded-lg transition-colors -mx-2">
                      <div>
                        <span className="text-slate-200 font-bold tracking-tight">Customs Estimate</span>
                        <p className="text-xs text-slate-400 mt-1 font-medium">VAT 16% + Duty 10% — estimate only</p>
                      </div>
                      <span className="font-black text-white text-lg tracking-tight">
                        KES {(bd?.customs_estimate?.amount || 0).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* Total */}
                  <div className="bg-gradient-to-br from-orange-500 to-orange-600 border border-orange-400/50 text-white rounded-2xl p-6 mt-6 shadow-[0_10px_30px_-10px_rgba(249,115,22,0.4)] relative overflow-hidden group/total">
                    {/* Sheen on Total */}
                    <span className="absolute inset-0 w-full h-full -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover/total:translate-x-[200%] transition-transform duration-[1500ms] ease-in-out pointer-events-none"></span>
                    
                    <p className="text-sm text-orange-100 font-bold mb-1 tracking-tight">{t('pricing.total')}</p>
                    <p className="text-4xl md:text-5xl font-black tracking-tighter leading-none mb-2 drop-shadow-sm">
                      KES {((sm?.total || result?.total) || 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-orange-100/90 font-medium bg-black/10 inline-block px-3 py-1.5 rounded-lg backdrop-blur-sm mt-2">
                      {(sm?.shipping_speed || result?.shipping_speed) === 'express' ? 'Express' : 'Economy'} shipping · {sm?.market || result?.market}
                    </p>
                  </div>

                  {/* Delivery time & disclaimer */}
                  <div className="bg-blue-900/30 border border-blue-500/30 backdrop-blur-sm rounded-xl p-5 flex gap-4 mt-6">
                    <Info className="text-blue-400 flex-shrink-0 mt-0.5" size={22} />
                    <div className="text-sm text-blue-200/90 space-y-2 font-medium leading-relaxed">
                      <p><strong className="text-blue-100">Estimated delivery:</strong> {result.notes?.delivery_time}</p>
                      <p className="text-xs text-blue-300/80">{result.notes?.disclaimer}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full bg-white/30 backdrop-blur-2xl border border-white/50 shadow-lg rounded-[24px] flex items-center justify-center p-8 relative overflow-hidden group hover:[transform:perspective(1200px)_rotateX(1deg)_rotateY(1deg)] transition-all duration-500">
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:translate-x-[200%] transition-transform duration-[2000ms] ease-in-out pointer-events-none" />
                <div className="text-center text-gray-500/80">
                  <Calculator size={56} className="mx-auto mb-6 opacity-40 text-[#1e3a5f]" />
                  <p className="font-bold text-gray-700 text-lg tracking-tight leading-none mb-2">Ready to Calculate</p>
                  <p className="text-sm font-medium">Fill out the form and click calculate to see your premium pricing</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
