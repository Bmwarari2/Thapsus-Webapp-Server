import React, { useState, useEffect } from 'react'
import { Package, Zap } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { consolidationApi } from '../api'
import toast from 'react-hot-toast'

export const Consolidation = () => {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [packages, setPackages] = useState([])
  const [requests, setRequests] = useState([])
  const [selectedPackages, setSelectedPackages] = useState([])
  const [consolidating, setConsolidating] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pkgRes, reqRes] = await Promise.all([
          consolidationApi.listPackages(),
          consolidationApi.getRequests(),
        ])
        setPackages(pkgRes.data.packages || [])
        setRequests(reqRes.data.requests || [])
      } catch (err) {
        toast.error('Failed to load consolidation data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const handleSelectPackage = (packageId) => {
    setSelectedPackages((prev) =>
      prev.includes(packageId)
        ? prev.filter((id) => id !== packageId)
        : [...prev, packageId]
    )
  }

  const handleRequestConsolidation = async () => {
    if (selectedPackages.length < 2) {
      toast.error('Please select at least 2 packages')
      return
    }

    try {
      setConsolidating(true)
      await consolidationApi.requestConsolidation(selectedPackages)
      toast.success('Consolidation request submitted!')

      // Refresh data
      const [pkgRes, reqRes] = await Promise.all([
        consolidationApi.listPackages(),
        consolidationApi.getRequests(),
      ])
      setPackages(pkgRes.data.packages || [])
      setRequests(reqRes.data.requests || [])
      setSelectedPackages([])
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to request consolidation')
    } finally {
      setConsolidating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  const selectedCost = packages
    .filter((pkg) => selectedPackages.includes(pkg.id))
    .reduce((sum, pkg) => sum + (pkg.shippingCost || 0), 0)

  const estimatedSavings = selectedCost * 0.15 // 15% savings estimate

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-2">
            {t('consolidation.title')}
          </h1>
          <p className="text-gray-600">{t('consolidation.description')}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Packages List */}
          <div className="lg:col-span-2">
            {packages.length > 0 ? (
              <div className="card">
                <h2 className="text-2xl font-bold text-[#1e3a5f] mb-6">
                  {t('consolidation.selectPackages')}
                </h2>

                <div className="space-y-3">
                  {packages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPackages.includes(pkg.id)}
                        onChange={() => handleSelectPackage(pkg.id)}
                        className="w-5 h-5 text-[#1e3a5f] rounded cursor-pointer"
                      />
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">
                          {pkg.id.slice(0, 8).toUpperCase()}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {pkg.market} • {pkg.weight} kg • Arrived{' '}
                          {new Date(pkg.arrivedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          KES {pkg.shippingCost?.toLocaleString() || 0}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="card text-center py-12">
                <Package className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-600">
                  {t('consolidation.noPackages')}
                </p>
              </div>
            )}
          </div>

          {/* Summary Sidebar */}
          <div className="space-y-6">
            {/* Savings Card */}
            {selectedPackages.length > 0 && (
              <div className="card bg-gradient-to-br from-green-50 to-green-100 border border-green-200">
                <div className="flex items-start gap-3 mb-4">
                  <Zap className="text-green-600 flex-shrink-0 mt-0.5" size={24} />
                  <h3 className="text-lg font-bold text-green-900">
                    {t('consolidation.estimatedSavings')}
                  </h3>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-green-700">Packages Selected</p>
                    <p className="text-3xl font-bold text-green-900">
                      {selectedPackages.length}
                    </p>
                  </div>

                  <div className="border-t border-green-300 pt-3">
                    <p className="text-sm text-green-700 mb-1">Current Cost</p>
                    <p className="text-2xl font-bold text-green-900">
                      KES {selectedCost.toLocaleString()}
                    </p>
                  </div>

                  <div className="bg-green-200 rounded-lg p-3">
                    <p className="text-sm text-green-700 mb-1">
                      Estimated Savings (15%)
                    </p>
                    <p className="text-2xl font-bold text-green-900">
                      KES {estimatedSavings.toLocaleString()}
                    </p>
                  </div>

                  <button
                    onClick={handleRequestConsolidation}
                    disabled={consolidating || selectedPackages.length < 2}
                    className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold transition-colors disabled:opacity-50 mt-4"
                  >
                    {consolidating ? 'Processing...' : t('consolidation.request')}
                  </button>
                </div>
              </div>
            )}

            {/* Consolidation Requests */}
            {requests.length > 0 && (
              <div className="card">
                <h3 className="text-lg font-bold text-[#1e3a5f] mb-4">
                  {t('consolidation.requests')}
                </h3>

                <div className="space-y-3">
                  {requests.map((req) => (
                    <div
                      key={req.id}
                      className="p-4 border border-gray-200 rounded-lg"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold text-gray-900">
                          {req.packageCount} packages
                        </h4>
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                            req.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : req.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        Requested{' '}
                        {new Date(req.createdAt).toLocaleDateString()}
                      </p>
                      {req.completedAt && (
                        <p className="text-sm text-green-600">
                          Completed{' '}
                          {new Date(req.completedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
