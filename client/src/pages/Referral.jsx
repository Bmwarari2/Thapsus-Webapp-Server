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
  null
);

const GlassCard = ({ children, className = "" }) => (
  <div className={`relative overflow-hidden rounded-[2.5rem] bg-surface-2 backdrop-blur-2xl border border-line shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] ${className}`}>
    <div className="absolute inset-0 hidden" />
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
    const msg = `Join Thapsus Cargo and ship from the UK to Kenya! Sign up using my code and we BOTH get KES 50 wallet credit when you place your first order!\n\nReferral code: ${referralCode}\n👉 ${window.location.origin}/register?ref=${referralCode}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const handleShareEmail = () => {
    const subject = 'Join Thapsus Cargo – use my referral code'
    const body = `Hey!\n\nI use Thapsus Cargo to ship from the UK to Kenya. Sign up with my referral code ${referralCode} and we BOTH get KES 50 wallet credit when you place your first order!\n\nhttps://thapsus.uk/register?ref=${referralCode}`
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-transparent">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-transparent font-sans text-white overflow-x-hidden relative pb-24">
      <ReferralStyles />
      
      {/* --- LIQUID BACKGROUNDS --- */}
      <LiquidBlob className="top-[-5%] left-[-10%] w-[400px] h-[400px] md:w-[600px] md:h-[600px]" color="bg-blue-200" />
      <LiquidBlob className="bottom-[20%] right-[-5%] w-[350px] h-[350px] md:w-[500px] md:h-[500px]" color="bg-orange-200" />
      <div className="absolute inset-0 bg-surface-2 backdrop-blur-[2px] pointer-events-none" />

      {/* Widened container to max-w-7xl for better big screen scaling */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 relative z-10">

        {/* Header */}
        <div className="text-center mb-12 lg:mb-16 px-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-surface-2 backdrop-blur-md border border-line text-[10px] font-black uppercase tracking-[0.3em] text-mute shadow-sm mb-4">
            <Sparkles size={12} className="text-ember-400" />
            Partnership Program
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-white tracking-tighter uppercase leading-none mb-4">
            Refer & Earn
          </h1>
          <p className="text-mute font-bold max-w-2xl mx-auto leading-relaxed text-sm md:text-base lg:text-lg">
            Share your unique code. When someone you refer places their <strong className="text-white">first order</strong>, you <strong className="text-ember-400">both earn KES 50</strong> in wallet credit automatically.
          </p>
        </div>

        {/* Referral Code Card (Tilted Interactive Glass) */}
        <div className="transform lg:-rotate-1 hover:rotate-0 transition-all duration-700 perspective-1000 mb-12">
          <GlassCard className="p-6 md:p-12 group hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] transition-all flex flex-col lg:flex-row items-center justify-between gap-8 ">
            <div className="w-full lg:w-auto flex-1 flex flex-col items-center lg:items-start">
              <h2 className="text-[10px] md:text-xs font-black uppercase tracking-widest text-dim mb-3 text-center lg:text-left">Your Referral Code</h2>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full">
                <div className="w-full sm:flex-1 bg-surface-2 backdrop-blur-md rounded-2xl border-2 border-orange-300/50 px-4 md:px-8 py-5 text-3xl md:text-5xl font-black text-center lg:text-left tracking-[0.2em] md:tracking-[0.3em] text-white font-mono select-all shadow-inner overflow-hidden text-ellipsis whitespace-nowrap">
                  {referralCode}
                </div>
                <button onClick={handleCopyCode}
                  className="glass-sheen w-full sm:w-auto bg-surface hover:bg-slate-800 text-white px-8 md:px-10 py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-xs md:text-sm flex items-center justify-center gap-2 transition-all shadow-xl hover:-translate-y-1 whitespace-nowrap">
                  <Copy size={18} /> Copy Code
                </button>
              </div>
            </div>

            <div className="w-full lg:w-auto lg:border-l border-line/50 lg:pl-10 pt-8 lg:pt-0 border-t lg:border-t-0">
              <p className="text-[10px] md:text-xs font-black uppercase tracking-widest text-dim mb-4 text-center lg:text-left">Share Network</p>
              <div className="grid grid-cols-2 gap-4 w-full lg:min-w-[320px]">
                <button onClick={handleShareWhatsApp}
                  className="bg-surface-2 hover:bg-surface backdrop-blur-md border border-emerald-500/20 text-white/80 px-4 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-xs md:text-sm transition-colors shadow-sm hover:shadow-green-100">
                  <MessageCircle size={18} className="text-green-500" /> WhatsApp
                </button>
                <button onClick={handleShareEmail}
                  className="bg-surface-2 hover:bg-surface backdrop-blur-md border border-blue-500/20 text-white/80 px-4 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-xs md:text-sm transition-colors shadow-sm hover:shadow-blue-100">
                  <Mail size={18} className="text-blue-500" /> Email
                </button>
                <button onClick={handleCopyLink}
                  className="bg-surface-2 hover:bg-surface backdrop-blur-md border border-purple-500/20 text-white/80 px-4 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-xs md:text-sm transition-colors shadow-sm hover:shadow-purple-100">
                  <Share2 size={18} className="text-purple-500" /> Copy Link
                </button>
                <button
                  onClick={() => navigator.share?.({ title: 'Thapsus Cargo', text: `Use my code: ${referralCode}`, url: `${window.location.origin}/register?ref=${referralCode}` }).catch(() => {})}
                  className="bg-surface-2 hover:bg-surface backdrop-blur-md border border-ember-500/25 text-white/80 px-4 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-xs md:text-sm transition-colors shadow-sm hover:shadow-orange-100">
                  <Share2 size={18} className="text-ember-400" /> Share OS
                </button>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8 mb-12">
          <GlassCard className="p-8 md:p-10 flex flex-col justify-center group hover:-translate-y-2 transition-all duration-500">
            <div className="flex items-center justify-between mb-6">
              <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-dim">Referred</span>
              <Users size={24} className="text-blue-500" />
            </div>
            <p className="text-5xl md:text-6xl font-black text-white tracking-tighter leading-none truncate">{stats.total_referrals || 0}</p>
          </GlassCard>
          
          <GlassCard className="p-8 md:p-10 flex flex-col justify-center group hover:-translate-y-2 transition-all duration-500 border-yellow-500/20 bg-yellow-500/10">
            <div className="flex items-center justify-between mb-6">
              <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-yellow-600/60">Awaiting Order</span>
              <Clock size={24} className="text-yellow-500" />
            </div>
            <p className="text-5xl md:text-6xl font-black text-white tracking-tighter leading-none truncate">{stats.pending_referrals || 0}</p>
          </GlassCard>

          <GlassCard className="p-8 md:p-10 flex flex-col justify-center group hover:-translate-y-2 transition-all duration-500 border-emerald-500/20 bg-emerald-500/10">
            <div className="flex items-center justify-between mb-6">
              <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-emerald-300/60">Credited</span>
              <CheckCircle size={24} className="text-green-500" />
            </div>
            <p className="text-5xl md:text-6xl font-black text-white tracking-tighter leading-none truncate">{stats.completed_referrals || 0}</p>
          </GlassCard>

          <GlassCard className="p-8 md:p-10 flex flex-col justify-center group hover:-translate-y-2 transition-all duration-500 border-ember-500/25 bg-ember-500/10">
            <div className="flex items-center justify-between mb-6">
              <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-ember-400/60">Total Earned</span>
              <Gift size={24} className="text-ember-400" />
            </div>
            <p className="text-4xl md:text-5xl font-black text-white tracking-tighter leading-none text-ember-400 truncate">
              <span className="text-lg md:text-xl text-ember-400 mr-2">KES</span>
              {(stats.total_earned || 0).toLocaleString()}
            </p>
          </GlassCard>
        </div>

        {/* Wallet Balance Banner (Border Gradient Bento) */}
        {currentBalance > 0 && (
          <div className="rounded-3xl mb-12 mx-2 md:mx-0">
            <div className="h-full w-full bg-surface border border-line shadow-card rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
              <div className="w-20 h-20 bg-emerald-500/15 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                <Gift size={40} className="text-emerald-300" />
              </div>
              <div className="min-w-0">
                <p className="font-black text-3xl md:text-4xl text-white tracking-tighter uppercase mb-2 truncate">
                  KES {currentBalance.toLocaleString()} <span className="text-green-500">Available</span>
                </p>
                <p className="text-sm md:text-base font-bold text-mute">This credit will be automatically deducted from your next order total.</p>
              </div>
            </div>
          </div>
        )}

        {/* Referred Users Tracking Table */}
        <GlassCard className="mb-12 !p-0 overflow-hidden mx-2 md:mx-0">
          <div className="px-8 md:px-10 py-8 border-b border-line bg-surface-2 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter">Your Network</h2>
              <p className="text-sm md:text-base font-bold text-mute mt-2">Track their progress — you both earn KES 50 on their first order.</p>
            </div>
            <Users size={40} className="text-mute hidden sm:block shrink-0" />
          </div>

          {referredUsers.length > 0 ? (
            <div className="bg-surface-2 backdrop-blur-md w-full overflow-hidden">
              <div className="overflow-x-auto no-scrollbar w-full">
                {/* min-w-max prevents squishing on huge screens, while still allowing scroll on small screens */}
                <table className="w-full text-left whitespace-nowrap min-w-max">
                  <thead className="bg-surface/5">
                    <tr>
                      <th className="px-8 py-6 text-[10px] md:text-xs font-black text-dim uppercase tracking-widest">Name</th>
                      <th className="px-8 py-6 text-[10px] md:text-xs font-black text-dim uppercase tracking-widest">Referred On</th>
                      <th className="px-8 py-6 text-[10px] md:text-xs font-black text-dim uppercase tracking-widest text-center">Signed Up</th>
                      <th className="px-8 py-6 text-[10px] md:text-xs font-black text-dim uppercase tracking-widest text-center">First Order</th>
                      <th className="px-8 py-6 text-[10px] md:text-xs font-black text-dim uppercase tracking-widest text-center">Reward</th>
                      <th className="px-8 py-6 text-[10px] md:text-xs font-black text-dim uppercase tracking-widest text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {referredUsers.map((ref) => (
                      <tr key={ref.id} className="hover:bg-surface-2 transition-colors">
                        <td className="px-8 py-6">
                          <p className="text-sm md:text-base font-black text-white">{ref.referee_name}</p>
                          <p className="text-[10px] md:text-xs font-bold text-mute mt-1">{ref.referee_email}</p>
                        </td>
                        <td className="px-8 py-6 text-xs md:text-sm font-bold text-mute">
                          {new Date(ref.referred_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-8 py-6 text-center">
                          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/15 shadow-sm">
                            <CheckCircle size={20} className="text-emerald-300" />
                          </span>
                        </td>
                        <td className="px-8 py-6 text-center">
                          {ref.first_order_placed ? (
                            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/15 shadow-sm">
                              <CheckCircle size={20} className="text-emerald-300" />
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/15 shadow-sm" title="Waiting for their first order">
                              <Clock size={20} className="text-amber-500" />
                            </span>
                          )}
                        </td>
                        <td className="px-8 py-6 text-center">
                          {ref.reward_status === 'completed' ? (
                            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                              <CheckCircle size={14} /> Credited
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm bg-amber-500/10 text-amber-300 border-amber-500/20">
                              <Clock size={14} /> Pending
                            </span>
                          )}
                        </td>
                        <td className="px-8 py-6 text-right">
                          {ref.reward_status === 'completed' ? (
                            <span className="text-base font-black text-emerald-300">+KES {ref.reward_amount}</span>
                          ) : (
                            <span className="text-sm font-bold text-dim">KES 50</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-16 md:p-24 text-center bg-surface-2 backdrop-blur-md">
              <Users size={64} className="text-mute mx-auto mb-6" />
              <h3 className="text-xl md:text-2xl font-black text-white uppercase tracking-tighter mb-3">No referrals yet</h3>
              <p className="text-mute font-bold text-sm md:text-base max-w-md mx-auto leading-relaxed">
                Share your code above to start earning. You'll be able to track each person's progress here.
              </p>
            </div>
          )}
        </GlassCard>

        {/* How It Works (Dark Glass Bento) */}
        <div className="relative group overflow-hidden rounded-[2.5rem] bg-surface p-10 md:p-16 text-white shadow-2xl flex flex-col transition-all hover:scale-[1.01] mx-2 md:mx-0">
          <div className="absolute top-[-20%] left-[-10%] w-80 h-80 bg-orange-500/20 blur-[100px] -z-0 pointer-events-none" />
          <div className="relative z-10">
            <h3 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter mb-10">How It Works</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              <div className="flex flex-col md:flex-row gap-5 text-center md:text-left items-center md:items-start">
                <div className="w-14 h-14 bg-white/10 backdrop-blur-md border border-line rounded-2xl flex items-center justify-center font-black text-xl shrink-0 text-orange-400 shadow-inner">1</div>
                <div>
                  <p className="font-black text-xl mb-3 tracking-tight">Share Your Code</p>
                  <p className="text-sm md:text-base text-dim font-medium leading-relaxed">Send your unique referral code to friends via WhatsApp, email, or a direct link.</p>
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-5 text-center md:text-left items-center md:items-start">
                <div className="w-14 h-14 bg-white/10 backdrop-blur-md border border-line rounded-2xl flex items-center justify-center font-black text-xl shrink-0 text-orange-400 shadow-inner">2</div>
                <div>
                  <p className="font-black text-xl mb-3 tracking-tight">They Sign Up</p>
                  <p className="text-sm md:text-base text-dim font-medium leading-relaxed">Your friend creates a Thapsus Cargo account using your referral code.</p>
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-5 text-center md:text-left items-center md:items-start">
                <div className="w-14 h-14 bg-white/10 backdrop-blur-md border border-line rounded-2xl flex items-center justify-center font-black text-xl shrink-0 text-orange-400 shadow-inner">3</div>
                <div>
                  <p className="font-black text-xl mb-3 tracking-tight">They Place Order</p>
                  <p className="text-sm md:text-base text-dim font-medium leading-relaxed">Once they place their first shipment, <strong className="text-white">KES 50</strong> is instantly added to both your wallet and theirs!</p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
