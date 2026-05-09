// Notifications.jsx
// Customer-facing inbox for /api/notifications. Mirrors the iOS app's
// NotificationInbox surface so the same audience can pick up either
// device and see the same unread badge resolve.

import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Bell, BellOff, CheckCheck, Loader2, Package, ReceiptText, KeyRound, ShoppingBag } from 'lucide-react'
import toast from 'react-hot-toast'
import { notificationsApi } from '../api'

const PAGE_SIZE = 50

// Lightweight relative-time helper. Avoids pulling in date-fns just for one
// label; the inbox is the only consumer.
function fmtRelative(iso) {
  if (!iso) return ''
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (diffSec < 60)            return 'just now'
  if (diffSec < 3_600)         return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86_400)        return `${Math.floor(diffSec / 3_600)}h ago`
  if (diffSec < 7 * 86_400)    return `${Math.floor(diffSec / 86_400)}d ago`
  // Older than a week → drop to a date label so the relative number stops
  // being meaningful.
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

// Pick an icon based on keywords in the message. The notifications.type
// column is uniformly 'in_app' across the codebase, so the keyword
// fallback is the only signal we have to differentiate row visuals.
function iconForMessage(message = '') {
  const m = message.toLowerCase()
  if (m.includes('otp'))                              return KeyRound
  if (m.includes('payment') || m.includes('invoice')) return ReceiptText
  if (m.includes('buy for me') || m.includes('quote')) return ShoppingBag
  if (m.includes('parcel') || m.includes('delivery'))  return Package
  return Bell
}

export function Notifications() {
  const [items, setItems]       = useState([])
  const [unread, setUnread]     = useState(0)
  const [loading, setLoading]   = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [markingAll, setMarkingAll]   = useState(false)
  const [hasMore, setHasMore]   = useState(false)
  const [offset, setOffset]     = useState(0)

  const fetchPage = useCallback(async (cursor = 0, replace = false) => {
    if (cursor === 0) setLoading(true); else setLoadingMore(true)
    try {
      const r = await notificationsApi.list({ limit: PAGE_SIZE, offset: cursor })
      const next = r.data?.notifications || []
      setItems((prev) => (replace ? next : [...prev, ...next]))
      setUnread(r.data?.unread || 0)
      setHasMore(next.length === PAGE_SIZE)
      setOffset(cursor + next.length)
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load notifications')
    } finally {
      if (cursor === 0) setLoading(false); else setLoadingMore(false)
    }
  }, [])

  useEffect(() => { fetchPage(0, true) }, [fetchPage])

  const onMarkOne = async (id) => {
    // Optimistic — the API rarely fails and the visual feedback shouldn't
    // wait on the round-trip.
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n))
    setUnread((u) => Math.max(0, u - 1))
    try {
      await notificationsApi.markRead(id)
    } catch (err) {
      // Roll back the optimistic flip if the server says no.
      setItems((prev) => prev.map((n) => n.id === id ? { ...n, is_read: false } : n))
      setUnread((u) => u + 1)
      toast.error('Failed to mark as read')
    }
  }

  const onMarkAll = async () => {
    if (markingAll || unread === 0) return
    setMarkingAll(true)
    const snapshot = items
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnread(0)
    try {
      await notificationsApi.markAllRead()
      toast.success('All caught up')
    } catch (err) {
      setItems(snapshot)
      // Best-effort recount: leave unread as-is so the user sees the
      // failure surface. The next fetch will recover the truth.
      toast.error('Failed to mark all as read')
    } finally {
      setMarkingAll(false)
    }
  }

  const onLoadMore = () => fetchPage(offset, false)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50/40 px-4 sm:px-8 py-12">
      <div className="max-w-3xl mx-auto">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#0f172a] mb-6">
          <ArrowLeft size={16} /> Back to dashboard
        </Link>

        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-600 mb-3">Inbox</p>
            <h1 className="text-4xl sm:text-5xl font-black text-[#0f172a] tracking-tighter mb-2">Notifications</h1>
            <p className="text-slate-500 text-sm">
              {unread > 0
                ? `${unread} unread message${unread === 1 ? '' : 's'}.`
                : 'Everything from your orders, payments, and deliveries.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onMarkAll}
            disabled={markingAll || unread === 0}
            className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {markingAll ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
            Mark all read
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
            <Loader2 size={18} className="animate-spin" /> Loading notifications…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 px-6 py-16 text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
              <BellOff size={20} />
            </div>
            <p className="text-base font-bold text-slate-700">No notifications yet</p>
            <p className="text-sm text-slate-500 mt-1">
              Updates about your orders, deliveries, and payments will appear here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((n) => {
              const Icon = iconForMessage(n.message)
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => !n.is_read && onMarkOne(n.id)}
                    className={[
                      'w-full text-left flex items-start gap-4 px-4 sm:px-5 py-4 rounded-2xl ring-1 transition',
                      n.is_read
                        ? 'bg-white ring-slate-200 hover:bg-slate-50'
                        : 'bg-orange-50/60 ring-orange-200 hover:bg-orange-50',
                    ].join(' ')}
                    aria-label={n.is_read ? n.message : `${n.message} (unread)`}
                  >
                    <span className={[
                      'shrink-0 w-9 h-9 rounded-xl flex items-center justify-center',
                      n.is_read ? 'bg-slate-100 text-slate-500' : 'bg-orange-100 text-orange-600',
                    ].join(' ')}>
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={[
                        'text-sm leading-relaxed',
                        n.is_read ? 'text-slate-700' : 'text-slate-900 font-semibold',
                      ].join(' ')}>
                        {n.message}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">{fmtRelative(n.created_at)}</p>
                    </div>
                    {!n.is_read && (
                      <span className="shrink-0 mt-1.5 w-2 h-2 rounded-full bg-orange-500" aria-hidden="true" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {hasMore && !loading && (
          <div className="flex justify-center mt-6">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
              Load older
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
