import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Package, Wallet, TrendingUp, Eye, Copy, CheckCheck, MapPin, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { ordersApi, walletApi } from '../api'
import toast from 'react-hot-toast'
import { useOrderUpdates, useWalletUpdates } from '../hooks/useRealtimeUpdates'

[span_0](start_span)// Ensure the export name is exactly "Dashboard" to match App.jsx[span_0](end_span)
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

  useOrderUpdates(({ action, order }) => {
    if (!order) return
    const isActiveStatus = ['pending', 'received_at_warehouse', 'consolidating', 'in_transit', 'customs', 'out_for_delivery'].includes(order.status)
    setOrders((prev) => {
      let next = prev.filter((o) => o.id !== order.id)
      if (isActiveStatus) {
        next = [order, ...next].sort((a, b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt))
      }
      setStats((prevStats) => ({ ...prevStats, activeOrders: next.length }))
      return next
    })
  })

  useWalletUpdates((payload) => {
    if (!payload || typeof payload.balance !== 'number') return
    setStats((prevStats) => ({ ...prevStats, walletBalance: payload.balance }))
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
      pending: 'bg-amber-100 text-amber-700 border-amber-200',
      received_at_warehouse: 'bg-blue-100 text-blue-700 border-blue-200',
      consolidating: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      in_transit: 'bg-purple-100 text-purple-700 border-purple-200',
      customs: 'bg-orange-100 text-orange-700 border-orange-200',
      out_for_delivery: 'bg-cyan-100 text-cyan-700 border-cyan-200',
      delivered: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      cancelled: 'bg-rose-100 text-rose-700 border-rose-200',
    }
    return colors[status] || 'bg-gray-100 text-gray-700 border-gray-200'
  }

  const formatStatus = (status) => {
    return status?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Pending'
  }

  const referralEarnings = user?.referral_earnings || user?.referralEarnings || 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="relative w-16 h-16">
          <div className="absolute top-0 left-0 w-full h-full border-4 border-gray-200 rounded-full"></div>
          <div className="absolute top-0 left-0 w-full h-full border-4 border-orange-500 rounded-full animate-spin border-t-transparent"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="max-w-7xl mx-auto px-4 py-10">
        
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-[#1e3a5f] tracking-tight">
              {t('dashboard.welcome')}, <span className="text-orange-500">{user?.name}</span>!
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Logistics simplified. Here is your current cargo status.</p>
          </div>
        </div>

        {/* Warehouse Address Card */}
        <div className="relative overflow-hidden rounded-2xl mb-10 bg-[#1e3a5f] shadow-2xl shadow-blue-900/20">
          <div className="relative p-6 md:p-8 flex flex-col lg:flex-row lg:items-center gap-8">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-4 text-orange-400">
                <MapPin size={20} />
                <h3 className="text-lg font-bold uppercase tracking-wider">{t('dashboard.warehouseAddress')}</h3>
              </div>
              <div className="bg-[#0f1e33]/50 backdrop-blur-sm border border-white/5 rounded-xl p-5 font-mono text-sm leading-relaxed shadow-inner">
                {addressLines.map((line, i) => (
                  <p key={i} className={i < 2 ? 'text-orange-400 font-bold text-base mb-1' : 'text-slate-300'}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
            <div className="lg:w-1/3 flex flex-col gap-3">
              <button
                onClick={handleCopyAddress}
                className="w-full flex items-center justify-center gap-3 bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white px-6 py-4 rounded-xl font-bold transition-all shadow-lg shadow-orange-500/30"
              >
                {copied ? <CheckCheck size={20} /> : <Copy size={20} />}
                {copied ? 'Address Copied!' : t('warehouse.copy')}
              </button>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-tight mb-1">{t('dashboard.activeOrders')}</p>
                <h3 className="text-4xl font-black text-[#1e3a5f]">{stats.activeOrders}</h3>
              </div>
              <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
                <Package size={28} />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-tight mb-1">{t('dashboard.walletBalance')}</p>
                <h3 className="text-3xl font-black text-[#1e3a5f]">
                  <span className="text-base font-bold mr-1">KES</span>
                  {stats.walletBalance.toLocaleString()}
                </h3>
              </div>
              <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
                <Wallet size={28} />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-tight mb-1">{t('dashboard.referralEarnings')}</p>
                <h3 className="text-3xl font-black text-[#1e3a5f]">
                  <span className="text-base font-bold mr-1">KES</span>
                  {referralEarnings.toLocaleString()}
                </h3>
              </div>
              <div className="p-4 bg-orange-50 text-orange-600 rounded-2xl">
                <TrendingUp size={28} />
              </div>
            </div>
          </div>
        </div>

        {/* Recent Orders Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
            <h2 className="text-xl font-bold text-[#1e3a5f]">{t('dashboard.recentOrders')}</h2>
            <Link to="/orders" className="text-orange-500 hover:text-orange-600 font-bold text-sm flex items-center gap-1 transition-colors">
              See All Orders <ChevronRight size={16} />
            </Link>
          </div>

          {orders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-white">
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Tracking / ID</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">{t('orders.market')}</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">{t('orders.status')}</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">{t('orders.amount')}</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {orders.slice(0, 5).map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs font-bold text-[#1e3a5f]">
                        {order.tracking_number || `#${order.id.slice(0, 8)}`}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-semibold text-slate-600">{order.market}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-[11px] font-bold border ${getStatusColor(order.status)}`}>
                          {formatStatus(order.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-black text-[#1e3a5f] text-right">
                        <span className="text-[10px] mr-1 text-slate-400 font-bold">KES</span>
                        {(order.estimated_cost || order.totalCost || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          to={`/orders/${order.id}`}
                          className="inline-flex items-center gap-1.5 text-orange-500 hover:text-orange-600 font-bold text-sm bg-orange-50 px-3 py-1.5 rounded-lg transition-all"
                        >
                          <Eye size={14} />
                          Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-20">
              <Package className="mx-auto text-slate-300 mb-4" size={40} />
              <p className="text-slate-600 font-bold">{t('orders.noOrders')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
