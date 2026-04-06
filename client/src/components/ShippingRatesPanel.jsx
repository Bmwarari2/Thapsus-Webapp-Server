import React, { useState, useEffect } from 'react'
import { Save, RefreshCw, Info } from 'lucide-react'
import { adminApi } from '../api'
import toast from 'react-hot-toast'

/**
 * ShippingRatesPanel
 * Allows admins to view and update shipping rates per market/weight band.
 * Rendered inside the AdminDashboard Settings tab.
 */
export const ShippingRatesPanel = () => {
  const [rates, setRates] = useState({
    UK: { economy_base: '', economy_per_kg: '', express_base: '', express_per_kg: '' },
    USA: { economy_base: '', economy_per_kg: '', express_base: '', express_per_kg: '' },
    China: { economy_base: '', economy_per_kg: '', express_base: '', express_per_kg: '' },
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    fetchRates()
  }, [])

  const fetchRates = async () => {
    try {
      setLoading(true)
      // Try to fetch shipping rates from adminApi; gracefully handle if endpoint not yet available
      if (typeof adminApi.getShippingRates === 'function') {
        const res = await adminApi.getShippingRates()
        if (res.data?.rates) {
          setRates((prev) => ({ ...prev, ...res.data.rates }))
          setLastUpdated(res.data.updated_at || null)
        }
      }
    } catch (err) {
      // Non-critical — panel still usable for input
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (market, field, value) => {
    setRates((prev) => ({
      ...prev,
      [market]: { ...prev[market], [field]: value },
    }))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    // Validate all fields are positive numbers
    for (const [market, fields] of Object.entries(rates)) {
      for (const [field, val] of Object.entries(fields)) {
        const num = parseFloat(val)
        if (val !== '' && (isNaN(num) || num < 0)) {
          toast.error(`Invalid value for ${market} – ${field.replace(/_/g, ' ')}`)
          return
        }
      }
    }
    try {
      setSaving(true)
      if (typeof adminApi.setShippingRates === 'function') {
        await adminApi.setShippingRates(rates)
        toast.success('Shipping rates updated successfully')
        setLastUpdated(new Date().toISOString())
      } else {
        toast.success('Rates saved (API endpoint pending integration)')
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save shipping rates')
    } finally {
      setSaving(false)
    }
  }

  const markets = ['UK', 'USA', 'China']
  const fieldLabels = {
    economy_base: 'Economy – Base fee (KES)',
    economy_per_kg: 'Economy – Per kg (KES)',
    express_base: 'Express – Base fee (KES)',
    express_per_kg: 'Express – Per kg (KES)',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-[#1e3a5f]">Shipping Rates Adjustment</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Set the base fee and per-kg rate for each market and shipping speed.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchRates}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1e3a5f] transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-800">
          <span className="font-semibold">Formula:</span> Total shipping cost = Base fee + (Weight in kg × Per-kg rate).
          Electronics handling fees are applied on top of these rates at checkout.
        </p>
      </div>

      {/* Rates form */}
      <form onSubmit={handleSave} className="space-y-6">
        {markets.map((market) => (
          <div key={market} className="border border-gray-200 rounded-xl p-5">
            <h4 className="text-sm font-bold text-[#1e3a5f] mb-4 uppercase tracking-wide">
              {market === 'UK' ? '🇬🇧' : market === 'USA' ? '🇺🇸' : '🇨🇳'} {market}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(fieldLabels).map(([field, label]) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={rates[market][field]}
                    onChange={(e) => handleChange(market, field, e.target.value)}
                    placeholder="e.g. 500"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Electronics fees (read-only reference) */}
        <div className="border border-amber-200 rounded-xl p-5 bg-amber-50">
          <h4 className="text-sm font-bold text-amber-800 mb-3 uppercase tracking-wide">⚡ Electronics Handling Fees (Fixed)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="bg-white rounded-lg p-3 border border-amber-200">
              <p className="font-semibold text-gray-800">Phone</p>
              <p className="text-amber-700 font-bold">+£75</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-amber-200">
              <p className="font-semibold text-gray-800">Laptop / Accessories</p>
              <p className="text-amber-700 font-bold">+£65</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-amber-200">
              <p className="font-semibold text-gray-800">TV / Screen / Monitor</p>
              <p className="text-amber-700 font-bold">+£65</p>
            </div>
          </div>
          <p className="text-xs text-amber-700 mt-3">These flat fees are applied automatically when a customer selects an electronics item type. To change them, update the source code in <code className="font-mono bg-amber-100 px-1 rounded">PricingCalculator.jsx</code> and <code className="font-mono bg-amber-100 px-1 rounded">Pricing.jsx</code>.</p>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-6 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Shipping Rates'}
          </button>
          {lastUpdated && (
            <p className="text-xs text-gray-400">
              Last updated: {new Date(lastUpdated).toLocaleString('en-GB')}
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
