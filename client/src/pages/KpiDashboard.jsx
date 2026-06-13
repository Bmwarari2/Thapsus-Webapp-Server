import React, { useEffect, useState } from 'react'
import { Activity, TrendingUp, TrendingDown, Clock, MessageCircle, Smile, Wallet, Shield } from 'lucide-react'
import toast from 'react-hot-toast'
import { kpiApi } from '../api'
import { GlassStyles, GlassCard, LiquidBlob, PageHeading } from '../components/GlassUI'

/**
 * /kpi — Founder KPI dashboard (Spec §4.12).
 *
 * Live snapshot of weekly kg shipped, on-time %, complaints/100, NPS,
 * days-cash-on-hand and the insurance pool.
 */
export const KpiDashboard = () => {
  const [kpi, setKpi] = useState(null)
  const [marketing, setMarketing] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([kpiApi.summary(), kpiApi.marketing()])
      .then(([k, m]) => { setKpi(k.data?.kpi); setMarketing(m.data) })
      .catch(() => toast.error('Failed to load KPI dashboard'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="relative min-h-screen bg-white/[0.03]">
      <GlassStyles />
      <LiquidBlob className="top-[-15%] right-[-15%] w-[40rem] h-[40rem]" color="bg-orange-200" />
      <LiquidBlob className="bottom-[-15%] left-[-15%] w-[40rem] h-[40rem]" color="bg-blue-200"  />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 py-10">
        <PageHeading icon={Activity} title="Founder KPI Dashboard"
          subtitle="Live snapshot — Framework v2 §14 numbers." />

        {loading ? (
          <p className="py-10 text-center text-mute">Loading…</p>
        ) : !kpi ? (
          <p className="py-10 text-center text-mute">No data yet — once parcels start moving, numbers populate here.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <KpiTile
                icon={<TrendingUp size={20}/>}
                label="Chargeable kg this week"
                value={kpi.kg_this_week}
                trend={kpi.kg_trend_pct}
                accent="text-ember-400"
              />
              <KpiTile
                icon={<Clock size={20}/>}
                label="On-time delivery %"
                value={kpi.on_time_pct == null ? '—' : `${kpi.on_time_pct}%`}
                accent="text-blue-500"
              />
              <KpiTile
                icon={<MessageCircle size={20}/>}
                label="Complaints / 100 parcels"
                value={kpi.complaints_per_100}
                accent="text-red-500"
              />
              <KpiTile
                icon={<Smile size={20}/>}
                label="NPS (avg score, 90d)"
                value={kpi.nps_avg == null ? '—' : kpi.nps_avg}
                sub={`${kpi.nps_responses || 0} responses`}
                accent="text-emerald-500"
              />
              <KpiTile
                icon={<Wallet size={20}/>}
                label="Wallet balance (KES)"
                value={kpi.wallet_kes?.toLocaleString?.() || 0}
                accent="text-purple-500"
              />
              <KpiTile
                icon={<TrendingUp size={20}/>}
                label="Pending inbound (KES)"
                value={kpi.pending_inbound?.toLocaleString?.() || 0}
                accent="text-blue-300"
              />
              <KpiTile
                icon={<Shield size={20}/>}
                label="Insurance pool (30d)"
                value={`£${kpi.insurance_premiums_gbp || 0}`}
                sub={`Claims paid: £${kpi.insurance_claims_gbp || 0}`}
                accent="text-amber-600"
              />
              <KpiTile
                icon={<Activity size={20}/>}
                label="Parcels this week"
                value={kpi.parcels_this_week || 0}
                accent="text-indigo-500"
              />
            </div>

            {marketing && (
              <GlassCard className="p-6 mb-8">
                <h3 className="text-lg font-black text-white mb-3">UTM signups (last 90 days)</h3>
                {marketing.utm?.length === 0 ? (
                  <p className="text-mute text-sm">No UTM-tagged signups yet.</p>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="text-[10px] uppercase text-mute">
                      <tr>
                        <th className="text-left py-2">Source</th>
                        <th className="text-left py-2">Medium</th>
                        <th className="text-left py-2">Campaign</th>
                        <th className="text-right py-2">Signups</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketing.utm?.map((row, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="py-2 font-bold">{row.source}</td>
                          <td className="py-2 text-mute">{row.medium}</td>
                          <td className="py-2 text-mute">{row.campaign}</td>
                          <td className="py-2 text-right font-mono">{row.signups}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {marketing.retention_90d && (
                  <p className="mt-4 text-sm text-mute">
                    <span className="font-bold">90-day repeat rate:</span>{' '}
                    {marketing.retention_90d.pct == null ? '—' : `${marketing.retention_90d.pct}%`}{' '}
                    ({marketing.retention_90d.repeat_in_90d}/{marketing.retention_90d.cohort_size})
                  </p>
                )}
              </GlassCard>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const KpiTile = ({ icon, label, value, trend, sub, accent = 'text-white/80' }) => (
  <GlassCard className="p-5">
    <div className={`flex items-center gap-2 ${accent}`}>{icon}
      <span className="text-[10px] uppercase tracking-widest font-black">{label}</span>
    </div>
    <div className="mt-3 text-3xl font-black tracking-tighter text-white">{value}</div>
    {sub && <div className="text-xs text-mute mt-1">{sub}</div>}
    {trend !== undefined && trend !== null && (
      <div className={`mt-2 inline-flex items-center text-xs font-bold ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
        {trend >= 0 ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}
        <span className="ml-1">{Math.abs(trend)}% vs last week</span>
      </div>
    )}
  </GlassCard>
)
