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
    <div className="min-h-screen relative bg-slate-50 overflow-hidden py-12 px-4 font-sans">
      {/* Liquid Backgrounds */}
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-blue-300/30 rounded-full blur-[100px] animate-morph mix-blend-multiply pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-orange-300/20 rounded-full blur-[100px] animate-morph mix-blend-multiply pointer-events-none" />
      <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[40vw] h-[40vw] max-w-[400px] max-h-[400px] bg-indigo-200/20 rounded-full blur-[120px] animate-morph mix-blend-multiply pointer-events-none" />

      <div className="max-w-3xl mx-auto relative z-10">

        {/* Success Banner */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 bg-white/40 backdrop-blur-2xl border border-white/60 shadow-xl rounded-full flex items-center justify-center relative overflow-hidden">
               <div className="absolute inset-0 bg-green-400/20 blur-xl rounded-full" />
               <CheckCircle className="text-green-600 relative z-10 drop-shadow-sm" size={56} />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-[#1e3a5f] mb-3 leading-none tracking-tighter">Order Confirmed.</h1>
          <p className="text-slate-600 text-lg font-medium">Your order is secured and processing.</p>
        </div>

        {/* Tracking Number - Dark Glass & Interactive Element */}
        <div className="group relative overflow-hidden bg-[#0f172a]/80 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 text-white shadow-2xl mb-8 transition-transform duration-500 hover:-rotate-1 hover:scale-[1.02] transform perspective-1000 glass-sheen">
          {/* Blurred Orange Orb inside Dark Glass */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-orange-500/40 rounded-full blur-[70px] pointer-events-none" />
          
          <div className="relative z-10">
            <p className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-widest">Tracking Number</p>
            <div className="flex items-center justify-between gap-4">
              <p className="font-mono text-3xl font-black text-orange-400 break-all leading-none tracking-tighter drop-shadow-md">
                {order.tracking_number}
              </p>
              <button
                onClick={handleCopyTracking}
                className="flex-shrink-0 flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-105 active:scale-95"
              >
                <Copy size={16} />
                Copy
              </button>
            </div>
            <p className="text-xs font-medium text-slate-400 mt-3">Use this number to track your shipment worldwide</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Order Details - Crystal Borders */}
          <div className="bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-6 relative overflow-hidden glass-sheen">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-white/50 rounded-lg shadow-sm">
                <Package className="text-[#1e3a5f]" size={20} />
              </div>
              <h2 className="text-2xl font-black text-[#1e3a5f] tracking-tighter leading-none">Details</h2>
            </div>
            <div className="space-y-4 text-sm font-medium">
              <div className="flex justify-between items-center border-b border-white/30 pb-2">
                <span className="text-slate-500">Retailer</span>
                <span className="text-slate-800">{order.retailer}</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/30 pb-2">
                <span className="text-slate-500">Market</span>
                <span className="text-slate-800">{order.market}</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/30 pb-2">
                <span className="text-slate-500">Description</span>
                <span className="text-slate-800 text-right max-w-[60%] truncate">{order.description}</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/30 pb-2">
                <span className="text-slate-500">Weight</span>
                <span className="text-slate-800">{order.weight_kg} kg</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/30 pb-2">
                <span className="text-slate-500">Speed</span>
                <span className="text-slate-800 capitalize">{order.shipping_speed}</span>
              </div>
              <div className="flex justify-between items-center pb-1">
                <span className="text-slate-500">Insurance</span>
                <span className="text-slate-800">{order.insurance ? 'Active' : 'None'}</span>
              </div>
            </div>
          </div>

          {/* Price Breakdown - Crystal Borders with Tint */}
          <div className="bg-orange-50/40 backdrop-blur-2xl border border-orange-200/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-6 relative overflow-hidden glass-sheen">
            <div className="flex items-center gap-3 mb-6">
               <div className="p-2 bg-orange-100/50 rounded-lg shadow-sm">
                 <Truck className="text-orange-600" size={20} />
               </div>
              <h2 className="text-2xl font-black text-[#1e3a5f] tracking-tighter leading-none">Pricing</h2>
            </div>
            {pricing ? (
              <div className="space-y-4 text-sm font-medium">
                <div className="flex justify-between items-center border-b border-orange-200/30 pb-2">
                  <span className="text-slate-600">Base Shipping</span>
                  <span className="text-slate-800">KES {pricing.breakdown?.base_shipping?.amount?.toLocaleString() ?? '—'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-orange-200/30 pb-2">
                  <span className="text-slate-600">Handling Fee</span>
                  <span className="text-slate-800">KES {pricing.breakdown?.handling_fee?.amount?.toLocaleString() ?? '—'}</span>
                </div>
                {pricing.breakdown?.insurance?.included && (
                  <div className="flex justify-between items-center border-b border-orange-200/30 pb-2">
                    <span className="text-slate-600">Insurance</span>
                    <span className="text-slate-800">KES {pricing.breakdown?.insurance?.amount?.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between items-center border-b border-orange-200/30 pb-2">
                  <span className="text-slate-600">Customs (est.)</span>
                  <span className="text-slate-800">KES {pricing.breakdown?.customs_estimate?.amount?.toLocaleString() ?? '—'}</span>
                </div>
                <div className="pt-2 flex justify-between items-end">
                  <span className="text-xl font-black text-[#1e3a5f] tracking-tight">Total</span>
                  <span className="text-xl font-black text-orange-600 tracking-tight">
                    KES {pricing.summary?.total?.toLocaleString() ?? (order.estimated_cost?.toLocaleString() ?? '—')}
                  </span>
                </div>
                {pricing.notes?.delivery_time && (
                  <div className="mt-4 p-3 bg-white/40 rounded-xl border border-white/50 backdrop-blur-md">
                    <p className="text-xs text-slate-600 font-semibold flex items-center gap-2">
                      <Clock size={14} className="text-orange-500" />
                      {pricing.notes.delivery_time}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm font-medium h-full flex flex-col justify-end pb-2">
                <div className="flex justify-between items-end">
                  <span className="text-lg font-bold text-slate-600 tracking-tight">Estimated Cost</span>
                  <span className="text-2xl font-black text-orange-600 tracking-tight">
                    KES {order.estimated_cost?.toLocaleString() ?? '—'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Journey Steps - Crystal Borders */}
        <div className="bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-8 mb-8">
          <h2 className="text-2xl font-black text-[#1e3a5f] tracking-tighter leading-none mb-8">Journey Status</h2>
          <ol className="relative border-l-2 border-white/50 ml-3">
            {statusSteps.map((step, i) => (
              <li key={step.key} className="mb-8 ml-8 last:mb-0 group">
                <span className={`absolute -left-[17px] flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition-all duration-300 ${
                  step.done ? 'bg-gradient-to-br from-green-400 to-green-500 ring-4 ring-white/50' : 'bg-white/80 ring-2 ring-white/30 backdrop-blur-md'
                }`}>
                  <span className={`text-xs font-black ${step.done ? 'text-white' : 'text-slate-400'}`}>{i + 1}</span>
                </span>
                <div className="flex items-center gap-3 transform transition-transform duration-300 group-hover:translate-x-1">
                  <p className={`text-lg font-bold tracking-tight ${ step.done ? 'text-slate-800' : 'text-slate-400'}`}>
                    {step.label}
                  </p>
                  {step.done && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 uppercase tracking-widest border border-green-200/50">
                      Completed
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Shipping Address - Border Gradient (Step 4 style evolution) */}
        <div className="rounded-2xl p-[1px] bg-gradient-to-br from-blue-300/60 via-white/20 to-orange-300/60 mb-10 shadow-lg">
          <div className="bg-white/50 backdrop-blur-3xl rounded-[15px] p-6 h-full relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-400/10 rounded-full blur-[40px] pointer-events-none" />
            
            <p className="text-sm font-black text-[#1e3a5f] mb-4 uppercase tracking-widest flex items-center gap-2">
              <span className="text-xl">📦</span> Ship your order to:
            </p>
            <div className="font-mono text-sm leading-relaxed text-slate-700 bg-white/30 p-4 rounded-xl border border-white/50">
              <p className="text-orange-600 font-bold text-base">{user?.name}</p>
              <p className="text-orange-600 font-bold mb-2">{user?.warehouse_id || user?.warehouseId}</p>
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
            className="group relative overflow-hidden flex-1 flex items-center justify-center gap-2 bg-[#1e3a5f] text-white py-4 px-6 rounded-2xl font-black tracking-tight transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 glass-sheen"
          >
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
            Track Shipment
            <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            to="/orders"
            className="group relative overflow-hidden flex-1 flex items-center justify-center gap-2 bg-white/40 backdrop-blur-xl border-2 border-white/60 text-[#1e3a5f] hover:bg-white/60 py-4 px-6 rounded-2xl font-black tracking-tight transition-all shadow-sm hover:shadow-md hover:-translate-y-1 glass-sheen"
          >
             <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
            View All Orders
          </Link>
          <Link
            to="/orders/new"
            className="group relative overflow-hidden flex-1 flex items-center justify-center gap-2 bg-orange-50/40 backdrop-blur-xl border-2 border-orange-200 text-orange-600 hover:bg-orange-100/50 hover:border-orange-300 py-4 px-6 rounded-2xl font-black tracking-tight transition-all shadow-sm hover:shadow-md hover:-translate-y-1 glass-sheen"
          >
             <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
            New Order
          </Link>
        </div>

      </div>
    </div>
  )
}
