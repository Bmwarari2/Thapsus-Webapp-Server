/**
 * ShippingRatesPanel – Admin component for viewing and updating per-kg shipping rates (GBP).
 * Import and render this inside AdminDashboard wherever rate management should live.
 *
 * Usage:
 *   import { ShippingRatesPanel } from '../components/ShippingRatesPanel'
 *   <ShippingRatesPanel />
 */
import React, { useState, useEffect } from 'react'
import { PoundSterling, Save, RefreshCw } from 'lucide-react'
import { adminApi } from '../api'
import toast from 'react-hot-toast'

const MARKETS = ['UK', 'USA', 'China']
const DEFAULT_RATES = { UK: 8, USA: 10, China: 6 }

export function ShippingRatesPanel() {
  const [rates, setRates] = useState({ ...DEFAULT_RATES })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadRates = async () => {
    setLoading(true)
    try {
      const res = await adminApi.getShippingRates()
      if (res.data?.success && res.data?.rates) {
        setRates((prev) => ({ ...prev, ...res.data.rates }))
      }
    } catch {
      toast.error('Failed to load shipping rates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadRates() }, [])

  const handleChange = (market, value) => {
    setRates((prev) => ({ ...prev, [market]: value }))
  }

  const handleSave = async () => {
    const parsed = {}
    for (const market of MARKETS) {
      const v = parseFloat(rates[market])
      if (isNaN(v) || v <= 0) {
        toast.error(`Invalid rate for ${market}`)
        return
      }
      parsed[market] = v
    }
    setSaving(true)
    try {
      await adminApi.setShippingRates(parsed)
      toast.success('Shipping rates updated successfully')
      await loadRates()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update shipping rates')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <PoundSterling className="text-[#1e3a5f]" size={22} />
          <h3 className="font-bold text-[#1e3a5f] text-lg">Shipping Rates (£/kg)</h3>
        </div>
        <button
          onClick={loadRates}
          disabled={loading}
          className="text-gray-500 hover:text-[#1e3a5f] transition-colors"
          title="Refresh rates"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-5">
        Set the per-kg shipping rate in GBP for each origin market. Changes take effect immediately
        for all new orders and pricing calculations.
      </p>

      <div className="space-y-3">
        {MARKETS.map((market) => (
          <div key={market} className="flex items-center gap-4">
            <label className="w-20 text-sm font-medium text-gray-700">{market}</label>
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">£</span>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={rates[market] ?? ''}
                onChange={(e) => handleChange(market, e.target.value)}
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
              />
            </div>
            <span className="text-xs text-gray-400">/kg</span>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving || loading}
        className="mt-5 w-full flex items-center justify-center gap-2 bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50"
      >
        <Save size={16} />
        {saving ? 'Saving…' : 'Save Rates'}
      </button>

      {/* Electronics fee reference */}
      <div className="mt-5 border-t pt-4">
        <p className="text-xs font-semibold text-gray-600 mb-2">Electronics Handling Fees (fixed)</p>
        <div className="space-y-1 text-xs text-gray-500">
          <div className="flex justify-between"><span>Phone</span><span className="font-medium">£75 + weight</span></div>
          <div className="flex justify-between"><span>Laptop / Accessories</span><span className="font-medium">£65 + weight</span></div>
          <div className="flex justify-between"><span>TV / Screen / Monitor</span><span className="font-medium">£65 + weight &amp; dims</span></div>
        </div>
        <p className="text-xs text-gray-400 mt-2">These flat fees are fixed and cannot be changed here. All items have a 1 kg minimum chargeable weight.</p>
      </div>
    </div>
  )
}

export default ShippingRatesPanel
