import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { PillLabel } from '../components/ui'
import toast from 'react-hot-toast'

export const Login = () => {
  const navigate = useNavigate()
  const { login, resendVerification } = useAuth()

  // Honour ?next=… (same-origin only) so deep links return where intended.
  const nextPath = (() => {
    if (typeof window === 'undefined') return null
    const next = new URLSearchParams(window.location.search).get('next')
    if (!next) return null
    return next.startsWith('/') ? next : null
  })()
  // Set when /verify-email bounces here post-activation.
  const justVerified = (() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('verified') === '1'
  })()

  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [emailUnverified, setEmailUnverified] = useState(false)
  const [resending, setResending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({ email: '', password: '' })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (error) setError(null)
    if (emailUnverified) setEmailUnverified(false)
  }

  const handleResendVerification = async () => {
    if (!formData.email) return
    try {
      setResending(true)
      await resendVerification(formData.email)
      toast.success('If your account is awaiting verification, a fresh activation email has been sent.')
    } catch (err) {
      toast.error(err.message || 'Failed to resend activation email.')
    } finally {
      setResending(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!formData.email) { setError(t('common.required') || 'Email is required'); return }
    if (!formData.password) { setError(t('common.required') || 'Password is required'); return }

    try {
      setLoading(true)
      const loggedInUser = await login(formData.email, formData.password)
      toast.success(t('auth.loginSuccess') || 'Login successful!')
      // Only staff have logins now. Admins get the admin surface,
      // everyone else works the WhatsApp inbox. (`/dashboard` and
      // `/influencer` were customer/partner routes and no longer exist —
      // sending anyone there is a dead end.)
      const home = loggedInUser.role === 'admin' ? '/admin' : '/ops/inbox'
      navigate(nextPath || home, { replace: true })
    } catch (err) {
      const code = err?.response?.data?.code
      const msg = err?.response?.data?.message || err.message || 'Login failed. Please check your credentials.'
      if (code === 'email_unverified') {
        setEmailUnverified(true)
        setError(msg)
      } else {
        setEmailUnverified(false)
        setError(msg)
        toast.error(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 overflow-hidden">
      {/* Ember aura */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] bg-ember-radial blur-2xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-slide-up">
        <div className="glow-card p-8 md:p-10">
          {/* Header */}
          <div className="text-center mb-8 space-y-4">
            <div className="flex justify-center"><PillLabel>Secure sign-in</PillLabel></div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
              Welcome back
            </h1>
            <p className="text-mute text-sm">{t('auth.login') || 'Sign in to your account'}</p>
          </div>

          {/* Just-verified banner */}
          {justVerified && !emailUnverified && !error && (
            <div className="alert-success mb-6 animate-scale-in">
              <CheckCircle2 className="shrink-0 mt-0.5 text-emerald-400" size={20} />
              <div>
                <p className="font-semibold text-emerald-200">Email verified</p>
                <p className="text-emerald-300/90 mt-0.5">Your account is now active. Sign in to continue.</p>
              </div>
            </div>
          )}

          {/* Email-not-verified banner */}
          {emailUnverified && (
            <div className="alert-warning mb-6 flex-col items-stretch animate-scale-in">
              <div className="flex items-start gap-3">
                <AlertCircle className="shrink-0 mt-0.5 text-amber-400" size={20} />
                <div>
                  <p className="font-semibold text-amber-200">Email not verified</p>
                  <p className="text-amber-300/90 mt-0.5">
                    Activate your account from the link we emailed to{' '}
                    <span className="font-semibold">{formData.email || 'your inbox'}</span>, then sign in again.
                  </p>
                </div>
              </div>
              <button type="button" onClick={handleResendVerification} disabled={resending || !formData.email}
                className="self-start mt-3 text-sm font-semibold text-ember-400 hover:text-ember-300 disabled:opacity-60">
                {resending ? 'Sending…' : 'Resend activation email'}
              </button>
            </div>
          )}

          {/* Error banner */}
          {error && !emailUnverified && (
            <div className="alert-error mb-6 animate-scale-in">
              <AlertCircle className="shrink-0 mt-0.5 text-red-400" size={20} />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="login-email" className="form-label">{t('auth.email') || 'Email address'}</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                <input id="login-email" type="email" name="email" value={formData.email} onChange={handleChange}
                  placeholder="you@example.com" autoComplete="email" className="form-input pl-11" />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="form-label">{t('auth.password') || 'Password'}</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                <input id="login-password" type={showPassword ? 'text' : 'password'} name="password"
                  value={formData.password} onChange={handleChange} placeholder="Enter your password"
                  autoComplete="current-password" className="form-input pl-11 pr-11" />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="text-right">
              <Link to="/forgot-password" className="text-xs font-semibold text-ember-400 hover:text-ember-300">
                {t('auth.forgotPassword') || 'Forgot password?'}
              </Link>
            </div>

            <button type="submit" disabled={loading} className="btn-primary glass-sheen w-full btn-lg">
              {loading && (
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              )}
              {loading ? (t('common.loading') || 'Authenticating…') : (t('auth.login') || 'Sign in')}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <div className="my-7 flex items-center gap-4">
            <div className="flex-1 h-px bg-line" />
            <span className="text-white/30 text-[11px] font-semibold uppercase tracking-widest">staff only</span>
            <div className="flex-1 h-px bg-line" />
          </div>

          <p className="text-center text-mute text-sm">
            Customer? No account needed — just message our WhatsApp line to order and track.
          </p>
        </div>
      </div>
    </div>
  )
}
