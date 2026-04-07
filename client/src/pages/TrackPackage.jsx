import React, { useState } from 'react'
import { 
  Search, Package, Check, Clock, AlertCircle, 
  ArrowRight, Box, MapPin, Calendar, Info, Zap, Sparkles
} from 'lucide-react'

/**
 * MOCK DEPENDENCIES
 * These replace the relative imports causing build errors
 * in the standalone preview environment.
 */
const useLanguage = () => ({
  t: (key) => {
    const translations = {
      'track.title': 'Track Your Package',
      'track.placeholder': 'Enter Tracking Number (e.g., THP-789-22)',
      'track.search': 'Track Order',
      'track.notFound': 'Invalid tracking number. Please check and try again.',
      'track.trackingNumber': 'Tracking ID',
      'track.status': 'Current Status',
      'track.estimatedDelivery': 'Expected Arrival',
      'track.lastUpdate': 'Last Scanned At',
      'track.timeline': 'Journey History',
      'common.error': 'Tracking Error',
      'common.loading': 'Locating Package...',
      'orders.pending': 'Order Placed',
      'orders.received_at_warehouse': 'At Hub',
      'orders.in_transit': 'In Transit',
      'orders.delivered': 'Delivered'
    };
    return translations[key] || key;
  }
});

const ordersApi = {
  track: async (id) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Return mock data for any ID entered
    return {
      data: {
        tracking: {
          status: 'in_transit',
          market: 'UK',
          weight_kg: 2.4,
          estimated_cost: 3450,
          description: 'Personal Electronics & Accessories',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          estimated_delivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
        }
      }
    };
  }
};

const toast = {
  error: (msg) => console.log('Toast Error:', msg),
  success: (msg) => console.log('Toast Success:', msg)
};

/**
 * LIQUID GLASS COMPONENTS
 */
const LiquidBlob = ({ className, color }) => (
  <div className={`absolute blur-[120px] rounded-full mix-blend-multiply opacity-60 animate-morph ${className} ${color}`} />
);

