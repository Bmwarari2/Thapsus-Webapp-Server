import React, { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { User, Mail, Phone, Lock, AlertCircle, CheckCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import api from '../api/client'
import toast from 'react-hot-toast'

export const Register = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { register } = useAuth()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [referralValid, setReferralValid] = useState(null) // null | true | false
  const [referrerName, setReferrerName] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    referralCode: searchParams.get('ref') || '',
  })

  // Auto-validate the referral code from the URL param on mount
  useEffect(() => {
    const refFromUrl = searchParams.get('ref')
    if (refFromUrl) {
      validateReferralCode(refFromUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const validateReferralCode = async (code) => {
    if (!code || code.length < 4) { setReferralValid(null); return }
    try {
      const res = await api.post('/referral/validate', { referral_code: code.trim().toUpperCase() })
      if (res.data.valid) {
        setReferralValid(true)
        setReferrerName(res.data.referrer_name || '')
      } else {
        setReferralValid(false)
        setReferrerName('')
      }
    } catch {
      setReferralValid(null)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (name === 'referralCode') {
      setReferralValid(null)
      setReferrerName('')
    }
  }

  const handleReferralBlur = () => {
    if (formData.referralCode) validateReferralCode(formData.referralCode)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!formData.name.trim()) { setError(t('common.required')); return }
    if (!formData.email) { setError(t('common.required')); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) { setError(t('common.invalidEmail')); return }
    if (!formData.phone.trim()) { setError(t('common.required')); return }
    if (!formData.password) { setError(t('common.required')); return }
    if (formData.password.length < 6) { setError(t('common.passwordTooShort')); return }
    if (formData.password !== formData.confirmPassword) { setError(t('common.passwordsDoNotMatch')); return }

    try {
      setLoading(true)
      await register(
        formData.name,
        formData.email,
        formData.phone,
        formData.password,
        formData.referralCode ? formData.referralCode.trim().toUpperCase() : null
      )
      toast.success(t('auth.registerSuccess'))
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a5f] to-[#152d4a] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-[#1e3a5f] mb-2">
              <span>Swift</span><span className="text-orange-500">Cargo</span>
            </h1>
            <p className="text-gray-600">{t('auth.register')}</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
              <p className="text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('auth.name')}</label>
              <div className="relative">
                <User className="absolute left-3 top-3 text-gray-400" size={20} />
                <input type="text" name="name" value={formData.name} onChange={handleChange}
                  placeholder="John Doe"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('auth.email')}</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 text-gray-400" size={20} />
                <input type="email" name="email" value={formData.email} onChange={handleChange}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('auth.phone')}</label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 text-gray-400" size={20} />
                <input type="tel" name="phone" value={formData.phone} onChange={handleChange}
                  placeholder="+254 712 345678"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('auth.password')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-gray-400" size={20} />
                <input type="password" name="password" value={formData.password} onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('auth.confirmPassword')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-gray-400" size={20} />
                <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
              </div>
            </div>

            {/* Referral Code */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('auth.referralCode')}
                <span className="ml-1 text-xs text-gray-400">(Optional)</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  name="referralCode"
                  value={formData.referralCode}
                  onChange={handleChange}
                  onBlur={handleReferralBlur}
                  placeholder="e.g. SCAB12XY"
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 uppercase tracking-widest font-mono ${
                    referralValid === true
                      ? 'border-green-400 focus:ring-green-300'
                      : referralValid === false
                      ? 'border-red-400 focus:ring-red-300'
                      : 'border-gray-300 focus:ring-[#1e3a5f]'
                  }`}
                />
                {referralValid === true && (
                  <div className="mt-1 flex items-center gap-1 text-green-600 text-xs font-medium">
                    <CheckCircle size={13} />
                    Valid code{referrerName ? ` — referred by ${referrerName}` : ''}
                  </div>
                )}
                {referralValid === false && (
                  <div className="mt-1 flex items-center gap-1 text-red-500 text-xs">
                    <AlertCircle size={13} />
                    Referral code not found
                  </div>
                )}
              </div>

              {/* Reward notice */}
              <p className="mt-2 text-xs text-gray-500">
                🎁 Using a referral code? The person who referred you earns <strong>KES 50</strong> in wallet credit after you place your first order.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-3 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6"
            >
              {loading ? t('common.loading') : t('auth.register')}
            </button>
          </form>

          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-gray-300"></div>
            <span className="text-gray-500 text-sm">OR</span>
            <div className="flex-1 h-px bg-gray-300"></div>
          </div>

          <p className="text-center text-gray-600">
            {t('auth.haveAccount')}{' '}
            <Link to="/login" className="text-orange-500 hover:text-orange-600 font-bold">
              {t('auth.loginHere')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
