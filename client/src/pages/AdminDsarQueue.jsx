// AdminDsarQueue.jsx
// /admin/dsar — admin surface for processing GDPR/DPA-2018 DSAR requests
// (export + erasure). Backed by routes/dsar.js. Customer-side submission
// flow lives at /dsar (DsarRequest.jsx).

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, Database, Download, AlertTriangle, RefreshCw,
  CheckCircle2, XCircle, Loader2, Clock, FileJson, UserMinus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { dsarApi } from '../api'

// Visual style per status — kept in sync with the server enum
// ('open', 'in_progress', 'fulfilled', 'rejected') from routes/dsar.js.
const STATUS_STYLE = {
  open:         { label: 'Open',        klass: 'bg-amber-50  text-amber-700  ring-amber-100' },
  in_progress:  { label: 'In progress', klass: 'bg-blue-50   text-blue-700   ring-blue-100' },
  fulfilled:    { label: 'Fulfilled',   klass: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  rejected:     { label: 'Rejected',    klass: 'bg-rose-50   text-rose-700   ring-rose-100' },
}

const TYPE_STYLE = {
  export:  { label: 'Export', icon: FileJson },
  erasure: { label: 'Erasure', icon: UserMinus },
}

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  } catch { return '—' }
}

// Returns true when due_at is past now. The queue endpoint only returns
// open + in_progress, so this lets the admin spot tickets approaching or
// past their statutory deadline.
function isOverdue(iso) {
  if (!iso) return false
  const ts = new Date(iso).getTime()
  return Number.isFinite(ts) && ts < Date.now()
}

