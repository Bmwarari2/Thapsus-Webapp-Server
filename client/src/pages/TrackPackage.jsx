import React, { useState } from 'react'
import { Search, Package, Check, Clock, AlertCircle } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { ordersApi } from '../api'
import toast from 'react-hot-toast'

export const TrackPackage = () => {
  const { t } = useLanguage()
  const [trackingNumber, setTrackingNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [package_, setPackage] = useState(null)
  const [error, setError] = useState(null)

  const statusTimeline = [
    { status: 'pending', label: 'Order Placed', icon: Package },
    { status: 'received_at_warehouse', label: 'Received at Warehouse', icon: Clock },
    { status: 'in_transit', label: 'In Transit', icon: Package },
    { status: 'delivered', label: 'Delivered', icon: Check },
  ]

  const handleTrack = async (e) => {
    e.preventDefault()
    if (!trackingNumber.trim()) {
      setError(t('track.notFound'))
      return
    }

    try {
      setLoading(true)
      setError(null)
      const response = await ordersApi.track(trackingNumber)
      setPackage(response.data.tracking)
    } catch (err) {
      setError(t('track.notFound'))
      toast.error(t('track.notFound'))
      setPackage(null)
    } finally {
      setLoading(false)
    }
  }

  const currentStatusIndex = package_
    ? statusTimeline.findIndex((s) => s.status === package_.status)
    : -1

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-4">
            {t('track.title')}
          </h1>
          <p className="text-gray-600">
            {t('track.notFound')} tracking number to get real-time updates
          </p>
        </div>

        {/* Search Form */}
        <div className="card mb-8">
          <form onSubmit={handleTrack} className="space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-3 text-gray-400" size={20} />
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder={t('track.placeholder')}
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-3 rounded-lg font-bold transition-colors disabled:opacity-50"
            >
              {loading ? t('common.loading') : t('track.search')}
            </button>
          </form>
        </div>

        {/* Error Message */}
        {error && (
          <div className="card mb-8 bg-red-50 border border-red-200">
            <div className="flex items-start gap-4">
              <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={24} />
              <div>
                <h3 className="font-bold text-red-900 mb-1">{t('common.error')}</h3>
                <p className="text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Package Details */}
        {package_ && (
          <div className="space-y-6">
            {/* Status Overview */}
            <div className="card">
              <h2 className="text-2xl font-bold text-[#1e3a5f] mb-6">
                {t('track.trackingNumber')}: {trackingNumber}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <p className="text-gray-600 text-sm mb-1">{t('track.status')}</p>
                  <p className="text-2xl font-bold text-orange-500">
                    {t(`orders.${package_.status}`)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm mb-1">{t('track.estimatedDelivery')}</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {new Date(package_.estimated_delivery || new Date(package_.created_at).getTime() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-gray-600 text-sm mb-2">{t('track.lastUpdate')}</p>
                <p className="text-gray-900">
                  {new Date(package_.updated_at || package_.created_at).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Timeline */}
            <div className="card">
              <h3 className="text-xl font-bold text-[#1e3a5f] mb-8">{t('track.timeline')}</h3>

              <div className="relative">
                {statusTimeline.map((step, idx) => {
                  const isCompleted = idx <= currentStatusIndex
                  const isCurrent = idx === currentStatusIndex
                  const Icon = step.icon

                  return (
                    <div key={step.status} className="relative mb-8 last:mb-0">
                      {/* Line */}
                      {idx < statusTimeline.length - 1 && (
                        <div
                          className={`absolute left-6 top-16 w-1 h-12 ${
                            isCompleted ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                        />
                      )}

                      {/* Circle */}
                      <div
                        className={`relative w-12 h-12 rounded-full flex items-center justify-center ${
                          isCurrent
                            ? 'bg-orange-500 text-white ring-4 ring-orange-200'
                            : isCompleted
                              ? 'bg-green-500 text-white'
                              : 'bg-gray-300 text-white'
                        }`}
                      >
                        <Icon size={24} />
                      </div>

                      {/* Content */}
                      <div className="ml-20 pt-1">
                        <h4 className="font-bold text-gray-900">{step.label}</h4>
                        {isCurrent && (
                          <p className="text-sm text-orange-600 mt-1">
                            Current status
                          </p>
                        )}
                        {isCompleted && !isCurrent && (
                          <p className="text-sm text-green-600 mt-1">
                            Completed
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Package Details Card */}
            <div className="card">
              <h3 className="text-xl font-bold text-[#1e3a5f] mb-4">
                Package Details
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-600">Market:</span>
                  <span className="font-semibold text-gray-900">{package_.market}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Weight:</span>
                  <span className="font-semibold text-gray-900">{package_.weight_kg || '—'} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Shipping Cost:</span>
                  <span className="font-semibold text-gray-900">
                    KES {package_.estimated_cost?.toLocaleString() || 0}
                  </span>
                </div>
                {package_.description && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Description:</span>
                    <span className="font-semibold text-gray-900">{package_.description}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
