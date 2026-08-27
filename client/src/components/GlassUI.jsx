import React from 'react'

/**
 * Shared surface primitives (Dashboard, Ops/Admin consoles, partner portals…).
 * Dark "Ember" design system: solid dark surfaces, hairline borders, ember
 * accent. Exported names/signatures unchanged so importing pages keep working.
 */

export const GlassStyles = () => (
  <style>{`
    .animate-morph { animation: none; }
    .glass-sheen::after { content: none; }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `}</style>
)

export const LiquidBlob = () => null

export const GlassCard = ({ children, className = '' }) => (
  <div className={`relative rounded-3xl bg-surface border border-line shadow-card
                   transition-[transform,box-shadow,border-color] duration-300 ease-smooth
                   hover:shadow-card-hover hover:border-line-strong ${className}`}>
    <div className="relative z-10">{children}</div>
  </div>
)

export const PageBackdrop = ({ children }) => (
  <div className="relative min-h-screen">
    <GlassStyles />
    <div className="absolute -top-24 right-0 w-[44rem] h-[44rem] bg-ember-radial blur-2xl pointer-events-none" />
    <div className="relative z-10">{children}</div>
  </div>
)

export const PageHeading = ({ icon: Icon, title, subtitle }) => (
  <div className="flex items-start gap-4 mb-8">
    {Icon && (
      <span className="ember-badge w-12 h-12 rounded-2xl"><Icon size={24} /></span>
    )}
    <div>
      <h1 className="text-3xl md:text-[2.25rem] font-bold tracking-tight text-white">{title}</h1>
      {subtitle && <p className="text-mute mt-1">{subtitle}</p>}
    </div>
  </div>
)

export const StatusBadge = ({ status, color }) => {
  const map = {
    open:             'bg-blue-500/10 text-blue-300 border-blue-500/20',
    pending:          'bg-amber-500/10 text-amber-300 border-amber-500/20',
    in_progress:      'bg-blue-500/10 text-blue-300 border-blue-500/20',
    received:         'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    consolidating:    'bg-purple-500/10 text-purple-300 border-purple-500/20',
    in_transit:       'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
    customs:          'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
    out_for_delivery: 'bg-ember-500/10 text-ember-400 border-ember-500/25',
    delivered:        'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    cancelled:        'bg-red-500/10 text-red-300 border-red-500/20',
    held:             'bg-red-500/10 text-red-300 border-red-500/20',
    cleared:          'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    paid:             'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    fulfilled:        'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    rejected:         'bg-red-500/10 text-red-300 border-red-500/20',
    completed:        'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    failed:           'bg-red-500/10 text-red-300 border-red-500/20',
    closed:           'bg-white/5 text-mute border-line',
    // WhatsApp pipeline (wa_orders / payments). These were missing, so
    // every badge on the board rendered as the undifferentiated grey
    // fallback and the colour coding was dead.
    quoting:          'bg-blue-500/10 text-blue-300 border-blue-500/20',
    quoted:           'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
    confirmed:        'bg-amber-500/10 text-amber-300 border-amber-500/20',
    awaiting_review:  'bg-amber-500/10 text-amber-300 border-amber-500/20',
    purchased:        'bg-purple-500/10 text-purple-300 border-purple-500/20',
    in_kenya:         'bg-teal-500/10 text-teal-300 border-teal-500/20',
    delivery_fee_pending: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
    dispatched:       'bg-ember-500/10 text-ember-400 border-ember-500/25',
    collected:        'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    // Team page passes roles / account states through the same badge.
    admin:            'bg-ember-500/10 text-ember-400 border-ember-500/25',
    operator:         'bg-blue-500/10 text-blue-300 border-blue-500/20',
    inactive:         'bg-white/5 text-mute border-line',
  }
  const cls = color || map[status] || 'bg-white/5 text-mute border-line'
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cls}`}>
      {String(status || '').replace(/_/g, ' ')}
    </span>
  )
}
