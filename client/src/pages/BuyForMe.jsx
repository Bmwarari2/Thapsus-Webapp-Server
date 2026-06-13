import React, { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ShoppingBag, Plus, Check, X, RefreshCw, Link2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { buyForMeApi, retailersApi } from '../api'
import { GlassStyles, GlassCard, LiquidBlob, PageHeading, StatusBadge } from '../components/GlassUI'
import { PayInvoiceModal } from '../components/PayInvoiceModal'
import { RetailerLink } from '../components/RetailerLink'
import { UkStoresMarquee } from '../components/UkStoresMarquee'
import { useAsyncGuard } from '../hooks/useAsyncGuard'
import { useBuyForMeUpdates } from '../hooks/useRealtimeUpdates'

const OTHER_RETAILER_ID = '__other__'

/**
 * /app/buy-for-me — concierge orders (Spec §4.10).
 *
 * Customer pastes a retailer URL → we buy + ship to UK → consolidate.
 * Operator quotes server-side; customer reviews here and accepts (now
 * via Stripe or M-Pesa via the PayInvoiceModal — wallet was dropped in
 * server PR #61 / migration 028) or rejects with a free-text reason
 * so the operator can re-quote.
 */
export const BuyForMe = () => {
  const [orders, setOrders] = useState([])
  const [retailers, setRetailers] = useState([])
  const [draft, setDraft] = useState({
    retailer_id: '', retailer_url: '', item_name: '', size: '', qty: 1, notes: '',
  })

  // Reject modal — `null` means closed.
  const [rejectingFor, setRejectingFor] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  // Pay modal — non-null = open. Holds the BFM order being paid for.
  const [payingFor, setPayingFor] = useState(null)

  // Alternative-offer response state.
  const [counterFor, setCounterFor] = useState(null) // order id awaiting a customer counter-link
  const [counterUrl, setCounterUrl] = useState('')

  // Double-submit guards (rapid taps were creating duplicate requests).
  const [submitting, runSubmit] = useAsyncGuard()
  const [rejecting, runReject] = useAsyncGuard()
  const [altBusy, runAlt] = useAsyncGuard()

  const [searchParams, setSearchParams] = useSearchParams()

  const refresh = () => buyForMeApi.mine().then(r => setOrders(r.data?.orders || []))
                                          .catch(() => toast.error('Failed to load orders'))

  useEffect(() => { refresh() }, [])
  useEffect(() => {
    retailersApi.list()
      .then(r => setRetailers(r.data?.retailers || []))
      .catch(() => {/* picker is enhancement — fall back to URL field */})
  }, [])

  // Live updates: quote ready, declined, alternative offered → refresh + toast.
  useBuyForMeUpdates((payload) => {
    if (!payload) return
    refresh()
    if (payload.action === 'quoted') toast.success('A quote is ready to review')
    else if (payload.action === 'alternative_offered') toast('We suggested an alternative', { icon: '🔄' })
    else if (payload.action === 'rejected') toast('A request was updated', { icon: 'ℹ️' })
  })

  // Deep link from the UK stores directory: /buy-for-me?store=<url> prefills
  // the form with that retailer under "Other".
  useEffect(() => {
    const store = searchParams.get('store')
    if (store) {
      setDraft((d) => ({ ...d, retailer_id: OTHER_RETAILER_ID, retailer_url: store }))
      const next = new URLSearchParams(searchParams); next.delete('store')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isOtherPicked = draft.retailer_id === OTHER_RETAILER_ID

  // ── Alternative-offer handlers ───────────────────────────────────────────
  const onAcceptAlternative = (id) => runAlt(async () => {
    try { await buyForMeApi.alternativeAccept(id); toast.success('Accepted — we\'ll quote it shortly'); refresh() }
    catch (e) { toast.error(e.response?.data?.message || 'Failed to accept') }
  })
  const onDeclineAlternative = (id) => runAlt(async () => {
    try { await buyForMeApi.alternativeDecline(id); toast.success('Alternative declined'); refresh() }
    catch (e) { toast.error(e.response?.data?.message || 'Failed to decline') }
  })
  const onCounterAlternative = () => runAlt(async () => {
    const url = counterUrl.trim()
    if (!url) { toast.error('Paste a link'); return }
    try {
      await buyForMeApi.alternativeCounter(counterFor, url)
      toast.success('Sent — we\'ll review your link')
      setCounterFor(null); setCounterUrl(''); refresh()
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to send') }
  })

  const onSubmit = () => {
    if (!draft.item_name) { toast.error('Item name is required'); return }
    if (!draft.retailer_id) { toast.error('Pick a retailer (or "Other")'); return }
    const isOther = draft.retailer_id === OTHER_RETAILER_ID
    if (isOther && !draft.retailer_url) {
      toast.error('Paste the retailer URL for "Other"'); return
    }
    runSubmit(async () => {
      try {
        await buyForMeApi.create({
          retailer_id:  isOther ? null : draft.retailer_id,
          retailer_url: draft.retailer_url || null,
          item_name:    draft.item_name,
          size:         draft.size,
          qty:          draft.qty,
          notes:        draft.notes,
        })
        toast.success('Concierge request submitted — we will quote within 24h')
        setDraft({ retailer_id: '', retailer_url: '', item_name: '', size: '', qty: 1, notes: '' })
        refresh()
      } catch { toast.error('Failed to submit') }
    })
  }

  // Group retailers by country for the picker, in catalog sort order.
  // UK-only system: filter out any non-UK rows so legacy seed data
  // (USA/China retailers from the pre-strip migration) never lands in
  // the customer picker even if the DB clean-up hasn't run yet.
  const retailerGroups = useMemo(() => {
    const groups = {}
    for (const r of retailers) {
      if ((r.country || '').toUpperCase() !== 'UK') continue
      groups[r.country] = groups[r.country] || []
      groups[r.country].push(r)
    }
    return groups
  }, [retailers])

  // Open the pay modal — replaces the legacy buyForMeApi.accept() wallet
  // debit. PayInvoiceModal calls POST /api/payments and routes through
  // Stripe or M-Pesa; on success the webhook flips the BFM row to 'paid'.
  const onAccept = (order) => setPayingFor(order)

  const onSubmitReject = () => {
    const reason = rejectReason.trim()
    if (reason.length < 3) { toast.error('Tell us briefly why'); return }
    runReject(async () => {
      try {
        await buyForMeApi.reject(rejectingFor, reason)
        toast.success('Quote rejected — thanks for the feedback')
        setRejectingFor(null); setRejectReason('')
        refresh()
      } catch (e) {
        toast.error(e.response?.data?.message || 'Failed to reject')
      }
    })
  }

  return (
    <div className="relative min-h-screen bg-white/[0.03]">
      <GlassStyles />
      <LiquidBlob className="top-[-15%] right-[-15%] w-[40rem] h-[40rem]" color="bg-orange-200" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 md:px-8 py-10">
        <PageHeading icon={ShoppingBag}
          title="Buy for me"
          subtitle="Don't have a UK card? Paste the link — we'll buy and ship for you." />

        {/* UK stores marquee + reminder */}
        <GlassCard className="p-5 mb-6">
          <UkStoresMarquee />
        </GlassCard>
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-ember-500/25 bg-ember-500/10 px-4 py-3">
          <Link2 size={18} className="text-ember-400 mt-0.5 shrink-0" />
          <p className="text-sm text-white/80 leading-relaxed">
            <strong className="text-white">Use the UK version of a store</strong> — e.g. <span className="font-mono text-ember-300">amazon.co.uk</span>,
            not amazon.com. UK links ship faster and avoid import surprises.
          </p>
        </div>

        <GlassCard className="p-6 mb-8">
          <h3 className="text-lg font-black text-white mb-4">New concierge order</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">
                Retailer
              </label>
              <select
                value={draft.retailer_id || ''}
                onChange={(e) => setDraft({ ...draft, retailer_id: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-300"
              >
                <option value="">— Choose a retailer —</option>
                {Object.entries(retailerGroups).map(([country, rs]) => (
                  <optgroup key={country} label={country}>
                    {rs.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </optgroup>
                ))}
                <option value={OTHER_RETAILER_ID}>Other (paste a URL)</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <Field
                label={isOtherPicked ? 'Retailer URL (required)' : 'Item URL (optional)'}
                value={draft.retailer_url}
                onChange={(v) => setDraft({ ...draft, retailer_url: v })}
                placeholder="https://…"
              />
            </div>
            <Field label="Item name" value={draft.item_name}
                   onChange={(v) => setDraft({ ...draft, item_name: v })} />
            <Field label="Size / variant" value={draft.size}
                   onChange={(v) => setDraft({ ...draft, size: v })} />
            <Field label="Quantity" type="number" value={draft.qty}
                   onChange={(v) => setDraft({ ...draft, qty: +v || 1 })} />
            <div className="md:col-span-2">
              <Field label="Notes" value={draft.notes}
                     onChange={(v) => setDraft({ ...draft, notes: v })}/>
            </div>
          </div>
          <button onClick={onSubmit} disabled={submitting}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus size={16}/> {submitting ? 'Submitting…' : 'Request a quote'}
          </button>
        </GlassCard>

        <h3 className="text-lg font-black text-white mb-3">My concierge orders</h3>
        {orders.length === 0 ? (
          <GlassCard className="p-8 text-center text-mute">No concierge orders yet.</GlassCard>
        ) : (
          <div className="space-y-3">
            {orders.map(o => (
              <GlassCard key={o.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-mute">{o.id}</p>
                    <p className="font-semibold text-white truncate">{o.item_name}</p>
                    {o.retailer_url && <RetailerLink url={o.retailer_url} />}
                    {o.size && <p className="text-xs text-mute mt-1">Size: {o.size}</p>}
                    <p className="text-xs text-mute">Qty: {o.qty}</p>
                    {o.status === 'rejected' && o.admin_decision_reason && (
                      <p className="mt-2 text-xs text-rose-400 italic">
                        Declined by Thapsus: "{o.admin_decision_reason}"
                      </p>
                    )}
                    {o.status === 'rejected' && o.customer_decision_reason && (
                      <p className="mt-2 text-xs text-rose-400 italic">
                        Your reason: "{o.customer_decision_reason}"
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <StatusBadge status={o.status}/>
                    {o.estimate_gbp != null && (
                      <>
                        <p className="mt-2 text-sm font-bold text-white">
                          £{Number(o.estimate_gbp).toFixed(2)}
                        </p>
                        {o.markup_pct != null && (
                          <p className="text-[10px] text-mute">
                            +{Number(o.markup_pct)}% service
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {o.status === 'quoted' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => onAccept(o)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold">
                      <Check size={14}/> Accept &amp; buy
                    </button>
                    <button onClick={() => { setRejectingFor(o.id); setRejectReason('') }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface border border-rose-300 text-rose-700 hover:bg-rose-50 text-sm font-bold">
                      <X size={14}/> Reject
                    </button>
                  </div>
                )}

                {o.status === 'alternative_offered' && (
                  <div className="mt-3 rounded-2xl border border-ember-500/25 bg-ember-500/5 p-4">
                    <p className="text-xs font-black uppercase tracking-widest text-ember-300 mb-2">
                      Alternative suggested
                    </p>
                    {o.alternative_note && (
                      <p className="text-sm text-white/85 leading-relaxed mb-2">{o.alternative_note}</p>
                    )}
                    {o.alternative_url && <RetailerLink url={o.alternative_url} />}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => onAcceptAlternative(o.id)} disabled={altBusy}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50">
                        <Check size={14}/> Accept
                      </button>
                      <button onClick={() => onDeclineAlternative(o.id)} disabled={altBusy}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface border border-rose-400/40 text-rose-300 hover:bg-rose-500/10 text-sm font-bold disabled:opacity-50">
                        <X size={14}/> Decline
                      </button>
                      <button onClick={() => { setCounterFor(o.id); setCounterUrl('') }} disabled={altBusy}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface border border-line text-white/80 hover:bg-white/[0.04] text-sm font-bold disabled:opacity-50">
                        <Link2 size={14}/> Suggest my own
                      </button>
                    </div>
                  </div>
                )}
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {rejectingFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
          <GlassCard className="p-6 w-full max-w-md">
            <h4 className="text-lg font-black text-white mb-1">Reject quote</h4>
            <p className="text-sm text-mute mb-3">
              Tell us why so we can re-quote with a better option.
            </p>
            <textarea rows={4} value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Out of budget, found cheaper, wrong size…"
              className="w-full px-3 py-2 rounded-xl border border-line bg-surface-2 focus:outline-none focus:ring-2 focus:ring-orange-400" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setRejectingFor(null); setRejectReason('') }}
                className="px-4 py-2 rounded-lg bg-surface border border-line text-white/80 text-sm font-semibold">
                Cancel
              </button>
              <button onClick={onSubmitReject} disabled={rejecting}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">
                {rejecting ? 'Submitting…' : 'Submit reject'}
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      {counterFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
          <GlassCard className="p-6 w-full max-w-md">
            <h4 className="text-lg font-black text-white mb-1">Suggest your own link</h4>
            <p className="text-sm text-mute mb-3">
              Paste a UK store link to the item you'd prefer — we'll review and quote it.
            </p>
            <input value={counterUrl} onChange={(e) => setCounterUrl(e.target.value)}
              placeholder="https://www.amazon.co.uk/…"
              className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-400" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setCounterFor(null); setCounterUrl('') }}
                className="px-4 py-2 rounded-lg bg-surface border border-line text-white/80 text-sm font-semibold">
                Cancel
              </button>
              <button onClick={onCounterAlternative} disabled={altBusy}
                className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">
                {altBusy ? 'Sending…' : 'Send link'}
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      <PayInvoiceModal
        open={!!payingFor}
        onClose={() => setPayingFor(null)}
        targetKind="buy_for_me"
        targetId={payingFor?.id}
        targetTitle={payingFor ? `Buy-for-me · ${payingFor.item_name}` : ''}
        amountKesGross={(() => {
          if (!payingFor) return 0
          const gbp = Number(payingFor.estimate_gbp || 0) * (1 + Number(payingFor.markup_pct || 10) / 100)
          // Approx KES at 165 — server's PaymentDto.amount_due_kes is
          // authoritative once the create POST returns; this only primes
          // the summary card before that.
          return Math.ceil(gbp * 165)
        })()}
        onPaid={refresh}
      />
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
