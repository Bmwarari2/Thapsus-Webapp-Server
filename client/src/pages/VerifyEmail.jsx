import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { PillLabel } from '../components/ui'

/**
 * /verify-email?token=<hex>
 * Posts the token via AuthContext.verifyEmail; on success bounces to
 * /login?verified=1 after a short beat. States: verifying | verified | failed.
 */
export const VerifyEmail = () => {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const { verifyEmail } = useAuth()
  const token = search.get('token')

  const [state, setState] = useState('verifying')
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
        setTimeout(() => { if (!cancelled) navigate('/login?verified=1', { replace: true }) }, 1200)
      } catch (err) {
        if (cancelled) return
        const msg = err?.response?.data?.message || err.message || 'This verification link is invalid or has expired.'
        setErrorMessage(msg)
        setState('failed')
      }
    }
    run()
    return () => { cancelled = true }
  }, [token, verifyEmail, navigate])

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 overflow-hidden">
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] bg-ember-radial blur-2xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-slide-up">
        <div className="glow-card p-8 md:p-10 text-center">
          <div className="flex justify-center mb-6"><PillLabel>Email verification</PillLabel></div>

          {state === 'verifying' && (
            <>
              <div className="flex justify-center my-8"><Loader2 className="animate-spin text-ember-500" size={48} /></div>
              <p className="text-mute font-medium">Activating your account…</p>
            </>
          )}

          {state === 'verified' && (
            <>
              <div className="flex justify-center my-8">
                <span className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 grid place-items-center">
                  <CheckCircle2 className="text-emerald-400" size={44} />
                </span>
              </div>
              <h1 className="text-xl font-bold text-white mb-2">Email verified</h1>
              <p className="text-mute">Your account is now active. Redirecting you to sign in…</p>
            </>
          )}

          {state === 'failed' && (
            <>
              <div className="flex justify-center my-8">
                <span className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 grid place-items-center">
                  <AlertCircle className="text-red-400" size={44} />
                </span>
              </div>
              <h1 className="text-xl font-bold text-white mb-2">Couldn't verify your email</h1>
              <p className="text-mute mb-6">{errorMessage}</p>
              <Link to="/login" className="btn-primary glass-sheen">Back to sign in</Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default VerifyEmail
