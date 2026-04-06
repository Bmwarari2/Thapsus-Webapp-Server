import React, { useState } from 'react'
import { pricingApi } from '../api'

const ELECTRONICS_FEES = {
  phone:      { label: 'Phone (+£75 handling fee)',                fee: 75 },
  laptop:     { label: 'Laptop / Accessories (+£65 handling fee)', fee: 65 },
  tv_monitor: { label: 'TV / Screen / Monitor (+£65 handling fee)', fee: 65 },
}

const MARKETS = ['UK', 'USA', 'China']

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
        form.electronicsItem || null,
      )
      setResult(res.data)
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
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Page header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-[#1e3a5f]">Shipping Price Calculator</h1>
          <p className="mt-2 text-gray-500">
            Get an instant estimate for your shipment — including any specialist handling fees.
          </p>
        </div>

        {/* Electronics info banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="font-semibold text-amber-800">Electronics &amp; Device Handling Fees</p>
          <p className="mt-1 text-sm text-amber-700">
            Phones, laptops, and screens require specialist handling and incur a flat fee on top of
            standard shipping. Select your item type below to include this in your estimate.
          </p>
        </div>

        {/* Calculator form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5"
        >
          {/* Market */}
          <div className="flex flex-col gap-1">
            <label htmlFor="market" className="text-sm font-medium text-gray-700">Shipping Market</label>
            <select
              id="market"
              name="market"
              value={form.market}
              onChange={handleChange}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
            >
              {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Weight */}
          <div className="flex flex-col gap-1">
            <label htmlFor="weight_kg" className="text-sm font-medium text-gray-700">Weight (kg)</label>
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
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
            />
          </div>

          {/* Dimensions */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Dimensions (cm) <span className="text-gray-400 font-normal">— optional</span></p>
            <div className="grid grid-cols-3 gap-3">
              {['length', 'width', 'height'].map((dim) => (
                <div key={dim} className="flex flex-col gap-1">
                  <label htmlFor={dim} className="text-xs text-gray-500 capitalize">{dim}</label>
                  <input
                    id={dim}
                    name={dim}
                    type="number"
                    step="0.1"
                    min="0"
                    value={form[dim]}
                    onChange={handleChange}
                    placeholder="0"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Service tier */}
          <div className="flex flex-col gap-1">
            <label htmlFor="shipping_speed" className="text-sm font-medium text-gray-700">Service Type</label>
            <select
              id="shipping_speed"
              name="shipping_speed"
              value={form.shipping_speed}
              onChange={handleChange}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
            >
              <option value="economy">Economy</option>
              <option value="express">Express</option>
            </select>
          </div>

          {/* Insurance */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="insurance"
              checked={form.insurance}
              onChange={handleChange}
              className="w-4 h-4 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]"
            />
            <span className="text-sm text-gray-700">Include insurance</span>
          </label>
          {form.insurance && (
            <div className="flex flex-col gap-1">
              <label htmlFor="declared_value" className="text-sm font-medium text-gray-700">Declared Value (KES)</label>
              <input
                id="declared_value"
                name="declared_value"
                type="number"
                min="0"
                value={form.declared_value}
                onChange={handleChange}
                placeholder="e.g. 50000"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
              />
            </div>
          )}

          {/* Electronics item dropdown */}
          <div className="flex flex-col gap-1">
            <label htmlFor="electronicsItem" className="text-sm font-medium text-gray-700">
              Electronic Item Type
            </label>
            <select
              id="electronicsItem"
              name="electronicsItem"
              value={form.electronicsItem}
              onChange={handleChange}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
            >
              <option value="">None (standard item)</option>
              <option value="phone">Phone (+£75 handling fee)</option>
              <option value="laptop">Laptop / Accessories (+£65 handling fee)</option>
              <option value="tv_monitor">TV / Screen / Monitor (+£65 handling fee)</option>
            </select>
            {electronicsFee > 0 && (
              <p className="text-xs text-amber-700 mt-1">
                A flat £{electronicsFee} specialist handling fee will be added to your estimate.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-lg text-sm disabled:opacity-50 transition-colors"
          >
            {loading ? 'Calculating…' : 'Get Estimate'}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-[#1e3a5f] mb-4">Your Estimate</h2>
            <div className="space-y-2 text-sm">
              {result.base_cost != null && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Base shipping cost</span>
                  <span className="font-medium">£{Number(result.base_cost).toFixed(2)}</span>
                </div>
              )}
              {result.electronics_fee > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span>Electronics handling fee</span>
                  <span className="font-medium">+£{Number(result.electronics_fee).toFixed(2)}</span>
                </div>
              )}
              {result.fuel_surcharge > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Fuel surcharge</span>
                  <span className="font-medium">+£{Number(result.fuel_surcharge).toFixed(2)}</span>
                </div>
              )}
              {(result.total ?? result.total_gbp) != null && (
                <div className="border-t border-gray-200 pt-3 flex justify-between text-base font-bold text-[#1e3a5f]">
                  <span>Total estimate</span>
                  <span>£{Number(result.total ?? result.total_gbp).toFixed(2)}</span>
                </div>
              )}
              {result.total_kes != null && (
                <div className="flex justify-between text-gray-500 text-xs">
                  <span>Approx. in KES</span>
                  <span>KES {Number(result.total_kes).toLocaleString()}</span>
                </div>
              )}
            </div>
            <p className="mt-4 text-xs text-gray-400">
              This is an estimate only. Final charges may vary based on actual weight, dimensions,
              and customs requirements.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
