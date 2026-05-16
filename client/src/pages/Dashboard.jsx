// Dashboard.jsx
// Customer Home tab. Mirror of iOS CustomerDashboardView, top-to-bottom:
//   1. Welcome header (greeting + first name)
//   2. CutoffBanner (weekly outgoing-shipment countdown)
//   3. BFM hero card (primary action — full-width orange gradient)
//   4. Pre-register card (secondary action — full-width dark ink, same height)
//   5. Stat tiles ("This month" — Parcels · In transit · Out for delivery)
//   6. Recent orders preview (web-only convenience, links to /orders)
//
// Surfaces that USED to live here but have moved:
//   • Warehouse address — now lives on /new-order (pre-register flow only).
//     iOS removed it from home in PR #126 ("ios-remove-warehouse-from-home").
//   • Credit balance + referral earnings — now reachable from the Account
//     hub (/account) via the credit hero card and the Refer & earn link.

import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Package, Eye, ArrowRight, Box, Wand2, ShoppingBag,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { ordersApi } from '../api'
import toast from 'react-hot-toast'
import { useOrderUpdates } from '../hooks/useRealtimeUpdates'
import { CutoffBanner } from '../components/CutoffBanner'

// --- CUSTOM STYLES & GLASS COMPONENTS ---
const DashboardStyles = () => (
  <style>{`
    @keyframes morph {
      0% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: translate(0, 0) scale(1); }
      33% { transform: translate(30px, -50px) scale(1.05); }
      66% { transform: translate(-20px, 20px) scale(0.95); }
      100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: translate(0, 0) scale(1); }
    }
    .animate-morph { animation: morph 15s ease-in-out infinite; }

    @keyframes sheen {
      0% { transform: translateX(-100%) skewX(-15deg); }
      100% { transform: translateX(200%) skewX(-15deg); }
    }
    .glass-sheen { position: relative; overflow: hidden; }
    .glass-sheen::after {
      content: ''; position: absolute; top: 0; left: 0; width: 50%; height: 100%;
      background: linear-gradient(to right, transparent, rgba(255,255,255,0.3), transparent);
      animation: sheen 4s infinite;
    }

    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `}</style>
)

const LiquidBlob = ({ className, color }) => (
  <div className={`absolute blur-[100px] md:blur-[120px] rounded-full mix-blend-multiply opacity-60 animate-morph pointer-events-none ${className} ${color}`} />
)

