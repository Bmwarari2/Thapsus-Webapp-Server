import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Package, Wallet, TrendingUp, Eye, Copy, CheckCheck, MapPin, ArrowRight, Box } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { ordersApi, walletApi } from '../api'
import toast from 'react-hot-toast'
import { useOrderUpdates, useWalletUpdates } from '../hooks/useRealtimeUpdates'

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
);

const LiquidBlob = ({ className, color }) => (
  <div className={`absolute blur-[100px] md:blur-[120px] rounded-full mix-blend-multiply opacity-60 animate-morph pointer-events-none ${className} ${color}`} />
);

const GlassCard = ({ children, className = "" }) => (
  <div className={`relative overflow-hidden rounded-[2.5rem] bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />
    <div className="relative z-10">{children}</div>
  </div>
);

export const Dashboard = () => {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])
  const [copied, setCopied] = useState(false)
  const [stats, setStats] = useState({
    activeOrders: 0,
    walletBalance: 0,
  })

  // Fetch once on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ordersResult, walletResult] = await Promise.allSettled([
          ordersApi.list(),
          walletApi.getBalance(),
        ])

        let fetchedOrders = []
        let walletBalance = 0

        if (ordersResult.status === 'fulfilled') {
          fetchedOrders = ordersResult.value.data?.orders || []
        }

        if (walletResult.status === 'fulfilled') {
          walletBalance = walletResult.value.data?.wallet?.balance ?? 0
        }

        const activeOrders = fetchedOrders.filter((o) =>
          ['pending', 'received_at_warehouse', 'consolidating', 'in_transit', 'customs', 'out_for_delivery'].includes(o.status)
        )

        setOrders(activeOrders)
        setStats({
          activeOrders: activeOrders.length,
          walletBalance,
        })
      } catch (err) {
        toast.error('Failed to load dashboard')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Live updates
  useOrderUpdates(({ action, order }) => {
    if (!order) return

    const isActiveStatus = ['pending', 'received_at_warehouse', 'consolidating', 'in_transit', 'customs', 'out_for_delivery'].includes(
      order.status,
    )

    setOrders((prev) => {
      let next = prev.filter((o) => o.id !== order.id)
      if (isActiveStatus) {
        next = [order, ...next].sort(
          (a, b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt),
        )
      }
      setStats((prevStats) => ({
        ...prevStats,
        activeOrders: next.length,
      }))
      return next
    })
  })

  useWalletUpdates((payload) => {
    if (!payload || typeof payload.balance !== 'number') return
    setStats((prevStats) => ({
      ...prevStats,
      walletBalance: payload.balance,
    }))
  })

  const addressLines = [
    user?.name || '',
    user?.warehouse_id || user?.warehouseId || '',
    '31 Collingwood Close',
    'Hazel Grove, Stockport',
    'SK7 4LB',
    'United Kingdom',
  ].filter(Boolean)

  const handleCopyAddress = useCallback(() => {
    navigator.clipboard.writeText(addressLines.join('\n')).then(() => {
      setCopied(true)
      toast.success('Address copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    })
  }, [addressLines])

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

  const formatStatus = (status) => {
    return status?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Pending'
  }

  const referralEarnings = user?.referral_earnings || user?.referralEarnings || 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f8fafc]">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-x-hidden relative pb-24">
      <DashboardStyles />
      
      {/* --- LIQUID BACKGROUNDS --- */}
      <LiquidBlob className="top-[-5%] left-[-10%] w-[400px] h-[400px] md:w-[600px] md:h-[600px]" color="bg-blue-200" />
      <LiquidBlob className="bottom-[20%] right-[-5%] w-[350px] h-[350px] md:w-[500px] md:h-[500px]" color="bg-orange-200" />
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-6 py-12 relative z-10">
        
        {/* Welcome Section */}
        <div className="mb-10 text-center md:text-left">
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-white/60 backdrop-blur-md border border-white/50 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 shadow-sm mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Client Terminal
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-[#0f172a] tracking-tighter uppercase leading-none mb-3">
            {t('dashboard.welcome')}, <span className="text-orange-500">{user?.name?.split(' ')[0]}</span>
          </h1>
          <p className="text-slate-500 font-bold max-w-lg mx-auto md:mx-0">
            Your global logistics overview and active shipments pipeline.
          </p>
        </div>

        {/* Warehouse Address Card (Dark Glass & Tilted) */}
        <div className="relative group overflow-hidden rounded-[2.5rem] bg-[#0f172a] p-8 md:p-12 text-white shadow-2xl flex flex-col transition-all hover:scale-[1.01] transform lg:rotate-1 hover:rotate-0 duration-700 mb-12">
          <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-orange-500/20 blur-[80px] -z-0 pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
            <div className="space-y-4">
              <h3 className="text-xl md:text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
                <MapPin className="text-orange-400" size={24} /> {t('dashboard.warehouseAddress')}
              </h3>
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-[1.5rem] p-6 font-mono text-sm leading-relaxed shadow-inner">
                {addressLines.map((line, i) => (
                  <p key={i} className={i < 2 ? 'text-orange-400 font-black text-base tracking-tight mb-1' : 'text-slate-300 font-bold'}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
            <button
              onClick={handleCopyAddress}
              className="glass-sheen flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-8 py-4 rounded-[2rem] font-black uppercase tracking-widest text-xs transition-all shadow-xl hover:-translate-y-1 w-full md:w-auto"
            >
              {copied ? <CheckCheck size={18} /> : <Copy size={18} />}
              {copied ? 'Copied!' : t('warehouse.copy')}
            </button>
          </div>
        </div>

        {/* Stats Cards (Crystal Bento) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <Link to="/orders" className="block">
          <GlassCard className="p-8 group hover:-translate-y-2 transition-all duration-500 cursor-pointer">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('dashboard.activeOrders')}</p>
                <h3 className="text-5xl font-black text-[#0f172a] tracking-tighter">{stats.activeOrders}</h3>
                <p className="text-[9px] font-bold text-orange-500 uppercase tracking-widest mt-2 flex items-center gap-1">View My Orders →</p>
              </div>
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-[1.5rem] text-blue-600 group-hover:scale-110 transition-transform shadow-sm">
                <Package size={28} />
              </div>
            </div>
          </GlassCard>
          </Link>

          <GlassCard className="p-8 group hover:-translate-y-2 transition-all duration-500">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('dashboard.walletBalance')}</p>
                <h3 className="text-4xl md:text-5xl font-black text-green-600 tracking-tighter">
                  <span className="text-2xl">KES</span> {stats.walletBalance.toLocaleString()}
                </h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2">Referral credit</p>
              </div>
              <div className="p-4 bg-green-50 border border-green-100 rounded-[1.5rem] text-green-600 group-hover:scale-110 transition-transform shadow-sm">
                <Wallet size={28} />
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-8 group hover:-translate-y-2 transition-all duration-500">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{t('dashboard.referralEarnings')}</p>
                <h3 className="text-4xl md:text-5xl font-black text-orange-500 tracking-tighter">
                  <span className="text-2xl">KES</span> {referralEarnings.toLocaleString()}
                </h3>
              </div>
              <div className="p-4 bg-orange-50 border border-orange-100 rounded-[1.5rem] text-orange-600 group-hover:scale-110 transition-transform shadow-sm">
                <TrendingUp size={28} />
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Quick Actions (Border Gradient) */}
        <div className="p-1 bg-gradient-to-br from-orange-400 via-orange-300 to-blue-400 rounded-[3rem] shadow-2xl mb-12">
          <div className="h-full w-full bg-white/95 backdrop-blur-3xl rounded-[2.9rem] p-4 flex flex-col md:flex-row gap-4">
            <Link
              to="/orders"
              className="glass-sheen flex-1 bg-[#0f172a] hover:bg-slate-800 text-white px-6 py-6 rounded-[2.5rem] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all shadow-xl hover:-translate-y-1"
            >
              <Box size={20} />
              View My Orders
            </Link>
            <Link
              to="/wallet"
              className="glass-sheen flex-1 bg-orange-500 hover:bg-orange-600 text-white px-6 py-6 rounded-[2.5rem] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all shadow-xl hover:-translate-y-1"
            >
              <Wallet size={20} />
              Wallet & Referrals
            </Link>
          </div>
        </div>

        {/* Recent Orders Table */}
        <GlassCard className="p-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-black text-[#0f172a] uppercase tracking-tighter">{t('dashboard.recentOrders')}</h2>
            <Link to="/orders" className="text-xs font-black text-orange-500 hover:text-orange-600 uppercase tracking-widest flex items-center gap-1 group transition-colors">
              View All <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform"/>
            </Link>
          </div>

          {orders.length > 0 ? (
            <div className="bg-white/50 backdrop-blur-md rounded-3xl overflow-hidden border border-white">
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left">
                  <thead className="bg-[#0f172a]/5">
                    <tr>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tracking #</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('orders.market')}</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('orders.status')}</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('orders.date')}</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('orders.amount')}</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/50">
                    {orders.slice(0, 5).map((order) => (
                      <tr key={order.id} className="hover:bg-white/40 transition-colors">
                        <td className="px-6 py-5 font-mono text-xs font-black text-[#0f172a]">
                          {order.tracking_number || `#${order.id.slice(0, 8)}`}
                        </td>
                        <td className="px-6 py-5 text-xs font-bold text-slate-600">{order.market}</td>
                        <td className="px-6 py-5">
                          <span className={`inline-flex px-3 py-1 rounded-full text-[9px] font-black uppercase border shadow-sm ${getStatusColor(order.status)}`}>
                            {formatStatus(order.status)}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-xs font-bold text-slate-600">
                          {new Date(order.created_at || order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-5 text-sm font-black text-[#0f172a]">
                          KES {(order.estimated_cost || order.totalCost || 0).toLocaleString()}
                        </td>
                        <td className="px-6 py-5 text-right">
                          <Link
                            to={`/orders/${order.id}`}
                            className="inline-flex items-center justify-center p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
                            title="View Details"
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
            <div className="text-center py-16 bg-white/50 rounded-3xl border border-white">
              <Package className="mx-auto text-slate-300 mb-6" size={48} />
              <p className="text-lg font-black text-[#0f172a] uppercase tracking-tight mb-2">{t('orders.noOrders')}</p>
              <p className="text-sm font-bold text-slate-500">Orders are logged by dispatch operators. Need assistance?</p>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  )
}