const GlassCard = ({ children, className = "" }) => (
  <div className={`relative overflow-hidden rounded-[2.5rem] bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
    {children}
  </div>
);

export const TrackPackage = () => {
  const { t } = useLanguage()
  const [trackingNumber, setTrackingNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [package_, setPackage] = useState(null)
  const [error, setError] = useState(null)

  const statusTimeline = [
    { status: 'pending', label: 'Order Placed', icon: Package },
    { status: 'received_at_warehouse', label: 'Warehouse Received', icon: MapPin },
    { status: 'in_transit', label: 'In Transit', icon: Box },
    { status: 'delivered', label: 'Delivered', icon: Check },
  ]

  const handleTrack = async (e) => {
    e.preventDefault()
    if (!trackingNumber.trim()) {
      setError(t('track.notFound'))
      return
    }

    try {
      setLoading(true)
      setError(null)
      const response = await ordersApi.track(trackingNumber)
      setPackage(response.data.tracking)
    } catch (err) {
      setError(t('track.notFound'))
      toast.error(t('track.notFound'))
      setPackage(null)
    } finally {
      setLoading(false)
    }
  }

  const currentStatusIndex = package_
    ? statusTimeline.findIndex((s) => s.status === package_.status)
    : -1

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-x-hidden relative">
      <style>{`
        @keyframes morph {
          0% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes sheen {
          0% { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(200%) skewX(-15deg); }
        }
        .animate-morph { animation: morph 12s ease-in-out infinite; }
        .glass-sheen { position: relative; overflow: hidden; }
        .glass-sheen::after {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 50%; height: 100%;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.3), transparent);
          animation: sheen 4s infinite;
        }
      `}</style>

      {/* Background Liquid Elements */}
      <LiquidBlob className="top-[-10%] left-[-5%] w-[500px] h-[500px]" color="bg-blue-100" />
      <LiquidBlob className="bottom-[10%] right-[-5%] w-[600px] h-[600px]" color="bg-orange-100" />
      <div className="absolute inset-0 bg-white/20 backdrop-blur-[2px]" />

      <div className="max-w-4xl mx-auto px-6 py-12 lg:py-20 relative z-10">
        {/* Header */}
        <div className="text-center mb-12 lg:mb-16 space-y-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/60 backdrop-blur-md border border-white/50 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-2">
            <Zap size={10} className="text-orange-500" />
            Live Logistics Tracking
          </div>
          <h1 className="text-5xl lg:text-7xl font-black text-[#0f172a] tracking-tighter uppercase leading-none">
            {t('track.title')}
          </h1>
          <p className="text-slate-500 font-medium max-w-md mx-auto">
            Get instant visibility into your package's global journey.
          </p>
        </div>

        {/* Search Bar - Glassmorphic */}
        <div className="max-w-2xl mx-auto mb-16">
          <form onSubmit={handleTrack} className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-orange-400 to-blue-400 rounded-[2.5rem] blur opacity-10 group-hover:opacity-30 transition duration-1000"></div>
            <div className="relative flex items-center gap-2 p-2 bg-white/80 backdrop-blur-2xl border border-white/50 rounded-[2.5rem] shadow-2xl">
              <Search className="ml-6 text-slate-400" size={20} />
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder={t('track.placeholder')}
                className="w-full px-4 py-4 bg-transparent border-none outline-none focus:ring-0 text-slate-800 font-bold placeholder:text-slate-300"
              />
              <button
                type="submit"
                disabled={loading}
                className="glass-sheen bg-[#0f172a] text-white px-10 py-4 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-slate-800 transition-all disabled:opacity-50 min-w-[140px]"
              >
                {loading ? 'Locating...' : t('track.search')}
              </button>
            </div>
          </form>
        </div>

        {/* Error Message */}
        {error && (
          <div className="max-w-2xl mx-auto mb-12 animate-in fade-in zoom-in duration-300">
            <div className="bg-red-50/80 backdrop-blur-md border border-red-200/50 p-6 rounded-[2rem] flex items-center gap-4 text-red-800 shadow-sm">
              <AlertCircle className="shrink-0" size={24} />
              <p className="font-bold text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Package Details Display */}
        {package_ && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in slide-in-from-bottom-8 duration-700">
            
            {/* Left Column: Timeline */}
            <div className="lg:col-span-7">
              <GlassCard className="p-8 lg:p-10">
                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400 mb-10 flex items-center gap-2">
                  <Clock size={14} /> Global Transit Timeline
                </h3>

                <div className="relative">
                  {statusTimeline.map((step, idx) => {
                    const isCompleted = idx <= currentStatusIndex
                    const isCurrent = idx === currentStatusIndex
                    const Icon = step.icon

                    return (
                      <div key={step.status} className="relative mb-12 last:mb-0 group">
                        {/* Vertical Line */}
                        {idx < statusTimeline.length - 1 && (
                          <div className="absolute left-6 top-14 w-[2px] h-10 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full bg-gradient-to-b from-green-500 to-green-400 transition-all duration-1000 delay-300 ${
                                isCompleted ? 'translate-y-0' : '-translate-y-full'
                              }`} 
                            />
                          </div>
                        )}

                        <div className="flex items-start gap-8">
                          {/* Circle Icon */}
                          <div
                            className={`relative shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                              isCurrent
                                ? 'bg-[#0f172a] text-white shadow-xl shadow-slate-200 scale-110'
                                : isCompleted
                                  ? 'bg-green-500 text-white'
                                  : 'bg-white border border-slate-100 text-slate-300'
                            }`}
                          >
                            <Icon size={20} />
                            {isCurrent && (
                              <div className="absolute inset-0 rounded-2xl bg-[#0f172a]/20 animate-ping opacity-20" />
                            )}
                          </div>

                          {/* Text Content */}
                          <div className="pt-1">
                            <h4 className={`text-lg font-black tracking-tight ${isCurrent || isCompleted ? 'text-slate-900' : 'text-slate-300'}`}>
                              {step.label}
                            </h4>
                            {isCurrent && (
                              <div className="mt-1 flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-md text-[9px] font-black uppercase tracking-wider">
                                  Current Station
                                </span>
                              </div>
                            )}
                            {isCompleted && !isCurrent && (
                              <p className="text-xs text-green-600 font-bold mt-1">Processed</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </GlassCard>
            </div>

            {/* Right Column: Status Card */}
            <div className="lg:col-span-5 space-y-8">
              <GlassCard className="p-8 lg:p-10 bg-slate-900/5">
                <div className="flex justify-between items-center mb-10">
                  <div className="p-3 bg-white rounded-2xl shadow-xl text-orange-500"><Package size={24}/></div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-white/60 backdrop-blur-md rounded-full text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 shadow-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Secure Status
                  </div>
                </div>

                <div className="space-y-8">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tracking Number</p>
                    <p className="text-2xl font-black text-[#0f172a]">{trackingNumber}</p>
                  </div>

                  <div className="h-px bg-slate-200/50 w-full" />

                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                      <p className="text-lg font-black text-orange-600 uppercase tracking-tighter">
                        {t(`orders.${package_.status}`)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Est. Delivery</p>
                      <p className="text-lg font-black text-slate-900">
                        {new Date(package_.estimated_delivery).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-8 lg:p-10">
                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400 mb-6">Package Manifest</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-slate-50">
                    <span className="text-sm font-bold text-slate-400">Hub Region</span>
                    <span className="font-black text-slate-900 uppercase tracking-tight">{package_.market} Hub</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-slate-50">
                    <span className="text-sm font-bold text-slate-400">Dead Weight</span>
                    <span className="font-black text-slate-900">{package_.weight_kg || '—'} KG</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-slate-50">
                    <span className="text-sm font-bold text-slate-400">Total Fees (KES)</span>
                    <span className="font-black text-[#0f172a] text-xl">
                      {package_.estimated_cost?.toLocaleString() || 0}
                    </span>
                  </div>
                  {package_.description && (
                    <div className="pt-4">
                      <span className="text-sm font-bold text-slate-400 block mb-2">Item Description</span>
                      <div className="p-4 bg-slate-50 rounded-2xl text-sm font-medium text-slate-600">
                        {package_.description}
                      </div>
                    </div>
                  )}
                </div>
              </GlassCard>

              {/* Support Quick Link */}
              <div className="bg-[#0f172a] p-8 rounded-[2.5rem] text-white flex items-center justify-between group cursor-pointer hover:shadow-2xl transition-all">
                <div>
                   <h4 className="font-black uppercase tracking-tighter text-lg">Need Assistance?</h4>
                   <p className="text-xs text-slate-400 font-bold">Connect with a dispatcher</p>
                </div>
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center group-hover:bg-orange-500 transition-colors">
                  <ArrowRight size={20} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function App() {
  return <TrackPackage />;
}