const GlassCard = ({ children, className = "" }) => (
  <div className={`relative overflow-hidden rounded-[2.5rem] bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />
    <div className="relative z-10">{children}</div>
  </div>
)

// Order statuses that count as "active" (still moving through the pipeline).
// Used both for filtering the recent-orders preview and computing stat tiles.
const ACTIVE_STATUSES = ['pending', 'received_at_warehouse', 'consolidating', 'in_transit', 'customs', 'out_for_delivery']

export const Dashboard = () => {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])

  // Fetch once on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const r = await ordersApi.list()
        const all = r.data?.orders || []
        // Keep all rows so we can derive month + active + in-transit stats;
        // recent-orders table filters to ACTIVE_STATUSES at render time.
        setOrders(all)
      } catch (err) {
        toast.error('Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // Live updates — flip or insert rows as parcels change status.
  useOrderUpdates(({ order }) => {
    if (!order) return
    setOrders((prev) => {
      const without = prev.filter((o) => o.id !== order.id)
      return [order, ...without].sort(
        (a, b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt),
      )
    })
  })

  // Stat-tile math: iOS shows Parcels (this month), In transit, Out for delivery.
  // "This month" matches by year + month on created_at.
  const now = new Date()
  const thisMonthParcels = orders.filter((o) => {
    const d = new Date(o.created_at || o.createdAt || 0)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length
  const inTransit = orders.filter((o) => o.status === 'in_transit').length
  const outForDelivery = orders.filter((o) => o.status === 'out_for_delivery').length

  // Recent-orders preview — only currently-active rows.
  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status))

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-amber-50 text-amber-700 border-amber-200',
      received_at_warehouse: 'bg-blue-50 text-blue-700 border-blue-200',
      consolidating: 'bg-purple-50 text-purple-700 border-purple-200',
      in_transit: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      customs: 'bg-orange-50 text-orange-700 border-orange-200',
      out_for_delivery: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      delivered: 'bg-green-50 text-green-700 border-green-200',
      cancelled: 'bg-red-50 text-red-700 border-red-200',
    }
    return colors[status] || 'bg-slate-50 text-slate-700 border-slate-200'
  }

  const formatStatus = (status) =>
    status?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Pending'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f8fafc]">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const firstName = user?.name?.split(' ')[0] || ''

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-x-hidden relative pb-24">
      <DashboardStyles />

      {/* --- LIQUID BACKGROUNDS --- */}
      <LiquidBlob className="top-[-5%] left-[-10%] w-[400px] h-[400px] md:w-[600px] md:h-[600px]" color="bg-blue-200" />
      <LiquidBlob className="bottom-[20%] right-[-5%] w-[350px] h-[350px] md:w-[500px] md:h-[500px]" color="bg-orange-200" />
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px] pointer-events-none" />

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-10 md:py-12 relative z-10 space-y-6">

        {/* Welcome header */}
        <div className="text-center md:text-left">
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-white/60 backdrop-blur-md border border-white/50 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 shadow-sm mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Home
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-[#0f172a] tracking-tighter uppercase leading-none mb-3">
            {t('dashboard.welcome')}{firstName && <>, <span className="text-orange-700">{firstName}</span></>}
          </h1>
        </div>

        {/* Cut-off countdown banner */}
        <CutoffBanner />

        {/* BFM-primary action grid: hero card (orange gradient) on top,
            pre-register secondary (dark ink) below. Both full-width and
            roughly equal height — mirrors iOS CustomerDashboardView.actionGrid. */}
        <Link
          to="/buy-for-me"
          className="glass-sheen block rounded-[2rem] p-6 md:p-7 bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-xl hover:-translate-y-1 transition-all"
        >
          <div className="flex items-center gap-4 md:gap-5">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              <Wand2 size={26} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/80 mb-1">Primary</p>
              <p className="text-xl md:text-2xl font-black tracking-tight leading-tight">Start a Buy-for-me request</p>
              <p className="text-sm text-white/90 font-medium mt-1.5">
                Send us a link from any UK retailer — we buy on your behalf, ship to Kenya, deliver to your door.
              </p>
            </div>
            <ArrowRight size={22} className="shrink-0" aria-hidden />
          </div>
        </Link>

        <Link
          to="/new-order"
          className="block rounded-[2rem] p-6 md:p-7 bg-[#0f172a] text-white shadow-lg hover:-translate-y-1 transition-all border border-white/5"
        >
          <div className="flex items-center gap-4 md:gap-5">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 text-orange-400">
              <Box size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg md:text-xl font-black tracking-tight leading-tight">Pre-register a parcel</p>
              <p className="text-sm text-slate-300 font-medium mt-1.5">
                Already bought somewhere we don't cover? Tell us it's coming — your UK warehouse address is here too.
              </p>
            </div>
            <ArrowRight size={18} className="shrink-0 text-slate-300" aria-hidden />
          </div>
        </Link>

        {/* Stat tiles — "This month" eyebrow + 3 tiles (mirrors iOS) */}
        <div className="pt-2">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 ml-1">This month</p>
          <div className="grid grid-cols-3 gap-3 md:gap-4">
            <StatTile label="Parcels" value={thisMonthParcels} />
            <StatTile label="In transit" value={inTransit} accent />
            <StatTile label="Out for delivery" value={outForDelivery} />
          </div>
        </div>

        {/* Recent orders preview — web-only convenience. iOS users dig into
            the Activity → Parcel tracking surface for this; on desktop a
            small inline preview saves a hop without ballooning the page. */}
        <GlassCard className="p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl md:text-2xl font-black text-[#0f172a] uppercase tracking-tighter">{t('dashboard.recentOrders')}</h2>
            <Link to="/orders" className="text-xs font-black text-orange-700 hover:text-orange-600 uppercase tracking-widest flex items-center gap-1 group transition-colors">
              View all <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          {activeOrders.length > 0 ? (
            <div className="bg-white/50 backdrop-blur-md rounded-2xl overflow-hidden border border-white">
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left">
                  <thead className="bg-[#0f172a]/5">
                    <tr>
                      <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tracking #</th>
                      <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('orders.status')}</th>
                      <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('orders.date')}</th>
                      <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/50">
                    {activeOrders.slice(0, 5).map((order) => (
                      <tr key={order.id} className="hover:bg-white/40 transition-colors">
                        <td className="px-5 py-4 font-mono text-xs font-black text-[#0f172a]">
                          {order.tracking_number || `#${order.id.slice(0, 8)}`}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-[9px] font-black uppercase border shadow-sm ${getStatusColor(order.status)}`}>
                            {formatStatus(order.status)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs font-bold text-slate-600">
                          {new Date(order.created_at || order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            to={`/orders/${order.id}`}
                            className="inline-flex items-center justify-center p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
                            title="View details"
                          >
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
            <div className="text-center py-12 bg-white/50 rounded-2xl border border-white">
              <ShoppingBag className="mx-auto text-slate-300 mb-4" size={40} />
              <p className="text-base font-black text-[#0f172a] tracking-tight mb-1">No active parcels</p>
              <p className="text-sm font-bold text-slate-500">Start a Buy-for-me request or pre-register a parcel above.</p>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  )
}

// ─── Stat tile ──────────────────────────────────────────────────────────────

function StatTile({ label, value, accent = false }) {
  return (
    <div className={`rounded-2xl p-4 md:p-5 border ${accent
      ? 'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200'
      : 'bg-white border-slate-200'}`}>
      <p className={`text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-1 ${accent ? 'text-orange-700' : 'text-slate-400'}`}>{label}</p>
      <p className={`text-3xl md:text-4xl font-black tracking-tighter ${accent ? 'text-orange-700' : 'text-[#0f172a]'}`}>{value}</p>
    </div>
  )
}
