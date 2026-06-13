// Invoices.jsx
// Customer-facing invoices archive. Mirror of iOS CustomerInvoicesView.
// Lists customer_consolidations split into:
//   • Active — status === 'invoiced' (customer must pay these)
//   • Past   — status === 'paid' || status === 'shipped' (kept for records)
// Rows in the Active section open the PayInvoiceModal.

import React, { useEffect, useState, useCallback } from 'react'
import { FileText, CheckCircle2, Plane, Clock, Loader2 } from 'lucide-react'
import { customerInvoicesApi } from '../api'
import { PayInvoiceModal } from '../components/PayInvoiceModal'
import toast from 'react-hot-toast'

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric',
}) : '—'

const fmtAmount = (cc) => {
  const amount = Number(cc.invoice_amount || 0)
  const currency = cc.invoice_currency || 'KES'
  return `${currency} ${amount.toLocaleString()}`
}

export const Invoices = () => {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [error, setError] = useState(null)
  const [payTarget, setPayTarget] = useState(null) // { id, title, amount_kes }

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const r = await customerInvoicesApi.listMine()
      setRows(r.data?.customer_consolidations || [])
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load invoices')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Active = invoiced & awaiting payment. Past = paid or shipped.
  // Pending (no invoice issued yet) doesn't surface here — there's
  // nothing for the customer to act on. Matches iOS bucketing.
  const active = rows
    .filter(r => r.status === 'invoiced')
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  const past = rows
    .filter(r => r.status === 'paid' || r.status === 'shipped')
    .sort((a, b) =>
      (b.invoice_paid_at || b.updated_at || '').localeCompare(a.invoice_paid_at || a.updated_at || '')
    )

  function openPay(cc) {
    setPayTarget({
      id: cc.id,
      title: `Invoice · ${cc.parcel_count || 0} parcel${cc.parcel_count === 1 ? '' : 's'}`,
      amount_kes: Number(cc.invoice_amount || 0),
    })
  }

  return (
    <div className="min-h-screen bg-transparent font-sans text-white pb-24">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-12">

        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-ember-500/10 border border-ember-500/25 text-[10px] font-black uppercase tracking-[0.3em] text-ember-400 mb-4">
            <FileText size={12} /> Activity
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase leading-none mb-3">
            Invoices
          </h1>
          <p className="text-mute font-bold leading-relaxed text-sm md:text-base max-w-2xl">
            Active charges to clear, plus everything you've already paid.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-ember-400" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 p-5 font-bold text-sm">{error}</div>
        )}

        {!loading && !error && active.length === 0 && past.length === 0 && (
          <div className="rounded-3xl bg-surface border border-line p-8 md:p-10 text-center shadow-sm">
            <p className="font-black text-lg text-white mb-2">No invoices yet</p>
            <p className="text-sm text-mute font-bold leading-relaxed max-w-md mx-auto">
              Once admin issues an invoice for one of your consolidations or a standalone charge, it'll appear here.
            </p>
          </div>
        )}

        {!loading && !error && active.length > 0 && (
          <section className="mb-10">
            <SectionHeader
              eyebrow={active.length === 1 ? 'Invoice due' : `${active.length} invoices due`}
              title="Active"
              subtitle="Pay these to clear your batch for the next outgoing shipment."
              tone="action"
            />
            <div className="space-y-3 mt-4">
              {active.map(cc => (
                <ActiveInvoiceCard key={cc.id} cc={cc} onPay={() => openPay(cc)} />
              ))}
            </div>
          </section>
        )}

        {!loading && !error && past.length > 0 && (
          <section>
            <SectionHeader
              eyebrow={`${past.length} settled`}
              title="Past invoices"
              subtitle="Paid + shipped — kept here for your records."
              tone="neutral"
            />
            <div className="space-y-3 mt-4">
              {past.map(cc => (
                <PastInvoiceCard key={cc.id} cc={cc} />
              ))}
            </div>
          </section>
        )}
      </div>

      <PayInvoiceModal
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        targetKind="consolidation"
        targetId={payTarget?.id}
        targetTitle={payTarget?.title}
        amountKesGross={payTarget?.amount_kes || 0}
        onPaid={() => { setPayTarget(null); fetchData() }}
      />
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SectionHeader({ eyebrow, title, subtitle, tone = 'neutral' }) {
  const pill = tone === 'action'
    ? 'bg-ember-500/10 text-ember-400 border-ember-500/25'
    : 'bg-white/[0.05] text-mute border-line'
  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-2">
        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.3em] border ${pill}`}>
          {eyebrow}
        </span>
      </div>
      <h2 className="text-2xl md:text-3xl font-black text-white tracking-tighter uppercase">{title}</h2>
      <p className="text-xs md:text-sm text-mute font-bold mt-1">{subtitle}</p>
    </div>
  )
}

function ActiveInvoiceCard({ cc, onPay }) {
  return (
    <div className="rounded-3xl bg-surface border-2 border-ember-500/25 p-5 md:p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-ember-400 mb-1">Invoiced</p>
          <p className="font-black text-2xl text-white tracking-tighter font-mono">{fmtAmount(cc)}</p>
          <p className="text-xs text-mute font-bold mt-1">
            {cc.parcel_count || 0} parcel{cc.parcel_count === 1 ? '' : 's'} · issued {fmtDate(cc.created_at)}
          </p>
        </div>
        <button
          onClick={onPay}
          className="shrink-0 px-5 py-3 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black uppercase tracking-widest text-xs shadow-md transition-colors"
        >
          Pay now
        </button>
      </div>
      {cc.notes && (
        <p className="text-xs text-mute font-medium italic mt-2 pt-3 border-t border-line">{cc.notes}</p>
      )}
    </div>
  )
}

function PastInvoiceCard({ cc }) {
  const isShipped = cc.status === 'shipped'
  return (
    <div className="rounded-3xl bg-surface border border-line p-5 md:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isShipped ? 'bg-blue-500/10 text-blue-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
            {isShipped ? <Plane size={18} /> : <CheckCircle2 size={18} />}
          </div>
          <div className="min-w-0">
            <p className="font-black text-base text-white truncate">{fmtAmount(cc)}</p>
            <p className="text-xs text-mute font-bold mt-0.5">
              {cc.parcel_count || 0} parcel{cc.parcel_count === 1 ? '' : 's'} · {isShipped ? 'attached to shipping' : `paid ${fmtDate(cc.invoice_paid_at || cc.updated_at)}`}
            </p>
          </div>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${isShipped ? 'bg-blue-500/10 text-blue-300 border-blue-500/20' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'}`}>
          {isShipped ? <Plane size={10} /> : <CheckCircle2 size={10} />}
          {cc.status}
        </span>
      </div>
    </div>
  )
}
