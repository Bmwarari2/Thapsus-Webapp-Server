// AccountDeletion.jsx
// Customer-initiated account deletion with a 14-day cooldown window.
// Mirror of iOS AccountDeletionView (see thapsus-v1.1/iosApp/iosApp/Features/
// AccountDeletionView.swift). Backend is routes/accountDeletion.js.
//
// Four UI states, switched on the server's `status` field:
//   idle      — no active request → explain + "Start deletion" CTA
//   active    — within the 14-day cooldown → countdown + cancel + export link
//   cancelled — most recent request was cancelled → "previous request" + restart
//   completed — request fulfilled → terminal "your account is gone" message

import React, { useEffect, useState } from 'react'
import {
  Trash2, ShieldAlert, Download, X, Loader2, AlertTriangle,
  CheckCircle2, RotateCcw, Mail, Clock,
} from 'lucide-react'
import { accountDeletionApi } from '../api'
import toast from 'react-hot-toast'

const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '—'

export const AccountDeletion = () => {
  const [loading, setLoading] = useState(true)
  const [request, setRequest] = useState(null)        // server-shaped row, or null
  const [actionInFlight, setActionInFlight] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState(null)

  const fetchStatus = async () => {
    try {
      setLoading(true)
      setError(null)
      const r = await accountDeletionApi.status()
      setRequest(r.data?.request || null)
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load deletion status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStatus() }, [])

  async function handleRequest() {
    setActionInFlight(true)
    try {
      const r = await accountDeletionApi.request()
      setRequest(r.data?.request || null)
      setConfirmOpen(false)
      toast.success('Deletion scheduled. Check your email for the data export.')
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to schedule deletion')
    } finally { setActionInFlight(false) }
  }

  async function handleCancel() {
    if (!window.confirm('Cancel your scheduled account deletion? Your account stays as-is.')) return
    setActionInFlight(true)
    try {
      await accountDeletionApi.cancel()
      toast.success('Deletion cancelled.')
      fetchStatus()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to cancel')
    } finally { setActionInFlight(false) }
  }

  async function handleRefreshExport() {
    setActionInFlight(true)
    try {
      const r = await accountDeletionApi.refreshExport()
      setRequest(r.data?.request || null)
      toast.success('Download link refreshed.')
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to refresh link')
    } finally { setActionInFlight(false) }
  }

  // Derive the active state. The server returns null when there's no row, or
  // a shaped row with status pending|cancelled|completed.
  const status = !request ? 'idle' : request.status

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 pb-24">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-12">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-[10px] font-black uppercase tracking-[0.3em] text-red-700 mb-4">
            <ShieldAlert size={12} /> Account closure
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-[#0f172a] tracking-tighter uppercase leading-none mb-4">
            Delete my account
          </h1>
          <p className="text-slate-500 font-bold leading-relaxed text-sm md:text-base max-w-2xl">
            Closing your account starts a 14-day cooldown. We'll email you a copy of everything we hold on you as a single HTML file — keep it for your records.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-orange-500" />
          </div>
        )}

        {!loading && error && (
          <div className="flex gap-3 p-5 rounded-2xl bg-red-50 border border-red-200 text-red-700">
            <AlertTriangle size={22} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-sm uppercase tracking-widest">Couldn't load</p>
              <p className="text-xs mt-1">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && status === 'idle'      && <IdleView    onStart={() => setConfirmOpen(true)} />}
        {!loading && !error && status === 'pending'   && <ActiveView  request={request} onCancel={handleCancel} onRefreshExport={handleRefreshExport} actionInFlight={actionInFlight} />}
        {!loading && !error && status === 'cancelled' && <CancelledView request={request} onRestart={() => setConfirmOpen(true)} />}
        {!loading && !error && status === 'completed' && <CompletedView />}

        {confirmOpen && (
          <ConfirmModal
            inFlight={actionInFlight}
            onCancel={() => setConfirmOpen(false)}
            onConfirm={handleRequest}
          />
        )}
      </div>
    </div>
  )
}

// ─── Sub-views ──────────────────────────────────────────────────────────────

function IdleView({ onStart }) {
  return (
    <div className="space-y-6">
      <Card title="What gets deleted" icon={<Trash2 size={18} />}>
        <Bullet>Profile, contact details, delivery addresses.</Bullet>
        <Bullet>Order history, parcel tracking, consolidations and Buy-for-me orders.</Bullet>
        <Bullet>Support tickets and notifications.</Bullet>
        <Bullet>Saved payment provider references (anonymised, not full card numbers — those are never stored).</Bullet>
      </Card>

      <Card title="What stays" icon={<ShieldAlert size={18} />}>
        <Bullet>Payment-proof artefacts (M-Pesa SMS contents, payer phone, Stripe IDs) are not included in the export and are retained for accounting / fraud audit per UK MLR 2017.</Bullet>
        <Bullet>Anonymised aggregate analytics (no personal identifiers).</Bullet>
      </Card>

      <Card title="What happens next" icon={<Clock size={18} />}>
        <Bullet>You start a 14-day cooldown. Nothing is deleted until day 15.</Bullet>
        <Bullet>We email you an HTML export of your data immediately.</Bullet>
        <Bullet>You can cancel at any time during the cooldown — your account stays exactly as-is.</Bullet>
      </Card>

      <button
        onClick={onStart}
        className="w-full py-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition shadow-lg"
      >
        <Trash2 size={18} /> Start 14-day deletion cooldown
      </button>
    </div>
  )
}

