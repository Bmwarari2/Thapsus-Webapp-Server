import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import api from '../api/client'
import toast from 'react-hot-toast'

export const ForgotPassword = () => {
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!email) {
      setError('Please enter your email address')
      return
    }

    try {
      setLoading(true)
      await api.post('/auth/forgot-password', { email })
      setSent(true)
      toast.success('Reset link sent! Check your email.')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      toast.error(err.message || 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
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
            <p className="text-gray-600">Reset your password</p>
          </div>

          {sent ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle className="text-green-500" size={48} />
              </div>
              <h2 className="text-xl font-bold text-[#1e3a5f]">Check Your Email</h2>
              <p className="text-gray-600">
                If an account exists for <strong>{email}</strong>, we've sent a password reset link.
                The link will expire in 1 hour.
              </p>
              <p className="text-sm text-gray-500">
                Don't see it? Check your spam folder.
              </p>
              <div className="pt-4 space-y-3">
                <button
                  onClick={() => { setSent(false); setEmail(''); }}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-lg font-bold transition-colors"
                >
                  Try a different email
                </button>
                <Link
                  to="/login"
                  className="block w-full text-center bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-3 rounded-lg font-bold transition-colors"
                >
                  Back to Login
                </Link>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                  <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-red-700">{error}</p>
                </div>
              )}

              <p className="text-gray-600 mb-6">
                Enter the email address associated with your account and we'll send you a link to reset your password.
              </p>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 text-gray-400" size={20} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-3 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-sm text-orange-500 hover:text-orange-600"
                >
                  <ArrowLeft size={16} />
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
