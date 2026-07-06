import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  MousePointerClick, UserPlus, ShoppingBag, Wallet, TrendingUp, Copy, Check,
  MapPin, Smartphone, Activity, LogOut, Sparkles, Link2, EyeOff,
} from 'lucide-react'
import { influencerPortalApi } from '../api'
import { useAuth } from '../context/AuthContext'
import { GlassStyles, GlassCard } from '../components/GlassUI'

const TrendAreaChart = lazy(() => import('../components/InfluencerCharts').then(m => ({ default: m.TrendAreaChart })))
const DeviceDonut = lazy(() => import('../components/InfluencerCharts').then(m => ({ default: m.DeviceDonut })))

const linkFor = (code) => `${window.location.origin}/i/${code}`
const nf = (n) => (n ?? 0).toLocaleString()
const kes = (n) => `KES ${Number(n || 0).toLocaleString()}`

// country_code (ISO-3166 alpha-2) → flag emoji
const flag = (cc) => {
  if (!cc || cc.length !== 2) return '🌍'
  try {
    return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65))
  } catch { return '🌍' }
}

const RANGES = [{ label: '7d', days: 7 }, { label: '30d', days: 30 }, { label: '90d', days: 90 }]

export const InfluencerDashboard = () => {
  const { user, logout } = useAuth()
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    influencerPortalApi.dashboard(days)
      .then((r) => { if (alive) setData(r.data) })
      .catch(() => toast.error('Could not load your dashboard'))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [days])

  const copy = async (code) => {
    try {
      await navigator.clipboard.writeText(linkFor(code))
      setCopied(code); setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500)
    } catch { toast.error(linkFor(code)) }
  }

  const t = data?.totals
  const maxLoc = useMemo(() => Math.max(1, ...(data?.locations || []).map(l => l.count)), [data])
  const firstName = (data?.profile?.name || user?.name || '').split(' ')[0]

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const hasLinks = (data?.links || []).length > 0

  return (
    <div className="relative min-h-screen bg-white/[0.03]">
      <GlassStyles />
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[44rem] h-[44rem] bg-ember-radial blur-2xl pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-8 py-10 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-ember-500/10 border border-ember-500/25 text-[10px] font-black uppercase tracking-[0.25em] text-ember-300 mb-3">
              <Sparkles size={12} /> Partner dashboard
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
              {firstName ? `Hey ${firstName} 👋` : 'Your performance'}
            </h1>
            <p className="text-mute text-sm mt-1">Here's how your referral links are doing.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-surface-2 p-1 rounded-2xl border border-line">
              {RANGES.map((r) => (
                <button key={r.days} onClick={() => setDays(r.days)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${days === r.days ? 'bg-ember-gradient text-white shadow' : 'text-mute hover:text-white'}`}>
                  {r.label}
                </button>
              ))}
            </div>
            <button onClick={logout} title="Sign out"
              className="p-2.5 rounded-2xl border border-line bg-surface-2 text-mute hover:text-white hover:bg-ember-500/10">
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {!hasLinks ? (
          <GlassCard className="p-10 text-center">
            <Link2 className="mx-auto text-dim mb-3" size={34} />
            <h3 className="text-white font-bold text-lg">No links assigned yet</h3>
            <p className="text-mute text-sm mt-1 max-w-md mx-auto">
              Your account is set up, but no referral link has been linked to it yet. Reach out to the Thapsus Cargo team and they'll assign your code.
            </p>
          </GlassCard>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <Kpi icon={MousePointerClick} label="Link opens" value={nf(t.opens)} sub={`${nf(t.unique_visitors)} unique`} accent="ember" />
              <Kpi icon={UserPlus} label="Signups" value={nf(t.signups)} sub={`${t.signup_rate}% of opens`} accent="sky" />
              <Kpi icon={ShoppingBag} label="Orders" value={nf(t.orders)} sub={`${t.order_rate}% of signups`} accent="emerald" />
              <Kpi icon={Wallet} label="Earnings" value={kes(t.earnings)} sub={t.unpaid_earnings > 0 ? `${kes(t.unpaid_earnings)} unpaid` : 'all settled'} accent="amber" />
            </div>

            {/* Funnel strip */}
            <GlassCard className="p-5 md:p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={16} className="text-ember-400" />
                <h3 className="text-sm font-black uppercase tracking-wider text-mute">Your funnel</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <FunnelStep label="Opened the link" value={nf(t.opens)} tone="ember" />
                <FunnelStep label="Opened, didn't sign up" value={nf(t.opened_not_signed_up)} tone="slate" icon={EyeOff} />
                <FunnelStep label="Created an account" value={nf(t.signups)} tone="sky" />
                <FunnelStep label="Placed an order" value={nf(t.orders)} tone="emerald" />
              </div>
            </GlassCard>

            {/* Trend chart */}
            <GlassCard className="p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black uppercase tracking-wider text-mute flex items-center gap-2">
                  <Activity size={16} className="text-ember-400" /> Activity over time
                </h3>
                <div className="flex items-center gap-3 text-[11px] font-semibold">
                  <Legend color="#f97316" label="Opens" />
                  <Legend color="#38bdf8" label="Signups" />
                  <Legend color="#34d399" label="Orders" />
                </div>
              </div>
              <div className="h-64">
                <Suspense fallback={<ChartFallback />}>
                  <TrendAreaChart data={data.timeseries} />
                </Suspense>
              </div>
            </GlassCard>

            {/* Locations + devices */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <GlassCard className="p-5 md:p-6 lg:col-span-2">
                <h3 className="text-sm font-black uppercase tracking-wider text-mute flex items-center gap-2 mb-4">
                  <MapPin size={16} className="text-ember-400" /> Where your clicks come from
                </h3>
                {(data.locations || []).length === 0 ? (
                  <p className="text-xs text-dim">No location data yet — it appears as soon as people open your link.</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.locations.slice(0, 8).map((l, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-lg leading-none w-6 text-center">{flag(l.country_code)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-white truncate">{[l.city, l.country].filter(Boolean).join(', ') || 'Unknown'}</span>
                            <span className="text-mute font-semibold ml-2">{nf(l.count)}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                            <div className="h-full bg-ember-gradient rounded-full" style={{ width: `${(l.count / maxLoc) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>

              <GlassCard className="p-5 md:p-6">
                <h3 className="text-sm font-black uppercase tracking-wider text-mute flex items-center gap-2 mb-3">
                  <Smartphone size={16} className="text-ember-400" /> Devices
                </h3>
                <div className="h-52">
                  <Suspense fallback={<ChartFallback />}>
                    <DeviceDonut data={data.devices} />
                  </Suspense>
                </div>
              </GlassCard>
            </div>

            {/* My links */}
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-mute mb-3 flex items-center gap-2">
                <Link2 size={16} className="text-ember-400" /> Your links
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.links.map((l) => (
                  <GlassCard key={l.code} className={`p-4 ${!l.is_active ? 'opacity-60' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-ember-500/15 text-ember-300 border border-ember-500/25">{l.code}</span>
                      <button onClick={() => copy(l.code)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-mute hover:text-white">
                        {copied === l.code ? <><Check size={14} className="text-emerald-400" /> Copied</> : <><Copy size={14} /> Copy link</>}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-dim truncate">{linkFor(l.code)}</p>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <MiniStat label="Opens" value={nf(l.clicks)} />
                      <MiniStat label="Signups" value={nf(l.signups)} />
                      <MiniStat label="Orders" value={nf(l.conversions)} accent />
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>

            {/* Recent activity */}
            {(data.recent || []).length > 0 && (
              <GlassCard className="p-5 md:p-6">
                <h3 className="text-sm font-black uppercase tracking-wider text-mute mb-3">Recent link opens</h3>
                <div className="space-y-1.5">
                  {data.recent.map((e, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-line last:border-b-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base leading-none">{flag(e.country_code)}</span>
                        <span className="text-white truncate">{[e.city, e.country].filter(Boolean).join(', ') || 'Unknown location'}</span>
                        {e.converted && <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">signed up</span>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-xs text-dim">
                        <span className="capitalize">{e.device || '—'}</span>
                        <span>{new Date(e.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, accent }) {
  const ring = {
    ember: 'border-ember-500/25 bg-ember-500/10 text-ember-400',
    sky: 'border-sky-500/25 bg-sky-500/10 text-sky-400',
    emerald: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
    amber: 'border-amber-500/25 bg-amber-500/10 text-amber-400',
  }[accent] || 'border-line bg-surface-2 text-mute'
  return (
    <div className={`rounded-2xl border p-4 md:p-5 ${ring.split(' ').slice(0, 2).join(' ')} bg-surface-2`}>
      <Icon size={20} className={ring.split(' ').slice(2).join(' ')} />
      <p className="text-2xl md:text-3xl font-black text-white mt-2 leading-none">{value}</p>
      <p className="text-[10px] font-black uppercase tracking-wider text-dim mt-1.5">{label}</p>
      {sub && <p className="text-[11px] text-mute mt-1">{sub}</p>}
    </div>
  )
}

function FunnelStep({ label, value, tone, icon: Icon }) {
  const tones = {
    ember: 'text-ember-400', sky: 'text-sky-400', emerald: 'text-emerald-400', slate: 'text-slate-400',
  }
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-4">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={13} className="text-dim" />}
        <p className="text-[10px] font-bold uppercase tracking-wider text-dim">{label}</p>
      </div>
      <p className={`text-2xl font-black mt-1.5 ${tones[tone] || 'text-white'}`}>{value}</p>
    </div>
  )
}

function MiniStat({ label, value, accent }) {
  return (
    <div>
      <p className={`text-lg font-black ${accent ? 'text-ember-400' : 'text-white'}`}>{value}</p>
      <p className="text-[9px] font-bold uppercase tracking-wider text-dim">{label}</p>
    </div>
  )
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-dim">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} /> {label}
    </span>
  )
}

function ChartFallback() {
  return <div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
}

export default InfluencerDashboard
