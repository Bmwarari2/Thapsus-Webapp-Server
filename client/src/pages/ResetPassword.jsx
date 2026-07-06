import React, { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Lock, AlertCircle, CheckCircle, Mail, Eye, EyeOff } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'
import { PillLabel } from '../components/ui'

// NOTE: Shell is defined at MODULE scope on purpose. It used to live inside the
// component, which meant every keystroke (state update → re-render) produced a
// new Shell component identity, so React unmounted + remounted the whole form —
// blurring the input and dropping every character after the first (and wiping
// any password inserted by Apple Passwords / a password manager). Hoisting it
// keeps the input mounted so typing and autofill work.
const Shell = ({ children }) => (
  <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 overflow-hidden">
    <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] bg-ember-radial blur-2xl pointer-events-none" />
    <div className="w-full max-w-md relative z-10 animate-slide-up">
      <div className="glow-card p-8 md:p-10">{children}</div>
    </div>
  </div>
)

export const ResetPassword = () => {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [formData, setFormData] = useState({ newPassword: '', confirmPassword: '' })
  const [email, setEmail] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)

  // Resolve the account email so password managers have a username to
  // associate the new credential with (and so we can show whose account this is).
  useEffect(() => {
    if (!token) return
    api.get('/auth/reset-context', { params: { token } })
      .then((res) => { if (res.data?.email) setEmail(res.data.email) })
      .catch(() => {})
  }, [token])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!formData.newPassword || !formData.confirmPassword) { setError('Please fill in both password fields'); return }
    if (formData.newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
    if (formData.newPassword !== formData.confirmPassword) { setError('Passwords do not match'); return }
    try {
      setLoading(true)
      await api.post('/auth/reset-password', { token, new_password: formData.newPassword })
      setSuccess(true)
      toast.success('Password set successfully!')
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to set password. The link may be expired.'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <Shell>
        <div className="text-center space-y-5">
          <div className="flex justify-center">
            <span className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 grid place-items-center">
              <AlertCircle className="text-red-400" size={40} />
            </span>
          </div>
          <h1 className="text-xl font-bold text-white">Invalid reset link</h1>
          <p className="text-mute">This password reset link is missing or invalid. Please request a new one.</p>
          <Link to="/forgot-password" className="btn-primary glass-sheen">Request new link</Link>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="text-center mb-8 space-y-4">
        <div className="flex justify-center"><PillLabel>New password</PillLabel></div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">Create a new password</h1>
        {email && <p className="text-mute text-sm">for <span className="text-white font-semibold">{email}</span></p>}
      </div>

      {success ? (
        <div className="text-center space-y-5 animate-scale-in">
          <div className="flex justify-center">
            <span className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 grid place-items-center">
              <CheckCircle className="text-emerald-400" size={40} />
            </span>
          </div>
          <h2 className="text-xl font-bold text-white">Password set</h2>
          <p className="text-mute">Your password has been saved. You can now log in with it.</p>
          <Link to="/login" className="btn-primary glass-sheen w-full">Go to login</Link>
        </div>
      ) : (
        <>
          {error && (
            <div className="alert-error mb-6 animate-scale-in">
              <AlertCircle className="shrink-0 mt-0.5 text-red-400" size={20} />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username field for password managers (Apple Passwords / 1Password
                association). Read-only when we know the account email; still
                present (empty) otherwise so the form reads as a credential form. */}
            <div>
              <label htmlFor="reset-email" className="form-label">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                <input id="reset-email" type="email" name="username" value={email}
                  readOnly autoComplete="username"
                  placeholder="Your account email"
                  className="form-input pl-11 opacity-80 cursor-default" />
              </div>
            </div>

            <div>
              <label htmlFor="reset-new-password" className="form-label">New password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                <input id="reset-new-password" type={showPassword ? 'text' : 'password'} name="newPassword"
                  value={formData.newPassword} onChange={handleChange}
                  placeholder="At least 8 characters" autoComplete="new-password"
                  className="form-input pl-11 pr-11" />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="reset-confirm-password" className="form-label">Confirm new password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                <input id="reset-confirm-password" type={showPassword ? 'text' : 'password'} name="confirmPassword"
                  value={formData.confirmPassword} onChange={handleChange}
                  placeholder="Re-enter your password" autoComplete="new-password"
                  className="form-input pl-11" />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary glass-sheen w-full btn-lg">
              {loading ? 'Saving…' : 'Set password'}
            </button>
          </form>

          <div className="mt-7 text-center">
            <Link to="/login" className="text-sm font-semibold text-ember-400 hover:text-ember-300">Back to login</Link>
          </div>
        </>
      )}
    </Shell>
  )
}

export default ResetPassword
