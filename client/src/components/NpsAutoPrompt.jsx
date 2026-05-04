import React, { useEffect, useState } from 'react'
import { Star, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { npsApi, ordersApi } from '../api'

/**
 * NpsAutoPrompt — webapp parity with iOS `NpsAutoPromptModifier`.
 *
 * Mounts on the customer dashboard. Polls `GET /api/nps/pending` once on
 * appear, picks the first invitation that hasn't been dismissed in this
 * browser, and shows a one-question survey modal. The server's
 * `responded_at` flip is the cross-device source of truth (so the modal
 * doesn't re-pop on iOS once submitted here, and vice versa);
 * localStorage is the within-browser "user dismissed without answering"
 * gate so a refresh doesn't re-show the same card.
 *
 * Triggered by the auto-trigger path that mints invitations on POD
 * (`routes/lastMile.js:1083`) and on admin bulk status flips
 * (`routes/admin.js:478`).
 *
 * The email-link landing (`/nps?tn=<tracking>`) is handled separately
 * by `pages/NpsLanding.jsx`; this component covers in-app appearance.
 */
const DISMISS_KEY_PREFIX = 'thapsus.nps.dismissed.'

export const NpsAutoPrompt = () => {
  const [open, setOpen] = useState(false)
  const [orderId, setOrderId] = useState(null)
  const [trackingNumber, setTrackingNumber] = useState(null)
  const [score, setScore] = useState(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await npsApi.pending()
        if (cancelled) return
        const pending = r.data?.pending || []
        // Pick the most recent invitation the user hasn't dismissed yet.
        // Server already filters out responded ones (responded_at IS NULL).
        const nextOpen = pending.find((p) =>
          !localStorage.getItem(DISMISS_KEY_PREFIX + p.order_id)
        )
        if (!nextOpen) return
        setOrderId(nextOpen.order_id)
        // Best-effort tracking number lookup so the modal can name the
        // parcel ("How was the delivery of TC-…?"). Falls back to the
        // raw uuid prefix if the lookup fails.
        try {
          const ord = await ordersApi.get(nextOpen.order_id)
          if (!cancelled) setTrackingNumber(ord.data?.order?.tracking_number || null)
        } catch { /* fallthrough — modal still opens */ }
        if (!cancelled) setOpen(true)
      } catch {
        // Silently ignore — the prompt is non-critical and showing an
        // error toast on dashboard load would be obnoxious.
      }
    })()
    return () => { cancelled = true }
  }, [])

  const close = ({ markDismissed }) => {
    if (markDismissed && orderId) {
      // Within-browser gate so a refresh doesn't immediately re-pop.
      // Cross-device gate is the server `responded_at`; this is just
      // for "not now" without an answer.
      localStorage.setItem(DISMISS_KEY_PREFIX + orderId, '1')
    }
    setOpen(false)
    setScore(null)
    setComment('')
  }

  const onSubmit = async () => {
    if (score == null) { toast.error('Pick a score from 0 to 10'); return }
    setSubmitting(true)
    try {
      await npsApi.submit(score, comment.trim() || null, orderId)
      toast.success('Thanks for the feedback')
      // Server stamps responded_at — purging the local dismiss key is
      // optional (the server flag wins), but keeps localStorage tidy.
      if (orderId) localStorage.removeItem(DISMISS_KEY_PREFIX + orderId)
      close({ markDismissed: false })
    } catch {
      toast.error("Couldn't send your rating. Try again in a moment.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const label = trackingNumber || (orderId ? orderId.slice(0, 8) : 'your delivery')

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden">
        <div className="relative p-6">
          <button onClick={() => close({ markDismissed: true })}
            className="absolute top-3 right-3 p-2 rounded-full text-slate-400 hover:bg-slate-100"
            aria-label="Close">
            <X size={18}/>
          </button>
          <h3 className="text-xl font-black text-[#1e3a5f]">How was your delivery?</h3>
          <p className="text-xs text-slate-500 mt-1">
            Parcel <span className="font-mono">{label}</span> · 0 means terrible, 10 means amazing.
          </p>

          <div className="mt-5 grid grid-cols-11 gap-1.5">
            {Array.from({ length: 11 }).map((_, i) => (
              <button key={i}
                onClick={() => setScore(i)}
                disabled={submitting}
                className={`aspect-square rounded-lg text-sm font-bold border-2 transition-colors
                  ${score === i
                    ? 'border-orange-500 bg-orange-500 text-white'
                    : 'border-slate-200 text-slate-700 hover:border-orange-300'}`}>
                {i}
              </button>
            ))}
          </div>

          <textarea value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Anything we should know? (optional)"
            disabled={submitting}
            rows={3}
            maxLength={500}
            className="mt-4 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400" />

          <div className="grid grid-cols-2 gap-3 mt-5">
            <button onClick={() => close({ markDismissed: true })}
              disabled={submitting}
              className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm">
              Not now
            </button>
            <button onClick={onSubmit}
              disabled={submitting || score == null}
              className="px-4 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold text-sm inline-flex items-center justify-center gap-2">
              <Star size={14}/> {submitting ? 'Sending…' : 'Send feedback'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
