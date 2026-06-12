import React, { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Mail, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * /check-inbox?email=<user@example.com>
 *
 * Landing surface after a successful /register call when the server
 * returned verification_required = true (PR N). Surfaces the registered
 * email + a one-tap "Resend activation email" affordance backed by
 * AuthContext.resendVerification. The activation link itself opens
 * /verify-email which completes the flow + drops the user on /dashboard.
 *
 * Email comes in via querystring so a refresh / bookmark doesn't lose
 * context; falls back to a generic prompt when absent.
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
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4 py-12 font-sans text-slate-900">
      <div className="w-full max-w-md">
        <div className="rounded-2xl">
          <div className="bg-white border border-gray-100 shadow-card rounded-2xl p-8 sm:p-10 text-center">
            <h1 className="text-3xl md:text-4xl font-black text-[#0f172a] tracking-tight mb-2 uppercase">
              <span>Thapsus</span>
              <span className="text-orange-700">Cargo</span>
            </h1>

            <div className="flex justify-center my-8">
              <div className="rounded-full bg-orange-50 p-5">
                <Mail className="text-orange-600" size={48} />
              </div>
            </div>

            <h2 className="text-xl font-black text-slate-900 mb-3">Check your inbox</h2>
            <p className="text-slate-600 mb-3">
              {email
                ? <>We sent an activation link to <span className="font-semibold">{email}</span>. Tap it to finish setting up your account.</>
                : 'Tap the activation link in the email we just sent to finish setting up your account.'}
            </p>
            <p className="text-slate-500 text-sm mb-6">
              The link expires in <span className="font-semibold">24 hours</span>. After that, use Resend below to get a fresh one.
            </p>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleResend}
                disabled={!email || resending}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors"
              >
                <RefreshCw size={16} className={resending ? 'animate-spin' : ''} />
                {resending ? 'Sending…' : 'Resend activation email'}
              </button>
              <Link
                to="/login"
                className="text-sm font-semibold text-slate-600 hover:text-slate-900"
              >
                Back to sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CheckInbox
