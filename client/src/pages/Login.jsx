import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import toast from 'react-hot-toast'

export const Login = () => {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (error) setError(null)   // clear error as soon as user starts typing
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!formData.email) {
      setError(t('common.required') || 'Email is required')
      return
    }
    if (!formData.password) {
      setError(t('common.required') || 'Password is required')
      return
    }

    try {
      setLoading(true)
      const loggedInUser = await login(formData.email, formData.password)
      toast.success(t('auth.loginSuccess') || 'Login successful!')
      navigate(loggedInUser.role === 'admin' ? '/admin' : '/dashboard', { replace: true })
    } catch (err) {
      const msg = err.message || 'Login failed. Please check your credentials.'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a5f] to-[#152d4a] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-xl p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-[#1e3a5f] mb-2">
              <span>Swift</span>
              <span className="text-orange-500">Cargo</span>
            </h1>
            <p className="text-gray-600">{t('auth.login') || 'Sign in to your account'}</p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            {/* Email */}
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-2">
                {t('auth.email') || 'Email address'}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 text-gray-400 pointer-events-none" size={20} />
                <input
                  id="login-email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-2">
                {t('auth.password') || 'Password'}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-gray-400 pointer-events-none" size={20} />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                />
                {/* Show/hide password toggle */}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Forgot password */}
            <div className="text-right">
              <Link to="/forgot-password" className="text-sm text-orange-500 hover:text-orange-600">
                {t('auth.forgotPassword') || 'Forgot password?'}
              </Link>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-3 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              )}
              {loading ? (t('common.loading') || 'Signing in…') : (t('auth.login') || 'Sign In')}
            </button>
          </form>

          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-gray-300" />
            <span className="text-gray-500 text-sm">OR</span>
            <div className="flex-1 h-px bg-gray-300" />
          </div>

          <p className="text-center text-gray-600">
            {t('auth.noAccount') || "Don't have an account?"}{' '}
            <Link to="/register" className="text-orange-500 hover:text-orange-600 font-bold">
              {t('auth.registerHere') || 'Register here'}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