function ActiveView({ request, onCancel, onRefreshExport, actionInFlight }) {
  const days = request.days_remaining ?? 0
  return (
    <div className="space-y-6">
      <div className="rounded-3xl p-6 md:p-8 bg-amber-50 border-2 border-amber-300">
        <div className="flex items-center gap-3 mb-2">
          <Clock size={22} className="text-amber-700" />
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Cooldown active</p>
        </div>
        <p className="text-4xl md:text-5xl font-black text-[#0f172a] tracking-tighter mb-2">
          {days} {days === 1 ? 'day' : 'days'} remaining
        </p>
        <p className="text-sm text-slate-600 font-bold leading-relaxed">
          Your account will be permanently deleted on{' '}
          <strong>{fmtDate(request.scheduled_deletion_at)}</strong>. Cancel any time before then to keep your account.
        </p>
      </div>

      <Card title="Data export" icon={<Mail size={18} />}>
        <Bullet>Requested {fmtDate(request.requested_at)}</Bullet>
        {request.export_emailed_at && <Bullet>Email sent {fmtDate(request.export_emailed_at)}</Bullet>}
        {request.export_url_expires_at && (
          <Bullet>Download link expires {fmtDate(request.export_url_expires_at)}</Bullet>
        )}
        <div className="pt-3 flex flex-col sm:flex-row gap-3">
          {request.export_signed_url ? (
            <a
              href={request.export_signed_url}
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-3.5 rounded-2xl bg-[#0f172a] hover:bg-slate-800 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition"
            >
              <Download size={16} /> Download HTML export
            </a>
          ) : (
            <p className="flex-1 text-xs text-slate-500 font-bold py-3.5">
              Export wasn't generated — refresh the link below.
            </p>
          )}
          <button
            onClick={onRefreshExport}
            disabled={actionInFlight}
            className="py-3.5 px-5 rounded-2xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            {actionInFlight ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
            Refresh link
          </button>
        </div>
      </Card>

      <button
        onClick={onCancel}
        disabled={actionInFlight}
        className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition shadow-lg"
      >
        {actionInFlight ? <Loader2 size={18} className="animate-spin" /> : <X size={18} />}
        Cancel deletion — keep my account
      </button>
    </div>
  )
}

function CancelledView({ request, onRestart }) {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl p-6 md:p-8 bg-slate-100 border border-slate-200">
        <div className="flex items-center gap-3 mb-3">
          <X size={22} className="text-slate-500" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Previous request cancelled</p>
        </div>
        <p className="text-sm text-slate-700 font-bold leading-relaxed">
          You cancelled a deletion request on <strong>{fmtDate(request.cancelled_at)}</strong>. Your account is active and unchanged.
        </p>
        {request.cancel_reason && (
          <p className="text-xs text-slate-500 font-bold mt-2 italic">"{request.cancel_reason}"</p>
        )}
      </div>

      <button
        onClick={onRestart}
        className="w-full py-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition shadow-lg"
      >
        <Trash2 size={18} /> Start a new 14-day deletion cooldown
      </button>
    </div>
  )
}

function CompletedView() {
  return (
    <div className="rounded-3xl p-8 md:p-10 bg-green-50 border-2 border-green-300 text-center">
      <CheckCircle2 size={48} className="text-green-600 mx-auto mb-4" />
      <p className="text-2xl md:text-3xl font-black text-[#0f172a] tracking-tighter uppercase mb-3">
        Account deleted
      </p>
      <p className="text-sm text-slate-600 font-bold leading-relaxed max-w-md mx-auto">
        Your account and personal data have been removed. If you signed in to see this page, you'll be signed out shortly.
      </p>
    </div>
  )
}

// ─── Re-usable bits ─────────────────────────────────────────────────────────

function Card({ title, icon, children }) {
  return (
    <div className="rounded-3xl bg-white border border-slate-200 p-6 md:p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 bg-orange-100 text-orange-700 rounded-xl">{icon}</div>
        <h3 className="text-base md:text-lg font-black text-[#0f172a] uppercase tracking-tight">{title}</h3>
      </div>
      <ul className="space-y-2.5">{children}</ul>
    </div>
  )
}

function Bullet({ children }) {
  return (
    <li className="flex gap-3 text-sm text-slate-700 leading-relaxed">
      <span className="mt-2 w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
      <span>{children}</span>
    </li>
  )
}

function ConfirmModal({ inFlight, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm grid place-items-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
        <div className="p-6">
          <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mb-5 mx-auto">
            <AlertTriangle size={28} className="text-red-600" />
          </div>
          <h2 className="text-2xl font-black text-[#0f172a] tracking-tight text-center mb-3">
            Are you sure?
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed text-center mb-6">
            You're about to start a <strong>14-day cooldown</strong>. We'll email you a copy of your data immediately. You can cancel at any time before the deletion runs.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={inFlight}
              className="flex-1 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-black uppercase tracking-widest text-xs transition"
            >
              Back
            </button>
            <button
              onClick={onConfirm}
              disabled={inFlight}
              className="flex-1 py-3.5 rounded-2xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition"
            >
              {inFlight ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Schedule deletion
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
