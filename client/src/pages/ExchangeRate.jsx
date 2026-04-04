import React, { useState, useEffect } from 'react'
import { ArrowRightLeft, TrendingUp } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { pricingApi } from '../api'
import toast from 'react-hot-toast'

export const ExchangeRate = () => {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [rates, setRates] = useState({
    usdToKes: 0,
    gbpToKes: 0,
  })
  const [usdAmount, setUsdAmount] = useState('1')
  const [gbpAmount, setGbpAmount] = useState('1')

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const response = await pricingApi.getExchangeRates()
        setRates(response.data)
      } catch (err) {
        toast.error('Failed to load exchange rates')
      } finally {
        setLoading(false)
      }
    }

    fetchRates()
  }, [])

  const handleSwapUSD = () => {
    const kes = usdAmount * rates.usdToKes
    setUsdAmount(kes.toString())
  }

  const handleSwapGBP = () => {
    const kes = gbpAmount * rates.gbpToKes
    setGbpAmount(kes.toString())
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
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-4">
            {t('exchange.title')}
          </h1>
          <p className="text-gray-600 flex items-center justify-center gap-2">
            <TrendingUp size={20} className="text-orange-500" />
            {t('exchange.liveRates')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* USD to KES */}
          <div className="card">
            <h2 className="text-xl font-bold text-[#1e3a5f] mb-6">
              {t('exchange.usdToKes')}
            </h2>

            <div className="space-y-4">
              {/* USD Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  USD Amount
                </label>
                <input
                  type="number"
                  value={usdAmount}
                  onChange={(e) => setUsdAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                />
              </div>

              {/* Exchange Rate */}
              <div className="bg-gradient-to-r from-[#1e3a5f] to-[#152d4a] text-white p-4 rounded-lg text-center">
                <p className="text-sm text-gray-300 mb-1">Current Rate</p>
                <p className="text-3xl font-bold">
                  1 USD = {rates.usdToKes.toFixed(2)} KES
                </p>
              </div>

              {/* KES Result */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  KES Amount
                </label>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-3xl font-bold text-green-700">
                    KES {(usdAmount * rates.usdToKes).toLocaleString('en-US', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </p>
                </div>
              </div>

              {/* Swap Button */}
              <button
                onClick={handleSwapUSD}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <ArrowRightLeft size={20} />
                {t('exchange.swap')}
              </button>
            </div>
          </div>

          {/* GBP to KES */}
          <div className="card">
            <h2 className="text-xl font-bold text-[#1e3a5f] mb-6">
              {t('exchange.gbpToKes')}
            </h2>

            <div className="space-y-4">
              {/* GBP Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  GBP Amount
                </label>
                <input
                  type="number"
                  value={gbpAmount}
                  onChange={(e) => setGbpAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                />
              </div>

              {/* Exchange Rate */}
              <div className="bg-gradient-to-r from-[#1e3a5f] to-[#152d4a] text-white p-4 rounded-lg text-center">
                <p className="text-sm text-gray-300 mb-1">Current Rate</p>
                <p className="text-3xl font-bold">
                  1 GBP = {rates.gbpToKes.toFixed(2)} KES
                </p>
              </div>

              {/* KES Result */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  KES Amount
                </label>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-3xl font-bold text-green-700">
                    KES {(gbpAmount * rates.gbpToKes).toLocaleString('en-US', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </p>
                </div>
              </div>

              {/* Swap Button */}
              <button
                onClick={handleSwapGBP}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <ArrowRightLeft size={20} />
                {t('exchange.swap')}
              </button>
            </div>
          </div>
        </div>

        {/* Info Card */}
        <div className="card mt-8 bg-blue-50 border border-blue-200">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-200 rounded-lg">
              <TrendingUp className="text-blue-600" size={24} />
            </div>
            <div>
              <h3 className="font-bold text-blue-900 mb-2">
                {t('exchange.historicalNote')}
              </h3>
              <p className="text-blue-700 text-sm">
                Exchange rates are updated in real-time. Actual rates may vary slightly based on your bank or payment provider. Always confirm the final amount before making a transaction.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
