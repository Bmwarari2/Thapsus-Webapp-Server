import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import api from '../api/client'
import toast from 'react-hot-toast'
import { PillLabel } from '../components/ui'

export const ForgotPassword = () => {
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!email) { setError('Please enter your email address'); return }
    try {
      setLoading(true)
      await api.post('/auth/forgot-password', { email })
      setSent(true)
      toast.success('Reset link sent! Check your email.')
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Something went wrong. Please try again.'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 overflow-hidden">
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] bg-ember-radial blur-2xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-slide-up">
        <div className="glow-card p-8 md:p-10">
          <div className="text-center mb-8 space-y-4">
            <div className="flex justify-center"><PillLabel>Password recovery</PillLabel></div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">Reset your password</h1>
          </div>

          {sent ? (
            <div className="text-center space-y-6 animate-scale-in">
              <div className="flex justify-center">
                <span className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 grid place-items-center">
                  <CheckCircle className="text-emerald-400" size={40} />
                </span>
              </div>
              <h2 className="text-xl font-bold text-white">Check your inbox</h2>
              <p className="text-mute leading-relaxed">
                If an account exists for <span className="text-white font-semibold">{email}</span>, we've sent a secure reset link. Valid for 1 hour.
              </p>
              <p className="text-xs text-dim uppercase tracking-widest">Don't see it? Check your spam folder.</p>
              <div className="pt-2 space-y-3">
                <button onClick={() => { setSent(false); setEmail('') }} className="btn-secondary w-full">Try a different email</button>
                <Link to="/login" className="btn-primary glass-sheen w-full">Back to login</Link>
              </div>
            </div>
          ) : (
            <div className="animate-fade-in">
              {error && (
                <div className="alert-error mb-6 animate-scale-in">
                  <AlertCircle className="shrink-0 mt-0.5 text-red-400" size={20} />
                  <p className="font-medium">{error}</p>
                </div>
              )}

              <p className="text-mute leading-relaxed mb-6 text-center">
                Enter your registered email address and we'll send a secure recovery link to your inbox.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="form-label">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com" autoComplete="email" className="form-input pl-11" />
                  </div>
                </div>

                <button type="submit" disabled={loading} className="btn-primary glass-sheen w-full btn-lg">
                  {loading && (
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  )}
                  {loading ? 'Sending…' : 'Send recovery link'}
                </button>
              </form>

              <div className="mt-7 text-center">
                <Link to="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-ember-400 hover:text-ember-300 group">
                  <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                  Back to login
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword
