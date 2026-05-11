import React, { useState, useEffect } from 'react'
import { pricingApi } from '../api'

/**
 * Edit the single global `base_shipping_per_kg` in `pricing_settings`.
 * Replaced the legacy per-market shipping_rates panel after the UK-only
 * migration retired the shipping_rates table — this is now a thin wrapper
 * over `GET/PUT /api/pricing/settings`. We deliberately don't expose the
 * other pricing-settings knobs (base_handling_fee, card_processing_pct,
 * dim_divisor) here so a misclick can't flip them while editing the
 * headline £/kg figure.
 */
export function ShippingRatesPanel() {
  const [rateGbp, setRateGbp] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    pricingApi.getSettings()
      .then((res) => {
        const v = res.data?.settings?.base_shipping_per_kg
        if (typeof v === 'number') setRateGbp(String(v))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const value = parseFloat(rateGbp)
      if (!Number.isFinite(value) || value <= 0) {
        setMessage({ type: 'error', text: 'Rate must be a positive number.' })
        setSaving(false)
        return
      }
      await pricingApi.updateSettings({ base_shipping_per_kg: value })
      setMessage({ type: 'success', text: 'UK rate updated.' })
    } catch (err) {
      setMessage({
        type: 'error',
        text: err?.response?.data?.message || err.message || 'Failed to save rate',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-[#1e3a5f] mb-1">Shipping Rate</h2>
      <p className="text-sm text-gray-500 mb-5">
        Single £/kg charged on every shipment. Applies to the price calculator, order quotes, and invoice prefills.
      </p>
      {message && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}
      <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="base_shipping_per_kg" className="text-sm font-medium text-gray-700">
            UK Rate (£/kg)
          </label>
          <input
            id="base_shipping_per_kg"
            name="base_shipping_per_kg"
            type="number"
            step="0.01"
            min="0"
            value={rateGbp}
            onChange={(e) => setRateGbp(e.target.value)}
            disabled={loading}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
            placeholder="0.00"
          />
        </div>
        <div className="sm:col-span-3 flex justify-end mt-2">
          <button
            type="submit"
            disabled={saving || loading}
            className="bg-[#1e3a5f] hover:bg-[#152d4a] text-white text-sm font-bold px-6 py-2 rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save Rate'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ShippingRatesPanel
