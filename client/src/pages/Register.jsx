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
    <div className="min-h-screen relative bg-slate-50 overflow-hidden flex items-center justify-center px-4 py-12 font-sans">
      {/* Liquid Backgrounds */}
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-blue-300/30 rounded-full blur-[100px] animate-morph mix-blend-multiply pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-orange-300/20 rounded-full blur-[100px] animate-morph mix-blend-multiply pointer-events-none" />
      <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[40vw] h-[40vw] max-w-[400px] max-h-[400px] bg-indigo-200/20 rounded-full blur-[120px] animate-morph mix-blend-multiply pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Crystal Border Gradient Container */}
        <div className="rounded-[24px] p-[1px] bg-gradient-to-br from-blue-300/60 via-white/20 to-orange-300/60 shadow-2xl">
          <div className="bg-white/60 backdrop-blur-3xl rounded-[23px] p-8 sm:p-10 relative overflow-hidden glass-sheen">
            {/* Subtle inner light orb */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-blue-400/10 rounded-full blur-[50px] pointer-events-none" />

            {/* Header */}
            <div className="text-center mb-8 relative z-10">
              <h1 className="text-4xl font-black text-[#1e3a5f] mb-3 leading-none tracking-tighter">
                <span>Thapsus</span><span className="text-orange-500">Cargo</span>
              </h1>
              <p className="text-slate-600 font-bold tracking-tight">{t('auth.register')}</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50/50 backdrop-blur-md border border-red-200/60 rounded-xl flex items-start gap-3 relative z-10">
                <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
                <p className="text-red-700 font-semibold text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
              {/* Name */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">{t('auth.name')}</label>
                <div className="relative">
                  <User className="absolute left-4 top-3.5 text-slate-400" size={20} />
                  <input type="text" name="name" value={formData.name} onChange={handleChange}
                    placeholder="John Doe"
                    className="w-full pl-12 pr-4 py-3 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-slate-800 font-bold transition-all placeholder-slate-400 shadow-sm" />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">{t('auth.email')}</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-3.5 text-slate-400" size={20} />
                  <input type="email" name="email" value={formData.email} onChange={handleChange}
                    placeholder="you@example.com"
                    className="w-full pl-12 pr-4 py-3 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-slate-800 font-bold transition-all placeholder-slate-400 shadow-sm" />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">{t('auth.phone')}</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-3.5 text-slate-400" size={20} />
                  <input type="tel" name="phone" value={formData.phone} onChange={handleChange}
                    placeholder="+254 712 345678"
                    className="w-full pl-12 pr-4 py-3 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-slate-800 font-bold transition-all placeholder-slate-400 shadow-sm" />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">{t('auth.password')}</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-3.5 text-slate-400" size={20} />
                  <input type="password" name="password" value={formData.password} onChange={handleChange}
                    placeholder="••••••••"
                    className="w-full pl-12 pr-4 py-3 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-slate-800 font-bold transition-all placeholder-slate-400 shadow-sm" />
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">{t('auth.confirmPassword')}</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-3.5 text-slate-400" size={20} />
                  <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange}
                    placeholder="••••••••"
                    className="w-full pl-12 pr-4 py-3 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-slate-800 font-bold transition-all placeholder-slate-400 shadow-sm" />
                </div>
              </div>

              {/* Referral Code */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                  {t('auth.referralCode')}
                  <span className="ml-2 text-[10px] text-slate-400 tracking-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="referralCode"
                    value={formData.referralCode}
                    onChange={handleChange}
                    onBlur={handleReferralBlur}
                    placeholder="e.g. SCAB12XY"
                    className={`w-full px-4 py-3 bg-white/50 backdrop-blur-md border rounded-xl focus:outline-none focus:ring-2 uppercase tracking-widest font-mono text-slate-800 font-bold transition-all shadow-sm ${
                      referralValid === true
                        ? 'border-green-400/60 focus:ring-green-400/50 bg-green-50/30'
                        : referralValid === false
                        ? 'border-red-400/60 focus:ring-red-400/50 bg-red-50/30'
                        : 'border-white/60 focus:ring-orange-500/50'
                    }`}
                  />
                  {referralValid === true && (
                    <div className="mt-2 flex items-center gap-1.5 text-green-600 text-xs font-bold tracking-tight bg-green-50/50 p-2 rounded-lg border border-green-200/50 w-fit">
                      <CheckCircle size={14} />
                      Valid code{referrerName ? ` — referred by ${referrerName}` : ''}
                    </div>
                  )}
                  {referralValid === false && (
                    <div className="mt-2 flex items-center gap-1.5 text-red-500 text-xs font-bold tracking-tight bg-red-50/50 p-2 rounded-lg border border-red-200/50 w-fit">
                      <AlertCircle size={14} />
                      Referral code not found
                    </div>
                  )}
                </div>

                {/* Reward notice */}
                <div className="mt-3 p-3 bg-gradient-to-br from-orange-50/50 to-white/30 border border-orange-100/50 rounded-xl backdrop-blur-sm">
                  <p className="text-xs text-slate-600 font-medium leading-relaxed">
                    <span className="mr-1">🎁</span> Using a referral code? <strong className="text-orange-600 font-black">Both you AND the person who referred you</strong> each earn <strong className="text-orange-600 font-black">KES 50</strong> in wallet credit when you place your first order that gets shipped!
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative overflow-hidden w-full bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-4 rounded-xl font-black tracking-tight transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-8 shadow-xl hover:shadow-2xl hover:-translate-y-0.5 glass-sheen"
              >
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                <span className="relative z-10">{loading ? t('common.loading') : t('auth.register')}</span>
              </button>
            </form>

            <div className="my-8 flex items-center gap-4 relative z-10">
              <div className="flex-1 h-px bg-white/60"></div>
              <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">OR</span>
              <div className="flex-1 h-px bg-white/60"></div>
            </div>

            <p className="text-center text-slate-600 font-semibold relative z-10">
              {t('auth.haveAccount')}{' '}
              <Link to="/login" className="text-orange-500 hover:text-orange-600 font-black tracking-tight transition-colors">
                {t('auth.loginHere')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
