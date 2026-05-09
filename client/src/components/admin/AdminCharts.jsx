/**
 * Lazy-loaded Recharts compositions for the admin dashboard (audit F-20).
 *
 * Recharts ships ~225 KB / 60 KB gzip of vendor JS — too much to keep in
 * the main admin entry chunk when ~5 of the 7 admin tabs don't render
 * any chart. This file is the only place that imports from `recharts`,
 * so Vite splits it into its own chunk; AdminDashboard.jsx imports each
 * named component via React.lazy + Suspense, deferring the recharts
 * download until the user actually opens the overview or revenue tab.
 *
 * Each component is intentionally a thin wrapper around the JSX that
 * used to live inline in AdminDashboard.jsx — same dimensions, same
 * gradient defs, same tooltip styles — so the visual footprint is
 * identical. Only the import path moved.
 */

import React from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts'

const TOOLTIP_DARK = {
  backgroundColor: '#0f172a',
  borderRadius: '1rem',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff',
}

const TOOLTIP_LIGHT = {
  borderRadius: '1rem',
  border: '1px solid rgba(0,0,0,0.05)',
  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
}

/**
 * Revenue area chart — ink-on-dark gradient. Used in the overview tab's
 * global revenue card.
 */
export function RevenueAreaChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data || []}>
        <defs>
          <linearGradient id="colorDailyRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f97316" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="rgba(255,255,255,0.05)"
        />
        <Tooltip
          contentStyle={TOOLTIP_DARK}
          formatter={(val) => [`KES ${Number(val).toLocaleString()}`, 'Revenue']}
          labelFormatter={(label) => new Date(label).toLocaleDateString()}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="#f97316"
          strokeWidth={3}
          fillOpacity={1}
          fill="url(#colorDailyRev)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/**
 * Market volume pie chart. Caller must pass the {name, value}[] data
 * plus a same-length COLORS array for cell tinting.
 */
export function MarketPieChart({ data, colors }) {
  if (!data || data.length === 0) {
    return (
      <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">
        No Market Data
      </p>
    )
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          innerRadius={55}
          outerRadius={80}
          dataKey="value"
          label={({ name, value }) => `${name}: ${value}`}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_LIGHT} />
      </PieChart>
    </ResponsiveContainer>
  )
}

/**
 * Orders trend area chart — light ink fill. Used in the overview tab's
 * 14-day trend card.
 */
export function OrdersTrendAreaChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data || []}>
        <defs>
          <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#1e3a5f" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#1e3a5f" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="rgba(0,0,0,0.05)"
        />
        <Tooltip
          contentStyle={TOOLTIP_LIGHT}
          formatter={(val) => [val, 'Orders']}
          labelFormatter={(label) => new Date(label).toLocaleDateString()}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#1e3a5f"
          strokeWidth={3}
          fillOpacity={1}
          fill="url(#colorOrders)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
