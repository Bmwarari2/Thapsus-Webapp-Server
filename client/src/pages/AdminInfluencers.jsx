// AdminInfluencers.jsx
// Admin console for the influencer referral programme (migration 0002).
// Mint codes for marketing influencers (who have no account), share the
// generated links, and track the funnel — link opens → signups → orders —
// so you know what to pay each influencer, and mark payouts as settled.

import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Megaphone, Plus, Copy, Check, MousePointerClick,
  UserPlus, ShoppingBag, Power, ChevronRight, BadgeDollarSign,
} from 'lucide-react'
import { influencerApi } from '../api'
import { GlassStyles, GlassCard, PageHeading } from '../components/GlassUI'

const linkFor = (code) => `${window.location.origin}/i/${code}`

export const AdminInfluencers = () => {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState(null) // code string
  const [copied, setCopied] = useState(null)

  const [form, setForm] = useState({ influencer_name: '', influencer_contact: '', reward_per_order: '', code: '', notes: '' })

  const load = () => {
    setLoading(true)
    influencerApi.list()
      .then((r) => setList(r.data?.influencers || []))
      .catch(() => toast.error('Failed to load influencers'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const totals = useMemo(() => list.reduce((acc, c) => ({
    clicks: acc.clicks + (c.clicks || 0),
    signups: acc.signups + (c.signups || 0),
    conversions: acc.conversions + (c.conversions || 0),
    unpaid: acc.unpaid + (c.unpaid_conversions || 0),
  }), { clicks: 0, signups: 0, conversions: 0, unpaid: 0 }), [list])

  const copy = async (code) => {
    try {
      await navigator.clipboard.writeText(linkFor(code))
      setCopied(code)
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500)
    } catch {
      toast.error('Copy failed — link: ' + linkFor(code))
    }
  }

  const create = async (e) => {
    e.preventDefault()
    if (!form.influencer_name.trim()) return toast.error('Influencer name is required')
    setCreating(true)
    try {
      await influencerApi.create({
        influencer_name: form.influencer_name.trim(),
        influencer_contact: form.influencer_contact.trim() || null,
        reward_per_order: form.reward_per_order === '' ? null : Number(form.reward_per_order),
        code: form.code.trim() || undefined,
        notes: form.notes.trim() || null,
      })
      toast.success('Code created')
      setForm({ influencer_name: '', influencer_contact: '', reward_per_order: '', code: '', notes: '' })
      load()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create code')
    } finally {
      setCreating(false)
    }
  }

  const toggleActive = async (c) => {
    try {
      await influencerApi.update(c.code, { is_active: !c.is_active })
      setList((prev) => prev.map((x) => (x.code === c.code ? { ...x, is_active: !x.is_active } : x)))
    } catch {
      toast.error('Failed to update')
    }
  }

  return (
    <div className="relative min-h-screen bg-white/[0.03]">
      <GlassStyles />
      <div className="relative z-10 max-w-5xl mx-auto px-4 md:px-8 py-10">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-mute hover:text-white mb-4">
          <ArrowLeft size={16} /> Back to admin
        </Link>
        <PageHeading icon={Megaphone}
          title="Influencer referrals"
          subtitle="Give a link to an influencer, track who opened it, signed up, and ordered — then pay them." />

        {/* Totals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-6">
          <Kpi icon={MousePointerClick} label="Link opens" value={totals.clicks} />
          <Kpi icon={UserPlus} label="Signups" value={totals.signups} />
          <Kpi icon={ShoppingBag} label="Ordered" value={totals.conversions} accent />
          <Kpi icon={BadgeDollarSign} label="Unpaid" value={totals.unpaid} />
        </div>

        {/* Create */}
        <GlassCard className="p-6 mb-8">
          <h3 className="text-sm font-black uppercase tracking-wider text-mute mb-4 flex items-center gap-2">
            <Plus size={16} /> New influencer code
          </h3>
          <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Influencer name *" value={form.influencer_name} onChange={(v) => setForm({ ...form, influencer_name: v })} placeholder="e.g. Aisha K." />
            <Field label="Contact (optional)" value={form.influencer_contact} onChange={(v) => setForm({ ...form, influencer_contact: v })} placeholder="email / phone / @handle" />
            <Field label="Reward per order (optional)" type="number" value={form.reward_per_order} onChange={(v) => setForm({ ...form, reward_per_order: v })} placeholder="e.g. 500" />
            <Field label="Custom code (optional)" value={form.code} onChange={(v) => setForm({ ...form, code: v.toUpperCase() })} placeholder="auto-generated if blank" mono />
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">Notes (private)</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Agreed terms, campaign, platform…"
                className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
            <div className="md:col-span-2">
              <button type="submit" disabled={creating}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-ember-gradient disabled:opacity-50 text-white font-bold text-sm">
                <Plus size={16} /> {creating ? 'Creating…' : 'Create code'}
              </button>
            </div>
          </form>
        </GlassCard>

        {/* List */}
        {loading ? (
          <p className="text-mute text-sm">Loading…</p>
        ) : list.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <Megaphone className="mx-auto text-dim mb-3" size={32} />
            <p className="text-mute text-sm">No influencer codes yet. Create one above to get a shareable link.</p>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {list.map((c) => (
              <GlassCard key={c.code} className={`p-4 md:p-5 ${!c.is_active ? 'opacity-60' : ''}`}>
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white">{c.influencer_name}</span>
                      <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-ember-500/15 text-ember-300 border border-ember-500/25">{c.code}</span>
                      {!c.is_active && <span className="text-[10px] uppercase tracking-wider text-red-400 font-bold">Disabled</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-dim">
                      <span className="truncate">{linkFor(c.code)}</span>
                    </div>
                    {c.influencer_contact && <p className="text-xs text-mute mt-1">{c.influencer_contact}</p>}
                  </div>

                  <div className="flex items-center gap-4 text-center shrink-0">
                    <Metric label="Opens" value={c.clicks} />
                    <Metric label="Signups" value={c.signups} />
                    <Metric label="Ordered" value={c.conversions} accent />
                    {c.unpaid_conversions > 0 && <Metric label="Unpaid" value={c.unpaid_conversions} warn />}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => copy(c.code)} title="Copy link"
                      className="p-2 rounded-lg border border-line bg-surface-2 hover:bg-ember-500/10 text-mute hover:text-white">
                      {copied === c.code ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                    </button>
                    <button onClick={() => toggleActive(c)} title={c.is_active ? 'Disable' : 'Enable'}
                      className="p-2 rounded-lg border border-line bg-surface-2 hover:bg-ember-500/10 text-mute hover:text-white">
                      <Power size={16} className={c.is_active ? 'text-emerald-400' : 'text-dim'} />
                    </button>
                    <button onClick={() => setSelected(selected === c.code ? null : c.code)} title="Details"
                      className="p-2 rounded-lg border border-line bg-surface-2 hover:bg-ember-500/10 text-mute hover:text-white">
                      <ChevronRight size={16} className={`transition-transform ${selected === c.code ? 'rotate-90' : ''}`} />
                    </button>
                  </div>
                </div>

                {selected === c.code && <Detail code={c.code} onChanged={load} />}
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Detail({ code, onChanged }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    influencerApi.get(code)
      .then((r) => setData(r.data))
      .catch(() => toast.error('Failed to load detail'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [code])

  const markPaid = async (conv, paid) => {
    try {
      await influencerApi.markPaid(conv.id, paid)
      toast.success(paid ? 'Marked paid' : 'Marked unpaid')
      load(); onChanged && onChanged()
    } catch {
      toast.error('Failed to update payout')
    }
  }

  if (loading) return <p className="text-xs text-dim mt-4 pt-4 border-t border-line">Loading detail…</p>

  const conversions = data?.conversions || []
  const signups = data?.signups || []

  return (
    <div className="mt-4 pt-4 border-t border-line space-y-5">
      <div>
        <h4 className="text-xs font-black uppercase tracking-wider text-mute mb-2">Conversions ({conversions.length})</h4>
        {conversions.length === 0 ? (
          <p className="text-xs text-dim">No orders from this code’s signups yet.</p>
        ) : (
          <div className="space-y-2">
            {conversions.map((cv) => (
              <div key={cv.id} className="flex items-center justify-between gap-3 text-sm bg-surface-2 rounded-lg px-3 py-2 border border-line">
                <div className="min-w-0">
                  <p className="text-white truncate">{cv.user_name || cv.user_email || cv.user_id}</p>
                  <p className="text-[11px] text-dim">
                    {cv.order_kind === 'buy_for_me' ? 'Buy-for-me' : 'Order'} · {cv.order_ref || '—'} · {new Date(cv.converted_at).toLocaleDateString()}
                  </p>
                </div>
                {cv.payout_status === 'paid' ? (
                  <button onClick={() => markPaid(cv, false)}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                    Paid ✓
                  </button>
                ) : (
                  <button onClick={() => markPaid(cv, true)}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-ember-500/15 text-ember-300 border border-ember-500/25 hover:bg-ember-500/25">
                    Mark paid
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-xs font-black uppercase tracking-wider text-mute mb-2">Signups ({signups.length})</h4>
        {signups.length === 0 ? (
          <p className="text-xs text-dim">Nobody has signed up through this link yet.</p>
        ) : (
          <div className="space-y-1.5">
            {signups.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 text-sm px-1">
                <div className="min-w-0">
                  <span className="text-white">{s.name || s.email}</span>
                  <span className="text-[11px] text-dim ml-2">{new Date(s.joined_at).toLocaleDateString()}</span>
                </div>
                <span className={`text-[11px] font-bold ${s.has_ordered ? 'text-emerald-300' : 'text-dim'}`}>
                  {s.has_ordered ? `${s.orders_count + s.bfm_count} order(s)` : 'no order yet'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, accent }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? 'border-ember-500/25 bg-ember-500/10' : 'border-line bg-surface-2'}`}>
      <Icon size={18} className={accent ? 'text-ember-400' : 'text-mute'} />
      <p className="text-2xl font-black text-white mt-2">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-dim">{label}</p>
    </div>
  )
}

function Metric({ label, value, accent, warn }) {
  return (
    <div className="min-w-[52px]">
      <p className={`text-lg font-black ${warn ? 'text-amber-400' : accent ? 'text-ember-400' : 'text-white'}`}>{value}</p>
      <p className="text-[9px] font-bold uppercase tracking-wider text-dim">{label}</p>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, mono }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-300 ${mono ? 'font-mono tracking-widest' : ''}`} />
    </div>
  )
}

export default AdminInfluencers
