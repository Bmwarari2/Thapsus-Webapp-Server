import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import api from '../api/client'
import toast from 'react-hot-toast'

// --- CUSTOM STYLES & GLASS COMPONENTS ---
const ForgotPasswordStyles = () => (
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
      const msg = err.response?.data?.message || err.message || 'Something went wrong. Please try again.'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4 py-8 relative overflow-hidden font-sans text-slate-900">
      <ForgotPasswordStyles />
      
      {/* --- LIQUID BACKGROUNDS --- */}
      <LiquidBlob className="top-[-10%] left-[-10%] w-[400px] h-[400px] md:w-[600px] md:h-[600px]" color="bg-blue-200" />
      <LiquidBlob className="bottom-[-10%] right-[-10%] w-[350px] h-[350px] md:w-[500px] md:h-[500px]" color="bg-orange-200" />
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px] pointer-events-none" />

      {/* --- INTERACTIVE TILTED CARD --- */}
      <div className="w-full max-w-md relative z-10 transform lg:rotate-1 hover:rotate-0 transition-all duration-700 group perspective-1000">
        <GlassCard className="p-8 md:p-10 group-hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] transition-shadow duration-700">
          
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-black text-[#0f172a] tracking-tighter uppercase leading-none mb-3">
              <span>Thapsus</span>
              <span className="text-orange-700">Cargo</span>
            </h1>
            <p className="text-slate-500 font-bold text-sm tracking-wide uppercase">Password Recovery</p>
          </div>

          {sent ? (
            <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 bg-green-100/80 backdrop-blur-md rounded-full flex items-center justify-center border border-green-200/50 shadow-inner">
                  <CheckCircle className="text-green-500" size={40} />
                </div>
              </div>
              <h2 className="text-2xl font-black text-[#0f172a] uppercase tracking-tighter">Check Your Inbox</h2>
              <p className="text-slate-500 font-medium leading-relaxed">
                If an account exists for <strong className="text-slate-800">{email}</strong>, we've sent a secure reset link. 
                Valid for 1 hour.
              </p>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                Don't see it? Check your spam folder.
              </p>
              
              <div className="pt-6 space-y-4">
                <button
                  onClick={() => { setSent(false); setEmail(''); }}
                  className="w-full bg-white/60 hover:bg-white/90 backdrop-blur-md text-slate-700 py-4 rounded-[1.5rem] font-black uppercase tracking-widest text-xs border border-white/50 transition-colors shadow-sm"
                >
                  Try different email
                </button>
                <Link
                  to="/login"
                  className="glass-sheen block w-full text-center bg-[#0f172a] hover:bg-slate-800 text-white py-4 rounded-[1.5rem] font-black uppercase tracking-widest text-xs transition-all shadow-xl hover:-translate-y-1"
                >
                  Back to Login
                </Link>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in duration-500">
              {error && (
                <div className="mb-8 p-4 bg-red-50/80 backdrop-blur-md border border-red-200/50 rounded-2xl flex items-start gap-3 shadow-sm animate-in fade-in zoom-in duration-300">
                  <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-red-700 text-sm font-bold">{error}</p>
                </div>
              )}

              <p className="text-slate-500 font-medium leading-relaxed mb-8 text-center">
                Enter your registered email address and we'll dispatch a secure recovery link to your inbox.
              </p>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-2">
                    Email Address
                  </label>
                  <div className="relative group/input">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-orange-700 transition-colors" size={20} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-12 pr-4 py-4 bg-white/60 backdrop-blur-md border border-white/50 rounded-[1.5rem] focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 text-slate-800 font-bold placeholder-slate-400 transition-all shadow-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="glass-sheen w-full bg-[#0f172a] hover:bg-slate-800 text-white py-4 rounded-[1.5rem] font-black uppercase tracking-widest text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-xl hover:-translate-y-1 mt-2"
                >
                  {loading && (
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  )}
                  {loading ? 'Dispatching...' : 'Send Recovery Link'}
                </button>
              </form>

              <div className="mt-8 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-xs font-bold text-orange-700 hover:text-orange-600 transition-colors uppercase tracking-widest group/link"
                >
                  <ArrowLeft size={16} className="group-hover/link:-translate-x-1 transition-transform" />
                  Back to Security Portal
                </Link>
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  )
}
