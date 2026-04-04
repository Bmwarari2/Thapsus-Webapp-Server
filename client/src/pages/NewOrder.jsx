import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, AlertCircle } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { ordersApi, pricingApi } from '../api'
import toast from 'react-hot-toast'

export const NewOrder = () => {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [formData, setFormData] = useState({
    market: 'UK',
    retailer: '',
    retailerOther: '',
    description: '',
    weight: '',
    length: '',
    width: '',
    height: '',
    shippingSpeed: 'economy',
    insurance: false,
    declaredValue: '',
    promoCode: '',
  })
  const [estimate, setEstimate] = useState(null)

  const retailers = ['Shein', 'Amazon', 'Next', 'Asos', 'Superdrug', 'eBay', 'ZARA', 'H&M']

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleCalculateEstimate = async () => {
    if (!formData.weight) {
      setError('Please enter a weight to calculate the estimate')
      return
    }
    setError(null)
    try {
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
          : { enabled: false }
      )
      setEstimate(response.data.pricing)
    } catch (err) {
      toast.error('Failed to calculate estimate')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!formData.market) { setError(t('common.required')); return }
    if (!formData.retailer && !formData.retailerOther) { setError(t('common.required')); return }
    if (!formData.description) { setError(t('common.required')); return }
    if (!formData.weight) { setError(t('common.required')); return }

    try {
      setLoading(true)
      const retailerName = formData.retailer === 'other' ? formData.retailerOther : formData.retailer
      const response = await ordersApi.create({
        market: formData.market,
        retailer: retailerName,
        description: formData.description,
        weight_kg: parseFloat(formData.weight),
        dimensions: {
          length: parseFloat(formData.length) || 0,
          width: parseFloat(formData.width) || 0,
          height: parseFloat(formData.height) || 0,
        },
        shipping_speed: formData.shippingSpeed,
        insurance: formData.insurance,
        declared_value: formData.insurance ? parseFloat(formData.declaredValue) || 0 : 0,
      })

      toast.success('Order created successfully!')
      // Navigate to confirmation page, passing the order + pricing data via router state
      navigate('/orders/confirmation', {
        replace: true,
        state: {
          order: response.data.order,
          pricing: estimate,
        },
      })
    } catch (err) {
      const msg = err.message || 'Failed to create order'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-4">
            {t('neworder.title')}
          </h1>
          <p className="text-gray-600">Provide your package details to create a new order</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form */}
          <div className="lg:col-span-2">
            <div className="card">
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                  <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-red-700">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Market */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('neworder.market')} *
                  </label>
                  <select name="market" value={formData.market} onChange={handleChange} required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent">
                    <option value="UK">United Kingdom</option>
                    <option value="USA">United States</option>
                    <option value="China">China</option>
                  </select>
                </div>

                {/* Retailer */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('neworder.retailer')} *
                  </label>
                  <select name="retailer" value={formData.retailer} onChange={handleChange} required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent">
                    <option value="">{t('neworder.retailerPlaceholder')}</option>
                    {retailers.map((r) => <option key={r} value={r}>{r}</option>)}
                    <option value="other">{t('neworder.other')}</option>
                  </select>
                </div>

                {formData.retailer === 'other' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Retailer Name *</label>
                    <input type="text" name="retailerOther" value={formData.retailerOther}
                      onChange={handleChange} placeholder="Enter retailer name"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent" />
                  </div>
                )}

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('neworder.description')} *
                  </label>
                  <textarea name="description" value={formData.description} onChange={handleChange}
                    placeholder="e.g., Blue hoodie size M, black shoes size 10" rows="3" required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent" />
                </div>

                {/* Weight */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('neworder.weight')} *
                  </label>
                  <input type="number" name="weight" value={formData.weight} onChange={handleChange}
                    step="0.1" min="0" placeholder="1.5" required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent" />
                </div>

                {/* Dimensions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('neworder.dimensions')}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {['length', 'width', 'height'].map((dim) => (
                      <input key={dim} type="number" name={dim}
                        placeholder={`${dim.charAt(0).toUpperCase() + dim.slice(1)} (cm)`}
                        value={formData[dim]} onChange={handleChange} step="0.1" min="0"
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent text-sm" />
                    ))}
                  </div>
                </div>

                {/* Shipping Speed */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('neworder.shippingSpeed')}
                  </label>
                  <div className="flex gap-4">
                    {[['economy', 'Economy (7-14 days)'], ['express', 'Express (3-5 days)']].map(([val, label]) => (
                      <label key={val} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="shippingSpeed" value={val}
                          checked={formData.shippingSpeed === val} onChange={handleChange}
                          className="w-4 h-4 text-[#1e3a5f]" />
                        <span className="text-gray-700">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Insurance */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="insurance" checked={formData.insurance}
                      onChange={handleChange} className="w-4 h-4 text-[#1e3a5f]" />
                    <span className="text-sm font-medium text-gray-700">{t('neworder.insurance')}</span>
                  </label>
                </div>

                {formData.insurance && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Declared Value (KES)</label>
                    <input type="number" name="declaredValue" value={formData.declaredValue}
                      onChange={handleChange} min="0" placeholder="0"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent" />
                  </div>
                )}

                {/* Promo Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('neworder.promoCode')}
                  </label>
                  <input type="text" name="promoCode" value={formData.promoCode} onChange={handleChange}
                    placeholder="Optional"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent" />
                </div>

                <button type="button" onClick={handleCalculateEstimate}
                  className="w-full bg-gray-800 hover:bg-gray-900 text-white py-2 rounded-lg font-bold transition-colors">
                  Calculate Estimate
                </button>

                <button type="submit" disabled={loading}
                  className="w-full bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-3 rounded-lg font-bold transition-colors disabled:opacity-50">
                  {loading ? t('common.loading') : t('neworder.submit')}
                </button>
              </form>
            </div>
          </div>

          {/* Estimate Sidebar */}
          {estimate && (
            <div className="card bg-orange-50 border border-orange-200 h-fit sticky top-20">
              <h3 className="text-lg font-bold text-[#1e3a5f] mb-4">{t('neworder.costEstimate')}</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-700">Base Shipping:</span>
                  <span className="font-semibold">KES {estimate.breakdown?.base_shipping?.amount?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">Handling Fee:</span>
                  <span className="font-semibold">KES {estimate.breakdown?.handling_fee?.amount?.toLocaleString()}</span>
                </div>
                {estimate.breakdown?.insurance?.included && (
                  <div className="flex justify-between">
                    <span className="text-gray-700">Insurance:</span>
                    <span className="font-semibold">KES {estimate.breakdown?.insurance?.amount?.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between pb-3 border-b border-orange-300">
                  <span className="text-gray-700">Customs Estimate:</span>
                  <span className="font-semibold">KES {estimate.breakdown?.customs_estimate?.amount?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-base">
                  <span className="text-[#1e3a5f] font-bold">Total:</span>
                  <div className="text-right">
                    <p className="font-bold text-orange-600">KES {estimate.summary?.total?.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">{estimate.notes?.delivery_time}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
