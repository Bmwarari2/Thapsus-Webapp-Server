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
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  const selectedCost = packages
    .filter((pkg) => selectedPackages.includes(pkg.id))
    .reduce((sum, pkg) => sum + (pkg.shippingCost || 0), 0)

  const estimatedSavings = selectedCost * 0.15 // 15% savings estimate

  return (
    <div className="min-h-screen relative bg-slate-50 overflow-hidden py-12 px-4 font-sans">
      {/* Liquid Backgrounds */}
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-blue-300/30 rounded-full blur-[100px] animate-morph mix-blend-multiply pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-orange-300/20 rounded-full blur-[100px] animate-morph mix-blend-multiply pointer-events-none" />
      <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[40vw] h-[40vw] max-w-[400px] max-h-[400px] bg-indigo-200/20 rounded-full blur-[120px] animate-morph mix-blend-multiply pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl md:text-5xl font-black text-[#1e3a5f] mb-3 leading-none tracking-tighter">
            {t('consolidation.title')}
          </h1>
          <p className="text-slate-600 text-lg font-medium">{t('consolidation.description')}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Packages List */}
          <div className="lg:col-span-2">
            {packages.length > 0 ? (
              <div className="bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-6 relative overflow-hidden glass-sheen">
                <h2 className="text-2xl font-black text-[#1e3a5f] tracking-tighter leading-none mb-6">
                  {t('consolidation.selectPackages')}
                </h2>

                <div className="space-y-3 relative z-10">
                  {packages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className="group flex items-center gap-4 p-4 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl hover:bg-white/70 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
                      onClick={() => handleSelectPackage(pkg.id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPackages.includes(pkg.id)}
                        onChange={() => handleSelectPackage(pkg.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-5 h-5 accent-orange-500 rounded cursor-pointer transition-transform group-hover:scale-110"
                      />
                      <div className="flex-1">
                        <h3 className="font-bold text-slate-800 tracking-tight">
                          {pkg.id.slice(0, 8).toUpperCase()}
                        </h3>
                        <p className="text-sm font-medium text-slate-500">
                          {pkg.market} • {pkg.weight_kg} kg • Arrived{' '}
                          {pkg.received_at ? new Date(pkg.received_at).toLocaleDateString() : '—'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-[#1e3a5f] tracking-tight">
                          {pkg.tracking_number || (pkg.id || '').slice(0, 8).toUpperCase()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Empty State - Border Gradient Bento */
              <div className="rounded-2xl p-[1px] bg-gradient-to-br from-blue-300/60 via-white/20 to-orange-300/60 shadow-lg transform transition-transform hover:scale-[1.01] duration-500">
                <div className="bg-white/60 backdrop-blur-3xl rounded-[15px] p-12 text-center relative overflow-hidden glass-sheen">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-blue-400/10 rounded-full blur-[50px] pointer-events-none" />
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-orange-400/10 rounded-full blur-[50px] pointer-events-none" />
                  
                  <div className="w-20 h-20 bg-white/40 backdrop-blur-xl border border-white/60 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                    <Package className="text-slate-400" size={40} />
                  </div>
                  <p className="text-2xl font-black text-[#1e3a5f] tracking-tighter mb-2">
                    {t('consolidation.noPackages')}
                  </p>
                  <p className="text-slate-600 font-medium max-w-md mx-auto">
                    You don't have any packages available for consolidation right now.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Summary Sidebar */}
          <div className="space-y-8">
            {/* Savings Card - Dark Glass Bento with Green Orb */}
            {selectedPackages.length > 0 && (
              <div className="group relative overflow-hidden bg-[#0f172a]/80 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 text-white shadow-2xl transition-transform duration-500 hover:-rotate-1 hover:scale-[1.02] transform perspective-1000 glass-sheen">
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-green-500/30 rounded-full blur-[70px] pointer-events-none" />
                
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-green-500/20 rounded-lg backdrop-blur-md border border-green-500/30 shadow-sm">
                      <Zap className="text-green-400" size={20} />
                    </div>
                    <h3 className="text-2xl font-black tracking-tighter leading-none">
                      {t('consolidation.estimatedSavings')}
                    </h3>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10 backdrop-blur-sm">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Packages Selected</p>
                      <p className="text-3xl font-black text-white tracking-tighter">
                        {selectedPackages.length}
                      </p>
                    </div>

                    <div className="border-t border-white/10 pt-4">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Current Cost</p>
                      <p className="text-xl font-bold text-slate-300 tracking-tight">
                        KES {selectedCost.toLocaleString()}
                      </p>
                    </div>

                    <div className="bg-gradient-to-br from-green-500/20 to-emerald-600/10 rounded-xl p-4 border border-green-500/30 backdrop-blur-md">
                      <p className="text-xs font-bold text-green-300 uppercase tracking-widest mb-1">
                        Estimated Savings (15%)
                      </p>
                      <p className="text-2xl font-black text-green-400 tracking-tighter">
                        KES {estimatedSavings.toLocaleString()}
                      </p>
                    </div>

                    <button
                      onClick={handleRequestConsolidation}
                      disabled={consolidating || selectedPackages.length < 2}
                      className="group/btn relative overflow-hidden w-full bg-green-500 hover:bg-green-400 text-slate-900 py-4 rounded-xl font-black tracking-tight transition-all disabled:opacity-50 mt-6 shadow-lg hover:shadow-xl hover:-translate-y-1 glass-sheen"
                    >
                      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover/btn:animate-[shimmer_1.5s_infinite]" />
                      <span className="relative z-10">{consolidating ? 'Processing...' : t('consolidation.request')}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Consolidation Requests - Crystal Borders */}
            {requests.length > 0 && (
              <div className="bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-6 relative overflow-hidden glass-sheen">
                <h3 className="text-xl font-black text-[#1e3a5f] tracking-tighter leading-none mb-6 relative z-10">
                  {t('consolidation.requests')}
                </h3>

                <div className="space-y-3 relative z-10">
                  {requests.map((req) => (
                    <div
                      key={req.id}
                      className="bg-white/50 backdrop-blur-md border border-white/60 rounded-xl p-4 shadow-sm hover:bg-white/60 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-slate-800 tracking-tight">
                          {req.packageCount} packages
                        </h4>
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                            req.status === 'completed'
                              ? 'bg-green-100/80 text-green-700 border-green-200'
                              : req.status === 'pending'
                                ? 'bg-orange-100/80 text-orange-700 border-orange-200'
                                : 'bg-slate-100/80 text-slate-700 border-slate-200'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                      <div className="space-y-1 mt-3">
                        <p className="text-xs font-semibold text-slate-500">
                          Requested on{' '}
                          <span className="text-slate-700">{new Date(req.createdAt).toLocaleDateString()}</span>
                        </p>
                        {req.completedAt && (
                          <p className="text-xs font-semibold text-green-600">
                            Completed on{' '}
                            <span className="text-green-700">{new Date(req.completedAt).toLocaleDateString()}</span>
                          </p>
                        )}
                      </div>
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
