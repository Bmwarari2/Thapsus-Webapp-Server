import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Package, ArrowLeft, MapPin, Truck, Calendar, DollarSign, FileText, Box } from 'lucide-react'
import { ordersApi } from '../api'
import toast from 'react-hot-toast'

export const OrderDetail = () => {
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState(null)

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const response = await ordersApi.get(id)
        setOrder(response.data.order)
      } catch (err) {
        toast.error('Failed to load order details')
      } finally {
        setLoading(false)
      }
    }
    fetchOrder()
  }, [id])

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      received_at_warehouse: 'bg-blue-100 text-blue-800',
      consolidating: 'bg-purple-100 text-purple-800',
      in_transit: 'bg-indigo-100 text-indigo-800',
      customs: 'bg-orange-100 text-orange-800',
      out_for_delivery: 'bg-cyan-100 text-cyan-800',
      delivered: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const statusSteps = [
    'pending',
    'received_at_warehouse',
    'consolidating',
    'in_transit',
    'customs',
    'out_for_delivery',
    'delivered',
  ]

  const currentStepIndex = order ? statusSteps.indexOf(order.status) : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <Package className="mx-auto text-gray-400 mb-4" size={64} />
          <h1 className="text-2xl font-bold text-[#1e3a5f] mb-2">Order Not Found</h1>
          <p className="text-gray-600 mb-6">This order does not exist or you don't have access to it.</p>
          <Link to="/orders" className="inline-flex items-center gap-2 bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-6 py-3 rounded-lg font-bold transition-colors">
            <ArrowLeft size={18} />
            Back to Orders
          </Link>
        </div>
      </div>
    )
  }

  const dimensions = order.dimensions_json
  const cost = order.actual_cost || order.estimated_cost || 0

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Back link */}
        <Link to="/orders" className="inline-flex items-center gap-2 text-[#1e3a5f] hover:text-orange-500 font-medium mb-6 transition-colors">
          <ArrowLeft size={18} />
          Back to Orders
        </Link>

        {/* Header */}
        <div className="card mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-[#1e3a5f] mb-1">
                {order.tracking_number}
              </h1>
              <p className="text-gray-600">{order.description}</p>
            </div>
            <span className={`inline-block self-start px-4 py-2 rounded-full text-sm font-bold ${getStatusColor(order.status)}`}>
              {order.status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </span>
          </div>
        </div>

        {/* Status Progress */}
        {order.status !== 'cancelled' && (
          <div className="card mb-6">
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-4">Shipment Progress</h2>
            <div className="flex items-center justify-between overflow-x-auto pb-2">
              {statusSteps.map((step, i) => (
                <div key={step} className="flex items-center flex-shrink-0">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      i <= currentStepIndex
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}>
                      {i <= currentStepIndex ? '✓' : i + 1}
                    </div>
                    <p className={`text-xs mt-1 text-center max-w-[80px] ${
                      i <= currentStepIndex ? 'text-green-700 font-medium' : 'text-gray-400'
                    }`}>
                      {step.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </p>
                  </div>
                  {i < statusSteps.length - 1 && (
                    <div className={`w-8 h-0.5 mx-1 ${
                      i < currentStepIndex ? 'bg-green-500' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Order Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="card">
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-4 flex items-center gap-2">
              <FileText size={20} />
              Order Details
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Retailer</span>
                <span className="font-medium text-gray-900">{order.retailer}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Market</span>
                <span className="font-medium text-gray-900">
                  {order.market === 'UK' ? 'United Kingdom' : order.market === 'USA' ? 'United States' : order.market}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Shipping Speed</span>
                <span className="font-medium text-gray-900 capitalize">{order.shipping_speed || 'Economy'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Insurance</span>
                <span className="font-medium text-gray-900">{order.insurance ? 'Yes' : 'No'}</span>
              </div>
              {order.declared_value > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Declared Value</span>
                  <span className="font-medium text-gray-900">KES {order.declared_value.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <span className="font-medium text-gray-900">
                  {order.created_at ? new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-4 flex items-center gap-2">
              <Box size={20} />
              Package Info
            </h2>
            <div className="space-y-3">
              {order.weight_kg && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Weight</span>
                  <span className="font-medium text-gray-900">{order.weight_kg} kg</span>
                </div>
              )}
              {dimensions && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Dimensions</span>
                  <span className="font-medium text-gray-900">
                    {dimensions.length} × {dimensions.width} × {dimensions.height} cm
                  </span>
                </div>
              )}
              {(!order.weight_kg && !dimensions) && (
                <p className="text-gray-400 text-sm">Package measurements will be updated once received at the warehouse.</p>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <h3 className="text-lg font-bold text-[#1e3a5f] mb-3 flex items-center gap-2">
                <DollarSign size={20} />
                Cost
              </h3>
              <div className="space-y-2">
                {order.estimated_cost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Estimated Cost</span>
                    <span className="font-medium text-gray-900">KES {order.estimated_cost.toLocaleString()}</span>
                  </div>
                )}
                {order.actual_cost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Actual Cost</span>
                    <span className="font-bold text-green-700">KES {order.actual_cost.toLocaleString()}</span>
                  </div>
                )}
                {order.customs_duty > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Customs Duty</span>
                    <span className="font-medium text-gray-900">KES {order.customs_duty.toLocaleString()}</span>
                  </div>
                )}
                {cost > 0 && (
                  <div className="flex justify-between pt-2 border-t border-gray-100">
                    <span className="font-bold text-[#1e3a5f]">Total</span>
                    <span className="font-bold text-[#1e3a5f] text-lg">
                      KES {((order.actual_cost || order.estimated_cost || 0) + (order.customs_duty || 0)).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Packages */}
        {order.packages && order.packages.length > 0 && (
          <div className="card mb-6">
            <h2 className="text-lg font-bold text-[#1e3a5f] mb-4 flex items-center gap-2">
              <Package size={20} />
              Packages ({order.packages.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Description</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Weight</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {order.packages.map((pkg) => (
                    <tr key={pkg.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{pkg.description}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{pkg.weight_kg ? `${pkg.weight_kg} kg` : '—'}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(pkg.status)}`}>
                          {pkg.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Payment CTA */}
        {order.status !== 'cancelled' && order.status !== 'delivered' && cost > 0 && (
          <div className="card bg-gradient-to-r from-orange-50 to-orange-100 border-2 border-orange-200">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-[#1e3a5f]">Pay for this order</h3>
                <p className="text-sm text-gray-600">Amount: KES {cost.toLocaleString()}</p>
              </div>
              <Link
                to={`/pay/${order.id}?amount=${cost}`}
                className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-bold transition-colors"
              >
                Pay Now via M-Pesa
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
