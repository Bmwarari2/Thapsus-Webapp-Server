import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HandCoins, CheckCircle2, XCircle, RefreshCw, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import { paymentsApi } from '../../api'
import { GlassStyles, GlassCard, PageHeading, StatusBadge } from '../../components/GlassUI'
import { useWaPipelineUpdates } from '../../hooks/useRealtimeUpdates'

/**
 * /ops/payments — the manual M-Pesa approval queue (operators + admins).
 *
 * M-Pesa STK is unavailable (provider withdrawn), so customers pay the
 * Buy Goods till and someone here confirms the money actually landed.
 * Approving is what mints the tracking code and sends the receipt, so
 * this queue is the pipeline's real bottleneck — it gets its own page and
 * its own nav item rather than hiding inside each order, and it follows
 * the pipeline SSE stream so new payments appear without anyone pressing
 * Refresh (it used to load once on mount and then sit stale all day).
 */
export function WaPayments() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  // Per-row "amount received" — what the reviewer matched on the till
  // statement. Pre-filled with the amount due (the overwhelmingly common
  // case) so verification is one glance, not data entry.
  const [amounts, setAmounts] = useState({})

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    try {
      const res = await paymentsApi.pendingMpesaQueue()
      setPayments(res.data.payments || [])
    } catch (e) {
      if (!quiet) toast.error(e.response?.data?.message || 'Failed to load the payment queue')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  // Payment rows open (customer says YES), settle, and get rejected via
  // pipeline events — refresh quietly on each one.
  useWaPipelineUpdates(() => load({ quiet: true }))

  const approve = async (p) => {
    const isWaOrder = p.target_kind === 'wa_order'
    const amountReceived = isWaOrder
      ? Math.round(Number(amounts[p.id] ?? p.amount_due_kes))
      : undefined
    if (isWaOrder && (!Number.isFinite(amountReceived) || amountReceived <= 0)) {
      return toast.error('Enter the amount received on the till statement')
    }
    if (!window.confirm(
      `Confirm KSh ${Number(amountReceived ?? p.amount_due_kes).toLocaleString()} from ${p.user_name || p.user_email} `
      + `is on the M-Pesa till statement?`)) return
    setBusy(p.id)
    try {
      await paymentsApi.approve(p.id, { amountReceived })
      toast.success('Payment approved — tracking code and receipt sent')
      await load()
    } catch (e) {
      const data = e.response?.data
      if (data?.error === 'amount_mismatch') {
        const reason = window.prompt(`${data.message}\n\nReason for approving anyway (min 10 chars):`)
        if (reason && reason.trim().length >= 10) {
          try {
            await paymentsApi.approve(p.id, { overrideReason: reason.trim(), amountReceived })
            toast.success('Payment approved with override — the receipt shows the amount received and the balance due')
            await load()
          } catch (e2) {
            toast.error(e2.response?.data?.message || 'Approval failed')
          }
        }
      } else {
        toast.error(data?.message || 'Approval failed')
      }
    } finally {
      setBusy(null)
    }
  }

  const reject = async (p) => {
    const reason = window.prompt(
      'Why are you rejecting this payment?\n\n'
      + 'This reason is SENT TO THE CUSTOMER on WhatsApp, with instructions to pay again.')
    if (!reason || reason.trim().length < 3) return
    setBusy(p.id)
    try {
      await paymentsApi.reject(p.id, reason.trim())
      toast.success('Payment rejected — the customer has been told why')
      await load()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Rejection failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <GlassStyles />
      <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
        <PageHeading icon={HandCoins} title="Payments to approve"
          subtitle="Customers pay the till, you confirm the money landed" />
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-line text-white hover:bg-white/10 text-sm">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {!loading && payments.length === 0 && (
        <GlassCard className="p-8 text-center">
          <p className="text-white font-semibold">Nothing waiting</p>
          <p className="text-sm text-mute mt-1">
            Payments show up here the moment a customer confirms a quote on WhatsApp.
          </p>
        </GlassCard>
      )}

      <div className="space-y-3">
        {payments.map((p) => (
          <GlassCard key={p.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white font-bold">
                  KSh {Number(p.amount_due_kes).toLocaleString()}
                  <span className="text-mute font-normal"> · {p.user_name || p.user_email || 'Unknown customer'}</span>
                </p>
                <p className="text-xs text-mute mt-0.5">
                  {p.wa_customer_code || '—'}
                  {p.wa_tracking_code ? ` · ${p.wa_tracking_code}` : ''}
                  {' · '}{new Date(p.created_at).toLocaleString('en-KE')}
                </p>
                <p className="text-xs mt-1">
                  {p.mpesa_reference
                    ? <span className="text-emerald-300">Customer's M-Pesa ref: <b>{p.mpesa_reference}</b></span>
                    : <span className="text-amber-300/80">No M-Pesa reference yet — check the till statement</span>}
                </p>
                {/* Legacy SMS-paste rows: show the claimed amount and flag a
                    short payment before anyone clicks Approve. */}
                {p.mpesa_message_amount_kes != null && Number(p.mpesa_message_amount_kes) < Number(p.amount_due_kes) && (
                  <p className="text-xs mt-1">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-red-300 font-bold">
                      SMS shows KSh {Number(p.mpesa_message_amount_kes).toLocaleString()} — short of the invoice
                    </span>
                  </p>
                )}
                {p.target_kind === 'wa_order' && (
                  <label className="flex items-center gap-2 text-xs text-mute mt-2">
                    Received on till:
                    <input
                      value={amounts[p.id] ?? String(p.amount_due_kes)}
                      onChange={(e) => setAmounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      inputMode="numeric"
                      className={`w-28 px-2 py-1 rounded-lg bg-white/5 border text-white text-xs focus:outline-none ${
                        Number(amounts[p.id] ?? p.amount_due_kes) < Number(p.amount_due_kes)
                          ? 'border-red-500/60 text-red-200'
                          : 'border-line'
                      }`} />
                    KSh
                  </label>
                )}
                {p.target_kind === 'wa_order' && (
                  <Link to={`/ops/orders/${p.target_id}`}
                    className="inline-flex items-center gap-1 text-xs text-ember-400 hover:text-ember-300 mt-1.5">
                    Open order <ExternalLink size={12} />
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={p.status} />
                <button onClick={() => approve(p)} disabled={busy === p.id}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50">
                  <CheckCircle2 size={15} /> Approve
                </button>
                <button onClick={() => reject(p)} disabled={busy === p.id}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 text-sm disabled:opacity-50">
                  <XCircle size={15} /> Reject
                </button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  )
}
