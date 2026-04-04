import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Package, Eye } from 'lucide-react'

import { useLanguage } from '../context/LanguageContext'
import { ordersApi } from '../api'
import toast from 'react-hot-toast'

export const Orders = () => {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])
  const [filters, setFilters] = useState({
    status: '',
    market: '',
  })
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

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

  const getStatusColor = (status) => {
    const colors = {
      pending: 'status-pending',
      processing: 'status-processing',
      'in-transit': 'status-in-transit',
      delivered: 'status-delivered',
      failed: 'status-failed',
      cancelled: 'status-cancelled',
    }
    return colors[status] || 'status-pending'
  }

  const paginatedOrders = orders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )
  const totalPages = Math.ceil(orders.length / itemsPerPage)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-2">
            {t('orders.title')}
          </h1>
          <p className="text-gray-600">Track and view all your shipments</p>
        </div>

        {/* Filters */}
        <div className="card mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('orders.filterByStatus')}
              </label>
              <select
                value={filters.status}
                onChange={(e) => {
                  setFilters({ ...filters, status: e.target.value })
                  setCurrentPage(1)
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="in-transit">In Transit</option>
                <option value="delivered">Delivered</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Market Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('orders.filterByMarket')}
              </label>
              <select
                value={filters.market}
                onChange={(e) => {
                  setFilters({ ...filters, market: e.target.value })
                  setCurrentPage(1)
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
              >
                <option value="">All Markets</option>
                <option value="UK">United Kingdom</option>
                <option value="USA">United States</option>
                <option value="China">China</option>
              </select>
            </div>

            {/* Clear Filters */}
            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilters({ status: '', market: '' })
                  setCurrentPage(1)
                }}
                className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>

        {/* Orders Table */}
        {orders.length > 0 ? (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      {t('orders.orderNumber')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      {t('orders.market')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      {t('orders.status')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      {t('orders.date')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      {t('orders.amount')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                      {t('orders.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-sm text-gray-900">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {order.market === 'UK' ? 'United Kingdom' : order.market === 'USA' ? 'United States' : order.market}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`status-badge ${getStatusColor(order.status)}`}>
                          {t(`orders.${order.status.replace('-', '')}`)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                        KES {order.totalCost?.toLocaleString() || 0}
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          to={`/orders/${order.id}`}
                          className="text-orange-500 hover:text-orange-600 font-medium flex items-center gap-1"
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
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="card text-center py-12">
            <Package className="mx-auto text-gray-400 mb-4" size={48} />
            <p className="text-gray-600 mb-2">{t('orders.noOrders')}</p>
            <p className="text-sm text-gray-400">Orders are created by the SwiftCargo team on your behalf.</p>
          </div>
        )}
      </div>
    </div>
  )
}
