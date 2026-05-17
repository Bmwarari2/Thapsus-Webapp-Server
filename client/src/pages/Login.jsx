import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import toast from 'react-hot-toast'

// --- CUSTOM STYLES & GLASS COMPONENTS ---
const LoginStyles = () => (
  <style>{`
    @keyframes morph {
      0% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: translate(0, 0) scale(1); }
      33% { transform: translate(30px, -50px) scale(1.05); }
      66% { transform: translate(-20px, 20px) scale(0.95); }
      100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: translate(0, 0) scale(1); }
    }
    .animate-morph { animation: morph 15s ease-in-out infinite; }
    
    @keyframes sheen {
      0% { transform: translateX(-100%) skewX(-15deg); }
      100% { transform: translateX(200%) skewX(-15deg); }
    }
    .glass-sheen { position: relative; overflow: hidden; }
    .glass-sheen::after {
      content: ''; position: absolute; top: 0; left: 0; width: 50%; height: 100%;
      background: linear-gradient(to right, transparent, rgba(255,255,255,0.3), transparent);
      animation: sheen 4s infinite;
    }
  `}</style>
);

const LiquidBlob = ({ className, color }) => (
  <div className={`absolute blur-[100px] md:blur-[120px] rounded-full mix-blend-multiply opacity-60 animate-morph pointer-events-none ${className} ${color}`} />
);

