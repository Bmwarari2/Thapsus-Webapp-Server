import React, { useState, useEffect } from 'react'
import { Calculator, Info, CheckCircle, AlertCircle } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { pricingApi } from '../api'
import { SEO } from '../components/SEO'
import toast from 'react-hot-toast'
import { PillLabel } from '../components/ui'
import { Reveal } from '../components/motion'

const ELECTRONICS_GUIDE = [
  { key: 'phone',      label: 'Phone',                 fee_gbp: 75, detail: 'Minimum £75 handling fee + 1 kg minimum weight. If total weight of phones exceeds 1 kg, the per-kg rate applies on top.' },
  { key: 'laptop',     label: 'Laptop / Accessories',  fee_gbp: 65, detail: 'Minimum £65 handling fee + 1 kg minimum weight. Includes accessories, cases and bags. Per-kg rate applies above 1 kg.' },
  { key: 'tv_monitor', label: 'TV / Screen / Monitor', fee_gbp: 65, detail: 'Minimum £65 handling fee charged based on actual weight and dimensions.' },
]

export const PricingCalculator = () => {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    weight: '1', length: '10', width: '10', height: '10',
    shippingSpeed: 'economy', insurance: false, declaredValue: '0', electronics_item: '',
  })
  const [result, setResult] = useState(null)
  const [currentRates, setCurrentRates] = useState(null)
  const [gbpToKes, setGbpToKes] = useState(null)

  const shippingSpeeds = [
    { value: 'economy', label: t('pricing.economy') || 'Economy' },
    { value: 'express', label: t('pricing.express') || 'Express' },
  ]

  useEffect(() => {
    pricingApi.getSettings()
      .then((res) => { const v = res.data?.settings?.base_shipping_per_kg; if (typeof v === 'number') setCurrentRates({ UK: v }) })
      .catch(() => {})
    pricingApi.getExchangeRates()
      .then((res) => setGbpToKes(Number(res.data?.data?.GBP_KES) || null))
      .catch(() => setGbpToKes(null))
  }, [])

  const formatKes = (gbp) => {
    if (!Number.isFinite(gbpToKes) || gbpToKes <= 0) {
      return `£${Number(gbp || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return `KES ${Math.round((gbp || 0) * gbpToKes).toLocaleString()}`
  }

  const formatServerKes = (key, fallbackGbp) => {
    const cents = result?.kes?.[key]
    if (Number.isFinite(cents)) return `KES ${cents.toLocaleString()}`
    return formatKes(fallbackGbp)
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleCalculate = async (e) => {
    e.preventDefault()
    if (!formData.weight || parseFloat(formData.weight) <= 0) { toast.error('Please enter a valid weight'); return }
    try {
      setLoading(true)
      const response = await pricingApi.calculate(
        parseFloat(formData.weight),
        { length: parseFloat(formData.length) || 0, width: parseFloat(formData.width) || 0, height: parseFloat(formData.height) || 0 },
        formData.shippingSpeed,
        formData.insurance ? { enabled: true, declaredValue: parseFloat(formData.declaredValue) || 0 } : { enabled: false },
        formData.electronics_item || null,
      )
      if (response.data?.success && response.data?.pricing) setResult(response.data.pricing)
      else toast.error('Unexpected response from pricing API')
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

  const LineRow = ({ label, desc, value, tone = 'text-white' }) => (
    <div className="flex justify-between items-center py-4 border-b border-line">
      <div>
        <span className="font-semibold text-white/90">{label}</span>
        {desc && <p className="text-xs text-mute mt-1">{desc}</p>}
      </div>
      <span className={`font-bold text-lg ${tone}`}>{value}</span>
    </div>
  )

  return (
    <div className="relative overflow-hidden py-14 px-4">
      <SEO title="Shipping Calculator — Get Instant Quotes"
        description="Calculate shipping costs from the UK to Kenya instantly. Get transparent pricing with weight, dimensions, and insurance." />
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[48rem] h-[44rem] bg-ember-radial blur-2xl pointer-events-none" />

      <div className="max-w-6xl mx-auto relative">
        {/* Header */}
        <Reveal className="text-center mb-10 space-y-5">
          <div className="flex justify-center"><PillLabel>Instant quote</PillLabel></div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white">{t('pricing.title') || 'Shipping calculator'}</h1>
          <p className="text-mute flex items-center justify-center gap-2">
            <Calculator size={18} className="text-ember-400" />
            {t('pricing.description') || 'Get an instant estimate for your shipment.'}
          </p>
        </Reveal>

        {/* Electronics notice */}
        <Reveal className="glow-card p-6 mb-8">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="text-ember-400 shrink-0 mt-0.5" size={22} />
            <div>
              <h2 className="font-bold text-white text-lg mb-1">Electronics &amp; special handling</h2>
              <p className="text-sm text-mute leading-relaxed">
                Certain electronics carry an additional handling fee on top of the standard shipping rate. Select your item type in the calculator to include the correct fee.
              </p>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {ELECTRONICS_GUIDE.map((item) => (
              <div key={item.key} className="rounded-2xl bg-surface-2 border border-line p-4">
                <p className="font-bold text-white mb-2">{item.label}</p>
                <p className="badge-ember mb-2">£{item.fee_gbp} handling fee</p>
                <p className="text-xs text-mute leading-snug">{item.detail}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Form */}
          <div className="card p-7 md:p-8">
            <h2 className="text-2xl font-bold text-white mb-7">{t('pricing.title') || 'Shipping calculator'}</h2>
            <form onSubmit={handleCalculate} className="space-y-5">
              {currentRates && (
                <p className="text-xs text-mute">Current UK rate: <span className="text-white/80 font-semibold">£{currentRates.UK?.toFixed(2) ?? '—'}/kg</span></p>
              )}

              <div>
                <label className="form-label">Electronics / special item <span className="text-dim normal-case tracking-normal">(optional)</span></label>
                <select name="electronics_item" value={formData.electronics_item} onChange={handleChange} className="form-select">
                  <option value="">— None / standard shipment —</option>
                  {ELECTRONICS_GUIDE.map((item) => (
                    <option key={item.key} value={item.key}>{item.label} (+ £{item.fee_gbp} handling fee)</option>
                  ))}
                </select>
                {formData.electronics_item && (
                  <div className="mt-2 alert-warning text-xs">
                    <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-400" />
                    <span>A £{ELECTRONICS_GUIDE.find((e) => e.key === formData.electronics_item)?.fee_gbp} handling fee will be added. Minimum chargeable weight: 1 kg.</span>
                  </div>
                )}
              </div>

              <div>
                <label className="form-label">{t('pricing.weight') || 'Weight'} (kg) *</label>
                <input type="number" name="weight" value={formData.weight} onChange={handleChange} step="0.1" min="0.1" required className="form-input" />
              </div>

              <div>
                <label className="form-label">{t('pricing.dimensions') || 'Dimensions'} <span className="text-dim normal-case tracking-normal">(cm)</span></label>
                <div className="grid grid-cols-3 gap-3">
                  {['length', 'width', 'height'].map((dim) => (
                    <input key={dim} type="number" name={dim} placeholder={t(`pricing.${dim}`) || dim}
                      value={formData[dim]} onChange={handleChange} step="0.1" min="0" className="form-input text-center text-sm" />
                  ))}
                </div>
              </div>

              <div>
                <label className="form-label">{t('pricing.shipping') || 'Shipping speed'}</label>
                <div className="flex gap-3">
                  {shippingSpeeds.map((speed) => {
                    const active = formData.shippingSpeed === speed.value
                    return (
                      <label key={speed.value} className={`flex-1 cursor-pointer rounded-2xl border px-4 py-3 text-center text-sm font-medium transition-colors ${active ? 'border-ember-500/50 bg-ember-500/10 text-white' : 'border-line bg-surface-2 text-mute hover:text-white'}`}>
                        <input type="radio" name="shippingSpeed" value={speed.value} checked={active} onChange={handleChange} className="sr-only" />
                        {speed.label}
                      </label>
                    )
                  })}
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer p-4 bg-surface-2 border border-line rounded-2xl hover:border-line-strong transition-colors">
                <input type="checkbox" name="insurance" checked={formData.insurance} onChange={handleChange} className="w-5 h-5 accent-ember-500 rounded cursor-pointer" />
                <span className="text-sm font-medium text-white/90">{t('pricing.insurance') || 'Include insurance coverage'}</span>
              </label>

              {formData.insurance && (
                <div className="animate-fade-in">
                  <label className="form-label">{t('pricing.declaredValue') || 'Declared value'} <span className="text-dim normal-case tracking-normal">(£)</span></label>
                  <input type="number" name="declaredValue" value={formData.declaredValue} onChange={handleChange} min="0" className="form-input" />
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary glass-sheen w-full btn-lg !mt-7">
                <Calculator size={20} /> {loading ? (t('common.loading') || 'Calculating…') : (t('pricing.calculate') || 'Calculate')}
              </button>
            </form>
          </div>

          {/* Results */}
          <div className="h-full">
            {result ? (
              <div className="glow-card p-7 md:p-8 h-full animate-scale-in">
                <div className="flex items-center gap-3 mb-7">
                  <CheckCircle className="text-ember-400" size={26} />
                  <h2 className="text-2xl font-bold text-white">{t('pricing.results') || 'Your estimate'}</h2>
                </div>

                <div className="space-y-3">
                  {dimWeight && (
                    <div className="rounded-2xl bg-surface-2 border border-line p-5">
                      <p className="text-sm font-semibold text-white/90 mb-3">Weight calculation</p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-mute">Actual weight</span><span className="font-semibold text-white">{Number(dimWeight.actual_kg ?? 0).toFixed(2)} kg</span></div>
                        <div className="flex justify-between"><span className="text-mute">Volumetric weight</span><span className="font-semibold text-white">{Number(dimWeight.vol_kg ?? 0).toFixed(2)} kg</span></div>
                        <div className="flex justify-between border-t border-line pt-2.5 mt-1"><span className="text-ember-300 font-semibold">Chargeable weight</span><span className="font-bold text-ember-400">{Number(dimWeight.chargeable_kg ?? 0).toFixed(2)} kg</span></div>
                      </div>
                    </div>
                  )}

                  <LineRow label="Base shipping" desc={bd?.base_shipping?.description} value={formatServerKes('base_shipping', bd?.base_shipping?.amount)} />

                  {elec?.included && (
                    <LineRow label="Electronics handling fee" desc={elec.description} tone="text-ember-400"
                      value={formatServerKes('electronics_handling', elec.amount)} />
                  )}
                  {!elec?.included && (bd?.handling_fee?.amount || 0) > 0 && (
                    <LineRow label="Handling fee" desc={bd?.handling_fee?.description} value={formatServerKes('handling_fee', bd?.handling_fee?.amount)} />
                  )}
                  {formData.insurance && (
                    <LineRow label="Insurance (3%)" value={formatServerKes('insurance', bd?.insurance?.amount)} />
                  )}
                  {(bd?.card_fee?.amount || 0) > 0 && (
                    <LineRow label="Card processing"
                      desc={`${((result?.settings?.card_processing_pct ?? bd?.card_fee?.rate ?? 0) * 100).toFixed(2)}% of subtotal`}
                      value={formatServerKes('card_fee', bd?.card_fee?.amount)} />
                  )}

                  {/* Total */}
                  <div className="rounded-3xl bg-ember-gradient text-white p-6 mt-5 shadow-ember">
                    <p className="text-sm text-white/85 font-semibold mb-1">{t('pricing.total') || 'Total estimate'}</p>
                    <p className="text-4xl md:text-5xl font-bold tracking-tight leading-none mb-2">{formatServerKes('total', sm?.total || result?.total)}</p>
                    <p className="text-xs text-white/90 font-medium bg-black/15 inline-block px-3 py-1.5 rounded-lg mt-1">
                      {(sm?.shipping_speed || result?.shipping_speed) === 'express' ? 'Express' : 'Economy'} shipping · UK
                    </p>
                  </div>

                  <div className="alert-info mt-5">
                    <Info className="shrink-0 mt-0.5 text-blue-300" size={20} />
                    <div className="text-sm text-blue-100/90 space-y-1.5 leading-relaxed">
                      <p><strong className="text-white">Estimated delivery:</strong> {result.notes?.delivery_time}</p>
                      <p className="text-xs text-blue-200/70">{result.notes?.disclaimer}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card h-full flex items-center justify-center p-8 text-center min-h-[24rem]">
                <div>
                  <Calculator size={52} className="mx-auto mb-5 text-white/15" />
                  <p className="font-bold text-white/80 text-lg mb-1">Ready to calculate</p>
                  <p className="text-sm text-mute">Fill out the form and calculate to see your estimate.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
