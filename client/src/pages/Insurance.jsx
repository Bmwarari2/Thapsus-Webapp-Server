import React, { useEffect, useState } from 'react'
import { Shield, ShieldCheck, ShieldAlert, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { insuranceApi, ordersApi } from '../api'
import { GlassStyles, GlassCard, LiquidBlob, PageHeading, StatusBadge } from '../components/GlassUI'

/**
 * /app/insurance — declared-value cover (Spec §4.9).
 *
 * Customer can browse the three tiers, see their existing policies, and
 * file a claim against any active policy.
 */
export const Insurance = () => {
  const { user } = useAuth()
  const [policies, setPolicies] = useState([])
  const [orders, setOrders] = useState([])
  const [tier, setTier] = useState('plus')
  const [parcelId, setParcelId] = useState('')
  const [value, setValue] = useState(100)
  const [quote, setQuote] = useState(null)

  const load = () => Promise.all([
    insuranceApi.list().then(r => setPolicies(r.data?.policies || [])),
    ordersApi.list().then(r => setOrders(r.data?.orders || [])),
  ])

  useEffect(() => { load() }, [])

  useEffect(() => {
    insuranceApi.quote(tier, value).then(r => setQuote(r.data?.quote)).catch(() => {})
  }, [tier, value])

  const onBuy = async () => {
    if (!parcelId) { toast.error('Pick a parcel'); return }
    try {
      await insuranceApi.buy(parcelId, tier, +value)
      toast.success('Policy issued')
      load()
    } catch { toast.error('Failed to issue policy') }
  }

  const onClaim = async (id) => {
    const amt = prompt('Claim amount (GBP)?')
    if (!amt) return
    try {
      await insuranceApi.claim(id, +amt, 'Customer-initiated claim')
      toast.success('Claim filed')
      load()
    } catch { toast.error('Failed to file claim') }
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50">
      <GlassStyles />
      <LiquidBlob className="top-[-15%] right-[-15%] w-[40rem] h-[40rem]" color="bg-orange-200" />
      <LiquidBlob className="bottom-[-15%] left-[-15%] w-[40rem] h-[40rem]" color="bg-blue-200"  />

      <div className="relative z-10 max-w-5xl mx-auto px-4 md:px-8 py-10">
        <PageHeading icon={Shield}
          title="Declared-value insurance"
          subtitle="Cover for theft, loss, and damage in transit." />

        {/* Tier picker */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Tier
            name="Standard" tag="Included"
            limit="≤ £100" rate="Free"
            picked={tier === 'standard'} onPick={() => setTier('standard')}
            icon={<Shield size={28} />} />
          <Tier
            name="Plus" tag="Most popular"
            limit="≤ £500" rate="£8 flat"
            picked={tier === 'plus'} onPick={() => setTier('plus')}
            icon={<ShieldCheck size={28} />} accent />
          <Tier
            name="Premier" tag="High-value"
            limit="≤ £2 000" rate="3.5% of declared value"
            picked={tier === 'premier'} onPick={() => setTier('premier')}
            icon={<ShieldAlert size={28} />} />
        </div>

        {/* Quote + buy */}
        <GlassCard className="p-6 mb-8">
          <h3 className="text-lg font-black text-[#1e3a5f] mb-4">Get a quote</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <label className="block">
              <span className="block text-[10px] uppercase tracking-widest text-slate-500 font-black mb-1">
                Parcel
              </span>
              <select value={parcelId} onChange={e => setParcelId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white/80">
                <option value="">— pick a parcel —</option>
                {orders.filter(o => ['pending','received_at_warehouse','consolidating'].includes(o.status)).map(o => (
                  <option key={o.id} value={o.id}>{o.tracking_number} — {o.retailer}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-widest text-slate-500 font-black mb-1">
                Declared value (£)
              </span>
              <input type="number" min="0" value={value}
                onChange={e => setValue(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white/80" />
            </label>
            <div className="flex flex-col justify-end">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black mb-1">Premium</p>
              <p className="text-3xl font-black text-[#1e3a5f]">£{quote?.premium_gbp ?? 0}</p>
              {quote?.requires_manual_review && (
                <p className="text-xs text-orange-700 mt-1">Custom quote — we'll confirm by email.</p>
              )}
            </div>
          </div>
          <button onClick={onBuy}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold">
            Buy cover <ArrowRight size={16}/>
          </button>
        </GlassCard>

        {/* My policies */}
        <h3 className="text-lg font-black text-[#1e3a5f] mb-3">Your policies</h3>
        {policies.length === 0 ? (
          <GlassCard className="p-8 text-center text-slate-500">No policies yet.</GlassCard>
        ) : (
          <div className="space-y-3">
            {policies.map(p => (
              <GlassCard key={p.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-slate-500">{p.id}</p>
                  <p className="font-semibold text-slate-800">{p.tracking_number}</p>
                  <p className="text-xs text-slate-500">
                    Tier <span className="font-bold uppercase">{p.tier}</span> · cover £{p.declared_value_gbp} · premium £{p.premium_gbp}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={p.status}/>
                  {p.status === 'active' && (
                    <button onClick={() => onClaim(p.id)}
                      className="text-xs px-3 py-2 rounded bg-red-100 text-red-700 font-bold">
                      File claim
                    </button>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const Tier = ({ name, tag, limit, rate, icon, picked, onPick, accent }) => (
  <button onClick={onPick}
    className={`text-left p-5 rounded-[2rem] border-2 transition-all
      ${picked
        ? accent ? 'border-orange-500 bg-orange-50' : 'border-[#1e3a5f] bg-white'
        : 'border-slate-200 bg-white/60 hover:border-slate-300'}`}>
    <div className="flex items-center gap-2 text-[#1e3a5f]">{icon}
      <p className="text-2xl font-black tracking-tighter">{name}</p>
    </div>
    <p className="text-[10px] uppercase tracking-widest text-orange-700 font-black mt-1">{tag}</p>
    <p className="mt-3 text-sm text-slate-600"><span className="font-bold">Cover:</span> {limit}</p>
    <p className="text-sm text-slate-600"><span className="font-bold">Premium:</span> {rate}</p>
  </button>
)
