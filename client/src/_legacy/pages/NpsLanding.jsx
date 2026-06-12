import React, { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Star } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { npsApi, ordersApi } from '../api'

/**
 * /nps — landing page from the post-delivery survey email.
 *
 * The email template (`utils/email.js::sendNpsInvitationEmail`) links
 * here as `/nps?tn=<tracking_number>`. POST /api/nps requires auth, so
 * an unauthenticated visitor is bounced to /login with `?next=/nps?tn=…`
 * — same pattern as PublicPayment for unauth deep-links.
 *
 * Once authenticated we resolve the tracking number to the order id
 * (so the server can stamp `nps_invitations.responded_at`), present
 * the same one-question survey as the in-app NpsAutoPrompt, and on
 * submit redirect to the dashboard.
 */
export const NpsLanding = () => {
  const [params] = useSearchParams()
  const trackingNumber = params.get('tn') || ''
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()

  const [orderId, setOrderId] = useState(null)
  const [resolved, setResolved] = useState(false)
  const [resolveError, setResolveError] = useState('')
  const [score, setScore] = useState(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      // Bounce through login. Login page reads `next` param and
      // redirects back here with the same query string preserved.
      const next = encodeURIComponent(`/nps?tn=${encodeURIComponent(trackingNumber)}`)
      navigate(`/login?next=${next}`, { replace: true })
      return
    }
    if (!trackingNumber) {
      setResolveError('Missing tracking number — open the link from your email.')
      setResolved(true)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        // /api/tracking/:trackingNumber returns a slim public projection
        // with the order id, which is what the NPS row needs.
        const r = await ordersApi.track(trackingNumber)
        if (cancelled) return
        const id = r.data?.tracking?.id
        if (!id) {
          setResolveError("We couldn't find that delivery. Try the link from your email again.")
        } else {
          setOrderId(id)
        }
      } catch {
        if (!cancelled) setResolveError("We couldn't look up that delivery.")
      } finally {
        if (!cancelled) setResolved(true)
      }
    })()
    return () => { cancelled = true }
  }, [authLoading, user, trackingNumber, navigate])

  const onSubmit = async () => {
    if (score == null) { toast.error('Pick a score from 0 to 10'); return }
    setSubmitting(true)
    try {
      await npsApi.submit(score, comment.trim() || null, orderId)
      // localStorage dismiss key (used by NpsAutoPrompt) cleared so
      // the in-app prompt doesn't re-show this invitation either.
      if (orderId) {
        localStorage.removeItem('thapsus.nps.dismissed.' + orderId)
      }
      setDone(true)
    } catch {
      toast.error("Couldn't send your rating. Try again in a moment.")
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading || !resolved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500 text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-6 md:p-8">
        {done ? (
          <div className="text-center">
            <h2 className="text-2xl font-black text-[#1e3a5f]">Thanks for the feedback</h2>
            <p className="text-sm text-slate-500 mt-2">It helps us get better.</p>
            <button onClick={() => navigate('/dashboard')}
              className="mt-6 px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm">
              Back to dashboard
            </button>
          </div>
        ) : resolveError ? (
          <div className="text-center">
            <h2 className="text-2xl font-black text-[#1e3a5f]">Hmm.</h2>
            <p className="text-sm text-slate-500 mt-2">{resolveError}</p>
            <button onClick={() => navigate('/dashboard')}
              className="mt-6 px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm">
              Back to dashboard
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-black text-[#1e3a5f]">How was your delivery?</h2>
            <p className="text-xs text-slate-500 mt-1">
              Parcel <span className="font-mono">{trackingNumber}</span> · 0 means terrible, 10 means amazing.
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

            <button onClick={onSubmit}
              disabled={submitting || score == null}
              className="mt-5 w-full px-5 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold text-sm inline-flex items-center justify-center gap-2">
              <Star size={14}/> {submitting ? 'Sending…' : 'Send feedback'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
