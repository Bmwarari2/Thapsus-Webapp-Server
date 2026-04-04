import React, { useState, useEffect } from 'react'
import { Gift, TrendingUp, CreditCard, Info, Phone, CheckCircle, Copy, Send } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { walletApi, referralApi } from '../api'
import toast from 'react-hot-toast'

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
          <p className="text-gray-600">Manage your payments and referral credit balance</p>
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
              This credit is earned by referring new customers. It is automatically deducted from your next order total.
            </p>
          </div>
        </div>

        {/* ═══ Mpesa Payment Section ═══ */}
        <div className="card mb-8 border-2 border-green-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <Phone size={20} className="text-green-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#1e3a5f]">Pay via M-Pesa</h2>
              <p className="text-sm text-gray-500">Send payment using the details below, then confirm</p>
            </div>
          </div>

          {/* Paybill Details */}
          <div className="bg-green-50 rounded-xl p-6 mb-6">
            <h3 className="font-bold text-green-900 mb-4">M-Pesa Paybill Details</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-green-200">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Business Number (Paybill)</p>
                  <p className="text-2xl font-bold text-[#1e3a5f] font-mono">XXXXXX</p>
                </div>
                <button
                  onClick={() => copyToClipboard('XXXXXX')}
                  className="p-2 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 transition-colors"
                  title="Copy paybill number"
                >
                  <Copy size={18} />
                </button>
              </div>

              <div className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-green-200">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Account Number</p>
                  <p className="text-2xl font-bold text-[#1e3a5f] font-mono">XXXXXX</p>
                </div>
                <button
                  onClick={() => copyToClipboard('XXXXXX')}
                  className="p-2 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 transition-colors"
                  title="Copy account number"
                >
                  <Copy size={18} />
                </button>
              </div>

              {payAmount && (
                <div className="bg-white rounded-lg px-4 py-3 border border-orange-200">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Amount Due</p>
                  <p className="text-2xl font-bold text-orange-600">KES {parseFloat(payAmount).toLocaleString()}</p>
                </div>
              )}
            </div>

            {/* Steps */}
            <div className="mt-6">
              <h4 className="font-semibold text-green-800 mb-3">How to pay:</h4>
              <ol className="space-y-2 text-sm text-green-800">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-200 text-green-800 font-bold flex items-center justify-center text-xs">1</span>
                  Go to M-Pesa on your phone
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-200 text-green-800 font-bold flex items-center justify-center text-xs">2</span>
                  Select "Lipa na M-Pesa" then "Pay Bill"
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-200 text-green-800 font-bold flex items-center justify-center text-xs">3</span>
                  Enter Business Number: <strong>XXXXXX</strong>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-200 text-green-800 font-bold flex items-center justify-center text-xs">4</span>
                  Enter Account Number: <strong>XXXXXX</strong>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-200 text-green-800 font-bold flex items-center justify-center text-xs">5</span>
                  Enter the amount and confirm with your M-Pesa PIN
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-200 text-green-800 font-bold flex items-center justify-center text-xs">6</span>
                  <strong>Copy the confirmation SMS</strong> and paste it below
                </li>
              </ol>
            </div>
          </div>

          {/* Mpesa Confirmation Form */}
          {mpesaSubmitted ? (
            <div className="bg-green-50 border border-green-300 rounded-xl p-6 text-center">
              <CheckCircle size={48} className="mx-auto text-green-600 mb-3" />
              <h3 className="text-lg font-bold text-green-800 mb-2">Payment Submitted!</h3>
              <p className="text-green-700 text-sm mb-4">
                Our team will verify your M-Pesa payment and update your account. This usually takes a few minutes.
              </p>
              <button
                onClick={() => setMpesaSubmitted(false)}
                className="text-[#1e3a5f] underline text-sm font-medium hover:text-orange-600"
              >
                Submit another payment
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount Paid (KES)
                </label>
                <input
                  type="number"
                  value={mpesaAmount}
                  onChange={(e) => setMpesaAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Paste M-Pesa Confirmation Message *
                </label>
                <textarea
                  value={mpesaMessage}
                  onChange={(e) => setMpesaMessage(e.target.value)}
                  placeholder="e.g. ABC123XYZ Confirmed. Ksh5,000.00 sent to SwiftCargo Ltd for account XXXXXX on 4/4/26 at 2:30 PM..."
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Paste the full SMS you received from M-Pesa after completing the payment.
                </p>
              </div>
              <button
                onClick={handleSubmitMpesa}
                disabled={submittingMpesa || !mpesaMessage.trim()}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-lg"
              >
                <Send size={20} />
                {submittingMpesa ? 'Submitting...' : 'Submit Payment Confirmation'}
              </button>
            </div>
          )}
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
                              : tx.type === 'deposit'
                                ? 'bg-purple-100 text-purple-700'
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
