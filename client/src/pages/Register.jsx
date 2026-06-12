import React, { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { User, Mail, Phone, Lock, AlertCircle, CheckCircle, Gift } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import api from '../api/client'
import toast from 'react-hot-toast'
import { PillLabel } from '../components/ui'

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
    name: '', email: '', phone: '', password: '', confirmPassword: '',
    referralCode: searchParams.get('ref') || '',
  })

  useEffect(() => {
    const refFromUrl = searchParams.get('ref')
    if (refFromUrl) validateReferralCode(refFromUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const validateReferralCode = async (code) => {
    if (!code || code.length < 4) { setReferralValid(null); return }
    try {
      const res = await api.post('/referral/validate', { referral_code: code.trim().toUpperCase() })
      if (res.data.valid) { setReferralValid(true); setReferrerName(res.data.referrer_name || '') }
      else { setReferralValid(false); setReferrerName('') }
    } catch { setReferralValid(null) }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (name === 'referralCode') { setReferralValid(null); setReferrerName('') }
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
      const result = await register(
        formData.name, formData.email, formData.phone, formData.password,
        formData.referralCode ? formData.referralCode.trim().toUpperCase() : null,
      )
      if (result?.verificationRequired) {
        toast.success('Check your inbox to activate your account.')
        navigate(`/check-inbox?email=${encodeURIComponent(result.email)}`)
      } else {
        toast.success(t('auth.registerSuccess'))
        navigate('/dashboard')
      }
    } catch (err) {
      setError(err.message)
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const field = (icon, props) => (
    <div className="relative">
      {React.createElement(icon, { className: 'absolute left-4 top-1/2 -translate-y-1/2 text-white/30', size: 18 })}
      <input {...props} className="form-input pl-11" />
    </div>
  )

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 overflow-hidden">
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[44rem] h-[44rem] bg-ember-radial blur-2xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-slide-up">
        <div className="glow-card p-8 md:p-10">
          <div className="text-center mb-7 space-y-4">
            <div className="flex justify-center"><PillLabel>Create account</PillLabel></div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">Join Thapsus Cargo</h1>
            <p className="text-mute text-sm">{t('auth.register') || 'Create your account'}</p>
          </div>

          {error && (
            <div className="alert-error mb-5 animate-scale-in">
              <AlertCircle className="shrink-0 mt-0.5 text-red-400" size={20} />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">{t('auth.name') || 'Full name'}</label>
              {field(User, { type: 'text', name: 'name', value: formData.name, onChange: handleChange, placeholder: 'John Doe', autoComplete: 'name' })}
            </div>
            <div>
              <label className="form-label">{t('auth.email') || 'Email'}</label>
              {field(Mail, { type: 'email', name: 'email', value: formData.email, onChange: handleChange, placeholder: 'you@example.com', autoComplete: 'email' })}
            </div>
            <div>
              <label className="form-label">{t('auth.phone') || 'Phone'}</label>
              {field(Phone, { type: 'tel', name: 'phone', value: formData.phone, onChange: handleChange, placeholder: '+254 712 345678', autoComplete: 'tel' })}
            </div>
            <div>
              <label className="form-label">{t('auth.password') || 'Password'}</label>
              {field(Lock, { type: 'password', name: 'password', value: formData.password, onChange: handleChange, placeholder: '••••••••', autoComplete: 'new-password' })}
            </div>
            <div>
              <label className="form-label">{t('auth.confirmPassword') || 'Confirm password'}</label>
              {field(Lock, { type: 'password', name: 'confirmPassword', value: formData.confirmPassword, onChange: handleChange, placeholder: '••••••••', autoComplete: 'new-password' })}
            </div>

            {/* Referral code */}
            <div>
              <label className="form-label">
                {t('auth.referralCode') || 'Referral code'}
                <span className="ml-2 text-[11px] text-dim normal-case tracking-normal">(Optional)</span>
              </label>
              <input
                type="text" name="referralCode" value={formData.referralCode}
                onChange={handleChange} onBlur={handleReferralBlur} placeholder="e.g. SCAB12XY"
                className={`form-input uppercase tracking-widest font-mono ${
                  referralValid === true ? '!border-emerald-500/60 focus:!ring-emerald-500/20'
                  : referralValid === false ? '!border-red-500/60 focus:!ring-red-500/20' : ''
                }`}
              />
              {referralValid === true && (
                <div className="mt-2 flex items-center gap-1.5 text-emerald-300 text-xs font-semibold">
                  <CheckCircle size={14} /> Valid code{referrerName ? ` — referred by ${referrerName}` : ''}
                </div>
              )}
              {referralValid === false && (
                <div className="mt-2 flex items-center gap-1.5 text-red-300 text-xs font-semibold">
                  <AlertCircle size={14} /> Referral code not found
                </div>
              )}
              <div className="mt-3 p-3 rounded-2xl bg-ember-500/[0.06] border border-ember-500/20">
                <p className="text-xs text-mute leading-relaxed flex gap-2">
                  <Gift size={15} className="text-ember-400 shrink-0 mt-0.5" />
                  <span>Using a referral code? <strong className="text-ember-400 font-semibold">Both you and the person who referred you</strong> each earn <strong className="text-ember-400 font-semibold">KES 50</strong> in wallet credit on your first shipped order.</span>
                </p>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary glass-sheen w-full btn-lg !mt-6">
              {loading ? (t('common.loading') || 'Creating…') : (t('auth.register') || 'Create account')}
            </button>
          </form>

          <div className="my-7 flex items-center gap-4">
            <div className="flex-1 h-px bg-line" />
            <span className="text-white/30 text-[11px] font-semibold uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-line" />
          </div>

          <p className="text-center text-mute text-sm">
            {t('auth.haveAccount') || 'Already have an account?'}{' '}
            <Link to="/login" className="text-ember-400 hover:text-ember-300 font-semibold ml-1">
              {t('auth.loginHere') || 'Sign in'}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default Register
