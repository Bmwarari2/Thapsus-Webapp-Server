/**
 * Lazy-loaded Recharts compositions for the Finance dashboard.
 *
 * Mirrors components/admin/AdminCharts.jsx: this file is the only place the
 * Finance page imports `recharts` from, so Vite splits it into its own chunk
 * and AdminFinance.jsx pulls each component via React.lazy + Suspense — the
 * ~225 KB recharts vendor bundle only downloads when a chart-bearing finance
 * tab is opened.
 *
 * All values arrive in MAJOR units already (the page divides minor→major before
 * handing data in), so tooltips just format with the currency label.
 */

import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid, Legend, PieChart, Pie, Cell,
} from 'recharts'

const TOOLTIP_LIGHT = {
  borderRadius: '1rem',
  border: '1px solid rgba(0,0,0,0.05)',
  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
}

const fmt = (cur) => (v) => `${cur} ${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

/** Income vs expense vs net, per month. data: [{month, income, expense, net}] */
export function CashflowBarChart({ data, currency = 'GBP' }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data || []} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={48} />
        <Tooltip contentStyle={TOOLTIP_LIGHT} formatter={(v, n) => [fmt(currency)(v), n]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="Money in" fill="#22c55e" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expense" name="Money out" fill="#ef4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Net profit trend area. data: [{month, net}] */
export function ProfitAreaChart({ data, currency = 'GBP' }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data || []} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f97316" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={48} />
        <Tooltip contentStyle={TOOLTIP_LIGHT} formatter={(v) => [fmt(currency)(v), 'Net']} />
        <Area type="monotone" dataKey="net" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorNet)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Expense breakdown by category. data: [{name, value}], colors[] */
export function ExpensePieChart({ data, colors }) {
  if (!data || data.length === 0) {
    return <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">No expense data</p>
  }
  const palette = colors || ['#ef4444', '#f97316', '#eab308', '#8b5cf6', '#3b82f6', '#14b8a6', '#ec4899', '#64748b']
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} innerRadius={55} outerRadius={80} dataKey="value" label={({ name }) => name}>
          {data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_LIGHT} />
      </PieChart>
    </ResponsiveContainer>
  )
}