export function AdminDsarQueue() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading]   = useState(true)
  const [busyId, setBusyId]     = useState(null)
  const [rejectFor, setRejectFor] = useState(null)
  const [rejectNotes, setRejectNotes] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await dsarApi.queue()
      setRequests(r.data?.requests || [])
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load DSAR queue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Sort by overdue first, then by due_at ascending. Server already sorts
  // by due_at but we lift overdue to the top because it's the actionable
  // bucket admins need to see first.
  const sorted = useMemo(() => {
    return [...requests].sort((a, b) => {
      const aOver = isOverdue(a.due_at) ? 0 : 1
      const bOver = isOverdue(b.due_at) ? 0 : 1
      if (aOver !== bOver) return aOver - bOver
      return new Date(a.due_at || a.created_at).getTime() - new Date(b.due_at || b.created_at).getTime()
    })
  }, [requests])

  const onPickUp = async (req) => {
    if (busyId) return
    setBusyId(req.id)
    try {
      await dsarApi.update(req.id, { status: 'in_progress' })
      toast.success('Picked up')
      refresh()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update DSAR')
    } finally {
      setBusyId(null)
    }
  }

  const onExportAndFulfil = async (req) => {
    if (busyId) return
    if (req.type !== 'export') {
      toast.error('Only export-type DSARs can use the email-export action')
      return
    }
    setBusyId(req.id)
    try {
      // POST /:id/export builds the JSON blob, emails it to the
      // customer, AND flips status to 'fulfilled' server-side, so we
      // don't need to follow with a separate PATCH.
      await dsarApi.export(req.id)
      toast.success('Export emailed and DSAR marked fulfilled')
      refresh()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to export DSAR')
    } finally {
      setBusyId(null)
    }
  }

  const onMarkFulfilled = async (req) => {
    if (busyId) return
    setBusyId(req.id)
    try {
      await dsarApi.update(req.id, { status: 'fulfilled' })
      toast.success('Marked fulfilled')
      refresh()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update DSAR')
    } finally {
      setBusyId(null)
    }
  }

  const onConfirmReject = async () => {
    if (!rejectFor) return
    if (!rejectNotes.trim()) {
      toast.error('Please record why this request is being rejected')
      return
    }
    setBusyId(rejectFor.id)
    try {
      await dsarApi.update(rejectFor.id, { status: 'rejected', notes: rejectNotes.trim() })
      toast.success('DSAR rejected')
      setRejectFor(null)
      setRejectNotes('')
      refresh()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to reject DSAR')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50/40 px-4 sm:px-8 py-12">
      <div className="max-w-5xl mx-auto">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#0f172a] mb-6">
          <ArrowLeft size={16} /> Back to admin
        </Link>

        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-600 mb-3 inline-flex items-center gap-2">
              <Database size={12} /> Compliance
            </p>
            <h1 className="text-4xl sm:text-5xl font-black text-[#0f172a] tracking-tighter mb-2">
              DSAR queue
            </h1>
            <p className="text-slate-500 text-sm">
              Open and in-progress data-subject requests under GDPR / DPA 2018.
              Statutory deadline is 30 days; overdue rows surface at the top.
            </p>
          </div>

          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
            <Loader2 size={18} className="animate-spin" /> Loading queue…
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 px-6 py-16 text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
              <CheckCircle2 size={20} />
            </div>
            <p className="text-base font-bold text-slate-700">Queue is empty</p>
            <p className="text-sm text-slate-500 mt-1">
              No outstanding data-subject requests right now.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {sorted.map((req) => {
              const overdue = isOverdue(req.due_at)
              const status  = STATUS_STYLE[req.status] || STATUS_STYLE.open
              const typeMeta = TYPE_STYLE[req.type] || { label: req.type, icon: FileJson }
              const TypeIcon = typeMeta.icon
              const busy = busyId === req.id
              return (
                <li key={req.id}
                  className={[
                    'rounded-2xl bg-white ring-1 transition',
                    overdue ? 'ring-rose-200 shadow-[0_0_0_1px_rgba(244,63,94,0.05)]' : 'ring-slate-200',
                  ].join(' ')}
                >
                  <div className="p-4 sm:p-5 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={['inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ring-1', status.klass].join(' ')}>
                          {status.label}
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ring-1 bg-slate-50 text-slate-700 ring-slate-200">
                          <TypeIcon size={11} /> {typeMeta.label}
                        </span>
                        {overdue && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ring-1 bg-rose-50 text-rose-700 ring-rose-200">
                            <AlertTriangle size={11} /> Overdue
                          </span>
                        )}
                      </div>
                      <p className="text-base font-semibold text-slate-900 truncate">
                        {req.name || '—'} <span className="text-slate-400 font-normal">·</span>{' '}
                        <span className="text-slate-600 font-mono text-sm">{req.email || '—'}</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                        <span className="inline-flex items-center gap-1"><Clock size={11} /> Submitted {fmtDate(req.created_at)}</span>
                        <span className={overdue ? 'text-rose-600 font-semibold' : ''}>
                          Due {fmtDate(req.due_at)}
                        </span>
                      </p>
                      {req.notes && (
                        <p className="text-xs text-slate-600 mt-2 italic line-clamp-2">{req.notes}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 shrink-0">
                      {req.status === 'open' && (
                        <button onClick={() => onPickUp(req)} disabled={busy}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 text-sm font-bold hover:bg-blue-100 disabled:opacity-50">
                          {busy ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
                          Pick up
                        </button>
                      )}
                      {req.type === 'export' && (
                        <button onClick={() => onExportAndFulfil(req)} disabled={busy}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 disabled:opacity-50">
                          {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                          Export &amp; email
                        </button>
                      )}
                      {req.type === 'erasure' && req.status !== 'fulfilled' && (
                        <button onClick={() => onMarkFulfilled(req)} disabled={busy}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 disabled:opacity-50">
                          {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          Mark fulfilled
                        </button>
                      )}
                      <button onClick={() => { setRejectFor(req); setRejectNotes('') }} disabled={busy}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50 disabled:opacity-50">
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Reject modal */}
      {rejectFor && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
                  <XCircle size={18} />
                </div>
                <div>
                  <p className="text-base font-bold text-slate-900">Reject DSAR</p>
                  <p className="text-xs text-slate-500">{rejectFor.email}</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Note the reason for rejection — it stays on the record and is required so an audit
                can review the decision later.
              </p>
              <textarea
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                rows={4}
                placeholder="e.g. Identity verification failed; re-issued IDV email."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 px-6 pb-6">
              <button onClick={() => { setRejectFor(null); setRejectNotes('') }}
                disabled={busyId === rejectFor.id}
                className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={onConfirmReject} disabled={busyId === rejectFor.id || !rejectNotes.trim()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500 text-white text-sm font-bold hover:bg-rose-600 disabled:opacity-50">
                {busyId === rejectFor.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                Confirm reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
