import React, { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Package, ArrowLeft, MessageSquareText, Printer, FileText,
  CheckCircle2, Smartphone, HandCoins, Gift, Send,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { waApi, paymentsApi } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { GlassStyles, GlassCard, PageHeading, StatusBadge } from '../../components/GlassUI'
import { PrintableParcelLabel } from '../../components/PrintableParcelLabel'
import { useWaPipelineUpdates } from '../../hooks/useRealtimeUpdates'

// Which single-step advance buttons to offer per current status. Payment
// statuses move via the payments machinery, not these buttons.
const NEXT_ACTIONS = {
  paid: [{ to: 'purchased', label: 'Mark purchased' }],
  purchased: [{ to: 'in_kenya', label: 'Arrived in Kenya' }],
  in_kenya: [{ to: 'dispatched', label: 'Dispatch' }],
  delivery_fee_pending: [{ to: 'dispatched', label: 'Dispatch' }],
  dispatched: [{ to: 'delivered', label: 'Mark delivered' }],
}

export function WaOrderDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [order, setOrder] = useState(null)
  const [events, setEvents] = useState([])
  const [payments, setPayments] = useState([])
  const [usd, setUsd] = useState('')
  const [busy, setBusy] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await waApi.order(id)
      setOrder(res.data.order)
      setEvents(res.data.events || [])
      setPayments(res.data.payments || [])
      if (res.data.order.usd_price) setUsd(String(res.data.order.usd_price))
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load order')
    }
  }, [id])

  useEffect(() => { load() }, [load])
  useWaPipelineUpdates((data) => { if (data.order_id === id) load() })

  const run = (fn, okMsg) => async (...args) => {
    setBusy(true)
    try {
      await fn(...args)
      if (okMsg) toast.success(okMsg)
      await load()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const sendQuote = run(() => {
    const price = Number(usd)
    if (!Number.isFinite(price) || price <= 0) throw Object.assign(new Error(), { response: { data: { message: 'Enter a valid USD price' } } })
    return waApi.quote(id, price)
  }, 'Quote sent to the customer')

  const confirm = run(() => waApi.confirm(id), 'Order confirmed')
  const advance = (to) => run(() => waApi.advance(id, to), 'Status updated')()
  const waive = run(() => waApi.waiveFee(id), 'Delivery fee waived')
  const requestPay = (method, purpose) =>
    run(() => waApi.requestPayment(id, { method, purpose }),
      method === 'stk' ? 'STK push sent' : 'Payment instructions sent')()
  const approvePayment = (paymentId) =>
    run(() => paymentsApi.approve(paymentId), 'Payment approved')()
  const resendReceipt = run(() => waApi.resendReceipt(id), 'Receipt re-sent')
  const openReceipt = async () => {
    try {
      const res = await waApi.receiptUrl(id)
      window.open(res.data.url, '_blank', 'noopener')
    } catch (e) {
      toast.error(e.response?.data?.message || 'No receipt yet')
    }
  }

  if (!order) {
    return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-mute">Loading…</div>
  }

  const links = Array.isArray(order.product_links) ? order.product_links : []
  const awaitingReview = payments.find((p) => p.status === 'awaiting_review')
  const feePayable = ['in_kenya', 'delivery_fee_pending'].includes(order.status)
    && !order.delivery_fee_waived && !order.delivery_fee_paid_at && Number(order.delivery_fee_kes) > 0

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <GlassStyles />
      <Link to="/ops/pipeline" className="inline-flex items-center gap-1.5 text-sm text-mute hover:text-white mb-4">
        <ArrowLeft size={15} /> Pipeline
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading icon={Package}
          title={order.tracking_code || 'New quote'}
          subtitle={`${order.full_name || order.phone} · ${order.customer_code || 'onboarding'}`} />
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} />
          {order.tracking_code && (
            <button onClick={() => setPrintOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-line text-white hover:bg-white/10 text-sm">
              <Printer size={15} /> Label
            </button>
          )}
          <Link to={`/ops/inbox?contact=${order.contact_id}`}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-line text-white hover:bg-white/10 text-sm">
            <MessageSquareText size={15} /> Chat
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Quote / money ── */}
        <GlassCard className="p-5">
          <h2 className="font-bold text-white mb-4">Quote</h2>
          {links.length > 0 && (
            <div className="mb-4 space-y-1">
              {links.map((l, i) => (
                <a key={i} href={l} target="_blank" rel="noreferrer"
                  className="block text-xs text-ember-400 hover:text-ember-300 truncate">{l}</a>
              ))}
            </div>
          )}
          {['quoting', 'quoted'].includes(order.status) ? (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mute text-sm">$</span>
                <input value={usd} onChange={(e) => setUsd(e.target.value)} inputMode="decimal"
                  placeholder="Item price in USD"
                  className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-white/5 border border-line text-white placeholder:text-mute focus:outline-none focus:border-ember-500/50" />
              </div>
              <button onClick={sendQuote} disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ember-600 hover:bg-ember-500 text-white font-semibold disabled:opacity-50">
                <Send size={16} /> {order.status === 'quoted' ? 'Re-quote' : 'Send quote'}
              </button>
            </div>
          ) : null}
          {order.quote_kes && (
            <div className="mt-4 grid grid-cols-2 gap-y-1.5 text-sm">
              <span className="text-mute">Item price</span>
              <span className="text-white text-right">${Number(order.usd_price).toFixed(2)}</span>
              <span className="text-mute">Rate</span>
              <span className="text-white text-right">1 USD = {Number(order.fx_rate).toFixed(2)} KES</span>
              <span className="text-mute">Margin</span>
              <span className="text-white text-right">{Number(order.markup_pct)}%</span>
              <span className="text-mute font-semibold">Total</span>
              <span className="text-ember-400 font-bold text-right">KSh {Number(order.quote_kes).toLocaleString()}</span>
            </div>
          )}

          {/* Stage actions */}
          <div className="mt-5 flex flex-wrap gap-2">
            {order.status === 'quoted' && (
              <button onClick={confirm} disabled={busy}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/5 border border-line text-white hover:bg-white/10 text-sm">
                <CheckCircle2 size={15} /> Confirm for customer
              </button>
            )}
            {['confirmed', 'quoted'].includes(order.status) && (
              <>
                <button onClick={() => requestPay('stk', 'order')} disabled={busy}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm font-semibold">
                  <Smartphone size={15} /> M-Pesa STK push
                </button>
                <button onClick={() => requestPay('manual', 'order')} disabled={busy}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/5 border border-line text-white hover:bg-white/10 text-sm">
                  <HandCoins size={15} /> Send till instructions
                </button>
              </>
            )}
            {(NEXT_ACTIONS[order.status] || []).map((a) => (
              <button key={a.to} onClick={() => advance(a.to)} disabled={busy}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-ember-600 hover:bg-ember-500 text-white text-sm font-semibold disabled:opacity-50">
                {a.label}
              </button>
            ))}
            {['quoting', 'quoted', 'confirmed'].includes(order.status) && (
              <button onClick={() => advance('cancelled')} disabled={busy}
                className="px-3.5 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 text-sm">
                Cancel
              </button>
            )}
          </div>

          {/* Delivery fee */}
          {['in_kenya', 'delivery_fee_pending'].includes(order.status) && (
            <div className="mt-5 pt-4 border-t border-line">
              <h3 className="text-sm font-bold text-white mb-2">Last-mile delivery fee</h3>
              <p className="text-sm text-mute mb-3">
                {order.delivery_fee_waived
                  ? 'Waived 🎉'
                  : order.delivery_fee_paid_at
                    ? 'Paid ✅'
                    : `KSh ${Number(order.delivery_fee_kes || 0).toLocaleString()} pending`}
              </p>
              {feePayable && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => requestPay('stk', 'delivery_fee')} disabled={busy}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm font-semibold">
                    <Smartphone size={15} /> STK for fee
                  </button>
                  <button onClick={waive} disabled={busy}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/5 border border-line text-white hover:bg-white/10 text-sm">
                    <Gift size={15} /> Waive fee
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Receipt */}
          {order.paid_at && (
            <div className="mt-5 pt-4 border-t border-line flex flex-wrap gap-2">
              <button onClick={openReceipt}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/5 border border-line text-white hover:bg-white/10 text-sm">
                <FileText size={15} /> View receipt
              </button>
              <button onClick={resendReceipt} disabled={busy}
                className="px-3.5 py-2 rounded-lg bg-white/5 border border-line text-white hover:bg-white/10 text-sm">
                Re-send to customer
              </button>
            </div>
          )}
        </GlassCard>

        {/* ── Payments + timeline ── */}
        <div className="space-y-4">
          <GlassCard className="p-5">
            <h2 className="font-bold text-white mb-3">Payments</h2>
            {payments.length === 0 && <p className="text-sm text-mute">None yet</p>}
            <div className="space-y-2">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="text-white truncate">KSh {Number(p.amount_due_kes).toLocaleString()} · {p.mpesa_provider}</p>
                    <p className="text-xs text-mute">{new Date(p.created_at).toLocaleString('en-KE')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={p.status} />
                    {p.status === 'awaiting_review' && user?.role === 'admin' && (
                      <button onClick={() => approvePayment(p.id)} disabled={busy}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">
                        Approve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {awaitingReview && user?.role !== 'admin' && (
              <p className="text-xs text-amber-300/80 mt-3">An admin approves manual payments (Admin → payments queue).</p>
            )}
          </GlassCard>

          <GlassCard className="p-5">
            <h2 className="font-bold text-white mb-3">Delivery details</h2>
            <p className="text-sm text-white">{order.full_name || '—'}</p>
            <p className="text-sm text-mute">{order.delivery_address || 'No address on file'}</p>
            <p className="text-sm text-mute mt-1">M-Pesa: {order.mpesa_number || '—'}</p>
            {order.customer_code && (
              <p className="text-xs text-ember-400 font-bold mt-2">
                Ship-to label: {order.full_name} — {order.customer_code}
              </p>
            )}
          </GlassCard>

          <GlassCard className="p-5">
            <h2 className="font-bold text-white mb-3">History</h2>
            <div className="space-y-2">
              {events.map((ev) => (
                <div key={ev.id} className="text-xs">
                  <span className="text-white font-semibold">{String(ev.to_status).replace(/_/g, ' ')}</span>
                  <span className="text-mute"> · {new Date(ev.created_at).toLocaleString('en-KE')}</span>
                  {ev.note && <p className="text-mute">{ev.note}</p>}
                </div>
              ))}
              {events.length === 0 && <p className="text-sm text-mute">No events yet</p>}
            </div>
          </GlassCard>
        </div>
      </div>

      {printOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPrintOpen(false)}>
          <div className="bg-white rounded-xl p-4 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <PrintableParcelLabel parcel={{
              tracking_number: order.tracking_code,
              description: `${order.full_name || ''} — ${order.customer_code || ''}`,
              user_name: order.full_name,
            }} />
            <div className="flex gap-2 mt-3 print:hidden">
              <button onClick={() => window.print()}
                className="px-4 py-2 rounded-lg bg-ember-600 text-white text-sm font-semibold">Print</button>
              <button onClick={() => setPrintOpen(false)}
                className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800 text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
