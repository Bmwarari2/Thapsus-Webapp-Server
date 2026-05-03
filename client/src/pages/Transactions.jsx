// Transactions.jsx
// Customer transaction history — paginated payments + credit ledger.
// Replaces the old wallet "transactions" view with a unified list backed by
// the new `payments` and `credit_ledger` tables (server PR 2 endpoints).

import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CreditCard, Smartphone, Gift, RotateCcw, ReceiptText } from 'lucide-react'
import { paymentsApi } from '../api'
import { useCreditUpdates } from '../hooks/useRealtimeUpdates'

const PAGE_SIZE = 20

const fmtKes = (n) => Number(n || 0).toLocaleString()
const fmtDate = (iso) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  } catch { return '—' }
}

const STATUS_STYLE = {
  paid:            { label: 'Paid',            klass: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  pending:         { label: 'Pending',         klass: 'bg-amber-50  text-amber-700  ring-amber-100' },
  awaiting_review: { label: 'Awaiting review', klass: 'bg-amber-50  text-amber-700  ring-amber-100' },
  failed:          { label: 'Failed',          klass: 'bg-rose-50   text-rose-700   ring-rose-100' },
  rejected:        { label: 'Rejected',        klass: 'bg-rose-50   text-rose-700   ring-rose-100' },
  cancelled:       { label: 'Cancelled',       klass: 'bg-slate-100 text-slate-600  ring-slate-200' },
}

const TARGET_LABEL = {
  order:         'Order',
  consolidation: 'Shipping invoice',
  buy_for_me:    'Buy-for-me',
}

export function Transactions() {
  const [tab, setTab] = useState('payments') // 'payments' | 'credit'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50/40 px-4 sm:px-8 py-12">
      <div className="max-w-3xl mx-auto">
        <Link to="/credit" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#0f172a] mb-6">
          <ArrowLeft size={16} /> Back to credit
        </Link>
        <p className="text-[10px] font-black uppercase tracking-widest text-orange-600 mb-3">History</p>
        <h1 className="text-4xl sm:text-5xl font-black text-[#0f172a] tracking-tighter mb-2">Transactions</h1>
        <p className="text-slate-500 text-sm mb-8">
          Every card or M-Pesa payment, plus your credit activity.
        </p>

        <div className="inline-flex p-1 rounded-full bg-slate-100 mb-8">
          <TabButton active={tab === 'payments'} onClick={() => setTab('payments')}>Payments</TabButton>
          <TabButton active={tab === 'credit'}   onClick={() => setTab('credit')}>Credit</TabButton>
        </div>

        {tab === 'payments' ? <PaymentsList /> : <CreditList />}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-full transition-colors ${
        active ? 'bg-white text-[#0f172a] shadow-sm' : 'text-slate-500 hover:text-[#0f172a]'
      }`}
    >
      {children}
    </button>
  )
}

function PaymentsList() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset]   = useState(0)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState(null)

  const load = useCallback(async (reset = false) => {
    setLoading(true)
    setError(null)
    try {
      const nextOffset = reset ? 0 : offset
      const r = await paymentsApi.list({ limit: PAGE_SIZE, offset: nextOffset })
      const next = r.data?.payments ?? []
      setRows(prev => reset ? next : [...prev, ...next])
      setOffset(nextOffset + next.length)
      setDone(next.length < PAGE_SIZE)
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load payments')
    } finally {
      setLoading(false)
    }
  }, [offset])

  useEffect(() => { load(true) /* eslint-disable-next-line */ }, [])

  if (error) return <ErrorBanner message={error} onRetry={() => load(true)} />
  if (loading && rows.length === 0) return <LoadingSkeleton />
  if (!loading && rows.length === 0) return <EmptyState
    icon={<ReceiptText size={28} />}
    title="No payments yet"
    body="Once you pay an invoice or accept a Buy-for-me quote, it'll show up here."
  />

  return (
    <>
      <ul className="space-y-3">
        {rows.map(p => <PaymentRow key={p.id} p={p} />)}
      </ul>
      {!done && (
        <button
          onClick={() => load(false)}
          disabled={loading}
          className="mt-6 w-full rounded-2xl bg-white border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  )
}

function PaymentRow({ p }) {
  const styled  = STATUS_STYLE[p.status] ?? { label: p.status, klass: 'bg-slate-100 text-slate-600 ring-slate-200' }
  const targetTitle = TARGET_LABEL[p.target_kind] || p.target_kind
  const Icon = p.method === 'stripe' ? CreditCard : Smartphone
  const methodLabel = p.method === 'stripe' ? 'Card' : 'M-Pesa'
  const reference = p.method === 'stripe' ? p.stripe_payment_intent_id : p.mpesa_reference

  return (
    <li className="bg-white/70 backdrop-blur rounded-3xl border border-slate-200 shadow-sm p-5 flex gap-4">
      <div className="p-3 rounded-2xl bg-slate-50 text-[#0f172a] flex-shrink-0">
        <Icon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {targetTitle} · {methodLabel}
            </p>
            <p className="font-bold text-[#0f172a] truncate">
              {p.target_label || p.target_id}
            </p>
          </div>
          <div className="text-right">
            <p className="font-black text-[#0f172a] tracking-tight">KES {fmtKes(p.amount_due_kes)}</p>
            <span className={`mt-1 inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${styled.klass}`}>
              {styled.label}
            </span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>{fmtDate(p.paid_at || p.created_at)}</span>
          {p.amount_credit_kes > 0 && (
            <span className="text-emerald-600 font-semibold">
              − KES {fmtKes(p.amount_credit_kes)} credit
            </span>
          )}
          {p.stripe_amount_pence_gbp > 0 && (
            <span>£{(p.stripe_amount_pence_gbp / 100).toFixed(2)}</span>
          )}
          {reference && <span className="font-mono truncate">{reference}</span>}
        </div>
        {p.rejection_reason && (
          <p className="mt-2 text-xs text-rose-600">Rejected: {p.rejection_reason}</p>
        )}
      </div>
    </li>
  )
}

function CreditList() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset]   = useState(0)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState(null)

  const load = useCallback(async (reset = false) => {
    setLoading(true)
    setError(null)
    try {
      const nextOffset = reset ? 0 : offset
      const r = await paymentsApi.creditLedger({ limit: PAGE_SIZE, offset: nextOffset })
      const next = r.data?.entries ?? []
      setRows(prev => reset ? next : [...prev, ...next])
      setOffset(nextOffset + next.length)
      setDone(next.length < PAGE_SIZE)
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load credit ledger')
    } finally {
      setLoading(false)
    }
  }, [offset])

  useEffect(() => { load(true) /* eslint-disable-next-line */ }, [])
  useCreditUpdates(() => { load(true) })

  if (error) return <ErrorBanner message={error} onRetry={() => load(true)} />
  if (loading && rows.length === 0) return <LoadingSkeleton />
  if (!loading && rows.length === 0) return <EmptyState
    icon={<Gift size={28} />}
    title="No credit activity yet"
    body="Refer a friend to earn KES 50 of credit on their first paid order."
  />

  return (
    <>
      <ul className="space-y-3">
        {rows.map(e => <CreditRow key={e.id} e={e} />)}
      </ul>
      {!done && (
        <button
          onClick={() => load(false)}
          disabled={loading}
          className="mt-6 w-full rounded-2xl bg-white border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  )
}

function CreditRow({ e }) {
  const positive = (e.delta_kes ?? 0) > 0
  const Icon = {
    referral:         Gift,
    consumed_payment: CreditCard,
    refund:           RotateCcw,
    manual:           ReceiptText,
  }[e.reason] || ReceiptText

  const reasonLabel = {
    referral:         'Referral reward',
    consumed_payment: 'Applied to payment',
    refund:           'Refund',
    manual:           'Manual adjustment',
  }[e.reason] || e.reason

  return (
    <li className="bg-white/70 backdrop-blur rounded-3xl border border-slate-200 shadow-sm p-5 flex gap-4">
      <div className={`p-3 rounded-2xl flex-shrink-0 ${positive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-700'}`}>
        <Icon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <p className="font-bold text-[#0f172a]">{reasonLabel}</p>
          <p className={`font-black tracking-tight ${positive ? 'text-emerald-600' : 'text-[#0f172a]'}`}>
            {positive ? '+' : '−'} KES {fmtKes(Math.abs(e.delta_kes))}
          </p>
        </div>
        {e.note && <p className="mt-1 text-xs text-slate-500">{e.note}</p>}
        <p className="mt-2 text-xs text-slate-400">{fmtDate(e.created_at)}</p>
      </div>
    </li>
  )
}

function EmptyState({ icon, title, body }) {
  return (
    <div className="bg-white/70 backdrop-blur rounded-[2.5rem] border border-slate-200 shadow-sm p-12 text-center">
      <div className="inline-flex p-4 rounded-2xl bg-slate-50 text-slate-500 mb-4">{icon}</div>
      <h3 className="text-lg font-black text-[#0f172a]">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <ul className="space-y-3">
      {[0, 1, 2].map(i => (
        <li key={i} className="bg-white/70 backdrop-blur rounded-3xl border border-slate-200 shadow-sm p-5 h-24 animate-pulse" />
      ))}
    </ul>
  )
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 flex items-center justify-between">
      <p className="text-sm font-medium">{message}</p>
      <button onClick={onRetry} className="text-xs font-bold text-rose-700 underline">Retry</button>
    </div>
  )
}
