import React, { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Lock, AlertCircle, CheckCircle } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'
import { PillLabel } from '../components/ui'

export const ResetPassword = () => {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [formData, setFormData] = useState({ newPassword: '', confirmPassword: '' })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!formData.newPassword || !formData.confirmPassword) { setError('Please fill in both password fields'); return }
    if (formData.newPassword.length < 6) { setError('Password must be at least 6 characters'); return }
    if (formData.newPassword !== formData.confirmPassword) { setError('Passwords do not match'); return }
    try {
      setLoading(true)
      await api.post('/auth/reset-password', { token, new_password: formData.newPassword })
      setSuccess(true)
      toast.success('Password reset successfully!')
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to reset password. The link may be expired.'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const Shell = ({ children }) => (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 overflow-hidden">
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] bg-ember-radial blur-2xl pointer-events-none" />
      <div className="w-full max-w-md relative z-10 animate-slide-up">
        <div className="glow-card p-8 md:p-10">{children}</div>
      </div>
    </div>
  )

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
      </div>

      {success ? (
        <div className="text-center space-y-5 animate-scale-in">
          <div className="flex justify-center">
            <span className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 grid place-items-center">
              <CheckCircle className="text-emerald-400" size={40} />
            </span>
          </div>
          <h2 className="text-xl font-bold text-white">Password reset complete</h2>
          <p className="text-mute">Your password has been updated. You can now log in with your new password.</p>
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
            <div>
              <label className="form-label">New password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                <input type="password" name="newPassword" value={formData.newPassword} onChange={handleChange}
                  placeholder="At least 6 characters" autoComplete="new-password" className="form-input pl-11" />
              </div>
            </div>
            <div>
              <label className="form-label">Confirm new password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange}
                  placeholder="Re-enter your password" autoComplete="new-password" className="form-input pl-11" />
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary glass-sheen w-full btn-lg">
              {loading ? 'Resetting…' : 'Reset password'}
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
