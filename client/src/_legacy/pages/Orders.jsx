import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Package, Eye, ChevronDown } from 'lucide-react'

import { useLanguage } from '../context/LanguageContext'
import { ordersApi } from '../api'
import toast from 'react-hot-toast'
import { useOrderUpdates } from '../hooks/useRealtimeUpdates'

const CostBreakdown = ({ order }) => {
  const shippingCost = order.shipping_cost ?? order.estimated_cost ?? 0
  const handlingFee  = order.handling_fee ?? 0
  const insuranceFee = order.insurance_fee ?? 0
  const customsDuty  = order.customs_duty ?? 0
  const total = (order.actual_cost ?? order.estimated_cost ?? 0) + customsDuty
  
  return (
    <div className="mt-3 bg-white/50 backdrop-blur-xl border border-white/60 rounded-xl p-4 text-xs space-y-2 shadow-[0_4px_15px_rgb(0,0,0,0.02)] relative overflow-hidden">
      {shippingCost > 0 && (
        <div className="flex justify-between font-medium text-slate-600">
          <span>Shipping</span>
          <span className="text-slate-800">KES {shippingCost.toLocaleString()}</span>
        </div>
      )}
      {handlingFee > 0 && (
        <div className="flex justify-between font-medium text-slate-600">
          <span>Handling Fee</span>
          <span className="text-slate-800">KES {handlingFee.toLocaleString()}</span>
        </div>
      )}
      {insuranceFee > 0 && (
        <div className="flex justify-between font-medium text-slate-600">
          <span>Insurance</span>
          <span className="text-slate-800">KES {insuranceFee.toLocaleString()}</span>
        </div>
      )}
      {customsDuty > 0 && (
        <div className="flex justify-between font-medium text-slate-600">
          <span>Customs Duty</span>
          <span className="text-slate-800">KES {customsDuty.toLocaleString()}</span>
        </div>
      )}
      <div className="flex justify-between font-black text-[#1e3a5f] tracking-tight pt-2 border-t border-white/40 mt-1">
        <span>Total</span>
        <span className="text-orange-600">KES {total.toLocaleString()}</span>
      </div>
      {!order.actual_cost && (
        <p className="text-orange-700 font-semibold text-[10px] mt-1 tracking-tight">* Estimated — final cost confirmed after weighing</p>
      )}
    </div>
  )
}

