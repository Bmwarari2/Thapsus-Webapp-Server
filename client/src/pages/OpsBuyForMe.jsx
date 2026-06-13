import React, { useEffect, useState } from 'react'
import { ShoppingBag, Send, RefreshCw, Ban } from 'lucide-react'
import toast from 'react-hot-toast'
import { buyForMeApi } from '../api'
import { GlassStyles, GlassCard, LiquidBlob, PageHeading, StatusBadge } from '../components/GlassUI'
import { RetailerLink } from '../components/RetailerLink'

/**
 * /ops/buy-for-me — operator concierge queue.
 *
 * Lists pending_quote / quoted / paid / rejected requests joined to the
 * customer's email + name. Operator opens a request, fills the quote form,
 * and the server (a) flips status pending_quote → quoted and (b) emails the
 * customer the "quote ready" deep-link to the Orders tab.
 */
export const OpsBuyForMe = () => {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // order being quoted
  const [draft, setDraft]     = useState({ estimate_gbp: '', markup_pct: 10, notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [rejecting, setRejecting] = useState(null) // order being declined
  const [rejectReason, setRejectReason] = useState('')
  const [rejectBusy, setRejectBusy] = useState(false)

  const refresh = () => {
    setLoading(true)
    buyForMeApi.queue()
      .then(r => setOrders(r.data?.orders || []))
      .catch(() => toast.error('Failed to load queue'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { refresh() }, [])

  const openQuote = (o) => {
    setEditing(o)
    setDraft({
      estimate_gbp: o.estimate_gbp || '',
      markup_pct:   o.markup_pct ?? 10,
      notes:        o.notes || '',
    })
  }

  const onSubmitQuote = async () => {
    if (submitting) return
    const num = Number(draft.estimate_gbp)
    if (!Number.isFinite(num) || num <= 0) {
      toast.error('Enter a valid GBP estimate'); return
    }
    try {
      setSubmitting(true)
      await buyForMeApi.quote(editing.id, {
        estimate_gbp: num,
        markup_pct:   Number(draft.markup_pct) || 10,
        notes:        draft.notes || null,
      })
      toast.success('Quote sent · customer emailed')
      setEditing(null)
      refresh()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to send quote')
    } finally {
      setSubmitting(false)
    }
  }

  const openReject = (o) => { setRejecting(o); setRejectReason('') }

  const onSubmitReject = async () => {
    if (rejectBusy) return
    const reason = rejectReason.trim()
    if (reason.length < 3) { toast.error('Give a brief reason'); return }
    try {
      setRejectBusy(true)
      await buyForMeApi.adminReject(rejecting.id, reason)
      toast.success('Request declined · customer notified')
      setRejecting(null)
      refresh()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to decline')
    } finally {
      setRejectBusy(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-white/[0.03]">
      <GlassStyles />
      <LiquidBlob className="top-[-15%] right-[-15%] w-[40rem] h-[40rem]" color="bg-orange-200" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 md:px-8 py-10">
        <div className="flex items-center justify-between mb-8">
          <PageHeading icon={ShoppingBag}
            title="Buy-for-me queue"
            subtitle="Quote concierge requests · accepts pay from wallet" />
          <button onClick={refresh}
            className="inline-flex items-center gap-2 bg-surface border border-line text-white/80 hover:bg-white/[0.03] font-semibold px-4 py-2 rounded-xl text-sm">
            <RefreshCw size={14}/> Refresh
          </button>
        </div>

        {loading ? (
          <GlassCard className="p-8 text-center text-mute">Loading…</GlassCard>
        ) : orders.length === 0 ? (
          <GlassCard className="p-10 text-center text-mute">
            No pending requests.
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {orders.map(o => (
              <GlassCard key={o.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-mute">{o.id}</span>
                      <StatusBadge status={o.status}/>
                    </div>
                    <p className="font-bold text-white mt-1">{o.item_name}</p>
                    {o.retailer_url && <RetailerLink url={o.retailer_url} />}
                    <div className="text-xs text-mute mt-1">
                      {o.size && <>Size: {o.size} · </>}
                      Qty: {o.qty}
                    </div>
                    <p className="text-xs text-mute mt-1">
                      <strong>{o.name || o.email}</strong>
                      {o.email && o.name ? ` · ${o.email}` : null}
                    </p>
                    {o.notes && (
                      <p className="text-xs text-mute mt-1 italic">"{o.notes}"</p>
                    )}
                    {o.status === 'rejected' && o.customer_decision_reason && (
                      <p className="text-xs text-rose-400 italic mt-1">
                        Customer rejected: "{o.customer_decision_reason}"
                      </p>
                    )}
                    {o.status === 'rejected' && o.admin_decision_reason && (
                      <p className="text-xs text-rose-400 italic mt-1">
                        Declined by staff: "{o.admin_decision_reason}"
                      </p>
                    )}
                    {o.status === 'paid' && o.parcel_tracking_number && (
                      <p className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 ring-1 ring-emerald-200 text-emerald-800 text-xs font-semibold">
                        <span>📦</span> Pre-registered as <span className="font-mono font-bold">{o.parcel_tracking_number}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {o.estimate_gbp != null && (
                      <p className="text-sm font-bold text-white">
                        £{Number(o.estimate_gbp).toFixed(2)} · {Number(o.markup_pct || 0)}%
                      </p>
                    )}
                    <button onClick={() => openQuote(o)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ember-gradient hover:bg-[#142640] text-white text-sm font-bold">
                      <Send size={14}/> {o.status === 'rejected' ? 'Re-quote' : (o.status === 'quoted' ? 'Edit quote' : 'Send quote')}
                    </button>
                    {(o.status === 'pending_quote' || o.status === 'quoted') && (
                      <button onClick={() => openReject(o)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 text-sm font-bold">
                        <Ban size={14}/> Decline
                      </button>
                    )}
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
          <GlassCard className="p-6 w-full max-w-lg">
            <h4 className="text-lg font-black text-white mb-1">Send quote</h4>
            <p className="text-xs text-mute mb-4">
              {editing.item_name} · {editing.email}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Estimate (GBP)" type="number" value={draft.estimate_gbp}
                onChange={(v) => setDraft({ ...draft, estimate_gbp: v })}
                placeholder="0.00" />
              <Field label="Service markup (%)" type="number" value={draft.markup_pct}
                onChange={(v) => setDraft({ ...draft, markup_pct: v })} />
              <div className="col-span-2">
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-widest text-mute font-black mb-1">Notes for customer</span>
                  <textarea rows={3} value={draft.notes}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    placeholder="e.g. We can buy from a cheaper UK retailer if you'd prefer."
                    className="w-full px-3 py-2 rounded-xl border border-line bg-surface-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </label>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-lg bg-surface border border-line text-white/80 text-sm font-semibold">
                Cancel
              </button>
              <button onClick={onSubmitQuote} disabled={submitting}
                className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                <Send size={14}/> {submitting ? 'Sending…' : 'Send & email'}
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
          <GlassCard className="p-6 w-full max-w-md">
            <h4 className="text-lg font-black text-white mb-1">Decline request</h4>
            <p className="text-xs text-mute mb-4">
              {rejecting.item_name} · {rejecting.email}
            </p>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-widest text-mute font-black mb-1">Reason (shown to customer)</span>
              <textarea rows={4} value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. This item is on our prohibited list and can't be shipped."
                className="w-full px-3 py-2 rounded-xl border border-line bg-surface-2 focus:outline-none focus:ring-2 focus:ring-rose-400" />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setRejecting(null)}
                className="px-4 py-2 rounded-lg bg-surface border border-line text-white/80 text-sm font-semibold">
                Cancel
              </button>
              <button onClick={onSubmitReject} disabled={rejectBusy}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                <Ban size={14}/> {rejectBusy ? 'Declining…' : 'Decline & notify'}
              </button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  )
}

const Field = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <label className="block">
    <span className="block text-[10px] uppercase tracking-widest text-mute font-black mb-1">{label}</span>
    <input value={value} type={type} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-xl border border-line bg-surface-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
  </label>
)
