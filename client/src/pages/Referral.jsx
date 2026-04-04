import React, { useState, useEffect } from 'react'
import {
  Copy, MessageCircle, Mail, Share2, TrendingUp,
  CheckCircle, Clock, AlertCircle, Gift, Users
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import api from '../api/client'
import toast from 'react-hot-toast'

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
    const msg = `Join SwiftCargo and ship from UK, USA & China to Kenya! Sign up using my code and we both benefit.\n\nReferral code: ${referralCode}\n👉 ${window.location.origin}/register?ref=${referralCode}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const handleShareEmail = () => {
    const subject = 'Join SwiftCargo – use my referral code'
    const body = `Hey!\n\nI use SwiftCargo to ship from the UK, USA & China to Kenya. Sign up with my referral code ${referralCode} and I get KES 50 wallet credit after you place your first order.\n\nhttps://swiftcargo.com/register?ref=${referralCode}`
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-3">Refer & Earn</h1>
          <p className="text-gray-600 max-w-xl mx-auto">
            Share your unique code. Every time someone you refer places their <strong>first order</strong>, you earn <strong>KES 50</strong> in wallet credit automatically.
          </p>
        </div>

        {/* Referral Code Card */}
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-xl p-6 mb-8 shadow-sm">
          <h2 className="text-xl font-bold text-[#1e3a5f] mb-4">Your Referral Code</h2>
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 bg-white rounded-lg border-2 border-orange-300 px-4 py-3 text-2xl font-bold text-center tracking-[0.3em] text-[#1e3a5f] font-mono select-all">
              {referralCode}
            </div>
            <button onClick={handleCopyCode}
              className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-3 rounded-lg font-bold flex items-center gap-2 transition-colors whitespace-nowrap">
              <Copy size={18} /> Copy Code
            </button>
          </div>

          <p className="text-sm font-medium text-gray-700 mb-3">Share via</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button onClick={handleShareWhatsApp}
              className="bg-white hover:bg-gray-50 border-2 border-green-500 text-gray-900 px-4 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 text-sm transition-colors">
              <MessageCircle size={18} className="text-green-500" /> WhatsApp
            </button>
            <button onClick={handleShareEmail}
              className="bg-white hover:bg-gray-50 border-2 border-blue-500 text-gray-900 px-4 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 text-sm transition-colors">
              <Mail size={18} className="text-blue-500" /> Email
            </button>
            <button onClick={handleCopyLink}
              className="bg-white hover:bg-gray-50 border-2 border-purple-500 text-gray-900 px-4 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 text-sm transition-colors">
              <Share2 size={18} className="text-purple-500" /> Copy Link
            </button>
            <button
              onClick={() => navigator.share?.({ title: 'SwiftCargo', text: `Use my code: ${referralCode}`, url: `${window.location.origin}/register?ref=${referralCode}` }).catch(() => {})}
              className="bg-white hover:bg-gray-50 border-2 border-orange-500 text-gray-900 px-4 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 text-sm transition-colors">
              <Share2 size={18} className="text-orange-500" /> Share
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Users size={18} className="text-blue-500" />
              <p className="text-xs text-gray-500 font-medium">Total Referred</p>
            </div>
            <p className="text-3xl font-bold text-[#1e3a5f]">{stats.total_referrals || 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={18} className="text-yellow-500" />
              <p className="text-xs text-gray-500 font-medium">Awaiting Order</p>
            </div>
            <p className="text-3xl font-bold text-yellow-600">{stats.pending_referrals || 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={18} className="text-green-500" />
              <p className="text-xs text-gray-500 font-medium">Credited</p>
            </div>
            <p className="text-3xl font-bold text-green-600">{stats.completed_referrals || 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Gift size={18} className="text-orange-500" />
              <p className="text-xs text-gray-500 font-medium">Total Earned</p>
            </div>
            <p className="text-3xl font-bold text-orange-600">KES {(stats.total_earned || 0).toLocaleString()}</p>
          </div>
        </div>

        {/* Wallet Balance Banner */}
        {currentBalance > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-8 flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-full">
              <Gift size={24} className="text-green-600" />
            </div>
            <div>
              <p className="font-bold text-green-800 text-lg">KES {currentBalance.toLocaleString()} wallet credit available</p>
              <p className="text-green-700 text-sm">This will be automatically deducted from your next order total.</p>
            </div>
          </div>
        )}

        {/* Referred Users Tracking Table */}
        {referredUsers.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-8">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-xl font-bold text-[#1e3a5f]">People You've Referred</h2>
              <p className="text-sm text-gray-500 mt-1">Track their progress towards earning you KES 50</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Referred On</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Signed Up</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">First Order</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Reward</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {referredUsers.map((ref) => (
                    <tr key={ref.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-gray-900">{ref.referee_name}</p>
                        <p className="text-xs text-gray-400">{ref.referee_email}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(ref.referred_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      {/* Step 1: Signed Up */}
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-100">
                          <CheckCircle size={16} className="text-green-600" />
                        </span>
                      </td>
                      {/* Step 2: First Order */}
                      <td className="px-6 py-4 text-center">
                        {ref.first_order_placed ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-100">
                            <CheckCircle size={16} className="text-green-600" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-yellow-100" title="Waiting for their first order">
                            <Clock size={16} className="text-yellow-500" />
                          </span>
                        )}
                      </td>
                      {/* Reward status badge */}
                      <td className="px-6 py-4 text-center">
                        {ref.reward_status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                            <CheckCircle size={12} /> Credited
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                            <Clock size={12} /> Pending
                          </span>
                        )}
                      </td>
                      {/* Amount */}
                      <td className="px-6 py-4 text-right">
                        {ref.reward_status === 'completed' ? (
                          <span className="text-sm font-bold text-green-600">+KES {ref.reward_amount}</span>
                        ) : (
                          <span className="text-sm text-gray-400">KES 50</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center mb-8">
            <Users size={40} className="text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No referrals yet</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              Share your code above to start earning. You'll be able to track each person's progress here.
            </p>
          </div>
        )}

        {/* How It Works */}
        <div className="bg-[#1e3a5f] text-white rounded-xl p-6">
          <h3 className="font-bold text-lg mb-4">How It Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center font-bold text-sm">1</span>
              <div>
                <p className="font-semibold mb-1">Share Your Code</p>
                <p className="text-sm text-blue-200">Send your unique referral code to friends via WhatsApp, email, or a direct link.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center font-bold text-sm">2</span>
              <div>
                <p className="font-semibold mb-1">They Sign Up</p>
                <p className="text-sm text-blue-200">Your friend creates a SwiftCargo account using your referral code.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center font-bold text-sm">3</span>
              <div>
                <p className="font-semibold mb-1">They Place First Order</p>
                <p className="text-sm text-blue-200">Once they place their first shipment, <strong>KES 50</strong> is instantly added to your wallet. No delays.</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
