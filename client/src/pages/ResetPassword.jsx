import React, { useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { Lock, AlertCircle, CheckCircle } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'

export const ResetPassword = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: '',
  })
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

    if (!formData.newPassword || !formData.confirmPassword) {
      setError('Please fill in both password fields')
      return
    }

    if (formData.newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    try {
      setLoading(true)
      await api.post('/auth/reset-password', {
        token,
        new_password: formData.newPassword,
      })
      setSuccess(true)
      toast.success('Password reset successfully!')
    } catch (err) {
      setError(err.message || 'Failed to reset password. The link may be expired.')
      toast.error(err.message || 'Reset failed')
    } finally {
      setLoading(false)
    }
  }

  // No token in URL
  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1e3a5f] to-[#152d4a] flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-xl shadow-xl p-8 text-center">
            <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
            <h2 className="text-xl font-bold text-[#1e3a5f] mb-2">Invalid Reset Link</h2>
            <p className="text-gray-600 mb-6">
              This password reset link is missing or invalid. Please request a new one.
            </p>
            <Link
              to="/forgot-password"
              className="inline-block bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-8 py-3 rounded-lg font-bold transition-colors"
            >
              Request New Link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a5f] to-[#152d4a] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-[#1e3a5f] mb-2">
              <span>Swift</span>
              <span className="text-orange-500">Cargo</span>
            </h1>
            <p className="text-gray-600">Create a new password</p>
          </div>

          {success ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle className="text-green-500" size={48} />
              </div>
              <h2 className="text-xl font-bold text-[#1e3a5f]">Password Reset Complete</h2>
              <p className="text-gray-600">
                Your password has been updated. You can now log in with your new password.
              </p>
              <Link
                to="/login"
                className="block w-full text-center bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-3 rounded-lg font-bold transition-colors"
              >
                Go to Login
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                  <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-red-700">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 text-gray-400" size={20} />
                    <input
                      type="password"
                      name="newPassword"
                      value={formData.newPassword}
                      onChange={handleChange}
                      placeholder="At least 6 characters"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 text-gray-400" size={20} />
                    <input
                      type="password"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      placeholder="Re-enter your password"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-3 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  to="/login"
                  className="text-sm text-orange-500 hover:text-orange-600"
                >
                  Back to Login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
