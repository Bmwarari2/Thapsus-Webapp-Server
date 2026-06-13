import React from 'react'

/**
 * Shared surface primitives (used by Dashboard, Ops/Admin consoles, partner
 * portals, etc.)
 *
 * Refreshed design language: these used to render translucent "liquid glass"
 * cards over animated orange/blue blobs. They now render clean, solid surfaces
 * on a calm neutral page background — sleek, simple, on-brand (navy + orange).
 *
 * Exported names and signatures are unchanged so every importing page keeps
 * working without edits.
 */

export const GlassStyles = () => (
  <style>{`
    /* Kept as inert no-ops so any lingering class references stay harmless
       after the de-glass refresh (no animated blobs, no sweeping sheen). */
    .animate-morph { animation: none; }
    .glass-sheen::after { content: none; }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `}</style>
)

/* Decorative background blobs removed in the redesign — render nothing so
   existing call sites are no-ops. */
export const LiquidBlob = () => null

export const GlassCard = ({ children, className = '' }) => (
  <div
    className={`relative rounded-2xl bg-white border border-gray-100 shadow-card
                transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
                hover:shadow-card-hover ${className}`}
  >
    <div className="relative z-10">{children}</div>
  </div>
)

export const PageBackdrop = ({ children }) => (
  <div className="relative min-h-screen bg-gray-50">
    <GlassStyles />
    <div className="relative z-10">{children}</div>
  </div>
)

export const PageHeading = ({ icon: Icon, title, subtitle }) => (
  <div className="flex items-start gap-4 mb-8">
    {Icon && (
      <div className="p-3 bg-navy text-white rounded-2xl shadow-soft">
        <Icon size={26} />
      </div>
    )}
    <div>
      <h1 className="text-3xl md:text-[2.25rem] font-bold tracking-tight text-navy">{title}</h1>
      {subtitle && <p className="text-gray-500 mt-1">{subtitle}</p>}
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
