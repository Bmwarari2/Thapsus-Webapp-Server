import React, { useState, useEffect } from 'react'
import {
  Search, Package, Check, Clock, AlertCircle,
  ArrowRight, Box, MapPin, Truck, Globe, Zap, LogIn
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { ordersApi } from '../api'
import { SEO } from '../components/SEO'
import { Link, useSearchParams, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'

// Human-readable labels for every order status
const STATUS_LABELS = {
  pending:               'Order Placed',
  received_at_warehouse: 'Received at Warehouse',
  consolidating:         'Consolidating',
  in_transit:            'In Transit',
  customs:               'Customs Clearance',
  out_for_delivery:      'Out for Delivery',
  delivered:             'Delivered',
  cancelled:             'Cancelled',
}

const STATUS_COLORS = {
  pending:               'bg-slate-100 text-slate-600 border-slate-200',
  received_at_warehouse: 'bg-blue-50 text-blue-700 border-blue-200',
  consolidating:         'bg-indigo-50 text-indigo-700 border-indigo-200',
  in_transit:            'bg-orange-50 text-orange-700 border-orange-200',
  customs:               'bg-amber-50 text-amber-700 border-amber-200',
  out_for_delivery:      'bg-green-50 text-green-700 border-green-200',
  delivered:             'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled:             'bg-red-50 text-red-600 border-red-200',
}

// Estimate delivery date from order data
function estimateDelivery(order) {
  if (!order) return null
  if (order.status === 'delivered') return order.updated_at ? new Date(order.updated_at) : null
  const base = order.created_at ? new Date(order.created_at) : new Date()
  const days = order.shipping_speed === 'express' ? 10 : 21
  const est = new Date(base)
  est.setDate(est.getDate() + days)
  return est
}

/**
 * LIQUID GLASS COMPONENTS
 */
const LiquidBlob = ({ className, color }) => (
  <div className={`absolute blur-[120px] rounded-full mix-blend-multiply opacity-60 animate-morph ${className} ${color}`} />
);

const GlassCard = ({ children, className = "" }) => (
  <div className={`relative overflow-hidden rounded-[2.5rem] bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
    {children}
  </div>
);

export const TrackPackage = () => {
  const { t } = useLanguage()
  const { user, isAuthenticated } = useAuth()
  const [searchParams] = useSearchParams()
  // /track/:tn (universal-link landing) takes priority over ?q= for the
  // initial input value. Both fall through to the same auto-search effect
  // below so a deep link from email or iOS lands on the result, not on a
  // blank form.
  const { tn } = useParams()
  const [trackingNumber, setTrackingNumber] = useState(tn || searchParams.get('q') || '')
  const [loading, setLoading] = useState(false)
  const [package_, setPackage] = useState(null)
  const [error, setError] = useState(null)

  // Signed-in user's orders
  const [myOrders, setMyOrders] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(false)

  // All 6 user-facing statuses in order — must mirror the DB CHECK constraint
  const statusTimeline = [
    { status: 'pending',               label: 'Order Placed',          icon: Package },
    { status: 'received_at_warehouse', label: 'Received at Warehouse', icon: MapPin  },
    { status: 'consolidating',         label: 'Consolidating',         icon: Box     },
    { status: 'in_transit',            label: 'In Transit',            icon: Truck   },
    { status: 'customs',               label: 'Customs Clearance',     icon: Globe   },
    { status: 'out_for_delivery',      label: 'Out for Delivery',      icon: ArrowRight },
    { status: 'delivered',             label: 'Delivered',             icon: Check   },
  ]

  // Auto-search on either ?q= (hero tracking input) or /track/:tn (universal
  // links from iOS / shared links from customer email). Path param wins.
  useEffect(() => {
    const initial = (tn || searchParams.get('q') || '').trim()
    if (initial) {
      setTrackingNumber(initial)
      setLoading(true)
      ordersApi.track(initial)
        .then(res => { setPackage(res.data.tracking); setLoading(false) })
        .catch(() => { setError(t('track.notFound')); setLoading(false) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load user's orders when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchMyOrders()
    }
  }, [isAuthenticated])

  const fetchMyOrders = async () => {
    try {
      setLoadingOrders(true)
      const res = await ordersApi.list({ limit: 20 })
      setMyOrders(res.data.orders || [])
    } catch (err) {
      console.error('Failed to load orders:', err)
    } finally {
      setLoadingOrders(false)
    }
  }

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

  const handleQuickTrack = (trackNum) => {
    setTrackingNumber(trackNum)
    setPackage(null)
    setError(null)
    // Trigger search automatically
    setLoading(true)
    ordersApi.track(trackNum)
      .then(res => { setPackage(res.data.tracking); setLoading(false) })
      .catch(() => { setError(t('track.notFound')); setLoading(false) })
  }

  // Returns -1 only before a search; after a successful lookup always ≥ 0
  const currentStatusIndex = package_
    ? Math.max(0, statusTimeline.findIndex((s) => s.status === package_.status))
    : -1

  const estimatedDelivery = estimateDelivery(package_)

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-x-hidden relative">
      <SEO
        title="Track Your Package"
        description="Track your shipment in real time with Thapsus Cargo. Enter your tracking number to see the latest status of your package from the UK to Kenya."
      />
      <style>{`
        @keyframes morph {
          0% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes sheen {
          0% { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(200%) skewX(-15deg); }
        }
        .animate-morph { animation: morph 12s ease-in-out infinite; }
        .glass-sheen { position: relative; overflow: hidden; }
        .glass-sheen::after {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 50%; height: 100%;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.3), transparent);
          animation: sheen 4s infinite;
        }
      `}</style>

      {/* Background Liquid Elements */}
      <LiquidBlob className="top-[-10%] left-[-5%] w-[500px] h-[500px]" color="bg-blue-100" />
      <LiquidBlob className="bottom-[10%] right-[-5%] w-[600px] h-[600px]" color="bg-orange-100" />
      <div className="absolute inset-0 bg-white/20 backdrop-blur-[2px]" />

      <div className="max-w-4xl mx-auto px-6 py-12 lg:py-20 relative z-10">
        {/* Header */}
        <div className="text-center mb-12 lg:mb-16 space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/60 backdrop-blur-md border border-white/50 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-2">
            <Zap size={10} className="text-orange-700" />
            Live Logistics Tracking
          </div>
          <h1 className="text-5xl lg:text-7xl font-black text-[#0f172a] tracking-tighter uppercase leading-none">
            {t('track.title')}
          </h1>
          <p className="text-slate-500 font-medium max-w-md mx-auto">
            Get instant visibility into your package's global journey.
          </p>
        </div>

        {/* Search Bar - Glassmorphic */}
        <div className="max-w-2xl mx-auto mb-16">
          <form onSubmit={handleTrack} className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-orange-400 to-blue-400 rounded-[2.5rem] blur opacity-10 group-hover:opacity-30 transition duration-1000"></div>
            <div className="relative flex items-center gap-2 p-2 bg-white/80 backdrop-blur-2xl border border-white/50 rounded-[2.5rem] shadow-2xl">
              <Search className="ml-6 text-slate-400" size={20} />
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder={t('track.placeholder')}
                className="w-full px-4 py-4 bg-transparent border-none outline-none focus:ring-0 text-slate-800 font-bold placeholder:text-slate-300"
              />
              <button
                type="submit"
                disabled={loading}
                className="glass-sheen bg-[#0f172a] text-white px-10 py-4 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-slate-800 transition-all disabled:opacity-50 min-w-[140px]"
              >
                {loading ? 'Locating...' : t('track.search')}
              </button>
            </div>
          </form>
        </div>

        {/* Error Message */}
        {error && (
          <div className="max-w-2xl mx-auto mb-12 animate-in fade-in zoom-in duration-300">
            <div className="bg-red-50/80 backdrop-blur-md border border-red-200/50 p-6 rounded-[2rem] flex items-center gap-4 text-red-800 shadow-sm">
              <AlertCircle className="shrink-0" size={24} />
              <p className="font-bold text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Package Details Display */}
        {package_ && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in slide-in-from-bottom-8 duration-700 mb-16">

            {/* Left Column: Timeline */}
            <div className="lg:col-span-7">
              <GlassCard className="p-8 lg:p-10">
                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400 mb-10 flex items-center gap-2">
                  <Clock size={14} /> Global Transit Timeline
                </h3>

                <div className="relative">
                  {statusTimeline.map((step, idx) => {
                    const isCompleted = idx <= currentStatusIndex
                    const isCurrent = idx === currentStatusIndex
                    const Icon = step.icon

                    return (
                      <div key={step.status} className="relative mb-12 last:mb-0 group">
                        {/* Vertical Line */}
                        {idx < statusTimeline.length - 1 && (
                          <div className="absolute left-6 top-14 w-[2px] h-10 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full bg-gradient-to-b from-green-500 to-green-400 transition-all duration-1000 delay-300 ${
                                isCompleted ? 'translate-y-0' : '-translate-y-full'
                              }`}
                            />
                          </div>
                        )}

                        <div className="flex items-start gap-8">
                          {/* Circle Icon */}
                          <div
                            className={`relative shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                              isCurrent
                                ? 'bg-[#0f172a] text-white shadow-xl shadow-slate-200 scale-110'
                                : isCompleted
                                  ? 'bg-green-500 text-white'
                                  : 'bg-white border border-slate-100 text-slate-300'
                            }`}
                          >
                            <Icon size={20} />
                            {isCurrent && (
                              <div className="absolute inset-0 rounded-2xl bg-[#0f172a]/20 animate-ping opacity-20" />
                            )}
                          </div>

                          {/* Text Content */}
                          <div className="pt-1">
                            <h4 className={`text-lg font-black tracking-tight ${isCurrent || isCompleted ? 'text-slate-900' : 'text-slate-300'}`}>
                              {step.label}
                            </h4>
                            {isCurrent && (
                              <div className="mt-1 flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-md text-[9px] font-black uppercase tracking-wider">
                                  Current Station
                                </span>
                              </div>
                            )}
                            {isCompleted && !isCurrent && (
                              <p className="text-xs text-green-600 font-bold mt-1">Processed</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </GlassCard>
            </div>

            {/* Right Column: Status Card */}
            <div className="lg:col-span-5 space-y-8">
              <GlassCard className="p-8 lg:p-10 bg-slate-900/5">
                <div className="flex justify-between items-center mb-10">
                  <div className="p-3 bg-white rounded-2xl shadow-xl text-orange-700"><Package size={24}/></div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-white/60 backdrop-blur-md rounded-full text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 shadow-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Secure Status
                  </div>
                </div>

                <div className="space-y-8">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tracking Number</p>
                    <p className="text-2xl font-black text-[#0f172a]">{trackingNumber}</p>
                  </div>

                  <div className="h-px bg-slate-200/50 w-full" />

                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                      <p className="text-lg font-black text-orange-600 uppercase tracking-tighter">
                        {STATUS_LABELS[package_.status] || package_.status?.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                        {package_.status === 'delivered' ? 'Delivered On' : 'Est. Delivery'}
                      </p>
                      <p className="text-lg font-black text-slate-900">
                        {estimatedDelivery
                          ? estimatedDelivery.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-8 lg:p-10">
                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400 mb-6">Package Manifest</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-slate-50">
                    <span className="text-sm font-bold text-slate-400">Hub Region</span>
                    <span className="font-black text-slate-900 uppercase tracking-tight">{package_.market} Hub</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-slate-50">
                    <span className="text-sm font-bold text-slate-400">Dead Weight</span>
                    <span className="font-black text-slate-900">{package_.weight_kg || '—'} KG</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-slate-50">
                    <span className="text-sm font-bold text-slate-400">Total Fees (KES)</span>
                    <span className="font-black text-[#0f172a] text-xl">
                      {package_.estimated_cost?.toLocaleString() || 0}
                    </span>
                  </div>
                  {package_.description && (
                    <div className="pt-4">
                      <span className="text-sm font-bold text-slate-400 block mb-2">Item Description</span>
                      <div className="p-4 bg-slate-50 rounded-2xl text-sm font-medium text-slate-600">
                        {package_.description}
                      </div>
                    </div>
                  )}
                </div>
              </GlassCard>

              {/* Support Quick Link */}
              <div className="bg-[#0f172a] p-8 rounded-[2.5rem] text-white flex items-center justify-between group cursor-pointer hover:shadow-2xl transition-all">
                <div>
                   <h4 className="font-black uppercase tracking-tighter text-lg">Need Assistance?</h4>
                   <p className="text-xs text-slate-400 font-bold">Connect with a dispatcher</p>
                </div>
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center group-hover:bg-orange-500 transition-colors">
                  <ArrowRight size={20} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MY PACKAGES (signed-in users) ── */}
        {isAuthenticated ? (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-black text-[#0f172a] uppercase tracking-tighter">My Packages</h2>
                <p className="text-sm text-slate-500 font-bold mt-1">All your active and past shipments</p>
              </div>
              {loadingOrders && (
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Loading...
                </div>
              )}
            </div>

            {!loadingOrders && myOrders.length === 0 && (
              <GlassCard className="p-12 text-center">
                <Package size={48} className="text-slate-200 mx-auto mb-4" />
                <p className="text-slate-500 font-bold">You don't have any packages yet.</p>
                <Link to="/orders/new" className="inline-block mt-4 px-6 py-3 bg-[#0f172a] text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition-all">
                  Create First Order
                </Link>
              </GlassCard>
            )}

            {!loadingOrders && myOrders.length > 0 && (
              <div className="space-y-4">
                {myOrders.map((order) => {
                  const statusColor = STATUS_COLORS[order.status] || 'bg-slate-100 text-slate-600 border-slate-200'
                  const delivery = estimateDelivery(order)
                  const isActive = !['delivered', 'cancelled'].includes(order.status)

                  return (
                    <GlassCard key={order.id} className="p-6 hover:shadow-lg transition-all cursor-pointer group" onClick={() => handleQuickTrack(order.tracking_number)}>
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        {/* Left: icon + tracking */}
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isActive ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-400'}`}>
                            <Package size={22} />
                          </div>
                          <div>
                            <p className="font-black text-[#0f172a] tracking-tighter text-lg">{order.tracking_number}</p>
                            <p className="text-xs text-slate-400 font-bold mt-0.5">{order.retailer} · {order.market} Hub</p>
                          </div>
                        </div>

                        {/* Middle: description */}
                        <div className="hidden md:block flex-1 min-w-0 px-4">
                          <p className="text-sm text-slate-600 font-bold truncate">{order.description}</p>
                          {order.weight_kg && (
                            <p className="text-xs text-slate-400 font-bold mt-0.5">{order.weight_kg} kg</p>
                          )}
                        </div>

                        {/* Right: status + cost + date */}
                        <div className="flex items-center gap-3 flex-wrap justify-end">
                          <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${statusColor}`}>
                            {STATUS_LABELS[order.status] || order.status?.replace(/_/g, ' ')}
                          </span>
                          {(order.actual_cost || order.estimated_cost) && (
                            <span className="text-sm font-black text-slate-900">
                              KES {(order.actual_cost || order.estimated_cost)?.toLocaleString()}
                              {!order.actual_cost && <span className="text-[9px] text-slate-400 font-bold ml-1">est.</span>}
                            </span>
                          )}
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                              {order.status === 'delivered' ? 'Delivered' : 'Est. Arrival'}
                            </p>
                            <p className="text-xs font-black text-slate-700">
                              {delivery
                                ? delivery.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                                : '—'}
                            </p>
                          </div>
                          <div className="w-8 h-8 bg-white/80 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-orange-500 group-hover:text-white transition-all">
                            <ArrowRight size={14} />
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          /* Not signed in — prompt to login */
          !package_ && (
            <div className="mt-4">
              <GlassCard className="p-10 flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
                <div className="w-16 h-16 bg-orange-100 rounded-3xl flex items-center justify-center shrink-0">
                  <LogIn size={28} className="text-orange-700" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-black text-[#0f172a] uppercase tracking-tighter mb-2">See All Your Packages</h3>
                  <p className="text-slate-500 font-bold text-sm">Sign in to view all your active and past shipments, their statuses, and delivery estimates in one place.</p>
                </div>
                <Link to="/login" className="glass-sheen shrink-0 bg-[#0f172a] text-white px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-800 transition-all">
                  Sign In
                </Link>
              </GlassCard>
            </div>
          )
        )}
      </div>
    </div>
  )
}

export default TrackPackage;
