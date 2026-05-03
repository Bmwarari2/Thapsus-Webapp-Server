// PayInvoiceModal.jsx
// Customer payment flow that replaces the wallet (server PR #61, migration 028).
// Mirror of iOS PayInvoiceView. Triggered from any "pay" CTA — BFM accept,
// customer-consolidation invoice, future order pay.
//
// Flow:
//   1. Show invoice + credit auto-applied + amount due.
//   2. Customer picks Card (Stripe) or M-Pesa (paste SMS).
//   3a. Card → POST /api/payments → Stripe Elements opens with the
//       returned client_secret → on confirm, webhook flips the target.
//   3b. M-Pesa → POST /api/payments → server returns Till + reference
//       → customer pays in M-Pesa → pastes the SMS → admin reviews.

import React, { useState, useMemo, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { CreditCard, Phone, Loader2, X, CheckCircle2, AlertCircle, Copy } from 'lucide-react'
import { paymentsApi } from '../api'
import toast from 'react-hot-toast'

const fmt = (n) => Number(n || 0).toLocaleString()

// ─── Lazy Stripe.js init ──────────────────────────────────────────────────
// Cache the loadStripe() promise per publishable key so we don't re-fetch
// stripe.js on every modal open.
const stripeCache = new Map()
function getStripeInstance(publishableKey) {
  if (!publishableKey) return null
  if (!stripeCache.has(publishableKey)) {
    stripeCache.set(publishableKey, loadStripe(publishableKey))
  }
  return stripeCache.get(publishableKey)
}

/**
 * Top-level modal. Owns method-chooser state and the create-payment call.
 * Renders Stripe <Elements> for the card path, MpesaPanel for the M-Pesa path.
 *
 * Props:
 *   open, onClose, targetKind, targetId, targetTitle, amountKesGross, onPaid?
 */
export function PayInvoiceModal({
  open,
  onClose,
  targetKind,
  targetId,
  targetTitle,
  amountKesGross,
  onPaid,
}) {
  const [creditKes, setCreditKes] = useState(0)
  const [publishableKey, setPublishableKey] = useState(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const [paymentSession, setPaymentSession] = useState(null) // { payment, next, method }

  // Bootstrap on open: fetch publishable key + credit balance.
  useEffect(() => {
    if (!open) return
    setPaymentSession(null)
    setError(null)
    Promise.allSettled([paymentsApi.stripeConfig(), paymentsApi.myCredit()])
      .then(([cfg, credit]) => {
        if (cfg.status === 'fulfilled') setPublishableKey(cfg.value.data?.publishable_key)
        if (credit.status === 'fulfilled') setCreditKes(credit.value.data?.balance_kes ?? 0)
      })
  }, [open])

  const willApplyCredit = Math.min(creditKes, amountKesGross)
  const amountDueKes = Math.max(amountKesGross - willApplyCredit, 0)

  async function startPayment(method) {
    setCreating(true)
    setError(null)
    try {
      const r = await paymentsApi.create(targetKind, targetId, method, true)
      const data = r.data
      if (data?.fully_covered_by_credit && data?.target_paid) {
        toast.success('Covered by your credit. Thanks!')
        onPaid?.()
        onClose?.()
        return
      }
      if (!data?.next) {
        setError('Server returned no next-step payload.')
        return
      }
      if (method === 'stripe' && !data.next.client_secret) {
        setError('Stripe client_secret missing — refresh and retry.')
        return
      }
      setPaymentSession({ payment: data.payment, next: data.next, method })
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to create payment')
    } finally {
      setCreating(false)
    }
  }

  // Hooks MUST run before any conditional return — React's Rules of Hooks.
  // Calling useMemo after `if (!open) return null` flipped the hook order
  // when the modal opened and threw React #310 in production. The promise
  // is cached inside getStripeInstance() so the recompute is cheap when
  // open=false (publishableKey hasn't been fetched yet → returns null).
  const stripePromise = useMemo(
    () => getStripeInstance(publishableKey),
    [publishableKey]
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm grid place-items-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-orange-600">Pay</p>
            <h2 className="text-xl font-black text-[#0f172a] tracking-tight">Pay your invoice</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition">
            <X size={18} />
          </button>
        </header>

        <div className="p-6 space-y-5">
          <p className="text-sm text-slate-500">{targetTitle}</p>

          <SummaryCard
            amountKesGross={amountKesGross}
            creditKes={creditKes}
            willApplyCredit={willApplyCredit}
            amountDueKes={amountDueKes}
          />

          {error && (
            <div className="flex gap-3 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700">
              <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">Couldn't proceed</p>
                <p className="text-xs">{error}</p>
              </div>
            </div>
          )}

          {!paymentSession && (
            <MethodChooser
              amountDueKes={amountDueKes}
              creating={creating}
              onPick={startPayment}
            />
          )}

          {paymentSession?.method === 'stripe' && stripePromise && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: paymentSession.next.client_secret,
                appearance: { theme: 'stripe' },
              }}
            >
              <StripeCardForm
                clientSecret={paymentSession.next.client_secret}
                onPaid={() => { onPaid?.(); onClose?.() }}
              />
            </Elements>
          )}

          {paymentSession?.method === 'mpesa' && (
            <MpesaPanel
              payment={paymentSession.payment}
              paybill={paymentSession.next.paybill}
              account={paymentSession.next.account}
              amountDueKes={paymentSession.next.amount_due_kes ?? amountDueKes}
              onSubmitted={() => { onPaid?.(); onClose?.() }}
            />
          )}

          <p className="text-[10px] text-slate-400 leading-relaxed">
            Card payments process in GBP using today's GBP→KES rate. M-Pesa
            payments are reviewed by an admin before your invoice clears.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Summary card ──────────────────────────────────────────────────────────

function SummaryCard({ amountKesGross, creditKes, willApplyCredit, amountDueKes }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-5 space-y-2 bg-slate-50/50">
      <Row label="Invoice" value={`KES ${fmt(amountKesGross)}`} />
      {creditKes > 0 && (
        <>
          <Row label="Your credit" value={`− KES ${fmt(willApplyCredit)}`} positive />
          <Row label="Remaining credit after" value={`KES ${fmt(creditKes - willApplyCredit)}`} muted />
          <hr className="border-slate-200" />
        </>
      )}
      <Row
        label="Amount due now"
        value={`KES ${fmt(amountDueKes)}`}
        emphasis
      />
    </div>
  )
}

