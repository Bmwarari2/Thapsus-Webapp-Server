import React, { useEffect, useState } from 'react'
import { pricingApi } from '../api'
import { AlertTriangle, Calculator } from 'lucide-react'
import { PillLabel } from '../components/ui'
import { Reveal } from '../components/motion'

function formatKes(gbp, rate) {
  if (!Number.isFinite(rate) || rate <= 0) {
    return `£${Number(gbp).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return `KES ${Math.round(gbp * rate).toLocaleString()}`
}

function serverKes(result, key, fallbackGbp, rate) {
  const cents = result?.kes?.[key]
  if (Number.isFinite(cents)) return `KES ${cents.toLocaleString()}`
  return formatKes(fallbackGbp, rate)
}

const ELECTRONICS_FEES = {
  phone:      { label: 'Phone (+£75 handling fee)',                 fee: 75 },
  laptop:     { label: 'Laptop / Accessories (+£65 handling fee)',  fee: 65 },
  tv_monitor: { label: 'TV / Screen / Monitor (+£65 handling fee)', fee: 65 },
}

export default function Pricing() {
  const [form, setForm] = useState({
    weight_kg: '', length: '', width: '', height: '',
    shipping_speed: 'economy', insurance: false, declared_value: '', electronicsItem: '',
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [gbpToKes, setGbpToKes] = useState(null)

  useEffect(() => {
    pricingApi.getExchangeRates()
      .then((r) => setGbpToKes(Number(r.data?.data?.GBP_KES) || null))
      .catch(() => setGbpToKes(null))
  }, [])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value })
    setResult(null); setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null); setResult(null)
    try {
      const dimensions = {
        length: parseFloat(form.length) || 0,
        width: parseFloat(form.width) || 0,
        height: parseFloat(form.height) || 0,
      }
      const res = await pricingApi.calculate(
        parseFloat(form.weight_kg), dimensions, form.shipping_speed,
        form.insurance, parseFloat(form.declared_value) || 0, form.electronicsItem || null,
      )
      setResult(res.data.pricing)
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Unable to calculate price. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const electronicsFee = form.electronicsItem ? ELECTRONICS_FEES[form.electronicsItem]?.fee ?? 0 : 0

  const Row = ({ label, value, tone = 'text-white/80', labelTone = 'text-mute' }) => (
    <div className="flex justify-between items-center border-b border-line pb-3">
      <span className={`text-[11px] font-semibold uppercase tracking-widest ${labelTone}`}>{label}</span>
      <span className={`text-lg font-bold ${tone}`}>{value}</span>
    </div>
  )

  return (
    <div className="relative overflow-hidden py-14 px-4">
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[44rem] h-[44rem] bg-ember-radial blur-2xl pointer-events-none" />

      <div className="max-w-2xl mx-auto relative">
        <Reveal className="mb-10 text-center space-y-5">
          <div className="flex justify-center"><PillLabel>Instant quote</PillLabel></div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">Shipping calculator</h1>
          <p className="text-mute text-lg">Get an instant estimate for your shipment — including any specialist handling fees.</p>
        </Reveal>

        {/* Electronics banner */}
        <div className="alert-warning mb-8">
          <AlertTriangle className="shrink-0 mt-0.5 text-amber-400" size={20} />
          <div>
            <p className="font-semibold text-amber-200 mb-1">Electronics &amp; device handling fees</p>
            <p className="text-sm text-amber-200/80 leading-relaxed">
              Phones, laptops, and screens require specialist handling and incur a flat fee on top of standard shipping. Select your item type below to include it in your estimate.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glow-card p-6 md:p-8 space-y-5">
          <div>
            <label htmlFor="weight_kg" className="form-label">Weight (kg)</label>
            <input id="weight_kg" name="weight_kg" type="number" step="0.1" min="0.1" required
              value={form.weight_kg} onChange={handleChange} placeholder="e.g. 2.5" className="form-input" />
          </div>

          <div>
            <p className="form-label">Dimensions (cm) <span className="text-dim normal-case tracking-normal">— optional</span></p>
            <div className="grid grid-cols-3 gap-3">
              {['length', 'width', 'height'].map((dim) => (
                <div key={dim}>
                  <label htmlFor={dim} className="block text-[10px] font-semibold text-mute uppercase tracking-widest mb-1.5 text-center">{dim}</label>
                  <input id={dim} name={dim} type="number" step="0.1" min="0" value={form[dim]} onChange={handleChange}
                    placeholder="0" className="form-input text-center" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="shipping_speed" className="form-label">Service type</label>
            <select id="shipping_speed" name="shipping_speed" value={form.shipping_speed} onChange={handleChange} className="form-select">
              <option value="economy">Economy</option>
              <option value="express">Express</option>
            </select>
          </div>

          <label className="flex items-center gap-3 cursor-pointer p-4 bg-surface-2 border border-line rounded-2xl hover:border-line-strong transition-colors">
            <input type="checkbox" name="insurance" checked={form.insurance} onChange={handleChange}
              className="w-5 h-5 accent-ember-500 rounded cursor-pointer" />
            <span className="font-medium text-white/90">Include insurance coverage</span>
          </label>

          {form.insurance && (
            <div className="animate-fade-in">
              <label htmlFor="declared_value" className="form-label">Declared value (£)</label>
              <input id="declared_value" name="declared_value" type="number" min="0" value={form.declared_value}
                onChange={handleChange} placeholder="e.g. 50000" className="form-input" />
            </div>
          )}

          <div>
            <label htmlFor="electronicsItem" className="form-label">Electronic item type</label>
            <select id="electronicsItem" name="electronicsItem" value={form.electronicsItem} onChange={handleChange} className="form-select">
              <option value="">None (standard item)</option>
              <option value="phone">Phone (+£75 handling fee)</option>
              <option value="laptop">Laptop / Accessories (+£65 handling fee)</option>
              <option value="tv_monitor">TV / Screen / Monitor (+£65 handling fee)</option>
            </select>
            {electronicsFee > 0 && (
              <div className="mt-2 alert-warning">
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-400" />
                <p className="text-sm">A flat £{electronicsFee} specialist handling fee will be added to your estimate.</p>
              </div>
            )}
          </div>

          <button type="submit" disabled={loading} className="btn-primary glass-sheen w-full btn-lg !mt-6">
            <Calculator size={18} /> {loading ? 'Calculating…' : 'Get estimate'}
          </button>
        </form>

        {error && (
          <div className="mt-6 alert-error animate-scale-in">
            <AlertTriangle className="shrink-0 mt-0.5 text-red-400" size={20} />
            <p className="font-medium">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="glow-card p-6 md:p-8 mt-8 animate-scale-in">
            <h2 className="text-2xl font-bold text-white mb-6">Your estimate</h2>
            <div className="space-y-4">
              {result.breakdown?.base_shipping?.amount != null && (
                <Row label="Base shipping cost" value={serverKes(result, 'base_shipping', result.breakdown.base_shipping.amount, gbpToKes)} />
              )}
              {result.breakdown?.handling_fee?.amount > 0 && (
                <Row label="Handling & processing" value={serverKes(result, 'handling_fee', result.breakdown.handling_fee.amount, gbpToKes)} />
              )}
              {result.breakdown?.electronics_handling?.included && result.breakdown?.electronics_handling?.amount > 0 && (
                <Row label="Electronics handling fee" labelTone="text-amber-400" tone="text-amber-300"
                  value={serverKes(result, 'electronics_handling', result.breakdown.electronics_handling.amount, gbpToKes)} />
              )}
              {result.breakdown?.insurance?.included && result.breakdown?.insurance?.amount > 0 && (
                <Row label="Insurance (3%)" labelTone="text-blue-400" tone="text-blue-300"
                  value={serverKes(result, 'insurance', result.breakdown.insurance.amount, gbpToKes)} />
              )}
              {result.breakdown?.card_fee?.amount > 0 && (
                <Row label="Card processing" value={serverKes(result, 'card_fee', result.breakdown.card_fee.amount, gbpToKes)} />
              )}

              {result.total != null && (
                <div className="rounded-2xl p-5 border border-ember-500/30 bg-ember-500/[0.08] mt-6 flex justify-between items-center">
                  <div>
                    <span className="text-sm font-semibold text-ember-300 uppercase tracking-widest block">Total estimate</span>
                    <span className="text-[10px] font-semibold text-mute uppercase tracking-widest">{result.notes?.delivery_time}</span>
                  </div>
                  <span className="text-3xl font-bold text-ember-400">{serverKes(result, 'total', result.total, gbpToKes)}</span>
                </div>
              )}

              {result.breakdown?.dimensional_weight && (
                <div className="flex justify-between items-center bg-white/[0.03] rounded-2xl p-4 border border-line mt-2">
                  <span className="text-[11px] font-semibold text-mute uppercase tracking-widest">Chargeable weight</span>
                  <span className="text-sm font-bold text-white">{Number(result.breakdown.dimensional_weight.chargeable_kg ?? 0).toFixed(2)} kg</span>
                </div>
              )}
            </div>

            <p className="mt-6 text-[10px] font-medium text-dim uppercase tracking-widest leading-relaxed">
              * Estimate only. Final charges may vary based on actual weight and dimensions on warehouse arrival.
              Customs (VAT + Duty) may be charged separately by Kenya Revenue Authority on clearance and are not included.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
