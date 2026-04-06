import React, { useState } from 'react'
import { pricingApi } from '../api'
import { Calculator, Package, Zap, Shield, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * Pricing page – public-facing shipping cost calculator.
 * Includes electronics handling fee selector and info banner.
 */
const ELECTRONICS_FEES = {
  '': 0,
  phone: 75,
  laptop: 65,
  tv_monitor: 65,
}

const ELECTRONICS_LABELS = {
  '': 'None (standard item)',
  phone: 'Phone (+£75 handling fee)',
  laptop: 'Laptop / Accessories (+£65 handling fee)',
  tv_monitor: 'TV / Screen / Monitor (+£65 handling fee)',
}

export const Pricing = () => {
  const [form, setForm] = useState({
    weight_kg: '',
    market: 'UK',
    shipping_speed: 'economy',
    insurance: false,
    declared_value: '',
  })
  const [electronicsItem, setElectronicsItem] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setResult(null)
  }

  const handleCalculate = async (e) => {
    e.preventDefault()
    const weight = parseFloat(form.weight_kg)
    if (!weight || weight <= 0) {
      toast.error('Please enter a valid weight')
      return
    }
    try {
      setLoading(true)
      const payload = {
        weight_kg: weight,
        market: form.market,
        shipping_speed: form.shipping_speed,
        insurance: form.insurance,
        declared_value: form.insurance ? parseFloat(form.declared_value) || 0 : 0,
        electronics_item: electronicsItem || undefined,
      }
      // pricingApi.calculate may not exist yet — gracefully compute client-side estimate
      let estimate = null
      if (typeof pricingApi?.calculate === 'function') {
        const res = await pricingApi.calculate(payload)
        estimate = res.data
      } else {
        // Client-side fallback estimate
        const baseRates = { UK: 500, USA: 700, China: 400 }
        const perKgRates = { UK: 350, USA: 450, China: 280 }
        const speedMultiplier = form.shipping_speed === 'express' ? 1.6 : 1
        const electronicsFeeGBP = ELECTRONICS_FEES[electronicsItem] || 0
        const electronicsFeeKES = electronicsFeeGBP * 160 // approx 1 GBP ≈ 160 KES
        const base = (baseRates[form.market] + perKgRates[form.market] * weight) * speedMultiplier
        const insurance = form.insurance ? (parseFloat(form.declared_value) || 0) * 0.02 : 0
        estimate = {
          estimated_cost_kes: Math.round(base + electronicsFeeKES + insurance),
          electronics_fee_gbp: electronicsFeeGBP,
          breakdown: {
            base_shipping: Math.round(base),
            electronics_handling: Math.round(electronicsFeeKES),
            insurance: Math.round(insurance),
          },
          note: 'Indicative estimate — final cost confirmed once parcel is received at warehouse.',
        }
      }
      setResult(estimate)
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to calculate — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Page header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[#1e3a5f] mb-2">Shipping Price Calculator</h1>
          <p className="text-gray-600">Get an instant estimate for shipping your parcel from the UK, USA, or China to Kenya.</p>
        </div>

        {/* ── Electronics & Device Handling Fees banner ── */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="font-semibold text-amber-800 mb-1">⚡ Electronics &amp; Device Handling Fees</p>
          <p className="text-sm text-amber-700">
            Phones, laptops, and screens require specialist handling and incur a flat fee on top of standard shipping.
            Select your item type below to include this in your estimate.
          </p>
        </div>

        {/* ── Calculator form ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8">
          <form onSubmit={handleCalculate} className="space-y-5">

            {/* Market */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Shipping from</label>
              <select
                value={form.market}
                onChange={(e) => handleChange('market', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
              >
                <option value="UK">🇬🇧 United Kingdom</option>
                <option value="USA">🇺🇸 United States</option>
                <option value="China">🇨🇳 China</option>
              </select>
            </div>

            {/* Weight */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Parcel weight (kg)</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={form.weight_kg}
                onChange={(e) => handleChange('weight_kg', e.target.value)}
                placeholder="e.g. 2.5"
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
              />
            </div>

            {/* Shipping speed */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Shipping speed</label>
              <div className="grid grid-cols-2 gap-3">
                {['economy', 'express'].map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => handleChange('shipping_speed', speed)}
                    className={`flex flex-col items-center gap-1 border-2 rounded-xl py-3 px-4 transition-colors ${
                      form.shipping_speed === speed
                        ? 'border-[#1e3a5f] bg-[#1e3a5f]/5 text-[#1e3a5f]'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {speed === 'economy' ? <Package size={20} /> : <Zap size={20} />}
                    <span className="text-sm font-semibold capitalize">{speed}</span>
                    <span className="text-xs text-gray-500">{speed === 'economy' ? '7–14 days' : '3–5 days'}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Electronics item selector */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Item type <span className="text-gray-400 font-normal">(electronics handling)</span>
              </label>
              <div className="relative">
                <select
                  value={electronicsItem}
                  onChange={(e) => { setElectronicsItem(e.target.value); setResult(null) }}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                >
                  <option value="">None (standard item)</option>
                  <option value="phone">Phone (+£75 handling fee)</option>
                  <option value="laptop">Laptop / Accessories (+£65 handling fee)</option>
                  <option value="tv_monitor">TV / Screen / Monitor (+£65 handling fee)</option>
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              {electronicsItem && (
                <p className="mt-1 text-xs text-amber-700 font-medium">
                  +£{ELECTRONICS_FEES[electronicsItem]} electronics handling fee will be added to your estimate.
                </p>
              )}
            </div>

            {/* Insurance */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="insurance"
                checked={form.insurance}
                onChange={(e) => handleChange('insurance', e.target.checked)}
                className="mt-1 w-4 h-4 cursor-pointer"
              />
              <div className="flex-1">
                <label htmlFor="insurance" className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 cursor-pointer">
                  <Shield size={14} />
                  Add shipment insurance
                </label>
                {form.insurance && (
                  <input
                    type="number"
                    min="0"
                    value={form.declared_value}
                    onChange={(e) => handleChange('declared_value', e.target.value)}
                    placeholder="Declared value (KES)"
                    className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
            >
              <Calculator size={18} />
              {loading ? 'Calculating...' : 'Calculate Shipping Cost'}
            </button>
          </form>

          {/* ── Result ── */}
          {result && (
            <div className="mt-6 border-t border-gray-100 pt-6">
              <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">Estimate</h3>
              <div className="bg-[#1e3a5f]/5 rounded-xl p-5">
                <p className="text-3xl font-bold text-[#1e3a5f]">
                  KES {(result.estimated_cost_kes || 0).toLocaleString()}
                </p>
                {result.electronics_fee_gbp > 0 && (
                  <p className="text-sm text-amber-700 font-medium mt-1">
                    Includes £{result.electronics_fee_gbp} electronics handling fee
                  </p>
                )}
                {result.breakdown && (
                  <div className="mt-3 space-y-1 text-xs text-gray-500">
                    {result.breakdown.base_shipping > 0 && (
                      <div className="flex justify-between">
                        <span>Base shipping</span>
                        <span>KES {result.breakdown.base_shipping.toLocaleString()}</span>
                      </div>
                    )}
                    {result.breakdown.electronics_handling > 0 && (
                      <div className="flex justify-between text-amber-700">
                        <span>Electronics handling</span>
                        <span>KES {result.breakdown.electronics_handling.toLocaleString()}</span>
                      </div>
                    )}
                    {result.breakdown.insurance > 0 && (
                      <div className="flex justify-between">
                        <span>Insurance</span>
                        <span>KES {result.breakdown.insurance.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
                {result.note && (
                  <p className="mt-3 text-xs text-gray-400 italic">{result.note}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Rate cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[{ flag: '🇬🇧', label: 'United Kingdom', economy: '7–14 days', express: '3–5 days' },
            { flag: '🇺🇸', label: 'United States', economy: '10–18 days', express: '5–7 days' },
            { flag: '🇨🇳', label: 'China', economy: '14–21 days', express: '7–10 days' }].map((m) => (
            <div key={m.label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <p className="text-2xl mb-1">{m.flag}</p>
              <p className="font-bold text-[#1e3a5f] text-sm">{m.label}</p>
              <p className="text-xs text-gray-500 mt-1">Economy: {m.economy}</p>
              <p className="text-xs text-gray-500">Express: {m.express}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Pricing