const GlassCard = ({ children, className = "" }) => (
  <div className={`relative overflow-hidden rounded-[2.5rem] bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />
    <div className="relative z-10">{children}</div>
  </div>
);

export const Login = () => {
  const navigate = useNavigate()
  const { login, resendVerification } = useAuth()
  // Honour ?next=… so deep-linked landings (NPS email survey,
  // PublicPayment redirect after auth, etc.) come back to where the
  // user was headed instead of dropping them on the dashboard.
  const nextPath = (() => {
    if (typeof window === 'undefined') return null
    const next = new URLSearchParams(window.location.search).get('next')
    if (!next) return null
    // Same-origin guard — only allow paths beginning with `/` so a
    // crafted ?next=https://evil.example.com link can't open-redirect.
    return next.startsWith('/') ? next : null
  })()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // PR R — when the server rejects login with code='email_unverified'
  // (post-PR-N gate), surface a specific banner with a one-tap "Resend
  // activation email" affordance instead of the generic "check your
  // credentials" copy.
  const [emailUnverified, setEmailUnverified] = useState(false)
  const [resending, setResending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (error) setError(null)   // clear error as soon as user starts typing
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
      // Customer ?next=… deep-links (NPS survey landing etc.) take
      // priority over the role default. Admins always go to /admin
      // regardless — they shouldn't be bounced into a customer survey.
      const dest = (loggedInUser.role !== 'admin' && nextPath)
        ? nextPath
        : (loggedInUser.role === 'admin' ? '/admin' : '/dashboard')
      navigate(dest, { replace: true })
    } catch (err) {
      // Axios surfaces the JSON body on err.response.data. Server PR N
      // returns 403 + { code: 'email_unverified', message } when the
      // user hasn't activated yet — surface the Resend banner instead
      // of the generic credentials error.
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
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4 py-8 relative overflow-hidden font-sans text-slate-900">
      <LoginStyles />
      
      {/* --- LIQUID BACKGROUNDS --- */}
      <LiquidBlob className="top-[-10%] left-[-10%] w-[400px] h-[400px] md:w-[600px] md:h-[600px]" color="bg-blue-200" />
      <LiquidBlob className="bottom-[-10%] right-[-10%] w-[350px] h-[350px] md:w-[500px] md:h-[500px]" color="bg-orange-200" />
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px] pointer-events-none" />

      {/* --- INTERACTIVE TILTED CARD --- */}
      <div className="w-full max-w-md relative z-10 transform lg:rotate-1 hover:rotate-0 transition-all duration-700 group perspective-1000">
        <GlassCard className="p-8 md:p-10 group-hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] transition-shadow duration-700">
          
          {/* Logo & Header */}
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-black text-[#0f172a] tracking-tighter uppercase leading-none mb-3">
              <span>Thapsus</span>
              <span className="text-orange-700">Cargo</span>
            </h1>
            <p className="text-slate-500 font-bold text-sm tracking-wide uppercase">{t('auth.login') || 'Sign in to your account'}</p>
          </div>

          {/* Email-not-verified banner — server PR N. Mirrors the iOS /
              Android emailUnverifiedBanner: explicit headline + a one-tap
              Resend so the user knows the password isn't the problem. */}
          {emailUnverified && (
            <div className="mb-8 p-4 bg-amber-50/80 backdrop-blur-md border border-amber-200/60 rounded-2xl flex flex-col gap-3 shadow-sm animate-in fade-in zoom-in duration-300">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                <div>
                  <p className="text-amber-800 text-sm font-bold">Email not verified</p>
                  <p className="text-amber-700 text-sm mt-1">
                    Activate your account from the link we emailed to{' '}
                    <span className="font-semibold">{formData.email || 'your inbox'}</span>, then sign in again.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resending || !formData.email}
                className="self-start text-sm font-bold text-orange-700 hover:text-orange-900 disabled:opacity-60 disabled:cursor-not-allowed underline-offset-2 hover:underline"
              >
                {resending ? 'Sending…' : 'Resend activation email'}
              </button>
            </div>
          )}

          {/* Error banner */}
          {error && !emailUnverified && (
            <div className="mb-8 p-4 bg-red-50/80 backdrop-blur-md border border-red-200/50 rounded-2xl flex items-start gap-3 shadow-sm animate-in fade-in zoom-in duration-300">
              <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
              <p className="text-red-700 text-sm font-bold">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            {/* Email */}
            <div>
              <label htmlFor="login-email" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-2">
                {t('auth.email') || 'Email address'}
              </label>
              <div className="relative group/input">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-orange-700 transition-colors" size={20} />
                <input
                  id="login-email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full pl-12 pr-4 py-4 bg-white/60 backdrop-blur-md border border-white/50 rounded-[1.5rem] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 text-slate-800 font-bold placeholder-slate-400 transition-all shadow-sm"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-2">
                {t('auth.password') || 'Password'}
              </label>
              <div className="relative group/input">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-orange-700 transition-colors" size={20} />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full pl-12 pr-12 py-4 bg-white/60 backdrop-blur-md border border-white/50 rounded-[1.5rem] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 text-slate-800 font-bold placeholder-slate-400 transition-all shadow-sm"
                />
                {/* Show/hide password toggle */}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Forgot password */}
            <div className="text-right">
              <Link to="/forgot-password" className="text-xs font-bold text-orange-700 hover:text-orange-600 transition-colors uppercase tracking-widest">
                {t('auth.forgotPassword') || 'Forgot password?'}
              </Link>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="glass-sheen w-full bg-[#0f172a] hover:bg-slate-800 text-white py-4 rounded-[1.5rem] font-black uppercase tracking-widest text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-xl hover:-translate-y-1"
            >
              {loading && (
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              )}
              {loading ? (t('common.loading') || 'Authenticating…') : (t('auth.login') || 'Secure Login')}
            </button>
          </form>

          <div className="my-8 flex items-center gap-4">
            <div className="flex-1 h-px bg-slate-300/50" />
            <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">OR</span>
            <div className="flex-1 h-px bg-slate-300/50" />
          </div>

          <p className="text-center text-slate-500 font-bold text-sm">
            {t('auth.noAccount') || "Don't have an account?"}{' '}
            <Link to="/register" className="text-orange-700 hover:text-orange-600 font-black uppercase tracking-wide ml-1 transition-colors">
              {t('auth.registerHere') || 'Create one'}
            </Link>
          </p>
        </GlassCard>
      </div>
    </div>
  )
}
