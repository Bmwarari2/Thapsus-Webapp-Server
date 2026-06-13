import React from 'react'

/**
 * Shared dark-UI primitives ("Ember" design system).
 * Lightweight building blocks used across the rebuilt pages.
 */

// Section eyebrow chip: a pill with a glowing ember dot.
export const PillLabel = ({ children, className = '' }) => (
  <span className={`pill-label ${className}`}>{children}</span>
)

// Circular/rounded ember icon badge with a soft glow halo.
export const EmberIcon = ({ icon: Icon, size = 22, className = '', wrap = 'w-12 h-12' }) => (
  <span className={`ember-badge ${wrap} ${className}`}>
    <Icon size={size} />
  </span>
)

// Dark card with an optional soft ember corner-glow.
export const Card = ({ children, glow = false, className = '', as: Tag = 'div', ...rest }) => (
  <Tag className={`${glow ? 'glow-card' : 'card'} ${className}`} {...rest}>
    {children}
  </Tag>
)

// Decorative concentric-arc backdrop (à la the reference), purely visual.
export const ArcDecoration = ({ className = '' }) => (
  <svg
    aria-hidden="true"
    className={`pointer-events-none absolute ${className}`}
    viewBox="0 0 400 400" fill="none"
  >
    {[60, 120, 180, 240, 300].map((r) => (
      <circle key={r} cx="400" cy="0" r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
    ))}
  </svg>
)

// Section heading block: eyebrow pill + big title + optional subtitle.
export const SectionHeading = ({ eyebrow, title, subtitle, center = false, className = '' }) => (
  <div className={`${center ? 'text-center mx-auto' : ''} max-w-2xl space-y-5 ${className}`}>
    {eyebrow && (
      <div className={center ? 'flex justify-center' : ''}>
        <PillLabel>{eyebrow}</PillLabel>
      </div>
    )}
    <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white leading-[1.05]">{title}</h2>
    {subtitle && <p className="text-mute text-base md:text-lg leading-relaxed">{subtitle}</p>}
  </div>
)

// Compact stat tile.
export const Stat = ({ label, value, accent = false }) => (
  <div className={`rounded-3xl p-5 border ${accent ? 'border-ember-500/30 bg-ember-500/[0.06]' : 'border-line bg-surface'}`}>
    <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${accent ? 'text-ember-400' : 'text-mute'}`}>{label}</p>
    <p className={`text-3xl md:text-4xl font-bold tracking-tight tabular-nums ${accent ? 'text-ember-400' : 'text-white'}`}>{value}</p>
  </div>
)
