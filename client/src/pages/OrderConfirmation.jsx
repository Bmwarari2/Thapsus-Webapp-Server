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
    <div className="min-h-screen relative bg-white/[0.03] overflow-hidden py-12 px-4 font-sans">
      {/* Liquid Backgrounds */}
      
      
      

      <div className="max-w-3xl mx-auto relative z-10">

        {/* Success Banner */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 bg-surface-2 backdrop-blur-2xl border border-line shadow-xl rounded-full flex items-center justify-center relative overflow-hidden">
               <div className="absolute inset-0 bg-green-400/20 blur-xl rounded-full" />
               <CheckCircle className="text-emerald-300 relative z-10 drop-shadow-sm" size={56} />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-3 leading-none tracking-tighter">Order Confirmed.</h1>
          <p className="text-mute text-lg font-medium">Your order is secured and processing.</p>
        </div>

        {/* Tracking Number - Dark Glass & Interactive Element */}
        <div className="group relative overflow-hidden bg-surface/80 backdrop-blur-2xl border border-line rounded-2xl p-6 text-white shadow-2xl mb-8 transition-transform duration-500 hover:-rotate-1 hover:scale-[1.02] transform perspective-1000 glass-sheen">
          {/* Blurred Orange Orb inside Dark Glass */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-orange-500/40 rounded-full blur-[70px] pointer-events-none" />
          
          <div className="relative z-10">
            <p className="text-sm font-semibold text-mute mb-2 uppercase tracking-widest">Tracking Number</p>
            <div className="flex items-center justify-between gap-4">
              <p className="font-mono text-3xl font-black text-orange-400 break-all leading-none tracking-tighter drop-shadow-md">
                {order.tracking_number}
              </p>
              <button
                onClick={handleCopyTracking}
                className="flex-shrink-0 flex items-center gap-2 bg-white/10 hover:bg-surface-2 backdrop-blur-md border border-line px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-105 active:scale-95"
              >
                <Copy size={16} />
                Copy
              </button>
            </div>
            <p className="text-xs font-medium text-dim mt-3">Use this number to track your shipment worldwide</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Order Details - Crystal Borders */}
          <div className="bg-surface-2 backdrop-blur-2xl border border-line shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-6 relative overflow-hidden glass-sheen">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-surface-2 rounded-lg shadow-sm">
                <Package className="text-white" size={20} />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tighter leading-none">Details</h2>
            </div>
            <div className="space-y-4 text-sm font-medium">
              <div className="flex justify-between items-center border-b border-line pb-2">
                <span className="text-mute">Retailer</span>
                <span className="text-white">{order.retailer}</span>
              </div>
              <div className="flex justify-between items-center border-b border-line pb-2">
                <span className="text-mute">Market</span>
                <span className="text-white">{order.market}</span>
              </div>
              <div className="flex justify-between items-center border-b border-line pb-2">
                <span className="text-mute">Description</span>
                <span className="text-white text-right max-w-[60%] truncate">{order.description}</span>
              </div>
              <div className="flex justify-between items-center border-b border-line pb-2">
                <span className="text-mute">Weight</span>
                <span className="text-white">{order.weight_kg} kg</span>
              </div>
              <div className="flex justify-between items-center border-b border-line pb-2">
                <span className="text-mute">Speed</span>
                <span className="text-white capitalize">{order.shipping_speed}</span>
              </div>
              <div className="flex justify-between items-center pb-1">
                <span className="text-mute">Insurance</span>
                <span className="text-white">{order.insurance ? 'Active' : 'None'}</span>
              </div>
            </div>
          </div>

          {/* Price Breakdown - Crystal Borders with Tint */}
          <div className="bg-ember-500/10 backdrop-blur-2xl border border-ember-500/25 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-6 relative overflow-hidden glass-sheen">
            <div className="flex items-center gap-3 mb-6">
               <div className="p-2 bg-ember-500/15 rounded-lg shadow-sm">
                 <Truck className="text-ember-400" size={20} />
               </div>
              <h2 className="text-2xl font-black text-white tracking-tighter leading-none">Pricing</h2>
            </div>
            {pricing ? (
              <div className="space-y-4 text-sm font-medium">
                <div className="flex justify-between items-center border-b border-ember-500/25 pb-2">
                  <span className="text-mute">Base Shipping</span>
                  <span className="text-white">KES {pricing.breakdown?.base_shipping?.amount?.toLocaleString() ?? '—'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-ember-500/25 pb-2">
                  <span className="text-mute">Handling Fee</span>
                  <span className="text-white">KES {pricing.breakdown?.handling_fee?.amount?.toLocaleString() ?? '—'}</span>
                </div>
                {pricing.breakdown?.insurance?.included && (
                  <div className="flex justify-between items-center border-b border-ember-500/25 pb-2">
                    <span className="text-mute">Insurance</span>
                    <span className="text-white">KES {pricing.breakdown?.insurance?.amount?.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between items-center border-b border-ember-500/25 pb-2">
                  <span className="text-mute">Customs (est.)</span>
                  <span className="text-white">KES {pricing.breakdown?.customs_estimate?.amount?.toLocaleString() ?? '—'}</span>
                </div>
                <div className="pt-2 flex justify-between items-end">
                  <span className="text-xl font-black text-white tracking-tight">Total</span>
                  <span className="text-xl font-black text-ember-400 tracking-tight">
                    KES {pricing.summary?.total?.toLocaleString() ?? (order.estimated_cost?.toLocaleString() ?? '—')}
                  </span>
                </div>
                {pricing.notes?.delivery_time && (
                  <div className="mt-4 p-3 bg-surface-2 rounded-xl border border-line backdrop-blur-md">
                    <p className="text-xs text-mute font-semibold flex items-center gap-2">
                      <Clock size={14} className="text-ember-400" />
                      {pricing.notes.delivery_time}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm font-medium h-full flex flex-col justify-end pb-2">
                <div className="flex justify-between items-end">
                  <span className="text-lg font-bold text-mute tracking-tight">Estimated Cost</span>
                  <span className="text-2xl font-black text-ember-400 tracking-tight">
                    KES {order.estimated_cost?.toLocaleString() ?? '—'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Journey Steps - Crystal Borders */}
        <div className="bg-surface-2 backdrop-blur-2xl border border-line shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-8 mb-8">
          <h2 className="text-2xl font-black text-white tracking-tighter leading-none mb-8">Journey Status</h2>
          <ol className="relative border-l-2 border-line ml-3">
            {statusSteps.map((step, i) => (
              <li key={step.key} className="mb-8 ml-8 last:mb-0 group">
                <span className={`absolute -left-[17px] flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition-all duration-300 ${
                  step.done ? 'bg-gradient-to-br from-green-400 to-green-500 ring-4 ring-white/50' : 'bg-surface-2 ring-2 ring-white/30 backdrop-blur-md'
                }`}>
                  <span className={`text-xs font-black ${step.done ? 'text-white' : 'text-dim'}`}>{i + 1}</span>
                </span>
                <div className="flex items-center gap-3 transform transition-transform duration-300 group-hover:translate-x-1">
                  <p className={`text-lg font-bold tracking-tight ${ step.done ? 'text-white' : 'text-dim'}`}>
                    {step.label}
                  </p>
                  {step.done && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 uppercase tracking-widest border border-emerald-500/20">
                      Completed
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Shipping Address - Border Gradient (Step 4 style evolution) */}
        <div className="rounded-2xl mb-10">
          <div className="bg-surface border border-line shadow-card rounded-2xl p-6 h-full">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-400/10 rounded-full blur-[40px] pointer-events-none" />
            
            <p className="text-sm font-black text-white mb-4 uppercase tracking-widest flex items-center gap-2">
              <span className="text-xl">📦</span> Ship your order to:
            </p>
            <div className="font-mono text-sm leading-relaxed text-white/80 bg-surface-2 p-4 rounded-xl border border-line">
              <p className="text-ember-400 font-bold text-base">{user?.name}</p>
              <p className="text-ember-400 font-bold mb-2">{user?.warehouse_id || user?.warehouseId}</p>
              <p className="font-medium">31 Collingwood Close</p>
              <p className="font-medium">Hazel Grove, Stockport, SK7 4LB</p>
              <p className="font-medium">United Kingdom</p>
            </div>
          </div>
        </div>

        {/* Actions - Dynamic Sheen & High-End Glass */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            to={`/track?q=${order.tracking_number}`}
            className="group relative overflow-hidden flex-1 flex items-center justify-center gap-2 bg-ember-gradient text-white py-4 px-6 rounded-2xl font-black tracking-tight transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 glass-sheen"
          >
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
            Track Shipment
            <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            to="/orders"
            className="group relative overflow-hidden flex-1 flex items-center justify-center gap-2 bg-surface-2 backdrop-blur-xl border-2 border-line text-white hover:bg-surface-2 py-4 px-6 rounded-2xl font-black tracking-tight transition-all shadow-sm hover:shadow-md hover:-translate-y-1 glass-sheen"
          >
             <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
            View All Orders
          </Link>
          <Link
            to="/orders/new"
            className="group relative overflow-hidden flex-1 flex items-center justify-center gap-2 bg-ember-500/10 backdrop-blur-xl border-2 border-ember-500/25 text-ember-400 hover:bg-ember-500/15 hover:border-orange-300 py-4 px-6 rounded-2xl font-black tracking-tight transition-all shadow-sm hover:shadow-md hover:-translate-y-1 glass-sheen"
          >
             <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
            New Order
          </Link>
        </div>

      </div>
    </div>
  )
}