export const Orders = () => {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])
  const [expandedCost, setExpandedCost] = useState(null)
  const [filters, setFilters] = useState({
    status: '',
  })
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const navigate = useNavigate()

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const response = await ordersApi.list(filters)
        setOrders(response.data.orders || [])
      } catch (err) {
        toast.error('Failed to load orders')
      } finally {
        setLoading(false)
      }
    }

    fetchOrders()
  }, [filters])

  // Real-time order updates via SSE — keep the list in sync without a page refresh
  useOrderUpdates(({ action, order }) => {
    if (!order) return
    setOrders((prev) => {
      // If a status filter is active and this order no longer matches, remove it
      if (filters.status && order.status !== filters.status) {
        return prev.filter((o) => o.id !== order.id)
      }
      const exists = prev.some((o) => o.id === order.id)
      if (exists) {
        // Update in-place to preserve sort order
        return prev.map((o) => (o.id === order.id ? { ...o, ...order } : o))
      }
      // New order arrived — prepend it
      return [order, ...prev]
    })
  })

  const getStatusColor = (status) => {
    const colors = {
      pending:                'bg-amber-50 text-amber-700 border-amber-200',
      received_at_warehouse:  'bg-blue-50 text-blue-700 border-blue-200',
      consolidating:          'bg-purple-50 text-purple-700 border-purple-200',
      in_transit:             'bg-indigo-50 text-indigo-700 border-indigo-200',
      customs:                'bg-orange-50 text-orange-700 border-orange-200',
      out_for_delivery:       'bg-cyan-50 text-cyan-700 border-cyan-200',
      delivered:              'bg-green-50 text-green-700 border-green-200',
      cancelled:              'bg-red-50 text-red-700 border-red-200',
    }
    return colors[status] || 'bg-slate-50 text-slate-700 border-slate-200'
  }

  const paginatedOrders = orders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )
  const totalPages = Math.ceil(orders.length / itemsPerPage)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative bg-slate-50 overflow-hidden py-8 px-4 font-sans">
      {/* Liquid Backgrounds */}
      
      
      

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl md:text-5xl font-black text-[#1e3a5f] mb-3 leading-none tracking-tighter">
            {t('orders.title')}
          </h1>
          <p className="text-slate-600 font-medium text-lg">Track and view all your shipments</p>
          <button
            onClick={() => navigate('/orders/new')}
            className="group relative overflow-hidden mt-6 bg-[#1e3a5f] text-white px-6 py-3.5 rounded-2xl font-black tracking-tight transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 flex items-center gap-2 glass-sheen w-fit"
          >
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
            <Package size={20} className="drop-shadow-sm" />
            <span className="relative z-10">New Order</span>
          </button>
        </div>

        {/* Filters - Crystal Borders */}
        <div className="bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-6 mb-8 relative overflow-hidden glass-sheen">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
            {/* Status Filter */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                {t('orders.filterByStatus')}
              </label>
              <select
                value={filters.status}
                onChange={(e) => {
                  setFilters({ ...filters, status: e.target.value })
                  setCurrentPage(1)
                }}
                className="w-full px-4 py-3 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-slate-800 font-bold transition-all hover:bg-white/60 shadow-sm appearance-none cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="received_at_warehouse">Received at Warehouse</option>
                <option value="consolidating">Consolidating</option>
                <option value="in_transit">In Transit</option>
                <option value="customs">Customs Clearance</option>
                <option value="out_for_delivery">Out for Delivery</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Clear Filters */}
            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilters({ status: '' })
                  setCurrentPage(1)
                }}
                className="w-full px-4 py-3 bg-white/40 backdrop-blur-md border border-white/60 text-slate-700 rounded-xl hover:bg-white/60 transition-all font-black tracking-tight shadow-sm active:scale-[0.98]"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>

        {/* Orders Table - Crystal Borders */}
        {orders.length > 0 ? (
          <div className="bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl overflow-hidden relative glass-sheen">
            <div className="overflow-x-auto relative z-10">
              <table className="w-full">
                <thead className="bg-white/50 border-b border-white/40 backdrop-blur-md">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-widest">
                      {t('orders.orderNumber')}
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-widest">
                      {t('orders.status')}
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-widest">
                      {t('orders.date')}
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-widest">
                      {t('orders.amount')}
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-widest">
                      {t('orders.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/30">
                  {paginatedOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="hover:bg-white/50 transition-colors duration-200 cursor-pointer"
                      onClick={() => navigate(`/orders/${order.id}`)}
                    >
                      <td className="px-6 py-5 font-mono text-sm font-bold text-slate-800">
                        {order.tracking_number || `#${order.id.slice(0, 8).toUpperCase()}`}
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase border shadow-sm ${getStatusColor(order.status)}`}>
                          {order.status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Pending'}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-sm font-semibold text-slate-600">
                        {order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                        <div>
                          <button
                            onClick={() => setExpandedCost(expandedCost === order.id ? null : order.id)}
                            className="text-sm font-black text-[#1e3a5f] hover:text-orange-700 flex items-center gap-1 transition-colors"
                          >
                            KES {((order.actual_cost ?? order.estimated_cost ?? 0) + (order.customs_duty ?? 0)).toLocaleString()}
                            <ChevronDown size={16} className={`transition-transform duration-300 ${expandedCost === order.id ? 'rotate-180' : ''}`} />
                          </button>
                          {expandedCost === order.id && <CostBreakdown order={order} />}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <Link
                          to={`/orders/${order.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-orange-700 hover:text-orange-600 font-black tracking-tight flex items-center gap-1.5 transition-colors bg-orange-50 hover:bg-orange-100/50 px-3 py-1.5 rounded-lg w-fit border border-orange-200/50"
                        >
                          <Eye size={16} />
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-white/40 bg-white/30 backdrop-blur-md relative z-10">
                <p className="text-sm font-bold text-slate-600 tracking-tight">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl text-slate-700 font-black tracking-tight hover:bg-white/70 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl text-slate-700 font-black tracking-tight hover:bg-white/70 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Empty State - Border Gradient (Step 4 style evolution) */
          <div className="rounded-2xl mb-8">
            <div className="bg-white border border-gray-100 shadow-card rounded-2xl p-12 text-center">
              <div className="absolute top-0 right-0 w-48 h-48 bg-blue-400/10 rounded-full blur-[50px] pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-orange-400/10 rounded-full blur-[50px] pointer-events-none" />
              
              <div className="w-20 h-20 bg-white/40 backdrop-blur-xl border border-white/60 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                <Package className="text-slate-400" size={40} />
              </div>
              <p className="text-2xl font-black text-[#1e3a5f] tracking-tighter mb-2">{t('orders.noOrders')}</p>
              <p className="text-slate-600 font-medium max-w-md mx-auto">Create your own orders or contact support for assistance with your shipments.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
