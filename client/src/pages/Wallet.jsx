import React, { useState, useEffect } from 'react'
import { Gift, TrendingUp, CreditCard, Info } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { walletApi, referralApi } from '../api'
import toast from 'react-hot-toast'

export const Wallet = () => {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [referralStats, setReferralStats] = useState(null)

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-2">
            {t('wallet.balance')}
          </h1>
          <p className="text-gray-600">Your referral credit balance — applied automatically at checkout</p>
        </div>

        {/* Balance Card */}
        <div className="bg-gradient-to-br from-[#1e3a5f] to-[#152d4a] rounded-xl p-8 mb-8 text-white shadow-lg">
          <p className="text-gray-300 mb-1">Referral Credit Balance</p>
          <h2 className="text-5xl md:text-6xl font-bold mb-4">
            KES {balance.toLocaleString()}
          </h2>
          <div className="bg-white/10 rounded-lg px-4 py-3 flex items-start gap-3">
            <Info size={18} className="text-orange-300 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-200">
              This credit is earned by referring new customers. It is automatically deducted from your next order total — you don't need to do anything.
            </p>
          </div>
        </div>

        {/* Referral Summary */}
        {referralStats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="card text-center">
              <TrendingUp className="mx-auto text-orange-500 mb-2" size={28} />
              <p className="text-2xl font-bold text-[#1e3a5f]">
                {referralStats.total_referrals ?? referralStats.totalReferrals ?? 0}
              </p>
              <p className="text-sm text-gray-500">Total Referrals</p>
            </div>
            <div className="card text-center">
              <Gift className="mx-auto text-green-500 mb-2" size={28} />
              <p className="text-2xl font-bold text-[#1e3a5f]">
                KES {(referralStats.total_earned ?? referralStats.totalEarned ?? 0).toLocaleString()}
              </p>
              <p className="text-sm text-gray-500">Total Earned</p>
            </div>
            <div className="card text-center">
              <CreditCard className="mx-auto text-blue-500 mb-2" size={28} />
              <p className="text-2xl font-bold text-[#1e3a5f]">
                KES {balance.toLocaleString()}
              </p>
              <p className="text-sm text-gray-500">Available Credit</p>
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="card mb-8">
          <h2 className="text-xl font-bold text-[#1e3a5f] mb-4">How referral credit works</h2>
          <ol className="space-y-3 text-sm text-gray-700">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-600 font-bold flex items-center justify-center text-xs">1</span>
              Share your unique referral code with friends and family.
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-600 font-bold flex items-center justify-center text-xs">2</span>
              When someone signs up using your code and places their first order, you earn credit.
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-600 font-bold flex items-center justify-center text-xs">3</span>
              Your credit balance is automatically deducted from your shipping + handling fee on your next order.
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-600 font-bold flex items-center justify-center text-xs">4</span>
              There's no expiry — your credit stays until you use it.
            </li>
          </ol>
        </div>

        {/* Transaction History */}
        <div className="card">
          <h2 className="text-xl font-bold text-[#1e3a5f] mb-6">{t('wallet.history')}</h2>

          {transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">{t('wallet.type')}</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Amount</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">{t('wallet.date')}</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">{t('wallet.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4 text-sm">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                          tx.type === 'referral_credit' || tx.type === 'referral'
                            ? 'bg-green-100 text-green-700'
                            : tx.type === 'payment'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-700'
                        }`}>
                          {tx.type?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold">
                        <span className={tx.type === 'payment' ? 'text-red-600' : 'text-green-600'}>
                          {tx.type === 'payment' ? '-' : '+'} KES {Math.abs(tx.amount).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {new Date(tx.created_at || tx.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                          tx.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : tx.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                        }`}>
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <CreditCard className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-600">No transactions yet. Refer a friend to earn credit!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
