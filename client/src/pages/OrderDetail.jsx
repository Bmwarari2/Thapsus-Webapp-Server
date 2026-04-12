import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Package, ArrowLeft, MapPin, Truck, Calendar, DollarSign, FileText, Box, Zap, Sparkles } from 'lucide-react'
import { ordersApi } from '../api'
import toast from 'react-hot-toast'

// --- CUSTOM STYLES & GLASS COMPONENTS ---
const OrderDetailStyles = () => (
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
    
    /* Hide scrollbar for horizontal scrolling elements */
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
    {children}
  </div>
);

export const OrderDetail = () => {
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState(null)
  const [activeTab, setActiveTab] = useState('tracking')

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

  // Human-readable labels that map to the DB status values
  const STATUS_LABELS = {
    pending:               'Pending',
    received_at_warehouse: 'Received',
    consolidating:         'Consolidating',
    in_transit:            'In Transit',
    customs:               'Customs',
    out_for_delivery:      'Out for Delivery',
    delivered:             'Delivered',
    cancelled:             'Cancelled',
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
      <div className="flex items-center justify-center h-screen bg-[#f8fafc]">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#f8fafc] py-12 px-4 font-sans flex items-center justify-center">
        <GlassCard className="max-w-lg w-full text-center p-12">
          <Package className="mx-auto text-slate-300 mb-6" size={64} />
          <h1 className="text-3xl font-black text-[#0f172a] tracking-tighter uppercase mb-3">Order Not Found</h1>
          <p className="text-slate-500 font-bold mb-8">This dispatch record does not exist or access is restricted.</p>
          <Link to="/orders" className="glass-sheen inline-flex items-center gap-2 bg-[#0f172a] hover:bg-slate-800 text-white px-8 py-4 rounded-[2rem] font-black uppercase tracking-widest text-xs transition-all shadow-xl hover:-translate-y-1">
            <ArrowLeft size={16} />
            Return to Terminal
          </Link>
        </GlassCard>
      </div>
    )
  }

  const dimensions = order.dimensions_json
  const cost = (order.actual_cost ?? order.estimated_cost ?? 0) + (order.customs_duty ?? 0)

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-x-hidden relative pb-24">
      <OrderDetailStyles />
      
      {/* --- LIQUID BACKGROUNDS --- */}
      <LiquidBlob className="top-[-5%] left-[-10%] w-[400px] h-[400px] md:w-[600px] md:h-[600px]" color="bg-blue-200" />
      <LiquidBlob className="bottom-[10%] right-[-5%] w-[350px] h-[350px] md:w-[500px] md:h-[500px]" color="bg-orange-200" />
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px] pointer-events-none" />

      <div className="max-w-5xl mx-auto px-6 py-12 relative z-10">
        
        {/* Back link */}
        <Link to="/orders" className="inline-flex items-center gap-2 text-slate-500 hover:text-orange-500 font-black uppercase tracking-widest text-[10px] mb-8 transition-all group">
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          Back to Terminal
        </Link>

        {/* --- INTERACTIVE TILTED HEADER --- */}
        <GlassCard className="mb-10 transform lg:rotate-1 hover:rotate-0 transition-all duration-700 p-8 md:p-12 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] group">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div className="space-y-4">
              <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-white/60 backdrop-blur-md border border-white/50 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 shadow-sm">
                <Zap size={12} className="text-orange-500" />
                Dispatch Overview
              </div>
              <h1 className="text-4xl md:text-6xl font-black text-[#0f172a] tracking-tighter uppercase leading-none">
                {order.tracking_number}
              </h1>
              <p className="text-slate-500 font-bold max-w-xl text-sm md:text-base leading-relaxed">
                {order.description}
              </p>
            </div>
            <span className={`inline-flex items-center px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest border shadow-sm ${getStatusColor(order.status)}`}>
              {STATUS_LABELS[order.status] || order.status?.replace(/_/g, ' ')}
            </span>
          </div>
        </GlassCard>

        {/* --- TAB SWITCHER --- */}
        <div className="mb-8">
          <div className="inline-flex bg-white/70 backdrop-blur-xl border border-white/60 rounded-full p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab('tracking')}
              className={`px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${
                activeTab === 'tracking'
                  ? 'bg-[#0f172a] text-white shadow-md'
                  : 'text-slate-500 hover:text-[#0f172a]'
              }`}
            >
              Tracking
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${
                activeTab === 'details'
                  ? 'bg-[#0f172a] text-white shadow-md'
                  : 'text-slate-500 hover:text-[#0f172a]'
              }`}
            >
              Details &amp; Charges
            </button>
          </div>
        </div>

        {/* --- STATUS PROGRESS (Tracking Tab) --- */}
        {activeTab === 'tracking' && order.status !== 'cancelled' && (
          <GlassCard className="mb-10 p-8 md:p-10 bg-slate-900/5">
            <h2 className="text-xl md:text-2xl font-black text-[#0f172a] uppercase tracking-tighter mb-8">Transit Trajectory</h2>
            <div className="flex items-center justify-between overflow-x-auto no-scrollbar pb-4 px-2">
              {statusSteps.map((step, i) => {
                const isCompleted = i <= currentStepIndex;
                const isCurrent = i === currentStepIndex;
                return (
                  <div key={step} className="flex items-center flex-shrink-0 relative group">
                    <div className="flex flex-col items-center relative z-10 w-20">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-black transition-all duration-500 ${
                        isCurrent
                          ? 'bg-[#0f172a] text-white scale-110 shadow-xl'
                          : isCompleted
                            ? 'bg-green-500 text-white shadow-lg shadow-green-200'
                            : 'bg-white border-2 border-slate-200 text-slate-400'
                      }`}>
                        {isCompleted && !isCurrent ? '✓' : i + 1}
                      </div>
                      <p className={`text-[9px] uppercase tracking-widest mt-4 text-center ${
                        isCurrent ? 'text-[#0f172a] font-black' : isCompleted ? 'text-green-600 font-bold' : 'text-slate-400 font-bold'
                      }`}>
                        {STATUS_LABELS[step] || step.replace(/_/g, ' ')}
                      </p>
                    </div>
                    {i < statusSteps.length - 1 && (
                      <div className="w-12 md:w-20 h-[3px] mx-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full bg-green-500 transition-all duration-700 ${isCompleted && !isCurrent ? 'w-full' : 'w-0'}`} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </GlassCard>
        )}

        {/* --- DETAILS & CHARGES TAB --- */}
        {activeTab === 'details' && (
          <>
            {/* BENTO GRID: DETAILS & FINANCES */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">

              {/* Left: Manifest Details */}
              <GlassCard className="p-8 md:p-10 flex flex-col h-full">
                <h2 className="text-xl md:text-2xl font-black text-[#0f172a] uppercase tracking-tighter mb-8 flex items-center gap-3">
                  <FileText className="text-blue-500" size={24} /> Manifest Details
                </h2>
                <div className="space-y-6 flex-1">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Retailer</span>
                    <span className="font-black text-lg text-[#0f172a]">{order.retailer}</span>
                  </div>
                  <div className="h-px w-full bg-slate-200/50" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Market Origin</span>
                    <span className="font-black text-lg text-[#0f172a]">
                      {order.market === 'UK' ? 'United Kingdom' : order.market === 'China' ? 'China' : order.market}
                    </span>
                  </div>
                  <div className="h-px w-full bg-slate-200/50" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Speed</span>
                      <span className="font-black text-slate-800 capitalize">{order.shipping_speed || 'Economy'}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Insurance</span>
                      <span className="font-black text-slate-800">{order.insurance ? 'Secured' : 'None'}</span>
                    </div>
                  </div>
                  {order.declared_value > 0 && (
                    <div className="flex flex-col pt-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Declared Value</span>
                      <span className="font-black text-lg text-green-600">KES {order.declared_value.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex flex-col pt-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Origination Date</span>
                    <span className="font-bold text-slate-600">
                      {order.created_at ? new Date(order.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                    </span>
                  </div>
                </div>
              </GlassCard>

              {/* Right: Specs & Finances */}
              <div className="relative group overflow-hidden rounded-[2.5rem] bg-[#0f172a] p-8 md:p-10 text-white shadow-2xl flex flex-col transition-all hover:scale-[1.01] h-full">
                <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-orange-500/20 blur-[80px] -z-0 pointer-events-none" />
                <div className="relative z-10 flex flex-col h-full">
                  <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tighter mb-8 flex items-center gap-3">
                    <Box className="text-orange-400" size={24} /> Specs & Finances
                  </h2>

                  <div className="grid grid-cols-2 gap-6 mb-8">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Dead Weight</p>
                      <p className="font-black text-2xl text-white">{order.weight_kg ? `${order.weight_kg} kg` : 'TBD'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Dimensions</p>
                      {dimensions ? (
                        <p className="font-black text-lg text-white">{dimensions.length}×{dimensions.width}×{dimensions.height} cm</p>
                      ) : (
                        <p className="font-bold text-slate-400 text-sm mt-1">Measured on arrival</p>
                      )}
                    </div>
                  </div>

                  <div className="h-px w-full bg-slate-700/50 mb-6" />

                  <div className="space-y-4 flex-1">
                    {(order.shipping_cost ?? order.estimated_cost) > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-400">Shipping Rate</span>
                        <span className="font-black text-sm">KES {(order.shipping_cost ?? order.estimated_cost ?? 0).toLocaleString()}</span>
                      </div>
                    )}
                    {order.handling_fee > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-400">Handling</span>
                        <span className="font-black text-sm">KES {order.handling_fee.toLocaleString()}</span>
                      </div>
                    )}
                    {order.insurance_fee > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-400">Insurance Premium</span>
                        <span className="font-black text-sm">KES {order.insurance_fee.toLocaleString()}</span>
                      </div>
                    )}
                    {order.customs_duty > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-400">Customs Clearance</span>
                        <span className="font-black text-sm">KES {order.customs_duty.toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 pt-6 border-t border-slate-700/50">
                    <div className="flex justify-between items-end">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest text-orange-400 mb-1">
                          {order.actual_cost ? 'Final Total' : 'Estimated Total'}
                        </span>
                        {!order.actual_cost && <span className="text-[9px] text-slate-400 font-bold max-w-[120px]">Confirmed after physical weighing</span>}
                      </div>
                      <span className="text-3xl md:text-4xl font-black text-white">
                        KES {cost.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* PACKAGES INCLUDED */}
            {order.packages && order.packages.length > 0 && (
              <GlassCard className="mb-10 p-8">
                <h2 className="text-xl font-black text-[#0f172a] uppercase tracking-tighter mb-6 flex items-center gap-3">
                  <Package size={20} className="text-blue-600" /> Package Line Items
                </h2>
                <div className="bg-white/50 backdrop-blur-md rounded-3xl overflow-hidden border border-white">
                  <table className="w-full text-left">
                    <thead className="bg-[#0f172a]/5">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Contents</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Weight</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Internal Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/50">
                      {order.packages.map((pkg) => (
                        <tr key={pkg.id} className="hover:bg-white/40 transition-colors">
                          <td className="px-6 py-4 text-sm font-bold text-[#0f172a]">{pkg.description}</td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-600">{pkg.weight_kg ? `${pkg.weight_kg} kg` : '—'}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex px-3 py-1 rounded-full text-[9px] font-black uppercase border shadow-sm ${getStatusColor(pkg.status)}`}>
                              {STATUS_LABELS[pkg.status] || pkg.status?.replace(/_/g, ' ')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            )}
          </>
        )}

        {/* --- PAYMENT CTA (Border Gradient Bento) --- */}
        {order.status !== 'cancelled' && order.status !== 'delivered' && cost > 0 && (
          <div className="p-1 bg-gradient-to-br from-orange-400 via-orange-300 to-blue-400 rounded-[2.5rem] shadow-2xl group transition-all hover:scale-[1.01]">
            <div className="h-full w-full bg-white/95 backdrop-blur-3xl rounded-[2.4rem] p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center shrink-0">
                  <DollarSign size={32} className="text-orange-500" />
                </div>
                <div>
                  <h3 className="text-2xl md:text-3xl font-black text-[#0f172a] tracking-tighter uppercase mb-1">Clear Invoice</h3>
                  <p className="text-sm font-bold text-slate-500">Settle your KES {cost.toLocaleString()} balance to expedite delivery.</p>
                </div>
              </div>
              <Link
                to={`/pay/${order.id}?amount=${cost}`}
                className="glass-sheen w-full md:w-auto bg-[#0f172a] hover:bg-slate-800 text-white px-10 py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-xl transition-all hover:-translate-y-1 whitespace-nowrap text-center"
              >
                Pay via M-Pesa
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
