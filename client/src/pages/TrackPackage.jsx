import React, { useState, useEffect } from 'react'
import {
  Search, Package, Check, Clock, AlertCircle,
  ArrowRight, Box, MapPin, Truck, Globe, LogIn,
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { ordersApi } from '../api'
import { SEO } from '../components/SEO'
import { Link, useSearchParams, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { PillLabel } from '../components/ui'
import { Reveal } from '../components/motion'

const STATUS_LABELS = {
  pending: 'Order Placed',
  received_at_warehouse: 'Received at Warehouse',
  consolidating: 'Consolidating',
  in_transit: 'In Transit',
  customs: 'Customs Clearance',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

const STATUS_BADGE = {
  pending: 'badge-gray',
  received_at_warehouse: 'badge-blue',
  consolidating: 'badge-indigo',
  in_transit: 'badge-ember',
  customs: 'badge-amber',
  out_for_delivery: 'badge-green',
  delivered: 'badge-green',
  cancelled: 'badge-red',
}

function estimateDelivery(order) {
  if (!order) return null
  if (order.status === 'delivered') return order.updated_at ? new Date(order.updated_at) : null
  const base = order.created_at ? new Date(order.created_at) : new Date()
  const days = order.shipping_speed === 'express' ? 10 : 21
  const est = new Date(base)
  est.setDate(est.getDate() + days)
  return est
}

export const TrackPackage = () => {
  const { t } = useLanguage()
  const { isAuthenticated } = useAuth()
  const [searchParams] = useSearchParams()
  const { tn } = useParams()
  const [trackingNumber, setTrackingNumber] = useState(tn || searchParams.get('q') || '')
  const [loading, setLoading] = useState(false)
  const [package_, setPackage] = useState(null)
  const [error, setError] = useState(null)
  const [myOrders, setMyOrders] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(false)

  const statusTimeline = [
    { status: 'pending',               label: 'Order Placed',          icon: Package },
    { status: 'received_at_warehouse', label: 'Received at Warehouse', icon: MapPin },
    { status: 'consolidating',         label: 'Consolidating',         icon: Box },
    { status: 'in_transit',            label: 'In Transit',            icon: Truck },
    { status: 'customs',               label: 'Customs Clearance',     icon: Globe },
    { status: 'out_for_delivery',      label: 'Out for Delivery',      icon: ArrowRight },
    { status: 'delivered',             label: 'Delivered',             icon: Check },
  ]

  useEffect(() => {
    const initial = (tn || searchParams.get('q') || '').trim()
    if (initial) {
      setTrackingNumber(initial)
      setLoading(true)
      ordersApi.track(initial)
        .then((res) => { setPackage(res.data.tracking); setLoading(false) })
        .catch(() => { setError(t('track.notFound')); setLoading(false) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (isAuthenticated) fetchMyOrders() }, [isAuthenticated])

  const fetchMyOrders = async () => {
    try {
      setLoadingOrders(true)
      const res = await ordersApi.list({ limit: 20 })
      setMyOrders(res.data.orders || [])
    } catch (err) { console.error('Failed to load orders:', err) }
    finally { setLoadingOrders(false) }
  }

  const handleTrack = async (e) => {
    e.preventDefault()
    if (!trackingNumber.trim()) { setError(t('track.notFound')); return }
    try {
      setLoading(true); setError(null)
      const response = await ordersApi.track(trackingNumber)
      setPackage(response.data.tracking)
    } catch (err) {
      setError(t('track.notFound')); toast.error(t('track.notFound')); setPackage(null)
    } finally { setLoading(false) }
  }

  const handleQuickTrack = (trackNum) => {
    setTrackingNumber(trackNum); setPackage(null); setError(null); setLoading(true)
    ordersApi.track(trackNum)
      .then((res) => { setPackage(res.data.tracking); setLoading(false) })
      .catch(() => { setError(t('track.notFound')); setLoading(false) })
  }

  const currentStatusIndex = package_
    ? Math.max(0, statusTimeline.findIndex((s) => s.status === package_.status))
    : -1
  const estimatedDelivery = estimateDelivery(package_)

  return (
    <div className="relative overflow-x-hidden">
      <SEO title="Track Your Package"
        description="Track your shipment in real time with Thapsus Cargo. Enter your tracking number to see the latest status of your package from the UK to Kenya." />

      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[44rem] h-[44rem] bg-ember-radial blur-2xl pointer-events-none" />

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-12 lg:py-16 relative">
        {/* Header */}
        <Reveal className="text-center mb-10 space-y-5">
          <div className="flex justify-center"><PillLabel>Live logistics tracking</PillLabel></div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white">{t('track.title') || 'Track your package'}</h1>
          <p className="text-mute max-w-md mx-auto">Get instant visibility into your package's global journey.</p>
        </Reveal>

        {/* Search */}
        <form onSubmit={handleTrack} className="max-w-2xl mx-auto mb-12 relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30" size={20} />
          <input type="text" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder={t('track.placeholder') || 'Enter tracking number…'}
            className="form-input !rounded-full pl-14 pr-36 py-4 text-base" />
          <button type="submit" disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 btn-primary glass-sheen min-w-[120px]">
            {loading ? 'Locating…' : (t('track.search') || 'Track')}
          </button>
        </form>

        {error && (
          <div className="max-w-2xl mx-auto mb-10 alert-error animate-scale-in">
            <AlertCircle className="shrink-0" size={22} />
            <p className="font-medium">{error}</p>
          </div>
        )}

        {/* Result */}
        {package_ && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mb-14 animate-fade-in">
            {/* Timeline */}
            <div className="lg:col-span-7">
              <div className="card p-7 lg:p-8">
                <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-mute mb-8 flex items-center gap-2">
                  <Clock size={14} /> Global transit timeline
                </h3>
                <div className="relative">
                  {statusTimeline.map((step, idx) => {
                    const isCompleted = idx <= currentStatusIndex
                    const isCurrent = idx === currentStatusIndex
                    const Icon = step.icon
                    return (
                      <div key={step.status} className="relative mb-10 last:mb-0">
                        {idx < statusTimeline.length - 1 && (
                          <div className="absolute left-6 top-14 w-px h-8 bg-line overflow-hidden">
                            <div className={`h-full bg-emerald-500 transition-transform duration-1000 delay-300 ${isCompleted ? 'translate-y-0' : '-translate-y-full'}`} />
                          </div>
                        )}
                        <div className="flex items-start gap-6">
                          <div className={`relative shrink-0 w-12 h-12 rounded-2xl grid place-items-center transition-all duration-500 ${
                            isCurrent ? 'bg-ember-gradient text-white shadow-ember-sm scale-110'
                            : isCompleted ? 'bg-emerald-500 text-white'
                            : 'bg-surface-2 border border-line text-white/25'}`}>
                            <Icon size={20} />
                            {isCurrent && <span className="absolute inset-0 rounded-2xl bg-ember-500/30 animate-ping" />}
                          </div>
                          <div className="pt-1.5">
                            <h4 className={`text-base font-bold ${isCurrent || isCompleted ? 'text-white' : 'text-white/25'}`}>{step.label}</h4>
                            {isCurrent && <span className="badge-ember mt-1.5">Current station</span>}
                            {isCompleted && !isCurrent && <p className="text-xs text-emerald-400 font-semibold mt-1">Processed</p>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Status + manifest */}
            <div className="lg:col-span-5 space-y-6">
              <div className="glow-card p-7 lg:p-8">
                <div className="flex justify-between items-center mb-8">
                  <span className="ember-badge w-12 h-12"><Package size={22} /></span>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.05] border border-line text-[10px] font-semibold uppercase tracking-[0.2em] text-mute">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Secure status
                  </div>
                </div>
                <div className="space-y-6">
                  <div>
                    <p className="text-[10px] font-semibold text-mute uppercase tracking-widest mb-1">Tracking number</p>
                    <p className="text-2xl font-bold text-white">{trackingNumber}</p>
                  </div>
                  <div className="h-px bg-line" />
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-[10px] font-semibold text-mute uppercase tracking-widest mb-1">Status</p>
                      <p className="text-base font-bold text-ember-400">{STATUS_LABELS[package_.status] || package_.status?.replace(/_/g, ' ')}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-mute uppercase tracking-widest mb-1">{package_.status === 'delivered' ? 'Delivered on' : 'Est. delivery'}</p>
                      <p className="text-base font-bold text-white">{estimatedDelivery ? estimatedDelivery.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card p-7 lg:p-8">
                <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-mute mb-5">Package manifest</h3>
                <div className="space-y-1">
                  <div className="flex justify-between items-center py-3 border-b border-line">
                    <span className="text-sm text-mute">Hub region</span>
                    <span className="font-semibold text-white">{package_.market} Hub</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-line">
                    <span className="text-sm text-mute">Dead weight</span>
                    <span className="font-semibold text-white">{package_.weight_kg || '—'} KG</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-line">
                    <span className="text-sm text-mute">Total fees (KES)</span>
                    <span className="font-bold text-white text-lg">{package_.estimated_cost?.toLocaleString() || 0}</span>
                  </div>
                  {package_.description && (
                    <div className="pt-4">
                      <span className="text-sm text-mute block mb-2">Item description</span>
                      <div className="p-4 bg-surface-2 border border-line rounded-2xl text-sm text-white/80">{package_.description}</div>
                    </div>
                  )}
                </div>
              </div>

              <Link to="/support" className="group flex items-center justify-between gap-4 rounded-3xl bg-surface border border-line hover:border-line-strong p-6 transition-colors">
                <div>
                  <h4 className="font-bold text-white">Need assistance?</h4>
                  <p className="text-xs text-mute">Connect with a dispatcher</p>
                </div>
                <span className="w-11 h-11 rounded-2xl bg-white/[0.06] grid place-items-center text-ember-400 group-hover:bg-ember-gradient group-hover:text-white transition-all"><ArrowRight size={20} /></span>
              </Link>
            </div>
          </div>
        )}

        {/* My packages / sign-in prompt */}
        {isAuthenticated ? (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white">My packages</h2>
                <p className="text-sm text-mute mt-1">All your active and past shipments</p>
              </div>
              {loadingOrders && <div className="spinner w-5 h-5" />}
            </div>

            {!loadingOrders && myOrders.length === 0 && (
              <div className="card empty-state">
                <Package size={44} className="text-white/15 mb-4" />
                <p className="empty-state-title">You don't have any packages yet.</p>
                <Link to="/orders/new" className="btn-primary glass-sheen mt-4">Create first order</Link>
              </div>
            )}

            {!loadingOrders && myOrders.length > 0 && (
              <div className="space-y-3">
                {myOrders.map((order) => {
                  const delivery = estimateDelivery(order)
                  const isActive = !['delivered', 'cancelled'].includes(order.status)
                  return (
                    <div key={order.id} onClick={() => handleQuickTrack(order.tracking_number)}
                      className="card cursor-pointer group p-5">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4">
                          <span className={`w-12 h-12 rounded-2xl grid place-items-center shrink-0 ${isActive ? 'bg-ember-500/10 text-ember-400 border border-ember-500/20' : 'bg-white/[0.04] text-mute border border-line'}`}>
                            <Package size={22} />
                          </span>
                          <div>
                            <p className="font-bold text-white">{order.tracking_number}</p>
                            <p className="text-xs text-mute mt-0.5">{order.retailer} · {order.market} Hub</p>
                          </div>
                        </div>
                        <div className="hidden md:block flex-1 min-w-0 px-4">
                          <p className="text-sm text-white/70 truncate">{order.description}</p>
                          {order.weight_kg && <p className="text-xs text-mute mt-0.5">{order.weight_kg} kg</p>}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap justify-end">
                          <span className={STATUS_BADGE[order.status] || 'badge-gray'}>{STATUS_LABELS[order.status] || order.status?.replace(/_/g, ' ')}</span>
                          {(order.actual_cost || order.estimated_cost) && (
                            <span className="text-sm font-bold text-white">KES {(order.actual_cost || order.estimated_cost)?.toLocaleString()}{!order.actual_cost && <span className="text-[10px] text-mute ml-1">est.</span>}</span>
                          )}
                          <span className="w-8 h-8 rounded-xl bg-white/[0.06] grid place-items-center text-mute group-hover:bg-ember-gradient group-hover:text-white transition-all"><ArrowRight size={14} /></span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          !package_ && (
            <div className="mt-2">
              <div className="glow-card p-8 flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
                <span className="ember-badge w-16 h-16 rounded-3xl"><LogIn size={28} /></span>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white mb-1.5">See all your packages</h3>
                  <p className="text-mute text-sm">Sign in to view all your active and past shipments, their statuses, and delivery estimates in one place.</p>
                </div>
                <Link to="/login" className="btn-primary glass-sheen shrink-0">Sign in</Link>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}

export default TrackPackage
