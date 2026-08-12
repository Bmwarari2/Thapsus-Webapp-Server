import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HandCoins, CheckCircle2, XCircle, RefreshCw, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import { paymentsApi } from '../../api'
import { GlassStyles, GlassCard, PageHeading, StatusBadge } from '../../components/GlassUI'

/**
 * /ops/payments — the manual M-Pesa approval queue.
 *
 * M-Pesa STK is unavailable (provider withdrawn), so customers pay the
 * Buy Goods till and someone here confirms the money actually landed.
 * Approving is what mints the tracking code and sends the receipt, so
 * this queue is the pipeline's real bottleneck — it gets its own page and
 * its own nav item rather than hiding inside each order.
 */
export function WaPayments() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await paymentsApi.pendingMpesaQueue()
      setPayments(res.data.payments || [])
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load the payment queue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const approve = async (p) => {
    if (!window.confirm(
      `Confirm KSh ${Number(p.amount_due_kes).toLocaleString()} from ${p.user_name || p.user_email} `
      + `is on the M-Pesa till statement?`)) return
    setBusy(p.id)
    try {
      await paymentsApi.approve(p.id)
      toast.success('Payment approved — tracking code and receipt sent')
      await load()
    } catch (e) {
      const data = e.response?.data
      if (data?.error === 'amount_mismatch') {
        const reason = window.prompt(`${data.message}\n\nReason for approving anyway (min 10 chars):`)
        if (reason && reason.trim().length >= 10) {
          try {
            await paymentsApi.approve(p.id, { overrideReason: reason.trim() })
            toast.success('Payment approved with override')
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
    const reason = window.prompt('Why are you rejecting this payment? (the customer can pay again)')
    if (!reason || reason.trim().length < 3) return
    setBusy(p.id)
    try {
      await paymentsApi.reject(p.id, reason.trim())
      toast.success('Payment rejected')
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
          <p className="text-white font-semibold">Nothing waiting 🎉</p>
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
