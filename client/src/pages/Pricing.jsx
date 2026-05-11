import React, { useEffect, useState } from 'react'
import { pricingApi } from '../api'

/**
 * Pricing engine outputs GBP, customer sees KES. We fetch the live GBP→KES
 * rate from /api/exchange/rates once on mount; if it fails the calculator
 * falls back to displaying £ so a missing FX row doesn't break quotes.
 */
function formatKes(gbp, rate) {
  if (!Number.isFinite(rate) || rate <= 0) {
    return `£${Number(gbp).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return `KES ${Math.round(gbp * rate).toLocaleString()}`
}

const ELECTRONICS_FEES = {
  phone:      { label: 'Phone (+£75 handling fee)',                fee: 75 },
  laptop:     { label: 'Laptop / Accessories (+£65 handling fee)', fee: 65 },
  tv_monitor: { label: 'TV / Screen / Monitor (+£65 handling fee)', fee: 65 },
}

const MARKETS = ['UK', 'China']

export default function Pricing() {
  const [form, setForm] = useState({
    market:          'UK',
    weight_kg:       '',
    length:          '',
    width:           '',
    height:          '',
    shipping_speed:  'economy',
    insurance:       false,
    declared_value:  '',
    electronicsItem: '',
  })
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  // Live GBP→KES rate, fetched once on mount. We only need to refresh on
  // page load — the rate moves day-to-day at most, and a stale rate is
  // strictly safer than a missing one (calculator falls back to £).
  const [gbpToKes, setGbpToKes] = useState(null)

  useEffect(() => {
    pricingApi.getExchangeRates()
      .then((r) => setGbpToKes(Number(r.data?.data?.GBP_KES) || null))
      .catch(() => setGbpToKes(null))
  }, [])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value })
    setResult(null)
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const dimensions = {
        length: parseFloat(form.length) || 0,
        width:  parseFloat(form.width)  || 0,
        height: parseFloat(form.height) || 0,
      }
      const res = await pricingApi.calculate(
        form.market,
        parseFloat(form.weight_kg),
        dimensions,
        form.shipping_speed,
        form.insurance,
        parseFloat(form.declared_value) || 0,
        form.electronicsItem || null,
      )
      setResult(res.data.pricing)
    } catch (err) {
      setError(
        err?.response?.data?.error ||
        err.message ||
        'Unable to calculate price. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const electronicsFee = form.electronicsItem
    ? ELECTRONICS_FEES[form.electronicsItem]?.fee ?? 0
    : 0

  return (
    <div className="min-h-screen relative bg-slate-50 overflow-hidden py-12 px-4 font-sans">
      {/* Liquid Backgrounds */}
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-blue-300/30 rounded-full blur-[100px] animate-morph mix-blend-multiply pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-orange-300/20 rounded-full blur-[100px] animate-morph mix-blend-multiply pointer-events-none" />
      <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[40vw] h-[40vw] max-w-[400px] max-h-[400px] bg-indigo-200/20 rounded-full blur-[120px] animate-morph mix-blend-multiply pointer-events-none" />

      <div className="max-w-2xl mx-auto relative z-10">

        {/* Page header - Refined Typography */}
        <div className="mb-10 text-center">
          <h1 className="text-4xl md:text-5xl font-black text-[#1e3a5f] mb-3 leading-none tracking-tighter">Shipping Calculator</h1>
          <p className="mt-2 text-slate-600 font-medium text-lg">
            Get an instant estimate for your shipment — including any specialist handling fees.
          </p>
        </div>

        {/* Electronics info banner - Border Gradient Bento */}
        <div className="rounded-2xl p-[1px] bg-gradient-to-br from-amber-300/60 via-white/20 to-orange-300/60 mb-8 shadow-lg transform transition-transform hover:scale-[1.01] duration-500">
          <div className="bg-white/60 backdrop-blur-3xl rounded-[15px] p-6 relative overflow-hidden glass-sheen">
            <div className="absolute top-0 right-0 w-40 h-40 bg-amber-400/10 rounded-full blur-[40px] pointer-events-none" />
            <p className="font-black text-amber-800 tracking-tight text-lg mb-2 relative z-10">Electronics &amp; Device Handling Fees</p>
            <p className="text-sm font-medium text-amber-900/80 leading-relaxed relative z-10">
              Phones, laptops, and screens require specialist handling and incur a flat fee on top of
              standard shipping. Select your item type below to include this in your estimate.
            </p>
          </div>
        </div>

        {/* Calculator form - Crystal Borders & Dynamic Sheen */}
        <form
          onSubmit={handleSubmit}
          className="bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-6 md:p-8 space-y-6 relative overflow-hidden glass-sheen"
        >
          {/* Market */}
          <div className="flex flex-col gap-2 relative z-10">
            <label htmlFor="market" className="block text-xs font-bold uppercase tracking-widest text-slate-500">Shipping Market</label>
            <select
              id="market"
              name="market"
              value={form.market}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-slate-800 font-bold transition-all shadow-sm appearance-none cursor-pointer hover:bg-white/60"
            >
              {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Weight */}
          <div className="flex flex-col gap-2 relative z-10">
            <label htmlFor="weight_kg" className="block text-xs font-bold uppercase tracking-widest text-slate-500">Weight (kg)</label>
            <input
              id="weight_kg"
              name="weight_kg"
              type="number"
              step="0.1"
              min="0.1"
              required
              value={form.weight_kg}
              onChange={handleChange}
              placeholder="e.g. 2.5"
              className="w-full px-4 py-3 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-slate-800 font-bold transition-all placeholder-slate-400 shadow-sm hover:bg-white/60"
            />
          </div>

          {/* Dimensions */}
          <div className="relative z-10">
            <p className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
              Dimensions (cm) <span className="text-slate-400 font-semibold tracking-normal normal-case">— optional</span>
            </p>
            <div className="grid grid-cols-3 gap-4">
              {['length', 'width', 'height'].map((dim) => (
                <div key={dim} className="flex flex-col gap-2">
                  <label htmlFor={dim} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{dim}</label>
                  <input
                    id={dim}
                    name={dim}
                    type="number"
                    step="0.1"
                    min="0"
                    value={form[dim]}
                    onChange={handleChange}
                    placeholder="0"
                    className="w-full px-4 py-3 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-slate-800 font-bold transition-all placeholder-slate-400 shadow-sm text-center hover:bg-white/60"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Service tier */}
          <div className="flex flex-col gap-2 relative z-10">
            <label htmlFor="shipping_speed" className="block text-xs font-bold uppercase tracking-widest text-slate-500">Service Type</label>
            <select
              id="shipping_speed"
              name="shipping_speed"
              value={form.shipping_speed}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-slate-800 font-bold transition-all shadow-sm appearance-none cursor-pointer hover:bg-white/60"
            >
              <option value="economy">Economy</option>
              <option value="express">Express</option>
            </select>
          </div>

          {/* Insurance Checkbox */}
          <label className="group flex items-center gap-3 cursor-pointer p-4 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl hover:bg-white/70 transition-all shadow-sm relative z-10">
            <input
              type="checkbox"
              name="insurance"
              checked={form.insurance}
              onChange={handleChange}
              className="w-5 h-5 accent-orange-500 rounded cursor-pointer transition-transform group-hover:scale-110"
            />
            <span className="font-bold text-slate-700 tracking-tight">Include insurance coverage</span>
          </label>
          
          {form.insurance && (
            <div className="flex flex-col gap-2 relative z-10 animate-fade-in">
              <label htmlFor="declared_value" className="block text-xs font-bold uppercase tracking-widest text-slate-500">Declared Value (£)</label>
              <input
                id="declared_value"
                name="declared_value"
                type="number"
                min="0"
                value={form.declared_value}
                onChange={handleChange}
                placeholder="e.g. 50000"
                className="w-full px-4 py-3 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-slate-800 font-bold transition-all placeholder-slate-400 shadow-sm hover:bg-white/60"
              />
            </div>
          )}

          {/* Electronics item dropdown */}
          <div className="flex flex-col gap-2 relative z-10">
            <label htmlFor="electronicsItem" className="block text-xs font-bold uppercase tracking-widest text-slate-500">
              Electronic Item Type
            </label>
            <select
              id="electronicsItem"
              name="electronicsItem"
              value={form.electronicsItem}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-slate-800 font-bold transition-all shadow-sm appearance-none cursor-pointer hover:bg-white/60"
            >
              <option value="">None (standard item)</option>
              <option value="phone">Phone (+£75 handling fee)</option>
              <option value="laptop">Laptop / Accessories (+£65 handling fee)</option>
              <option value="tv_monitor">TV / Screen / Monitor (+£65 handling fee)</option>
            </select>
            {electronicsFee > 0 && (
              <div className="mt-2 p-3 bg-amber-50/50 border border-amber-200/50 rounded-lg backdrop-blur-sm">
                <p className="text-xs font-bold text-amber-700 flex items-center gap-2">
                  <span className="text-lg leading-none">⚠️</span> 
                  A flat £{electronicsFee} specialist handling fee will be added to your estimate.
                </p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group relative overflow-hidden w-full bg-[#1e3a5f] hover:bg-[#152d4a] text-white font-black tracking-tight py-4 rounded-xl text-lg disabled:opacity-50 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 glass-sheen mt-4 z-10"
          >
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
            <span className="relative z-10">{loading ? 'Calculating…' : 'Get Estimate'}</span>
          </button>
        </form>

        {/* Error - Frosted Red */}
        {error && (
          <div className="mt-6 p-4 bg-red-50/80 backdrop-blur-md border border-red-200/60 rounded-xl shadow-sm relative z-10">
            <p className="text-red-700 font-bold text-sm tracking-tight">{error}</p>
          </div>
        )}

        {/* Result - Dark Glass Bento & Interactive Element */}
        {result && (
          <div className="group relative overflow-hidden bg-[#0f172a]/80 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 md:p-8 text-white shadow-2xl mt-8 transition-transform duration-500 hover:-rotate-1 hover:scale-[1.02] transform perspective-1000 glass-sheen">
            {/* Blurred Orange Orb inside Dark Glass */}
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-orange-500/30 rounded-full blur-[70px] pointer-events-none" />

            <div className="relative z-10">
              <h2 className="text-2xl font-black tracking-tighter leading-none mb-6">Your Estimate</h2>

              <div className="space-y-4">
                {result.breakdown?.base_shipping?.amount != null && (
                  <div className="flex justify-between items-center border-b border-white/10 pb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Base shipping cost</span>
                    <span className="text-lg font-bold text-slate-300 tracking-tight">{formatKes(result.breakdown.base_shipping.amount, gbpToKes)}</span>
                  </div>
                )}
                {result.breakdown?.handling_fee?.amount > 0 && (
                  <div className="flex justify-between items-center border-b border-white/10 pb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Handling &amp; processing</span>
                    <span className="text-lg font-bold text-slate-300 tracking-tight">{formatKes(result.breakdown.handling_fee.amount, gbpToKes)}</span>
                  </div>
                )}
                {result.breakdown?.electronics_handling?.included && result.breakdown?.electronics_handling?.amount > 0 && (
                  <div className="flex justify-between items-center border-b border-white/10 pb-3">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Electronics handling fee</span>
                    <span className="text-lg font-bold text-amber-400 tracking-tight">{formatKes(result.breakdown.electronics_handling.amount, gbpToKes)}</span>
                  </div>
                )}
                {result.breakdown?.insurance?.included && result.breakdown?.insurance?.amount > 0 && (
                  <div className="flex justify-between items-center border-b border-white/10 pb-3">
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Insurance (3%)</span>
                    <span className="text-lg font-bold text-blue-300 tracking-tight">{formatKes(result.breakdown.insurance.amount, gbpToKes)}</span>
                  </div>
                )}
                {result.breakdown?.customs_estimate?.amount > 0 && (
                  <div className="flex justify-between items-center border-b border-white/10 pb-3">
                    <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">Customs estimate (VAT+Duty)</span>
                    <span className="text-lg font-bold text-purple-300 tracking-tight">{formatKes(result.breakdown.customs_estimate.amount, gbpToKes)}</span>
                  </div>
                )}

                {result.total != null && (
                  <div className="bg-gradient-to-br from-orange-500/20 to-red-600/10 rounded-xl p-5 border border-orange-500/30 backdrop-blur-md mt-6 flex justify-between items-center">
                    <div>
                      <span className="text-sm font-bold text-orange-300 uppercase tracking-widest block">Total estimate</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{result.notes?.delivery_time}</span>
                    </div>
                    <span className="text-3xl font-black text-orange-400 tracking-tighter">
                      {formatKes(result.total, gbpToKes)}
                    </span>
                  </div>
                )}

                {result.breakdown?.dimensional_weight && (
                  <div className="flex justify-between items-center bg-white/5 rounded-xl p-4 border border-white/10 backdrop-blur-sm mt-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Chargeable weight</span>
                    <span className="text-sm font-bold text-white tracking-tight">{Number(result.breakdown.dimensional_weight.chargeable_kg ?? 0).toFixed(2)} kg</span>
                  </div>
                )}
              </div>

              <p className="mt-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                * This is an estimate only. Final charges may vary based on actual weight, dimensions,
                and customs requirements upon warehouse arrival.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
