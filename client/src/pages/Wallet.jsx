import React, { useState, useEffect } from 'react'
import { Gift, TrendingUp, CreditCard, Info, Phone, CheckCircle, Copy, Send, Zap } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { walletApi, referralApi } from '../api'
import toast from 'react-hot-toast'

// --- CUSTOM STYLES & GLASS COMPONENTS ---
const WalletStyles = () => (
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

export const Wallet = () => {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [referralStats, setReferralStats] = useState(null)

  // Mpesa payment state
  const [mpesaMessage, setMpesaMessage] = useState('')
  const [mpesaAmount, setMpesaAmount] = useState('')
  const [submittingMpesa, setSubmittingMpesa] = useState(false)
  const [mpesaSubmitted, setMpesaSubmitted] = useState(false)

  // Read pay params from URL (e.g., /wallet?pay=ORDER_ID&amount=5000)
  const urlParams = new URLSearchParams(window.location.search)
  const payOrderId = urlParams.get('pay')
  const payAmount = urlParams.get('amount')

  useEffect(() => {
    if (payAmount && !mpesaAmount) {
      setMpesaAmount(payAmount)
    }
  }, [payAmount])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [walletResult, txResult, referralResult] = await Promise.allSettled([
          walletApi.getBalance(),
          walletApi.getTransactions(),
          referralApi.getStats(),
        ])

        if (walletResult.status === 'fulfilled') {
          setBalance(walletResult.value.data?.wallet?.balance ?? 0)
        }
        if (txResult.status === 'fulfilled') {
          setTransactions(txResult.value.data?.transactions || [])
        }
        if (referralResult.status === 'fulfilled') {
          setReferralStats(referralResult.value.data)
        }
      } catch (err) {
        toast.error('Failed to load wallet data')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleSubmitMpesa = async () => {
    if (!mpesaMessage.trim()) {
      toast.error('Please paste your Mpesa confirmation message')
      return
    }
    try {
      setSubmittingMpesa(true)
      await walletApi.submitMpesaConfirmation(
        mpesaMessage.trim(),
        payOrderId || null,
        parseFloat(mpesaAmount) || 0
      )
      toast.success('Mpesa payment submitted! Our team will verify and update your account.')
      setMpesaSubmitted(true)
      setMpesaMessage('')
      setMpesaAmount('')
      // Refresh transactions
      const txResult = await walletApi.getTransactions()
      setTransactions(txResult.data?.transactions || [])
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit Mpesa confirmation')
    } finally {
      setSubmittingMpesa(false)
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  const inputClass = "w-full px-6 py-4 bg-white/60 backdrop-blur-md border border-white/50 rounded-[1.5rem] focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 text-slate-800 font-bold placeholder-slate-400 transition-all shadow-sm";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f8fafc]">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-x-hidden relative pb-24">
      <WalletStyles />
      
      {/* --- LIQUID BACKGROUNDS --- */}
      <LiquidBlob className="top-[-5%] left-[-10%] w-[400px] h-[400px] md:w-[600px] md:h-[600px]" color="bg-blue-200" />
      <LiquidBlob className="bottom-[20%] right-[-5%] w-[350px] h-[350px] md:w-[500px] md:h-[500px]" color="bg-orange-200" />
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-12 relative z-10">
        
        {/* Header */}
        <div className="text-center mb-12 lg:mb-16 px-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-white/60 backdrop-blur-md border border-white/50 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 shadow-sm mb-4">
            <Gift size={12} className="text-orange-500" />
            Financial Center
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-[#0f172a] tracking-tighter uppercase leading-none mb-4">
            {t('wallet.balance')}
          </h1>
          <p className="text-slate-500 font-bold max-w-xl mx-auto leading-relaxed text-sm md:text-base">
            Manage your payments, view transactions, and track referral credit.
          </p>
        </div>

        {/* Balance Card (Dark Glass Bento) */}
        <div className="relative group overflow-hidden rounded-[2.5rem] bg-[#0f172a] p-8 md:p-12 text-white shadow-2xl flex flex-col transition-all hover:scale-[1.01] mb-12 mx-2 md:mx-0">
          <div className="absolute top-[-20%] right-[-10%] w-80 h-80 bg-orange-500/20 blur-[100px] -z-0 pointer-events-none animate-pulse" />
          <div className="relative z-10 flex flex-col md:flex-row items-center md:items-end justify-between gap-8 text-center md:text-left">
            <div>
              <p className="text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Referral Credit Balance</p>
              <h2 className="text-5xl md:text-7xl font-black tracking-tighter text-white leading-none">
                <span className="text-2xl md:text-3xl text-orange-500 mr-2">KES</span>{balance.toLocaleString()}
              </h2>
            </div>
            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-3xl p-5 max-w-sm flex flex-col sm:flex-row items-center sm:items-start gap-4 shadow-inner text-center sm:text-left">
              <Info size={28} className="text-orange-400 shrink-0" />
              <p className="text-xs text-slate-300 font-bold leading-relaxed">
                This credit is earned by referring new customers. It is automatically deducted from your next order total.
              </p>
            </div>
          </div>
        </div>

       {/* ═══ Mpesa Payment Section (Border Gradient & Tilted) ═══ */}
        <div className="transform lg:-rotate-[0.5deg] hover:rotate-0 transition-all duration-700 perspective-1000 mb-12 mx-2 md:mx-0">
          <div className="p-1 bg-gradient-to-br from-green-400 via-emerald-300 to-teal-400 rounded-[3rem] shadow-2xl group transition-all hover:scale-[1.002]">
            <div className="h-full w-full bg-white/95 backdrop-blur-3xl rounded-[2.9rem] p-6 md:p-12">
              
              <div className="flex flex-col md:flex-row items-center md:items-start gap-6 mb-10 text-center md:text-left">
                <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                  <Phone size={32} className="text-green-600" />
                </div>
                <div>
                  <h2 className="text-3xl md:text-4xl font-black text-[#0f172a] uppercase tracking-tighter mb-2">Pay via M-Pesa</h2>
                  <p className="text-sm font-bold text-slate-500">Send payment using the details below, then confirm via SMS.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* Paybill Details */}
                <div className="bg-slate-900/5 border border-white/50 rounded-[2rem] p-6 md:p-8 shadow-inner h-full flex flex-col">
                  <h3 className="font-black text-xs uppercase tracking-widest text-slate-500 mb-6">M-Pesa Paybill Details</h3>
                  <div className="space-y-4 flex-1">
                    <div className="flex items-center justify-between bg-white/80 backdrop-blur-md rounded-2xl px-6 py-4 border border-white shadow-sm">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Business No.</p>
                        <p className="text-2xl font-black text-[#0f172a] font-mono tracking-widest mt-1">XXXXXX</p>
                      </div>
                      <button onClick={() => copyToClipboard('XXXXXX')} className="p-3 rounded-xl bg-slate-50 hover:bg-green-50 text-slate-400 hover:text-green-600 transition-colors shadow-sm">
                        <Copy size={20} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-white/80 backdrop-blur-md rounded-2xl px-6 py-4 border border-white shadow-sm">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Account No.</p>
                        <p className="text-2xl font-black text-[#0f172a] font-mono tracking-widest mt-1">XXXXXX</p>
                      </div>
                      <button onClick={() => copyToClipboard('XXXXXX')} className="p-3 rounded-xl bg-slate-50 hover:bg-green-50 text-slate-400 hover:text-green-600 transition-colors shadow-sm">
                        <Copy size={20} />
                      </button>
                    </div>

                    {payAmount && (
                      <div className="bg-orange-50/80 backdrop-blur-md rounded-2xl px-6 py-4 border border-orange-200/50 shadow-sm">
                        <p className="text-[10px] font-black text-orange-500/80 uppercase tracking-widest">Amount Due</p>
                        <p className="text-2xl font-black text-orange-600 mt-1">KES {parseFloat(payAmount).toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Mpesa Confirmation Form */}
                <div className="flex flex-col justify-center">
                  {mpesaSubmitted ? (
                    <div className="bg-green-50 border border-green-300 rounded-[2rem] p-8 text-center shadow-sm animate-in fade-in zoom-in duration-300">
                      <CheckCircle size={56} className="mx-auto text-green-500 mb-4" />
                      <h3 className="text-2xl font-black text-green-800 uppercase tracking-tighter mb-3">Payment Submitted!</h3>
                      <p className="text-green-700 font-bold text-sm mb-6">
                        Our team will verify your M-Pesa payment and update your account. This usually takes a few minutes.
                      </p>
                      <button onClick={() => setMpesaSubmitted(false)} className="text-[#0f172a] font-black text-xs uppercase tracking-widest underline hover:text-orange-500 transition-colors">
                        Submit another payment
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-2">
                          Amount Paid (KES)
                        </label>
                        <input
                          type="number"
                          value={mpesaAmount}
                          onChange={(e) => setMpesaAmount(e.target.value)}
                          placeholder="e.g. 5000"
                          className={inputClass + " text-xl"}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-2">
                          Paste M-Pesa Confirmation Message *
                        </label>
                        <textarea
                          value={mpesaMessage}
                          onChange={(e) => setMpesaMessage(e.target.value)}
                          placeholder="e.g. ABC123XYZ Confirmed. Ksh5,000.00 sent to Thapsus Cargo Ltd..."
                          rows={4}
                          className={inputClass + " text-sm resize-none font-mono"}
                        />
                      </div>
                      <button
                        onClick={handleSubmitMpesa}
                        disabled={submittingMpesa || !mpesaMessage.trim()}
                        className="glass-sheen w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all shadow-xl hover:-translate-y-1"
                      >
                        {submittingMpesa ? (
                          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                          </svg>
                        ) : (
                          <Send size={18} />
                        )}
                        {submittingMpesa ? 'Submitting...' : 'Submit Confirmation'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Referral Summary (Crystal Bento) */}
        {referralStats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12 mx-2 md:mx-0">
            <GlassCard className="p-8 flex flex-col items-center text-center group hover:-translate-y-2 transition-all duration-500">
              <TrendingUp className="text-blue-500 mb-4 group-hover:scale-110 transition-transform" size={32} />
              <p className="text-4xl font-black text-[#0f172a] tracking-tighter mb-1">
                {referralStats.total_referrals ?? referralStats.totalReferrals ?? 0}
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Referrals</p>
            </GlassCard>
            <GlassCard className="p-8 flex flex-col items-center text-center group hover:-translate-y-2 transition-all duration-500">
              <Gift className="text-orange-500 mb-4 group-hover:scale-110 transition-transform" size={32} />
              <p className="text-4xl font-black text-[#0f172a] tracking-tighter mb-1">
                <span className="text-xl text-orange-500 mr-1">KES</span>{(referralStats.total_earned ?? referralStats.totalEarned ?? 0).toLocaleString()}
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Earned</p>
            </GlassCard>
            <GlassCard className="p-8 flex flex-col items-center text-center group hover:-translate-y-2 transition-all duration-500">
              <CreditCard className="text-green-500 mb-4 group-hover:scale-110 transition-transform" size={32} />
              <p className="text-4xl font-black text-[#0f172a] tracking-tighter mb-1">
                <span className="text-xl text-green-500 mr-1">KES</span>{balance.toLocaleString()}
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Available Credit</p>
            </GlassCard>
          </div>
        )}

        {/* How it works (Dark Glass Bento) */}
        <div className="relative group overflow-hidden rounded-[2.5rem] bg-[#0f172a] p-8 md:p-12 text-white shadow-2xl flex flex-col transition-all hover:scale-[1.01] mb-12 mx-2 md:mx-0">
          <div className="absolute top-[-20%] left-[-10%] w-64 h-64 bg-orange-500/20 blur-[80px] -z-0 pointer-events-none" />
          <div className="relative z-10">
            <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter mb-8">How referral credit works</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 text-orange-400 shadow-inner">1</div>
                <div>
                  <p className="text-sm text-slate-300 font-bold leading-relaxed pt-1">Share your unique referral code with friends and family.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 text-orange-400 shadow-inner">2</div>
                <div>
                  <p className="text-sm text-slate-300 font-bold leading-relaxed pt-1">When someone signs up using your code and places their first order, you earn credit.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 text-orange-400 shadow-inner">3</div>
                <div>
                  <p className="text-sm text-slate-300 font-bold leading-relaxed pt-1">Your credit balance is automatically deducted from your shipping + handling fee on your next order.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 text-orange-400 shadow-inner">4</div>
                <div>
                  <p className="text-sm text-slate-300 font-bold leading-relaxed pt-1">There's no expiry — your credit stays until you use it.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <GlassCard className="!p-0 overflow-hidden mx-2 md:mx-0">
          <div className="px-8 py-6 border-b border-white/50 bg-white/30 backdrop-blur-md">
            <h2 className="text-2xl font-black text-[#0f172a] uppercase tracking-tighter">{t('wallet.history')}</h2>
          </div>

          {transactions.length > 0 ? (
            <div className="bg-white/50 backdrop-blur-md w-full overflow-hidden">
              <div className="overflow-x-auto no-scrollbar w-full">
                <table className="w-full text-left whitespace-nowrap min-w-max">
                  <thead className="bg-[#0f172a]/5">
                    <tr>
                      <th className="px-8 py-6 text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">{t('wallet.type')}</th>
                      <th className="px-8 py-6 text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">Amount</th>
                      <th className="px-8 py-6 text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">{t('wallet.date')}</th>
                      <th className="px-8 py-6 text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">{t('wallet.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/50">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-white/40 transition-colors">
                        <td className="px-8 py-5">
                          <span className={`inline-block px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm border ${
                            tx.type === 'referral_credit' || tx.type === 'referral'
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : tx.type === 'payment'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : tx.type === 'deposit'
                                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                                  : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}>
                            {tx.type?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-sm md:text-base font-black">
                          <span className={tx.type === 'payment' ? 'text-red-600' : 'text-green-600'}>
                            {tx.type === 'payment' ? '-' : '+'} KES {Math.abs(tx.amount).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-xs md:text-sm font-bold text-slate-600">
                          {new Date(tx.created_at || tx.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-8 py-5">
                          <span className={`inline-block px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm border ${
                            tx.status === 'completed'
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : tx.status === 'pending'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-red-50 text-red-700 border-red-200'
                          }`}>
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-16 md:p-24 text-center bg-white/30 backdrop-blur-md">
              <CreditCard className="mx-auto text-slate-300 mb-6" size={64} />
              <h3 className="text-xl md:text-2xl font-black text-[#0f172a] uppercase tracking-tighter mb-3">No transactions yet</h3>
              <p className="text-slate-500 font-bold text-sm md:text-base max-w-md mx-auto">
                Refer a friend or make a deposit to see your history here.
              </p>
            </div>
          )}
        </GlassCard>

      </div>
    </div>
  )
}
