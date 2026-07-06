/**
 * Lazy-loaded Recharts compositions for the influencer dashboard.
 *
 * Kept in its own module (like components/admin/AdminCharts.jsx) so Vite
 * splits recharts into a separate chunk and the dashboard only pays for it
 * when it actually renders a chart.
 */
import React from 'react'
import {
  ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

const COLORS = {
  opens: '#f97316',   // ember
  signups: '#38bdf8', // sky
  orders: '#34d399',  // emerald
}
const DEVICE_COLORS = ['#f97316', '#38bdf8', '#a78bfa', '#94a3b8']

const tooltipStyle = {
  backgroundColor: '#0f172a',
  borderRadius: '0.9rem',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff',
  fontSize: 12,
}

const fmtDay = (d) => {
  try {
    const dt = new Date(`${d}T00:00:00Z`)
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch { return d }
}

export function TrendAreaChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          {Object.entries(COLORS).map(([k, c]) => (
            <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={0.5} />
              <stop offset="100%" stopColor={c} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={34} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtDay} />
        <Area type="monotone" dataKey="opens" name="Opens" stroke={COLORS.opens} strokeWidth={2} fill="url(#grad-opens)" />
        <Area type="monotone" dataKey="signups" name="Signups" stroke={COLORS.signups} strokeWidth={2} fill="url(#grad-signups)" />
        <Area type="monotone" dataKey="orders" name="Orders" stroke={COLORS.orders} strokeWidth={2} fill="url(#grad-orders)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function DeviceDonut({ data }) {
  const rows = (data || []).filter((d) => d.count > 0)
  if (rows.length === 0) return <div className="flex items-center justify-center h-full text-xs text-dim">No device data yet</div>
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={rows} dataKey="count" nameKey="device_type" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="none">
          {rows.map((_, i) => <Cell key={i} fill={DEVICE_COLORS[i % DEVICE_COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize' }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
