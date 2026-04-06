import React, { useState, useEffect } from 'react'

export function ShippingRatesPanel() {
  const [rates, setRates] = useState({
    standard_per_kg: '',
    express_per_kg: '',
    economy_per_kg: '',
    base_fee: '',
    fuel_surcharge_pct: '',
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    fetch('/api/admin/shipping-rates', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setRates((prev) => ({ ...prev, ...data })))
      .catch(() => {})
  }, [])

  const handleChange = (e) => {
    setRates({ ...rates, [e.target.name]: e.target.value })
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/shipping-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(rates),
      })
      if (!res.ok) throw new Error('Failed to save rates')
      setMessage({ type: 'success', text: 'Shipping rates updated successfully.' })
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  const fields = [
    { name: 'standard_per_kg', label: 'Standard Rate (£/kg)' },
    { name: 'express_per_kg',  label: 'Express Rate (£/kg)' },
    { name: 'economy_per_kg',  label: 'Economy Rate (£/kg)' },
    { name: 'base_fee',        label: 'Base Handling Fee (£)' },
    { name: 'fuel_surcharge_pct', label: 'Fuel Surcharge (%)' },
  ]

  return (
    <div>
      <h2 className="text-lg font-semibold text-[#1e3a5f] mb-1">Shipping Rates</h2>
      <p className="text-sm text-gray-500 mb-5">
        Adjust per-kg rates and surcharges applied across all shipping calculations.
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

      <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(({ name, label }) => (
          <div key={name} className="flex flex-col gap-1">
            <label htmlFor={name} className="text-sm font-medium text-gray-700">
              {label}
            </label>
            <input
              id={name}
              name={name}
              type="number"
              step="0.01"
              min="0"
              value={rates[name]}
              onChange={handleChange}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
              placeholder="0.00"
            />
          </div>
        ))}

        <div className="sm:col-span-2 lg:col-span-3 flex justify-end mt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#1e3a5f] hover:bg-[#152d4a] text-white text-sm font-bold px-6 py-2 rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save Rates'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ShippingRatesPanel
