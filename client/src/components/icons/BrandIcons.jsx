/**
 * Brand icon stubs for Facebook + Instagram.
 *
 * Lucide v1 dropped brand icons (per reference_dep_major_gotchas.md
 * and audit F-19). Footer.jsx used to import these directly from
 * lucide-react; once the dependency bump lands, those imports break
 * the build. We re-implement just the two shapes we use, with the
 * same `size` + `className` API Lucide exposes, so the call-sites
 * stay identical:
 *
 *     <Facebook size={20} className="..." />
 *     <Instagram size={20} className="..." />
 *
 * SVG paths lifted from Lucide v0.577.0's source so the visual
 * footprint matches what was rendered before the bump.
 */

import React from 'react'

const baseProps = (size, className) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className,
  'aria-hidden': 'true',
})

export function Facebook({ size = 24, className = '', ...rest }) {
  return (
    <svg {...baseProps(size, className)} {...rest}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  )
}

export function Instagram({ size = 24, className = '', ...rest }) {
  return (
    <svg {...baseProps(size, className)} {...rest}>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}
