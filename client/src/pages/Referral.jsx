import React, { useState, useEffect } from 'react'
import {
  Copy, MessageCircle, Mail, Share2, TrendingUp,
  CheckCircle, Clock, AlertCircle, Gift, Users, Sparkles
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import api from '../api/client'
import toast from 'react-hot-toast'

// --- CUSTOM STYLES & GLASS COMPONENTS ---
const ReferralStyles = () => (
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

    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
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

export const Referral = () => {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [referralCode, setReferralCode] = useState('')
  const [currentBalance, setCurrentBalance] = useState(0)
  const [stats, setStats] = useState({
    total_referrals: 0,
    completed_referrals: 0,
    pending_referrals: 0,
    total_earned: 0,
  })
  const [referredUsers, setReferredUsers] = useState([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/referral')
        const data = res.data
        setReferralCode(data.referral?.referral_code || '')
        setCurrentBalance(data.referral?.current_balance || 0)
        setStats(data.referral?.statistics || {})
        setReferredUsers(data.referred_users || [])
      } catch (err) {
        toast.error('Failed to load referral data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleCopyCode = () => {
    navigator.clipboard.writeText(referralCode)
    toast.success('Code copied!')
  }

  const handleCopyLink = () => {
    const link = `${window.location.origin}/register?ref=${referralCode}`
    navigator.clipboard.writeText(link)
    toast.success('Link copied!')
  }

  const handleShareWhatsApp = () => {
    const msg = `Join Thapsus Cargo and ship from UK, USA & China to Kenya! Sign up using my code and we both benefit.\n\nReferral code: ${referralCode}\n👉 ${window.location.origin}/register?ref=${referralCode}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const handleShareEmail = () => {
    const subject = 'Join Thapsus Cargo – use my referral code'
    const body = `Hey!\n\nI use Thapsus Cargo to ship from the UK, USA & China to Kenya. Sign up with my referral code ${referralCode} and I get KES 50 wallet credit after you place your first order.\n\nhttps://thapsus.uk/register?ref=${referralCode}`
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f8fafc]">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-x-hidden relative pb-24">
      <ReferralStyles />
      
      {/* --- LIQUID BACKGROUNDS --- */}
      <LiquidBlob className="top-[-5%] left-[-10%] w-[400px] h-[400px] md:w-[600px] md:h-[600px]" color="bg-blue-200" />
      <LiquidBlob className="bottom-[20%] right-[-5%] w-[350px] h-[350px] md:w-[500px] md:h-[500px]" color="bg-orange-200" />
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px] pointer-events-none" />

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-12 relative z-10">

        {/* Header */}
        <div className="text-center mb-12 lg:mb-16 px-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-white/60 backdrop-blur-md border border-white/50 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 shadow-sm mb-4">
            <Sparkles size={12} className="text-orange-500" />
            Partnership Program
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-[#0f172a] tracking-tighter uppercase leading-none mb-4">
            Refer & Earn
          </h1>
          <p className="text-slate-500 font-bold max-w-xl mx-auto leading-relaxed text-sm md:text-base">
            Share your unique code. Every time someone you refer places their <strong className="text-[#0f172a]">first order</strong>, you earn <strong className="text-orange-500">KES 50</strong> in wallet credit automatically.
          </p>
        </div>

        {/* Referral Code Card (Tilted Interactive Glass) */}
        <div className="transform lg:-rotate-1 hover:rotate-0 transition-all duration-700 perspective-1000 mb-12">
          <GlassCard className="p-6 md:p-12 group hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] transition-all flex flex-col md:flex-row items-center justify-between gap-8 bg-gradient-to-br from-white/40 to-orange-50/40 border-orange-200/50">
            <div className="w-full md:w-auto flex-1 flex flex-col items-center md:items-start">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 text-center md:text-left">Your Referral Code</h2>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full">
                <div className="w-full sm:flex-1 bg-white/80 backdrop-blur-md rounded-2xl border-2 border-orange-300/50 px-4 md:px-6 py-4 text-2xl md:text-4xl font-black text-center tracking-[0.2em] md:tracking-[0.3em] text-[#0f172a] font-mono select-all shadow-inner overflow-hidden text-ellipsis whitespace-nowrap">
                  {referralCode}
                </div>
                <button onClick={handleCopyCode}
                  className="glass-sheen w-full sm:w-auto bg-[#0f172a] hover:bg-slate-800 text-white px-8 py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all shadow-xl hover:-translate-y-1 whitespace-nowrap">
                  <Copy size={18} /> Copy Code
                </button>
              </div>
            </div>

            <div className="w-full md:w-auto md:border-l border-slate-200/50 md:pl-8 pt-6 md:pt-0 border-t md:border-t-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 text-center md:text-left">Share Network</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                <button onClick={handleShareWhatsApp}
                  className="bg-white/80 hover:bg-white backdrop-blur-md border border-green-200 text-slate-700 px-4 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 text-xs transition-colors shadow-sm hover:shadow-green-100">
                  <MessageCircle size={16} className="text-green-500" /> WhatsApp
                </button>
                <button onClick={handleShareEmail}
                  className="bg-white/80 hover:bg-white backdrop-blur-md border border-blue-200 text-slate-700 px-4 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 text-xs transition-colors shadow-sm hover:shadow-blue-100">
                  <Mail size={16} className="text-blue-500" /> Email
                </button>
                <button onClick={handleCopyLink}
                  className="bg-white/80 hover:bg-white backdrop-blur-md border border-purple-200 text-slate-700 px-4 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 text-xs transition-colors shadow-sm hover:shadow-purple-100">
                  <Share2 size={16} className="text-purple-500" /> Copy Link
                </button>
                <button
                  onClick={() => navigator.share?.({ title: 'Thapsus Cargo', text: `Use my code: ${referralCode}`, url: `${window.location.origin}/register?ref=${referralCode}` }).catch(() => {})}
                  className="bg-white/80 hover:bg-white backdrop-blur-md border border-orange-200 text-slate-700 px-4 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 text-xs transition-colors shadow-sm hover:shadow-orange-100">
                  <Share2 size={16} className="text-orange-500" /> Share OS
                </button>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <GlassCard className="p-6 md:p-8 flex flex-col justify-center group hover:-translate-y-2 transition-all duration-500">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Referred</span>
              <Users size={20} className="text-blue-500" />
            </div>
            <p className="text-3xl md:text-4xl lg:text-5xl font-black text-[#0f172a] tracking-tighter leading-none truncate">{stats.total_referrals || 0}</p>
          </GlassCard>
          
          <GlassCard className="p-6 md:p-8 flex flex-col justify-center group hover:-translate-y-2 transition-all duration-500 border-yellow-200/50 bg-yellow-50/20">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-yellow-600/60">Awaiting Order</span>
              <Clock size={20} className="text-yellow-500" />
            </div>
            <p className="text-3xl md:text-4xl lg:text-5xl font-black text-[#0f172a] tracking-tighter leading-none truncate">{stats.pending_referrals || 0}</p>
          </GlassCard>

          <GlassCard className="p-6 md:p-8 flex flex-col justify-center group hover:-translate-y-2 transition-all duration-500 border-green-200/50 bg-green-50/20">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-green-600/60">Credited</span>
              <CheckCircle size={20} className="text-green-500" />
            </div>
            <p className="text-3xl md:text-4xl lg:text-5xl font-black text-[#0f172a] tracking-tighter leading-none truncate">{stats.completed_referrals || 0}</p>
          </GlassCard>

          <GlassCard className="p-6 md:p-8 flex flex-col justify-center group hover:-translate-y-2 transition-all duration-500 border-orange-200/50 bg-orange-50/20">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-orange-600/60">Total Earned</span>
              <Gift size={20} className="text-orange-500" />
            </div>
            <p className="text-2xl md:text-3xl lg:text-4xl font-black text-[#0f172a] tracking-tighter leading-none text-orange-600 truncate">
              <span className="text-sm md:text-base text-orange-500 mr-1">KES</span>
              {(stats.total_earned || 0).toLocaleString()}
            </p>
          </GlassCard>
        </div>

        {/* Wallet Balance Banner (Border Gradient Bento) */}
        {currentBalance > 0 && (
          <div className="p-1 bg-gradient-to-br from-green-400 via-emerald-300 to-teal-400 rounded-[2.5rem] shadow-2xl mb-12 transition-all hover:scale-[1.01] mx-2 md:mx-0">
            <div className="h-full w-full bg-white/95 backdrop-blur-3xl rounded-[2.4rem] p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
              <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                <Gift size={32} className="text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="font-black text-2xl md:text-3xl text-[#0f172a] tracking-tighter uppercase mb-1 truncate">
                  KES {currentBalance.toLocaleString()} <span className="text-green-500">Available</span>
                </p>
                <p className="text-xs md:text-sm font-bold text-slate-500">This credit will be automatically deducted from your next order total.</p>
              </div>
            </div>
          </div>
        )}

        {/* Referred Users Tracking Table */}
        <GlassCard className="mb-12 !p-0 overflow-hidden mx-2 md:mx-0">
          <div className="px-6 md:px-8 py-6 border-b border-white/50 bg-white/30 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl md:text-2xl font-black text-[#0f172a] uppercase tracking-tighter">Your Network</h2>
              <p className="text-xs md:text-sm font-bold text-slate-500 mt-1">Track their progress towards earning you KES 50.</p>
            </div>
            <Users size={32} className="text-slate-300 hidden sm:block shrink-0" />
          </div>

          {referredUsers.length > 0 ? (
            <div className="bg-white/50 backdrop-blur-md overflow-hidden">
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left whitespace-nowrap min-w-[800px]">
                  <thead className="bg-[#0f172a]/5">
                    <tr>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Name</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Referred On</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Signed Up</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">First Order</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Reward</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/50">
                    {referredUsers.map((ref) => (
                      <tr key={ref.id} className="hover:bg-white/40 transition-colors">
                        <td className="px-6 py-5">
                          <p className="text-sm font-black text-[#0f172a] truncate max-w-[200px]">{ref.referee_name}</p>
                          <p className="text-[10px] font-bold text-slate-500 mt-1 truncate max-w-[200px]">{ref.referee_email}</p>
                        </td>
                        <td className="px-6 py-5 text-xs font-bold text-slate-600">
                          {new Date(ref.referred_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 shadow-sm">
                            <CheckCircle size={16} className="text-green-600" />
                          </span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          {ref.first_order_placed ? (
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 shadow-sm">
                              <CheckCircle size={16} className="text-green-600" />
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 shadow-sm" title="Waiting for their first order">
                              <Clock size={16} className="text-amber-500" />
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-center">
                          {ref.reward_status === 'completed' ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm bg-green-50 text-green-700 border-green-200">
                              <CheckCircle size={12} /> Credited
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm bg-amber-50 text-amber-700 border-amber-200">
                              <Clock size={12} /> Pending
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-right">
                          {ref.reward_status === 'completed' ? (
                            <span className="text-sm font-black text-green-600">+KES {ref.reward_amount}</span>
                          ) : (
                            <span className="text-sm font-bold text-slate-400">KES 50</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-8 md:p-12 text-center bg-white/30 backdrop-blur-md">
              <Users size={48} className="text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-black text-[#0f172a] uppercase tracking-tighter mb-2">No referrals yet</h3>
              <p className="text-slate-500 font-bold text-sm max-w-sm mx-auto">
                Share your code above to start earning. You'll be able to track each person's progress here.
              </p>
            </div>
          )}
        </GlassCard>

        {/* How It Works (Dark Glass Bento) */}
        <div className="relative group overflow-hidden rounded-[2.5rem] bg-[#0f172a] p-8 md:p-12 text-white shadow-2xl flex flex-col transition-all hover:scale-[1.01] mx-2 md:mx-0">
          <div className="absolute top-[-20%] left-[-10%] w-64 h-64 bg-orange-500/20 blur-[80px] -z-0 pointer-events-none" />
          <div className="relative z-10">
            <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter mb-8">How It Works</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col md:flex-row gap-4 text-center md:text-left items-center md:items-start">
                <div className="w-12 h-12 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 text-orange-400 shadow-inner">1</div>
                <div>
                  <p className="font-black text-lg mb-2 tracking-tight">Share Your Code</p>
                  <p className="text-sm text-slate-400 font-medium leading-relaxed">Send your unique referral code to friends via WhatsApp, email, or a direct link.</p>
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-4 text-center md:text-left items-center md:items-start">
                <div className="w-12 h-12 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 text-orange-400 shadow-inner">2</div>
                <div>
                  <p className="font-black text-lg mb-2 tracking-tight">They Sign Up</p>
                  <p className="text-sm text-slate-400 font-medium leading-relaxed">Your friend creates a Thapsus Cargo account using your referral code.</p>
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-4 text-center md:text-left items-center md:items-start">
                <div className="w-12 h-12 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 text-orange-400 shadow-inner">3</div>
                <div>
                  <p className="font-black text-lg mb-2 tracking-tight">They Place Order</p>
                  <p className="text-sm text-slate-400 font-medium leading-relaxed">Once they place their first shipment, <strong className="text-white">KES 50</strong> is instantly added to your wallet.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
