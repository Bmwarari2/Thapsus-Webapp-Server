// Dashboard.jsx — Customer home (dark "Ember" redesign)
// Top-to-bottom: welcome header · cut-off banner · Buy-for-me hero ·
// pre-register card · "this month" stat tiles · recent active orders.

import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Eye, ArrowRight, Box, Wand2, ShoppingBag } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { ordersApi } from '../api'
import toast from 'react-hot-toast'
import { useOrderUpdates } from '../hooks/useRealtimeUpdates'
import { CutoffBanner } from '../components/CutoffBanner'
import { PillLabel, Stat } from '../components/ui'
import { Reveal, CountUp } from '../components/motion'

const ACTIVE_STATUSES = ['pending', 'received_at_warehouse', 'consolidating', 'in_transit', 'customs', 'out_for_delivery']

const STATUS_BADGE = {
  pending: 'badge-amber',
  received_at_warehouse: 'badge-blue',
  consolidating: 'badge-purple',
  in_transit: 'badge-indigo',
  customs: 'badge-ember',
  out_for_delivery: 'badge-blue',
  delivered: 'badge-green',
  cancelled: 'badge-red',
}

export const Dashboard = () => {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const r = await ordersApi.list()
        setOrders(r.data?.orders || [])
      } catch (err) {
        toast.error('Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  useOrderUpdates(({ order }) => {
    if (!order) return
    setOrders((prev) => {
      const without = prev.filter((o) => o.id !== order.id)
      return [order, ...without].sort(
        (a, b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt),
      )
    })
  })

  const now = new Date()
  const thisMonthParcels = orders.filter((o) => {
    const d = new Date(o.created_at || o.createdAt || 0)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length
  const inTransit = orders.filter((o) => o.status === 'in_transit').length
  const outForDelivery = orders.filter((o) => o.status === 'out_for_delivery').length
  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status))

  const formatStatus = (status) =>
    status?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Pending'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="spinner w-12 h-12" />
      </div>
    )
  }

  const firstName = user?.name?.split(' ')[0] || ''

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-10 md:py-14 space-y-6 animate-fade-in">
      {/* Welcome */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <PillLabel>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse -ml-0.5" />
            Home
          </PillLabel>
        </div>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white leading-tight">
          {t('dashboard.welcome') || 'Welcome back'}
          {firstName && <>, <span className="text-ember-gradient">{firstName}</span></>}
        </h1>
      </div>

      <CutoffBanner />

      {/* Buy-for-me hero (primary) */}
      <Link to="/buy-for-me"
        className="glass-sheen group block rounded-4xl p-6 md:p-7 bg-ember-gradient text-white shadow-ember hover:brightness-[1.05] transition-all hover:-translate-y-0.5">
        <div className="flex items-center gap-4 md:gap-5">
          <span className="w-14 h-14 rounded-2xl bg-white/20 grid place-items-center shrink-0"><Wand2 size={26} /></span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80 mb-1">Primary</p>
            <p className="text-xl md:text-2xl font-bold tracking-tight">Start a Buy-for-me request</p>
            <p className="text-sm text-white/90 mt-1.5">
              Send us a link from any UK retailer — we buy on your behalf, ship to Kenya, deliver to your door.
            </p>
          </div>
          <ArrowRight size={22} className="shrink-0 group-hover:translate-x-1 transition-transform" />
        </div>
      </Link>

      {/* Pre-register (secondary) */}
      <Link to="/new-order"
        className="group block rounded-4xl p-6 md:p-7 bg-surface border border-line hover:border-line-strong shadow-card hover:shadow-card-hover transition-all hover:-translate-y-0.5">
        <div className="flex items-center gap-4 md:gap-5">
          <span className="w-14 h-14 rounded-2xl bg-white/[0.06] border border-line grid place-items-center shrink-0 text-ember-400"><Box size={24} /></span>
          <div className="flex-1 min-w-0">
            <p className="text-lg md:text-xl font-bold tracking-tight text-white">Pre-register a parcel</p>
            <p className="text-sm text-mute mt-1.5">
              Already bought somewhere we don't cover? Tell us it's coming — your UK warehouse address is here too.
            </p>
          </div>
          <ArrowRight size={18} className="shrink-0 text-mute group-hover:translate-x-1 transition-transform" />
        </div>
      </Link>

      {/* Stat tiles */}
      <div className="pt-2">
        <p className="eyebrow mb-3 ml-1 !tracking-[0.25em]">This month</p>
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          <Stat label="Parcels" value={<CountUp to={thisMonthParcels} duration={1100} />} />
          <Stat label="In transit" value={<CountUp to={inTransit} duration={1100} />} accent />
          <Stat label="Out for delivery" value={<CountUp to={outForDelivery} duration={1100} />} />
        </div>
      </div>

      {/* Recent active orders */}
      <div className="card p-5 md:p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg md:text-xl font-bold text-white">{t('dashboard.recentOrders') || 'Recent orders'}</h2>
          <Link to="/orders" className="text-xs font-semibold text-ember-400 hover:text-ember-300 flex items-center gap-1 group">
            View all <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {activeOrders.length > 0 ? (
          <div className="rounded-2xl border border-line overflow-hidden">
            <div className="overflow-x-auto no-scrollbar">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tracking #</th>
                    <th>{t('orders.status') || 'Status'}</th>
                    <th>{t('orders.date') || 'Date'}</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeOrders.slice(0, 5).map((order) => (
                    <tr key={order.id}>
                      <td className="font-mono text-xs font-semibold text-white">
                        {order.tracking_number || `#${order.id.slice(0, 8)}`}
                      </td>
                      <td>
                        <span className={STATUS_BADGE[order.status] || 'badge-gray'}>{formatStatus(order.status)}</span>
                      </td>
                      <td className="text-xs text-mute">
                        {new Date(order.created_at || order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      </td>
                      <td className="text-right">
                        <Link to={`/orders/${order.id}`} title="View details"
                          className="inline-flex items-center justify-center p-2 rounded-xl bg-white/[0.06] text-ember-400 hover:bg-white/[0.1] transition-colors">
                          <Eye size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <ShoppingBag className="text-white/15 mb-4" size={40} />
            <p className="empty-state-title">No active parcels</p>
            <p className="empty-state-desc">Start a Buy-for-me request or pre-register a parcel above.</p>
          </div>
        )}
      </div>
    </div>
  )
}
