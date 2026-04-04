import React from 'react'
import { Link, useLocation, Navigate } from 'react-router-dom'
import { CheckCircle, Package, Truck, Clock, Copy, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export const OrderConfirmation = () => {
  const { state } = useLocation()
  const { user } = useAuth()

  // If landed here without order data (e.g. direct URL), send back to orders
  if (!state?.order) {
    return <Navigate to="/orders" replace />
  }

  const { order, pricing } = state

  const handleCopyTracking = () => {
    navigator.clipboard.writeText(order.tracking_number)
    toast.success('Tracking number copied!')
  }

  const statusSteps = [
    { key: 'pending', label: 'Order Placed', done: true },
    { key: 'received_at_warehouse', label: 'Received at Warehouse', done: false },
    { key: 'in_transit', label: 'In Transit', done: false },
    { key: 'customs', label: 'Customs Clearance', done: false },
    { key: 'delivered', label: 'Delivered', done: false },
  ]

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">

        {/* Success Banner */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="text-green-600" size={48} />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-[#1e3a5f] mb-2">Order Confirmed!</h1>
          <p className="text-gray-600">Your order has been placed successfully and is now being processed.</p>
        </div>

        {/* Tracking Number */}
        <div className="card mb-6 bg-gradient-to-r from-[#1e3a5f] to-[#152d4a] text-white">
          <p className="text-sm text-gray-300 mb-1">Your Tracking Number</p>
          <div className="flex items-center justify-between gap-4">
            <p className="font-mono text-2xl font-bold text-orange-400 break-all">
              {order.tracking_number}
            </p>
            <button
              onClick={handleCopyTracking}
              className="flex-shrink-0 flex items-center gap-2 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-sm transition-colors"
            >
              <Copy size={16} />
              Copy
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">Use this number to track your shipment</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Order Details */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Package className="text-[#1e3a5f]" size={20} />
              <h2 className="text-lg font-bold text-[#1e3a5f]">Order Details</h2>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Retailer</span>
                <span className="font-medium">{order.retailer}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Market</span>
                <span className="font-medium">{order.market}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Description</span>
                <span className="font-medium text-right max-w-[60%]">{order.description}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Weight</span>
                <span className="font-medium">{order.weight_kg} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Shipping Speed</span>
                <span className="font-medium capitalize">{order.shipping_speed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Insurance</span>
                <span className="font-medium">{order.insurance ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>

          {/* Price Breakdown */}
          <div className="card bg-orange-50 border border-orange-200">
            <div className="flex items-center gap-2 mb-4">
              <Truck className="text-orange-600" size={20} />
              <h2 className="text-lg font-bold text-[#1e3a5f]">Price Breakdown</h2>
            </div>
            {pricing ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Base Shipping</span>
                  <span className="font-medium">KES {pricing.breakdown?.base_shipping?.amount?.toLocaleString() ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Handling Fee</span>
                  <span className="font-medium">KES {pricing.breakdown?.handling_fee?.amount?.toLocaleString() ?? '—'}</span>
                </div>
                {pricing.breakdown?.insurance?.included && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Insurance</span>
                    <span className="font-medium">KES {pricing.breakdown?.insurance?.amount?.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Customs (est.)</span>
                  <span className="font-medium">KES {pricing.breakdown?.customs_estimate?.amount?.toLocaleString() ?? '—'}</span>
                </div>
                <div className="border-t border-orange-300 pt-3 flex justify-between text-base">
                  <span className="font-bold text-[#1e3a5f]">Total Estimate</span>
                  <span className="font-bold text-orange-600">
                    KES {pricing.summary?.total?.toLocaleString() ?? (order.estimated_cost?.toLocaleString() ?? '—')}
                  </span>
                </div>
                {pricing.notes?.delivery_time && (
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                    <Clock size={12} />
                    {pricing.notes.delivery_time}
                  </p>
                )}
              </div>
            ) : (
              <div className="text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Estimated Cost</span>
                  <span className="font-bold text-orange-600">
                    KES {order.estimated_cost?.toLocaleString() ?? '—'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Journey Steps */}
        <div className="card mb-6">
          <h2 className="text-lg font-bold text-[#1e3a5f] mb-4">What happens next?</h2>
          <ol className="relative border-l border-gray-200 ml-2">
            {statusSteps.map((step, i) => (
              <li key={step.key} className="mb-6 ml-6 last:mb-0">
                <span className={`absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white ${
                  step.done ? 'bg-green-500' : 'bg-gray-200'
                }`}>
                  <span className="text-xs font-bold text-white">{i + 1}</span>
                </span>
                <p className={`font-medium ${ step.done ? 'text-green-700' : 'text-gray-700'}`}>
                  {step.label}
                  {step.done && <span className="ml-2 text-xs text-green-600 font-normal">✓ Done</span>}
                </p>
              </li>
            ))}
          </ol>
        </div>

        {/* Shipping Address Reminder */}
        <div className="card mb-8 bg-blue-50 border border-blue-200">
          <p className="text-sm font-semibold text-[#1e3a5f] mb-2">📦 Ship your order to:</p>
          <div className="font-mono text-sm leading-relaxed text-gray-700">
            <p className="text-orange-600 font-semibold">{user?.name}</p>
            <p className="text-orange-600 font-semibold">{user?.warehouse_id || user?.warehouseId}</p>
            <p>31 Collingwood Close</p>
            <p>Hazel Grove, Stockport, SK7 4LB</p>
            <p>United Kingdom</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            to={`/track?q=${order.tracking_number}`}
            className="flex-1 flex items-center justify-center gap-2 bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-3 px-6 rounded-lg font-bold transition-colors"
          >
            Track Shipment
            <ArrowRight size={18} />
          </Link>
          <Link
            to="/orders"
            className="flex-1 flex items-center justify-center gap-2 border-2 border-[#1e3a5f] text-[#1e3a5f] hover:bg-[#1e3a5f] hover:text-white py-3 px-6 rounded-lg font-bold transition-colors"
          >
            View All Orders
          </Link>
          <Link
            to="/orders/new"
            className="flex-1 flex items-center justify-center gap-2 border-2 border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white py-3 px-6 rounded-lg font-bold transition-colors"
          >
            New Order
          </Link>
        </div>

      </div>
    </div>
  )
}
