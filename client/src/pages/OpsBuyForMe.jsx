import React, { useEffect, useState } from 'react'
import { ShoppingBag, Send, RefreshCw, Ban, Repeat } from 'lucide-react'
import toast from 'react-hot-toast'
import { buyForMeApi } from '../api'
import { GlassStyles, GlassCard, LiquidBlob, PageHeading, StatusBadge } from '../components/GlassUI'
import { RetailerLink } from '../components/RetailerLink'
import { useBuyForMeUpdates, useAdminStats } from '../hooks/useRealtimeUpdates'

/**
 * /ops/buy-for-me — operator concierge queue.
 *
 * Operators quote a request, suggest an alternative when the item is
 * unavailable, or decline with a reason. Each card has one clear action bar so
 * the queue stays scannable. Live-refreshes as requests land or change.
 */
export const OpsBuyForMe = () => {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  // Quote modal
  const [editing, setEditing] = useState(null)
  const [draft, setDraft]     = useState({ estimate_gbp: '', markup_pct: 10, notes: '' })
  const [submitting, setSubmitting] = useState(false)

  // Decline modal
  const [rejecting, setRejecting] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectBusy, setRejectBusy] = useState(false)

  // Alternative modal
  const [alting, setAlting] = useState(null)
  const [altDraft, setAltDraft] = useState({ alternative_url: '', alternative_note: '' })
  const [altBusy, setAltBusy] = useState(false)

  const refresh = (showSpin = true) => {
    if (showSpin) setLoading(true)
    buyForMeApi.queue()
      .then(r => setOrders(r.data?.orders || []))
      .catch(() => toast.error('Failed to load queue'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { refresh() }, [])
  // Live refresh as requests arrive or customers respond to alternatives.
  useBuyForMeUpdates(() => refresh(false))
  useAdminStats((d) => {
    if (d?.action?.startsWith('new_buy_for_me') || d?.action?.startsWith('buy_for_me')) refresh(false)
  })

  // ── Quote ──────────────────────────────────────────────────────────────
  const openQuote = (o) => {
    setEditing(o)
    setDraft({ estimate_gbp: o.estimate_gbp || '', markup_pct: o.markup_pct ?? 10, notes: o.notes || '' })
  }
  const onSubmitQuote = async () => {
    if (submitting) return
    const num = Number(draft.estimate_gbp)
    if (!Number.isFinite(num) || num <= 0) { toast.error('Enter a valid GBP estimate'); return }
    try {
      setSubmitting(true)
      await buyForMeApi.quote(editing.id, {
        estimate_gbp: num, markup_pct: Number(draft.markup_pct) || 10, notes: draft.notes || null,
      })
      toast.success('Quote sent · customer emailed')
      setEditing(null); refresh(false)
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to send quote')
    } finally { setSubmitting(false) }
  }

  // ── Decline ────────────────────────────────────────────────────────────
  const onSubmitReject = async () => {
    if (rejectBusy) return
    const reason = rejectReason.trim()
    if (reason.length < 3) { toast.error('Give a brief reason'); return }
    try {
      setRejectBusy(true)
      await buyForMeApi.adminReject(rejecting.id, reason)
      toast.success('Request declined · customer notified')
      setRejecting(null); refresh(false)
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to decline')
    } finally { setRejectBusy(false) }
  }

  // ── Suggest alternative ──────────────────────────────────────────────────
  const openAlt = (o) => { setAlting(o); setAltDraft({ alternative_url: '', alternative_note: '' }) }
  const onSubmitAlt = async () => {
    if (altBusy) return
    if (!altDraft.alternative_url.trim() && !altDraft.alternative_note.trim()) {
      toast.error('Add an alternative link and/or a note'); return
    }
    try {
      setAltBusy(true)
      await buyForMeApi.suggestAlternative(alting.id, {
        alternative_url: altDraft.alternative_url.trim(),
        alternative_note: altDraft.alternative_note.trim(),
      })
      toast.success('Alternative sent · customer notified')
      setAlting(null); refresh(false)
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to send alternative')
    } finally { setAltBusy(false) }
  }

  const canAct = (s) => ['pending_quote', 'quoted', 'alternative_offered'].includes(s)

  return (
    <div className="relative min-h-screen bg-white/[0.03]">
      <GlassStyles />
      <LiquidBlob className="top-[-15%] right-[-15%] w-[40rem] h-[40rem]" color="bg-orange-200" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 md:px-8 py-10">
        <div className="flex items-center justify-between gap-4 mb-8">
          <PageHeading icon={ShoppingBag}
            title="Buy-for-me queue"
            subtitle="Quote, suggest an alternative, or decline concierge requests" />
          <button onClick={() => refresh()}
            className="shrink-0 inline-flex items-center gap-2 bg-surface border border-line text-white/80 hover:bg-white/[0.03] font-semibold px-4 py-2 rounded-xl text-sm">
            <RefreshCw size={14}/> Refresh
          </button>
        </div>

        {loading ? (
          <GlassCard className="p-8 text-center text-mute">Loading…</GlassCard>
        ) : orders.length === 0 ? (
          <GlassCard className="p-10 text-center text-mute">No pending requests.</GlassCard>
        ) : (
          <div className="space-y-4">
            {orders.map(o => (
              <GlassCard key={o.id} className="p-5">
                {/* Row 1 — status + price */}
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusBadge status={o.status}/>
                    <span className="font-mono text-[11px] text-dim truncate">{o.id}</span>
                  </div>
                  {o.estimate_gbp != null && (
                    <p className="shrink-0 text-sm font-black text-white">
                      £{Number(o.estimate_gbp).toFixed(2)}
                      <span className="text-mute font-bold"> · {Number(o.markup_pct || 0)}%</span>
                    </p>
                  )}
                </div>

                {/* Row 2 — item + retailer */}
                <h3 className="text-lg font-black text-white leading-tight">{o.item_name}</h3>
                {o.retailer_url && <RetailerLink url={o.retailer_url} />}

                {/* Row 3 — meta */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute">
                  <span>Qty: <span className="text-white/80 font-semibold">{o.qty}</span></span>
                  {o.size && <span>Size: <span className="text-white/80 font-semibold">{o.size}</span></span>}
                  <span className="text-white/80 font-semibold">{o.name || o.email}</span>
                  {o.email && o.name && <span className="text-dim">{o.email}</span>}
                </div>

                {o.notes && <p className="mt-2 text-xs text-mute italic">“{o.notes}”</p>}

                {/* Alternative awaiting customer */}
                {o.status === 'alternative_offered' && (
                  <div className="mt-3 rounded-xl border border-ember-500/25 bg-ember-500/5 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-ember-300 mb-1">Alternative sent · awaiting customer</p>
                    {o.alternative_note && <p className="text-xs text-white/80">{o.alternative_note}</p>}
                    {o.alternative_url && <RetailerLink url={o.alternative_url} />}
                  </div>
                )}

                {/* Reasons */}
                {o.status === 'rejected' && o.customer_decision_reason && (
                  <p className="mt-2 text-xs text-rose-400 italic">Customer: “{o.customer_decision_reason}”</p>
                )}
                {o.status === 'rejected' && o.admin_decision_reason && (
                  <p className="mt-2 text-xs text-rose-400 italic">Declined: “{o.admin_decision_reason}”</p>
                )}
                {o.status === 'paid' && o.parcel_tracking_number && (
                  <p className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/25 text-emerald-300 text-xs font-semibold">
                    📦 Pre-registered as <span className="font-mono font-bold">{o.parcel_tracking_number}</span>
                  </p>
                )}

                {/* Action bar */}
                {canAct(o.status) && (
                  <div className="mt-4 pt-4 border-t border-line flex flex-wrap gap-2">
                    <button onClick={() => openQuote(o)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold">
                      <Send size={14}/> {o.status === 'quoted' ? 'Edit quote' : 'Send quote'}
                    </button>
                    <button onClick={() => openAlt(o)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface border border-line text-white/80 hover:bg-white/[0.04] text-sm font-bold">
                      <Repeat size={14}/> Alternative
                    </button>
                    <button onClick={() => { setRejecting(o); setRejectReason('') }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 text-sm font-bold">
                      <Ban size={14}/> Decline
                    </button>
                  </div>
                )}
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {/* Quote modal */}
      {editing && (
        <Modal onClose={() => setEditing(null)} title="Send quote" subtitle={`${editing.item_name} · ${editing.email}`}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estimate (GBP)" type="number" value={draft.estimate_gbp}
              onChange={(v) => setDraft({ ...draft, estimate_gbp: v })} placeholder="0.00" />
            <Field label="Service markup (%)" type="number" value={draft.markup_pct}
              onChange={(v) => setDraft({ ...draft, markup_pct: v })} />
            <div className="col-span-2">
              <FieldLabel>Notes for customer</FieldLabel>
              <textarea rows={3} value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="e.g. We can buy from a cheaper UK retailer if you'd prefer."
                className={textareaCls} />
            </div>
          </div>
          <ModalActions onCancel={() => setEditing(null)}>
            <button onClick={onSubmitQuote} disabled={submitting}
              className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
              <Send size={14}/> {submitting ? 'Sending…' : 'Send & email'}
            </button>
          </ModalActions>
        </Modal>
      )}

      {/* Alternative modal */}
      {alting && (
        <Modal onClose={() => setAlting(null)} title="Suggest an alternative" subtitle={`${alting.item_name} · ${alting.email}`}>
          <div className="space-y-3">
            <div>
              <FieldLabel>Alternative product link</FieldLabel>
              <input value={altDraft.alternative_url}
                onChange={(e) => setAltDraft({ ...altDraft, alternative_url: e.target.value })}
                placeholder="https://www.amazon.co.uk/…" className={inputCls} />
            </div>
            <div>
              <FieldLabel>Note to customer</FieldLabel>
              <textarea rows={3} value={altDraft.alternative_note}
                onChange={(e) => setAltDraft({ ...altDraft, alternative_note: e.target.value })}
                placeholder="e.g. Original is out of stock — this one is the same spec, slightly cheaper."
                className={textareaCls} />
            </div>
          </div>
          <ModalActions onCancel={() => setAlting(null)}>
            <button onClick={onSubmitAlt} disabled={altBusy}
              className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
              <Repeat size={14}/> {altBusy ? 'Sending…' : 'Send alternative'}
            </button>
          </ModalActions>
        </Modal>
      )}

      {/* Decline modal */}
      {rejecting && (
        <Modal onClose={() => setRejecting(null)} title="Decline request" subtitle={`${rejecting.item_name} · ${rejecting.email}`}>
          <div>
            <FieldLabel>Reason (shown to customer)</FieldLabel>
            <textarea rows={4} value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. This item is on our prohibited list and can't be shipped."
              className={textareaCls.replace('ring-orange-400', 'ring-rose-400')} />
          </div>
          <ModalActions onCancel={() => setRejecting(null)}>
            <button onClick={onSubmitReject} disabled={rejectBusy}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
              <Ban size={14}/> {rejectBusy ? 'Declining…' : 'Decline & notify'}
            </button>
          </ModalActions>
        </Modal>
      )}
    </div>
  )
}

// ── Small presentational helpers ────────────────────────────────────────────
const inputCls = 'w-full px-3 py-2 rounded-xl border border-line bg-surface-2 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-400'
const textareaCls = inputCls + ' resize-none'

const FieldLabel = ({ children }) => (
  <span className="block text-[10px] uppercase tracking-widest text-mute font-black mb-1">{children}</span>
)

const Field = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <label className="block">
    <FieldLabel>{label}</FieldLabel>
    <input value={value} type={type} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} className={inputCls} />
  </label>
)

const Modal = ({ title, subtitle, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
    <GlassCard className="p-6 w-full max-w-lg">
      <h4 className="text-lg font-black text-white mb-1">{title}</h4>
      {subtitle && <p className="text-xs text-mute mb-4">{subtitle}</p>}
      {children}
    </GlassCard>
  </div>
)

const ModalActions = ({ children, onCancel }) => (
  <div className="mt-4 flex justify-end gap-2">
    <button onClick={onCancel}
      className="px-4 py-2 rounded-lg bg-surface border border-line text-white/80 text-sm font-semibold">
      Cancel
    </button>
    {children}
  </div>
)
