import React from 'react'

/**
 * Shared liquid-glass UI primitives (matches Home.jsx / Dashboard.jsx / Wallet.jsx)
 *
 * Use these helpers in new pages to keep the existing visual language without
 * duplicating the morph keyframes block in every file.
 */

export const GlassStyles = () => (
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
)

export const LiquidBlob = ({ className = '', color = 'bg-orange-200' }) => (
  <div className={`absolute blur-[100px] md:blur-[120px] rounded-full mix-blend-multiply opacity-60 animate-morph pointer-events-none ${className} ${color}`} />
)

export const GlassCard = ({ children, className = '' }) => (
  <div className={`relative overflow-hidden rounded-[2.5rem] bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />
    <div className="relative z-10">{children}</div>
  </div>
)

export const PageBackdrop = ({ children }) => (
  <div className="relative min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50 overflow-hidden">
    <GlassStyles />
    <LiquidBlob className="top-[-15%] left-[-15%] w-[40rem] h-[40rem]" color="bg-orange-200" />
    <LiquidBlob className="bottom-[-15%] right-[-15%] w-[40rem] h-[40rem]" color="bg-blue-200"  />
    <div className="relative z-10">{children}</div>
  </div>
)

export const PageHeading = ({ icon: Icon, title, subtitle }) => (
  <div className="flex items-start gap-4 mb-8">
    {Icon && (
      <div className="p-3 bg-[#1e3a5f] text-white rounded-2xl shadow-lg">
        <Icon size={26} />
      </div>
    )}
    <div>
      <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-[#1e3a5f]">{title}</h1>
      {subtitle && <p className="text-slate-600 mt-1">{subtitle}</p>}
    </div>
  </div>
)

export const StatusBadge = ({ status, color }) => {
  const map = {
    open:           'bg-blue-100   text-blue-800',
    pending:        'bg-amber-100  text-amber-800',
    in_progress:    'bg-blue-100   text-blue-800',
    received:       'bg-emerald-100 text-emerald-800',
    consolidating:  'bg-purple-100 text-purple-800',
    in_transit:     'bg-indigo-100 text-indigo-800',
    customs:        'bg-yellow-100 text-yellow-800',
    out_for_delivery: 'bg-orange-100 text-orange-800',
    delivered:      'bg-emerald-100 text-emerald-800',
    cancelled:      'bg-red-100    text-red-800',
    held:           'bg-red-100    text-red-800',
    cleared:        'bg-emerald-100 text-emerald-800',
    paid:           'bg-emerald-100 text-emerald-800',
    fulfilled:      'bg-emerald-100 text-emerald-800',
    rejected:       'bg-red-100    text-red-800',
    completed:      'bg-emerald-100 text-emerald-800',
    failed:         'bg-red-100    text-red-800',
    closed:         'bg-slate-200  text-slate-700',
  }
  const cls = color || map[status] || 'bg-slate-100 text-slate-700'
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {String(status || '').replace(/_/g, ' ')}
    </span>
  )
}
