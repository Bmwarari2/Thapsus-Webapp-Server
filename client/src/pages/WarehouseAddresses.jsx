import React, { useState, useEffect } from 'react'
import { Copy, MapPin, AlertCircle } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { warehouseApi } from '../api'
import toast from 'react-hot-toast'

export const WarehouseAddresses = () => {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [addresses, setAddresses] = useState({})

  useEffect(() => {
    const fetchAddresses = async () => {
      try {
        const response = await warehouseApi.getAddresses()
        setAddresses(response.data.addresses || {})
      } catch (err) {
        toast.error('Failed to load warehouse addresses')
      } finally {
        setLoading(false)
      }
    }

    fetchAddresses()
  }, [])

  const handleCopyAddress = (address) => {
    navigator.clipboard.writeText(address)
    toast.success(t('warehouse.copied'))
  }

  const defaultAddresses = {
    UK: {
      full: `31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB, United Kingdom\nAttn: SC-${user?.warehouse_id || 'XXXX'}`,
      label: 'United Kingdom',
      flag: '🇬🇧',
    },
    USA: {
      full: `SwiftCargo Warehouse, 1234 Commerce Way, Los Angeles, CA 90001, USA\nAttn: SC-${user?.warehouse_id || 'XXXX'}`,
      label: 'United States',
      flag: '🇺🇸',
    },
    China: {
      full: `SwiftCargo Warehouse, Shanghai, China\nAttn: SC-${user?.warehouse_id || 'XXXX'}`,
      label: 'China',
      flag: '🇨🇳',
    },
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
        <div className="mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-4">
            {t('warehouse.title')}
          </h1>
          <p className="text-gray-600">
            Use these addresses when shopping from international retailers
          </p>
        </div>

        {/* Addresses */}
        <div className="space-y-6 mb-8">
          {Object.entries(defaultAddresses).map(([market, data]) => (
            <div key={market} className="card">
              <div className="flex items-start gap-4 mb-6">
                <span className="text-5xl">{data.flag}</span>
                <div>
                  <h2 className="text-2xl font-bold text-[#1e3a5f]">
                    {data.label}
                  </h2>
                  <p className="text-gray-600 mt-1">
                    Your unique warehouse address in {data.label}
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-6 mb-4">
                <pre className="font-mono text-sm text-gray-900 whitespace-pre-wrap break-words">
                  {data.full}
                </pre>
              </div>

              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => handleCopyAddress(data.full)}
                  className="bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors"
                >
                  <Copy size={20} />
                  Copy Address
                </button>
                <button
                  onClick={() => handleCopyAddress(`SC-${user?.warehouse_id || 'XXXX'}`)}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors"
                >
                  <Copy size={20} />
                  Copy SC Code
                </button>
              </div>

              {/* Market-specific tips */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="font-bold text-gray-900 mb-3">
                  Shopping Tips for {data.label}
                </h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  {market === 'UK' && (
                    <>
                      <li className="flex gap-2">
                        <span>•</span>
                        <span>
                          Shop from Amazon UK, Shein, ASOS, Next, Superdrug, and more
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span>•</span>
                        <span>
                          Enter the full address including your SC code in the delivery address
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span>•</span>
                        <span>
                          Our warehouse will receive and consolidate your packages
                        </span>
                      </li>
                    </>
                  )}
                  {market === 'USA' && (
                    <>
                      <li className="flex gap-2">
                        <span>•</span>
                        <span>
                          Shop from Amazon US, Walmart, Target, Best Buy, and other US retailers
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span>•</span>
                        <span>
                          Use the address provided as your shipping destination
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span>•</span>
                        <span>
                          Make sure your SC code is clearly visible in the recipient name
                        </span>
                      </li>
                    </>
                  )}
                  {market === 'China' && (
                    <>
                      <li className="flex gap-2">
                        <span>•</span>
                        <span>
                          Shop from AliExpress, Taobao, Wish, and Chinese marketplaces
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span>•</span>
                        <span>
                          Provide this address as your shipping destination
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span>•</span>
                        <span>
                          Packages may take longer to arrive from China
                        </span>
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Instructions Card */}
        <div className="card bg-blue-50 border border-blue-200">
          <div className="flex gap-4 mb-4">
            <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={24} />
            <h3 className="text-lg font-bold text-blue-900">
              {t('warehouse.instructions')}
            </h3>
          </div>

          <ol className="space-y-3 text-blue-700">
            <li className="flex gap-3">
              <span className="font-bold flex-shrink-0">1.</span>
              <span>{t('warehouse.instruction1')}</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold flex-shrink-0">2.</span>
              <span>{t('warehouse.instruction2')}</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold flex-shrink-0">3.</span>
              <span>{t('warehouse.instruction3')}</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold flex-shrink-0">4.</span>
              <span>
                Track your package using the tracking number provided in your order
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold flex-shrink-0">5.</span>
              <span>
                Once all packages arrive, we'll consolidate them and ship to Kenya
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold flex-shrink-0">6.</span>
              <span>
                Receive your consolidated shipment in Kenya within 7-14 days
              </span>
            </li>
          </ol>
        </div>

        {/* Info Card */}
        <div className="card mt-8 bg-green-50 border border-green-200">
          <h3 className="font-bold text-green-900 mb-3">Pro Tips</h3>
          <ul className="space-y-2 text-green-700">
            <li className="flex gap-2">
              <span>✓</span>
              <span>
                Save on shipping costs by consolidating multiple packages into one shipment
              </span>
            </li>
            <li className="flex gap-2">
              <span>✓</span>
              <span>
                Keep your SC code safe and use it consistently for all your orders
              </span>
            </li>
            <li className="flex gap-2">
              <span>✓</span>
              <span>
                Check prohibited items before ordering to avoid customs issues
              </span>
            </li>
            <li className="flex gap-2">
              <span>✓</span>
              <span>
                Add insurance to valuable items for extra protection during transit
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
