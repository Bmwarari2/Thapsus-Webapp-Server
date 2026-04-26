import React, { useState, useEffect } from 'react'
import {
  Gift, TrendingUp, CreditCard, Info, CheckCircle, Copy, Zap,
  MessageCircle, Mail, Share2, Users, Clock, Sparkles
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { walletApi, referralApi } from '../api'
import api from '../api/client'
import toast from 'react-hot-toast'

// --- SHARED STYLES & GLASS COMPONENTS ---
const PageStyles = () => (
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

const GlassCard = ({ children, className = '' }) => (
  <div className={`relative overflow-hidden rounded-[2.5rem] bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />
    <div className="relative z-10">{children}</div>
  </div>
);

// ─── WALLET TAB ────────────────────────────────────────────────────────────────
const WalletTab = ({ balance, transactions }) => {
  // DB transaction types: 'deposit', 'payment', 'refund', 'referral_credit'
  const CREDIT_TYPES = ['deposit', 'refund', 'referral_credit']
  const isCredit = (type) => CREDIT_TYPES.includes(type)

  const txTypeIcon = (type) => {
    if (type === 'referral_credit') return <Gift        size={16} className="text-orange-700" />
    if (type === 'deposit')         return <TrendingUp  size={16} className="text-green-500"  />
    if (type === 'refund')          return <CheckCircle size={16} className="text-blue-500"   />
    if (type === 'payment')         return <CreditCard  size={16} className="text-red-400"    />
    return <Info size={16} className="text-slate-400" />
  }

  const txLabel = (tx) => {
    if (tx.type === 'referral_credit') return 'Referral Bonus'
    if (tx.type === 'deposit')         return tx.payment_method === 'mpesa' ? 'M-Pesa Deposit' : 'Deposit'
    if (tx.type === 'refund')          return 'Refund'
    if (tx.type === 'payment')         return tx.payment_method === 'wallet' ? 'Wallet Payment' : 'Payment'
    return tx.type?.replace(/_/g, ' ') ?? '—'
  }

  return (
    <div className="space-y-10">
      {/* Balance hero card */}
      <div className="relative group overflow-hidden rounded-[2.5rem] bg-[#0f172a] p-8 md:p-12 text-white shadow-2xl flex flex-col transition-all hover:scale-[1.01] mx-2 md:mx-0">
        <div className="absolute top-[-20%] right-[-10%] w-80 h-80 bg-orange-500/20 blur-[100px] -z-0 pointer-events-none animate-pulse" />
        <div className="relative z-10 flex flex-col md:flex-row items-center md:items-end justify-between gap-8 text-center md:text-left">
          <div>
            <p className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Referral Credit Balance</p>
            <h2 className="text-5xl md:text-7xl font-black tracking-tighter text-white leading-none">
              <span className="text-2xl md:text-3xl text-orange-700 mr-2">KES</span>{balance.toLocaleString()}
            </h2>
          </div>
          <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-3xl p-5 max-w-sm flex flex-col sm:flex-row items-center sm:items-start gap-4 text-left">
            <Zap size={24} className="text-orange-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Auto-Applied</p>
              <p className="text-sm text-slate-300 font-medium leading-snug">
                Your referral credits are automatically deducted from future order totals — no action needed.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction history */}
      <GlassCard className="!p-0 overflow-hidden mx-2 md:mx-0">
        <div className="px-8 md:px-10 py-8 border-b border-white/50 bg-white/30 backdrop-blur-md flex items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-[#0f172a] uppercase tracking-tighter">Transaction History</h2>
            <p className="text-sm font-bold text-slate-500 mt-1">All credits and deductions on your wallet.</p>
          </div>
          <TrendingUp size={36} className="text-slate-300 hidden sm:block shrink-0" />
        </div>
        {transactions.length > 0 ? (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left whitespace-nowrap min-w-max">
              <thead className="bg-[#0f172a]/5">
                <tr>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/50">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/40 transition-colors">
                    <td className="px-8 py-5">
                      <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
                        {txTypeIcon(tx.type)}
                        <span className="capitalize">{txLabel(tx)}</span>
                      </span>
                    </td>
                    <td className="px-8 py-5 text-sm font-medium text-slate-600 max-w-xs truncate">
                      {tx.payment_reference || (tx.type === 'referral_credit' ? 'Referral reward' : '—')}
                    </td>
                    <td className={`px-8 py-5 text-right text-sm font-black ${
                      isCredit(tx.type) ? 'text-green-600' : 'text-red-500'
                    }`}>
                      {isCredit(tx.type) ? '+' : '-'}KES {Number(tx.amount).toLocaleString()}
                    </td>
                    <td className="px-8 py-5 text-right text-xs font-bold text-slate-500">
                      {new Date(tx.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-16 text-center bg-white/30">
            <TrendingUp size={56} className="text-slate-200 mx-auto mb-5" />
            <h3 className="text-xl font-black text-[#0f172a] uppercase tracking-tighter mb-2">No transactions yet</h3>
            <p className="text-slate-500 font-bold text-sm max-w-sm mx-auto">
              Refer friends to start earning wallet credits.
            </p>
          </div>
        )}
      </GlassCard>
    </div>
  )
}

// ─── REFERRAL TAB ──────────────────────────────────────────────────────────────
const ReferralTab = () => {
  const [loading, setLoading]           = useState(true)
  const [referralCode, setReferralCode] = useState('')
  const [currentBalance, setCurrentBalance] = useState(0)
  const [stats, setStats] = useState({
    total_referrals: 0, completed_referrals: 0, pending_referrals: 0, total_earned: 0,
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
      } catch {
        toast.error('Failed to load referral data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const copyToClipboard = (text, label = 'Copied!') => {
    navigator.clipboard.writeText(text)
    toast.success(label)
  }

  const handleShareWhatsApp = () => {
    const msg = `Join Thapsus Cargo and ship from UK & China to Kenya! Sign up using my code and we both benefit.\n\nReferral code: ${referralCode}\n👉 ${window.location.origin}/register?ref=${referralCode}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const handleShareEmail = () => {
    const subject = 'Join Thapsus Cargo – use my referral code'
    const body = `Hey!\n\nI use Thapsus Cargo to ship from the UK & China to Kenya. Sign up with my referral code ${referralCode} and we BOTH get KES 50 wallet credit when you place your first order!\n\nhttps://thapsus.uk/register?ref=${referralCode}`
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-10">
      {/* Header blurb */}
      <div className="text-center px-2">
        <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-white/60 backdrop-blur-md border border-white/50 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 shadow-sm mb-4">
          <Sparkles size={12} className="text-orange-700" />
          Partnership Program
        </div>
        <p className="text-slate-500 font-bold max-w-2xl mx-auto leading-relaxed text-sm md:text-base">
          Share your unique code. Every time someone you refer places their{' '}
          <strong className="text-[#0f172a]">first order</strong>, you earn{' '}
          <strong className="text-orange-700">KES 50</strong> in wallet credit automatically.
        </p>
      </div>

      {/* Referral code card */}
      <div className="transform lg:-rotate-1 hover:rotate-0 transition-all duration-700 mx-2 md:mx-0">
        <GlassCard className="p-6 md:p-12 group hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] transition-all flex flex-col lg:flex-row items-center justify-between gap-8 bg-gradient-to-br from-white/40 to-orange-50/40 border-orange-200/50">
          <div className="w-full lg:w-auto flex-1 flex flex-col items-center lg:items-start">
            <h2 className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-400 mb-3 text-center lg:text-left">Your Referral Code</h2>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full">
              <div className="w-full sm:flex-1 bg-white/80 backdrop-blur-md rounded-2xl border-2 border-orange-300/50 px-4 md:px-8 py-5 text-3xl md:text-5xl font-black text-center lg:text-left tracking-[0.2em] md:tracking-[0.3em] text-[#0f172a] font-mono select-all shadow-inner overflow-hidden text-ellipsis whitespace-nowrap">
                {referralCode}
              </div>
              <button
                onClick={() => copyToClipboard(referralCode, 'Code copied!')}
                className="glass-sheen w-full sm:w-auto bg-[#0f172a] hover:bg-slate-800 text-white px-8 md:px-10 py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-xs md:text-sm flex items-center justify-center gap-2 transition-all shadow-xl hover:-translate-y-1 whitespace-nowrap"
              >
                <Copy size={18} /> Copy Code
              </button>
            </div>
          </div>

          <div className="w-full lg:w-auto lg:border-l border-slate-200/50 lg:pl-10 pt-8 lg:pt-0 border-t lg:border-t-0">
            <p className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-400 mb-4 text-center lg:text-left">Share Network</p>
            <div className="grid grid-cols-2 gap-4 w-full lg:min-w-[320px]">
              <button onClick={handleShareWhatsApp}
                className="bg-white/80 hover:bg-white backdrop-blur-md border border-green-200 text-slate-700 px-4 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-xs md:text-sm transition-colors shadow-sm">
                <MessageCircle size={18} className="text-green-500" /> WhatsApp
              </button>
              <button onClick={handleShareEmail}
                className="bg-white/80 hover:bg-white backdrop-blur-md border border-blue-200 text-slate-700 px-4 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-xs md:text-sm transition-colors shadow-sm">
                <Mail size={18} className="text-blue-500" /> Email
              </button>
              <button onClick={() => copyToClipboard(`${window.location.origin}/register?ref=${referralCode}`, 'Link copied!')}
                className="bg-white/80 hover:bg-white backdrop-blur-md border border-purple-200 text-slate-700 px-4 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-xs md:text-sm transition-colors shadow-sm">
                <Share2 size={18} className="text-purple-500" /> Copy Link
              </button>
              <button
                onClick={() => navigator.share?.({ title: 'Thapsus Cargo', text: `Use my code: ${referralCode}`, url: `${window.location.origin}/register?ref=${referralCode}` }).catch(() => {})}
                className="bg-white/80 hover:bg-white backdrop-blur-md border border-orange-200 text-slate-700 px-4 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-xs md:text-sm transition-colors shadow-sm">
                <Share2 size={18} className="text-orange-700" /> Share OS
              </button>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
        <GlassCard className="p-8 md:p-10 flex flex-col justify-center group hover:-translate-y-2 transition-all duration-500">
          <div className="flex items-center justify-between mb-6">
            <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-400">Referred</span>
            <Users size={24} className="text-blue-500" />
          </div>
          <p className="text-5xl md:text-6xl font-black text-[#0f172a] tracking-tighter leading-none truncate">{stats.total_referrals || 0}</p>
        </GlassCard>
        <GlassCard className="p-8 md:p-10 flex flex-col justify-center group hover:-translate-y-2 transition-all duration-500 border-yellow-200/50 bg-yellow-50/20">
          <div className="flex items-center justify-between mb-6">
            <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-yellow-600/60">Awaiting Order</span>
            <Clock size={24} className="text-yellow-500" />
          </div>
          <p className="text-5xl md:text-6xl font-black text-[#0f172a] tracking-tighter leading-none truncate">{stats.pending_referrals || 0}</p>
        </GlassCard>
        <GlassCard className="p-8 md:p-10 flex flex-col justify-center group hover:-translate-y-2 transition-all duration-500 border-green-200/50 bg-green-50/20">
          <div className="flex items-center justify-between mb-6">
            <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-green-600/60">Credited</span>
            <CheckCircle size={24} className="text-green-500" />
          </div>
          <p className="text-5xl md:text-6xl font-black text-[#0f172a] tracking-tighter leading-none truncate">{stats.completed_referrals || 0}</p>
        </GlassCard>
        <GlassCard className="p-8 md:p-10 flex flex-col justify-center group hover:-translate-y-2 transition-all duration-500 border-orange-200/50 bg-orange-50/20">
          <div className="flex items-center justify-between mb-6">
            <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-orange-600/60">Total Earned</span>
            <Gift size={24} className="text-orange-700" />
          </div>
          <p className="text-4xl md:text-5xl font-black text-[#0f172a] tracking-tighter leading-none text-orange-600 truncate">
            <span className="text-lg md:text-xl text-orange-700 mr-2">KES</span>
            {(stats.total_earned || 0).toLocaleString()}
          </p>
        </GlassCard>
      </div>

      {/* Available balance banner */}
      {currentBalance > 0 && (
        <div className="p-1.5 bg-gradient-to-br from-green-400 via-emerald-300 to-teal-400 rounded-[3rem] shadow-2xl transition-all hover:scale-[1.01] mx-2 md:mx-0">
          <div className="h-full w-full bg-white/95 backdrop-blur-3xl rounded-[2.85rem] p-8 md:p-12 flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
            <div className="w-20 h-20 bg-green-100 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
              <Gift size={40} className="text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="font-black text-3xl md:text-4xl text-[#0f172a] tracking-tighter uppercase mb-2 truncate">
                KES {currentBalance.toLocaleString()} <span className="text-green-500">Available</span>
              </p>
              <p className="text-sm md:text-base font-bold text-slate-500">This credit will be automatically deducted from your next order total.</p>
            </div>
          </div>
        </div>
      )}

      {/* Network table */}
      <GlassCard className="!p-0 overflow-hidden mx-2 md:mx-0">
        <div className="px-8 md:px-10 py-8 border-b border-white/50 bg-white/30 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-[#0f172a] uppercase tracking-tighter">Your Network</h2>
            <p className="text-sm md:text-base font-bold text-slate-500 mt-2">Track their progress towards earning you KES 50.</p>
          </div>
          <Users size={40} className="text-slate-300 hidden sm:block shrink-0" />
        </div>
        {referredUsers.length > 0 ? (
          <div className="bg-white/50 backdrop-blur-md w-full overflow-hidden">
            <div className="overflow-x-auto no-scrollbar w-full">
              <table className="w-full text-left whitespace-nowrap min-w-max">
                <thead className="bg-[#0f172a]/5">
                  <tr>
                    <th className="px-8 py-6 text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">Name</th>
                    <th className="px-8 py-6 text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">Referred On</th>
                    <th className="px-8 py-6 text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest text-center">Signed Up</th>
                    <th className="px-8 py-6 text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest text-center">First Order</th>
                    <th className="px-8 py-6 text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest text-center">Reward</th>
                    <th className="px-8 py-6 text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/50">
                  {referredUsers.map((ref) => (
                    <tr key={ref.id} className="hover:bg-white/40 transition-colors">
                      <td className="px-8 py-6">
                        <p className="text-sm md:text-base font-black text-[#0f172a]">{ref.referee_name}</p>
                        <p className="text-[10px] md:text-xs font-bold text-slate-500 mt-1">{ref.referee_email}</p>
                      </td>
                      <td className="px-8 py-6 text-xs md:text-sm font-bold text-slate-600">
                        {new Date(ref.referred_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-8 py-6 text-center">
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-100 shadow-sm">
                          <CheckCircle size={20} className="text-green-600" />
                        </span>
                      </td>
                      <td className="px-8 py-6 text-center">
                        {ref.first_order_placed ? (
                          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-100 shadow-sm">
                            <CheckCircle size={20} className="text-green-600" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 shadow-sm" title="Waiting for their first order">
                            <Clock size={20} className="text-amber-500" />
                          </span>
                        )}
                      </td>
                      <td className="px-8 py-6 text-center">
                        {ref.reward_status === 'completed' ? (
                          <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm bg-green-50 text-green-700 border-green-200">
                            <CheckCircle size={14} /> Credited
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm bg-amber-50 text-amber-700 border-amber-200">
                            <Clock size={14} /> Pending
                          </span>
                        )}
                      </td>
                      <td className="px-8 py-6 text-right">
                        {ref.reward_status === 'completed' ? (
                          <span className="text-base font-black text-green-600">+KES {ref.reward_amount}</span>
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
          <div className="p-16 md:p-24 text-center bg-white/30 backdrop-blur-md">
            <Users size={64} className="text-slate-300 mx-auto mb-6" />
            <h3 className="text-xl md:text-2xl font-black text-[#0f172a] uppercase tracking-tighter mb-3">No referrals yet</h3>
            <p className="text-slate-500 font-bold text-sm md:text-base max-w-md mx-auto leading-relaxed">
              Share your code above to start earning. You'll be able to track each person's progress here.
            </p>
          </div>
        )}
      </GlassCard>

      {/* How it works */}
      <div className="relative overflow-hidden rounded-[2.5rem] bg-[#0f172a] p-10 md:p-16 text-white shadow-2xl mx-2 md:mx-0">
        <div className="absolute top-[-20%] left-[-10%] w-80 h-80 bg-orange-500/20 blur-[100px] -z-0 pointer-events-none" />
        <div className="relative z-10">
          <h3 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter mb-10">How It Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { n: '1', title: 'Share Your Code', desc: 'Send your unique referral code to friends via WhatsApp, email, or a direct link.' },
              { n: '2', title: 'They Sign Up', desc: 'Your friend creates a Thapsus Cargo account using your referral code.' },
              { n: '3', title: 'They Place Order', desc: 'Once they place their first shipment, KES 50 is instantly added to your wallet.' },
            ].map(({ n, title, desc }) => (
              <div key={n} className="flex flex-col md:flex-row gap-5 text-center md:text-left items-center md:items-start">
                <div className="w-14 h-14 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl flex items-center justify-center font-black text-xl shrink-0 text-orange-400 shadow-inner">{n}</div>
                <div>
                  <p className="font-black text-xl mb-3 tracking-tight">{title}</p>
                  <p className="text-sm md:text-base text-slate-400 font-medium leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── PAGE ROOT ─────────────────────────────────────────────────────────────────
export const Wallet = () => {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState('wallet')
  const [loading, setLoading]     = useState(true)
  const [balance, setBalance]     = useState(0)
  const [transactions, setTransactions] = useState([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [walletResult, txResult] = await Promise.allSettled([
          walletApi.getBalance(),
          walletApi.getTransactions(),
        ])
        if (walletResult.status === 'fulfilled') {
          setBalance(walletResult.value.data?.wallet?.balance ?? 0)
        }
        if (txResult.status === 'fulfilled') {
          setTransactions(txResult.value.data?.transactions || [])
        }
      } catch {
        toast.error('Failed to load wallet data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f8fafc]">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const tabs = [
    { id: 'wallet',   label: 'Wallet & Balance', icon: <TrendingUp size={16} /> },
    { id: 'referral', label: 'Referral',          icon: <Gift       size={16} /> },
  ]

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-x-hidden relative pb-24">
      <PageStyles />

      {/* Liquid backgrounds */}
      <LiquidBlob className="top-[-5%] left-[-10%] w-[400px] h-[400px] md:w-[600px] md:h-[600px]" color="bg-blue-200" />
      <LiquidBlob className="bottom-[20%] right-[-5%] w-[350px] h-[350px] md:w-[500px] md:h-[500px]" color="bg-orange-200" />
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-12 relative z-10">

        {/* Page header */}
        <div className="text-center mb-10 px-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-white/60 backdrop-blur-md border border-white/50 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 shadow-sm mb-4">
            <Gift size={12} className="text-orange-700" />
            Financial Centre
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-[#0f172a] tracking-tighter uppercase leading-none mb-4">
            Wallet &amp; Referral
          </h1>
          <p className="text-slate-500 font-bold max-w-xl mx-auto leading-relaxed text-sm md:text-base">
            Manage your balance, view transactions, and grow your network to earn credit.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex justify-center mb-10">
          <div className="flex gap-2 bg-white/50 backdrop-blur-md border border-white/50 p-1.5 rounded-2xl shadow-sm">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all duration-300 ${
                  activeTab === tab.id
                    ? 'bg-[#0f172a] text-white shadow-md'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        {activeTab === 'wallet'
          ? <WalletTab balance={balance} transactions={transactions} />
          : <ReferralTab />
        }
      </div>
    </div>
  )
}
