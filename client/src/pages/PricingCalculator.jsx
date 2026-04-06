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

  const markets = ['UK', 'USA', 'China']
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
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-4">
            {t('pricing.title')}
          </h1>
          <p className="text-gray-600 flex items-center justify-center gap-2">
            <Calculator size={20} className="text-orange-500" />
            {t('pricing.description')}
          </p>
        </div>

        {/* ── Electronics Handling Fee Notice ── */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
          <div className="flex items-start gap-3 mb-3">
            <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={22} />
            <div>
              <h2 className="font-bold text-amber-900 text-base mb-1">
                Electronics, Phone &amp; Laptop Handling Fees
              </h2>
              <p className="text-sm text-amber-800">
                Certain electronics carry an additional handling fee on top of the standard shipping
                rate. If your shipment includes one of the items below, select it in the calculator
                to include the correct handling fee in your estimate.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            {ELECTRONICS_GUIDE.map((item) => (
              <div key={item.key} className="bg-white border border-amber-200 rounded-lg p-3">
                <p className="font-semibold text-gray-800 text-sm">{item.label}</p>
                <p className="text-orange-600 font-bold text-sm">£{item.fee_gbp} handling fee</p>
                <p className="text-xs text-gray-500 mt-1">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* ── Form ── */}
          <div className="card">
            <h2 className="text-2xl font-bold text-[#1e3a5f] mb-6">{t('pricing.title')}</h2>
            <form onSubmit={handleCalculate} className="space-y-4">
              {/* Market */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('pricing.market')}</label>
                <select
                  name="market"
                  value={formData.market}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                >
                  {markets.map((m) => (
                    <option key={m} value={m}>
                      {m === 'UK' ? 'United Kingdom' : m === 'USA' ? 'United States' : 'China'}
                    </option>
                  ))}
                </select>
                {currentRates && (
                  <p className="text-xs text-gray-500 mt-1">
                    Current rate for {formData.market}: £{currentRates[formData.market]?.toFixed(2) ?? '—'}/kg
                  </p>
                )}
              </div>

              {/* Electronics Item */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Electronics / Special Item (optional)
                </label>
                <select
                  name="electronics_item"
                  value={formData.electronics_item}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                >
                  <option value="">— None / Standard shipment —</option>
                  {ELECTRONICS_GUIDE.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label} (+ £{item.fee_gbp} handling fee)
                    </option>
                  ))}
                </select>
                {formData.electronics_item && (
                  <p className="text-xs text-amber-700 mt-1">
                    ⚠ A £
                    {ELECTRONICS_GUIDE.find((e) => e.key === formData.electronics_item)?.fee_gbp}
                    {' '}handling fee will be added. Minimum chargeable weight: 1 kg.
                  </p>
                )}
              </div>

              {/* Weight */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                />
              </div>

              {/* Dimensions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('pricing.dimensions')} (cm)
                </label>
                <div className="grid grid-cols-3 gap-2">
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] text-sm"
                    />
                  ))}
                </div>
              </div>

              {/* Shipping Speed */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('pricing.shipping')}</label>
                <div className="flex gap-4">
                  {shippingSpeeds.map((speed) => (
                    <label key={speed.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="shippingSpeed"
                        value={speed.value}
                        checked={formData.shippingSpeed === speed.value}
                        onChange={handleChange}
                        className="w-4 h-4 text-[#1e3a5f]"
                      />
                      <span className="text-gray-700">{speed.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Insurance */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="insurance"
                    checked={formData.insurance}
                    onChange={handleChange}
                    className="w-4 h-4 text-[#1e3a5f]"
                  />
                  <span className="text-sm font-medium text-gray-700">{t('pricing.insurance')}</span>
                </label>
              </div>

              {formData.insurance && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('pricing.declaredValue')} (KES)
                  </label>
                  <input
                    type="number"
                    name="declaredValue"
                    value={formData.declaredValue}
                    onChange={handleChange}
                    min="0"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-3 rounded-lg font-bold transition-colors disabled:opacity-50 mt-6 flex items-center justify-center gap-2"
              >
                <Calculator size={20} />
                {loading ? t('common.loading') : t('pricing.calculate')}
              </button>
            </form>
          </div>

          {/* ── Results ── */}
          <div>
            {result ? (
              <div className="card bg-gradient-to-br from-orange-50 to-orange-100">
                <div className="flex items-center gap-2 mb-6">
                  <CheckCircle className="text-green-500" size={24} />
                  <h2 className="text-2xl font-bold text-[#1e3a5f]">{t('pricing.results')}</h2>
                </div>
                <div className="space-y-3">
                  {/* Weight Breakdown */}
                  {dimWeight && (
                    <div className="bg-white rounded-lg p-4">
                      <p className="text-sm font-semibold text-gray-600 mb-2">Weight Calculation</p>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Actual weight:</span>
                          <span className="font-semibold">{dimWeight.actual_weight_kg} kg</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Volumetric weight:</span>
                          <span className="font-semibold">{dimWeight.dimensional_weight_kg} kg</span>
                        </div>
                        <div className="flex justify-between border-t pt-1 mt-1">
                          <span className="text-gray-700 font-medium">Chargeable weight:</span>
                          <span className="font-bold text-[#1e3a5f]">{dimWeight.chargeable_weight_kg} kg</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Base Shipping */}
                  <div className="flex justify-between items-center py-3 border-b border-orange-200">
                    <div>
                      <span className="text-gray-700 font-medium">Base Shipping</span>
                      <p className="text-xs text-gray-500">{bd?.base_shipping?.description}</p>
                    </div>
                    <span className="font-bold text-gray-900">
                      KES {(bd?.base_shipping?.amount || 0).toLocaleString()}
                    </span>
                  </div>

                  {/* Electronics Handling Fee */}
                  {elec?.included && (
                    <div className="flex justify-between items-center py-3 border-b border-orange-200">
                      <div>
                        <span className="text-gray-700 font-medium">Electronics Handling Fee</span>
                        <p className="text-xs text-gray-500">{elec.description}</p>
                      </div>
                      <span className="font-bold text-orange-600">
                        KES {(elec.amount || 0).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* General Handling Fee (non-electronics) */}
                  {!elec?.included && (bd?.handling_fee?.amount || 0) > 0 && (
                    <div className="flex justify-between items-center py-3 border-b border-orange-200">
                      <div>
                        <span className="text-gray-700 font-medium">Handling Fee</span>
                        <p className="text-xs text-gray-500">{bd?.handling_fee?.description}</p>
                      </div>
                      <span className="font-bold text-gray-900">
                        KES {(bd?.handling_fee?.amount || 0).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* Insurance */}
                  {formData.insurance && (
                    <div className="flex justify-between items-center py-3 border-b border-orange-200">
                      <span className="text-gray-700">Insurance (3%)</span>
                      <span className="font-bold text-gray-900">
                        KES {(bd?.insurance?.amount || 0).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* Customs Estimate */}
                  {(bd?.customs_estimate?.amount || 0) > 0 && (
                    <div className="flex justify-between items-center py-3 border-b border-orange-200">
                      <div>
                        <span className="text-gray-700">Customs Estimate</span>
                        <p className="text-xs text-gray-500">VAT 16% + Duty 10% — estimate only</p>
                      </div>
                      <span className="font-bold text-gray-900">
                        KES {(bd?.customs_estimate?.amount || 0).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* Total */}
                  <div className="bg-[#1e3a5f] text-white rounded-lg p-4 mt-2">
                    <p className="text-sm text-gray-300 mb-1">{t('pricing.total')}</p>
                    <p className="text-3xl font-bold">
                      KES {((sm?.total || result?.total) || 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-300 mt-1">
                      {(sm?.shipping_speed || result?.shipping_speed) === 'express' ? 'Express' : 'Economy'} shipping · {sm?.market || result?.market}
                    </p>
                  </div>

                  {/* Delivery time & disclaimer */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
                    <Info className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
                    <div className="text-sm text-blue-700 space-y-1">
                      <p><strong>Estimated delivery:</strong> {result.notes?.delivery_time}</p>
                      <p>{result.notes?.disclaimer}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card h-full flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <Calculator size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Fill out the form and click calculate to see pricing</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
