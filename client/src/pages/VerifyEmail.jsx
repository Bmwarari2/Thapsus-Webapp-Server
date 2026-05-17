import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

/**
 * /verify-email?token=<hex>
 *
 * Lands here when the user opens the link from sendEmailVerificationEmail.
 * Posts the token to /api/auth/verify-email via the auth context; on
 * success the server returns the same auth bundle login does and we
 * route the now-signed-in user straight to /dashboard. The mobile apps
 * land back into the app via Universal / App Links — this page is the
 * web fallback (and also the destination for desktop browsers).
 *
 * Three render states:
 *   - verifying — the activation request is in flight
 *   - verified  — server accepted the token; show a confirmation +
 *                  auto-redirect to /dashboard after a short beat so
 *                  the success state is legible
 *   - failed    — token missing / expired / already used; show the
 *                  copy from the server and a link back to /login
 */
export const VerifyEmail = () => {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const { verifyEmail } = useAuth()
  const token = search.get('token')

  const [state, setState] = useState('verifying') // 'verifying' | 'verified' | 'failed'
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!token) {
        setErrorMessage('No verification token in the link.')
        setState('failed')
        return
      }
      try {
        await verifyEmail(token)
        if (cancelled) return
        setState('verified')
        // Short beat so the success state registers visually before we
        // bounce — too-quick navigation looks like the click did nothing.
        setTimeout(() => {
          if (!cancelled) navigate('/dashboard', { replace: true })
        }, 1200)
      } catch (err) {
        if (cancelled) return
        const msg = err?.response?.data?.message
          || err.message
          || 'This verification link is invalid or has expired.'
        setErrorMessage(msg)
        setState('failed')
      }
    }
    run()
    return () => { cancelled = true }
  }, [token, verifyEmail, navigate])

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4 py-12 font-sans text-slate-900">
      <div className="w-full max-w-md">
        <div className="rounded-[24px] p-[1px] bg-gradient-to-br from-blue-300/60 via-white/20 to-orange-300/60 shadow-2xl">
          <div className="bg-white/80 backdrop-blur-3xl rounded-[23px] p-8 sm:p-10 text-center">
            <h1 className="text-3xl md:text-4xl font-black text-[#0f172a] tracking-tight mb-2 uppercase">
              <span>Thapsus</span>
              <span className="text-orange-700">Cargo</span>
            </h1>

            {state === 'verifying' && (
              <>
                <div className="flex justify-center my-8">
                  <Loader2 className="animate-spin text-orange-600" size={48} />
                </div>
                <p className="text-slate-600 font-semibold">Activating your account…</p>
              </>
            )}

            {state === 'verified' && (
              <>
                <div className="flex justify-center my-8">
                  <CheckCircle2 className="text-green-600" size={56} />
                </div>
                <h2 className="text-xl font-black text-slate-900 mb-2">Email verified</h2>
                <p className="text-slate-600">Welcome aboard. Redirecting you to your dashboard…</p>
              </>
            )}

            {state === 'failed' && (
              <>
                <div className="flex justify-center my-8">
                  <AlertCircle className="text-red-600" size={56} />
                </div>
                <h2 className="text-xl font-black text-slate-900 mb-2">Couldn't verify your email</h2>
                <p className="text-slate-600 mb-6">{errorMessage}</p>
                <Link
                  to="/login"
                  className="inline-block px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm transition-colors"
                >
                  Back to sign in
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default VerifyEmail
