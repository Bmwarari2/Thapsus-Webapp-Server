import React, { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Mail, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { PillLabel } from '../components/ui'

/**
 * /check-inbox?email=<user@example.com>
 * Landing after register when verification_required = true. Shows the
 * registered email + a one-tap resend backed by AuthContext.resendVerification.
 */
export const CheckInbox = () => {
  const [search] = useSearchParams()
  const { resendVerification } = useAuth()
  const email = search.get('email') || ''
  const [resending, setResending] = useState(false)

  const handleResend = async () => {
    if (!email) return
    try {
      setResending(true)
      await resendVerification(email)
      toast.success('If your account is awaiting verification, a fresh activation email has been sent.')
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to resend.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 overflow-hidden">
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] bg-ember-radial blur-2xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-slide-up">
        <div className="glow-card p-8 md:p-10 text-center">
          <div className="flex justify-center mb-6"><PillLabel>Verify email</PillLabel></div>

          <div className="flex justify-center my-6">
            <span className="ember-badge w-20 h-20 rounded-3xl"><Mail size={40} /></span>
          </div>

          <h1 className="text-2xl font-bold text-white mb-3">Check your inbox</h1>
          <p className="text-mute mb-3">
            {email
              ? <>We sent an activation link to <span className="text-white font-semibold">{email}</span>. Tap it to finish setting up your account.</>
              : 'Tap the activation link in the email we just sent to finish setting up your account.'}
          </p>
          <p className="text-dim text-sm mb-7">
            The link expires in <span className="text-white/80 font-semibold">24 hours</span>. After that, use Resend below to get a fresh one.
          </p>

          <div className="flex flex-col gap-3">
            <button type="button" onClick={handleResend} disabled={!email || resending} className="btn-primary glass-sheen w-full">
              <RefreshCw size={16} className={resending ? 'animate-spin' : ''} />
              {resending ? 'Sending…' : 'Resend activation email'}
            </button>
            <Link to="/login" className="text-sm font-semibold text-mute hover:text-white">Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CheckInbox