function Row({ label, value, emphasis = false, muted = false, positive = false }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={`text-sm ${muted ? 'text-slate-400' : 'text-slate-600'}`}>{label}</span>
      <span
        className={`font-black ${
          emphasis ? 'text-2xl text-orange-600' : positive ? 'text-green-600 text-sm' : 'text-[#0f172a] text-sm'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Method chooser ────────────────────────────────────────────────────────

function MethodChooser({ amountDueKes, creating, onPick }) {
  if (amountDueKes === 0) {
    return (
      <button
        onClick={() => onPick('stripe')}
        disabled={creating}
        className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition"
      >
        {creating ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
        Apply credit & confirm
      </button>
    )
  }
  return (
    <div className="space-y-2">
      <button
        onClick={() => onPick('stripe')}
        disabled={creating}
        className="w-full py-4 px-5 rounded-2xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white flex items-center gap-3 transition"
      >
        <CreditCard size={20} />
        <div className="flex-1 text-left">
          <p className="font-black uppercase tracking-widest text-xs">Pay with card</p>
          <p className="text-[10px] opacity-90">Stripe · KES → GBP at checkout</p>
        </div>
      </button>
      <button
        onClick={() => onPick('mpesa')}
        disabled={creating}
        className="w-full py-4 px-5 rounded-2xl bg-green-100 hover:bg-green-200 disabled:opacity-50 text-green-800 flex items-center gap-3 transition"
      >
        <Phone size={20} />
        <div className="flex-1 text-left">
          <p className="font-black uppercase tracking-widest text-xs">Pay via M-Pesa</p>
          <p className="text-[10px] opacity-90">Till 5530500 · admin review</p>
        </div>
      </button>
    </div>
  )
}

// ─── Stripe card form ──────────────────────────────────────────────────────

function StripeCardForm({ clientSecret, onPaid }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setErr(null)
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      })
      if (error) {
        setErr(error.message || 'Card payment failed')
        return
      }
      if (paymentIntent?.status === 'succeeded') {
        toast.success('Payment received. Thanks!')
        // Webhook flips the target row server-side.
        onPaid?.()
      }
    } catch (e) {
      setErr(e?.message || 'Card payment failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition"
      >
        {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
        Confirm card payment
      </button>
    </form>
  )
}

// ─── M-Pesa paste panel ────────────────────────────────────────────────────

function MpesaPanel({ payment, paybill, account, amountDueKes, onSubmitted }) {
  const [sms, setSms] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)

  async function submit() {
    setSubmitting(true)
    setErr(null)
    try {
      await paymentsApi.submitMpesaConfirmation(payment.id, sms.trim())
      toast.success('Submitted — an admin will review your payment shortly.')
      onSubmitted?.()
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  function copy(value) {
    navigator.clipboard?.writeText(value)
    toast.success(`${value} copied`)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 p-5 space-y-3 bg-slate-50/50">
        <Detail label="Till" value={paybill} onCopy={() => copy(paybill)} />
        <Detail label="Reference" value={account} onCopy={() => copy(account)} />
        <Detail label="Amount" value={`KES ${fmt(amountDueKes)}`} />
        <p className="text-xs text-slate-500 leading-relaxed pt-1">
          On your phone: Lipa na M-Pesa → Buy Goods and Services → Till{' '}
          <strong>{paybill}</strong> → enter the amount above → put the
          reference in the account number field.
        </p>
      </div>

      <div>
        <label className="text-xs font-black uppercase tracking-widest text-slate-500">
          M-Pesa SMS confirmation
        </label>
        <p className="text-[10px] text-slate-400 mb-2">
          Paste the full SMS — must include the 10-character reference and the
          Ksh amount.
        </p>
        <textarea
          value={sms}
          onChange={(e) => setSms(e.target.value)}
          rows={5}
          placeholder="TI82A4XYZ1 Confirmed. Ksh1500 sent to THAPSUS CARGO 5530500..."
          className="w-full p-3 rounded-2xl border border-slate-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-200 outline-none resize-none text-sm font-mono"
        />
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      <button
        onClick={submit}
        disabled={submitting || sms.trim().length < 20}
        className="w-full py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition"
      >
        {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
        Submit for review
      </button>
    </div>
  )
}

function Detail({ label, value, onCopy }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono font-bold text-sm text-[#0f172a]">{value}</span>
        {onCopy && (
          <button onClick={onCopy} className="p-1.5 hover:bg-slate-200 rounded-md text-orange-600 transition">
            <Copy size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
