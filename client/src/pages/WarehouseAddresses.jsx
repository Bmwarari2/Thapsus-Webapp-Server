import React, { useState, useEffect, useCallback } from 'react'
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
  const [tcCode, setTcCode] = useState(`TC-${user?.warehouse_id || 'XXXX'}`)

  useEffect(() => {
    const fetchAddresses = async () => {
      try {
        const response = await warehouseApi.getAddresses()
        setAddresses(response.data.addresses || {})
        if (response.data.tcCode) setTcCode(response.data.tcCode)
      } catch (err) {
        toast.error('Failed to load warehouse addresses')
      } finally {
        setLoading(false)
      }
    }

    fetchAddresses()
  }, [])

  /** Copy to clipboard with graceful fallback for restricted browser contexts */
  const handleCopyAddress = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('warehouse.copied'))
    } catch (_) {
      // Fallback: select text via a temporary textarea
      try {
        const el = document.createElement('textarea')
        el.value = text
        el.setAttribute('readonly', '')
        el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        toast.success(t('warehouse.copied'))
      } catch (_) {
        toast.error('Could not copy automatically — please select and copy manually.')
      }
    }
  }, [t])

  // Build display-ready address objects, merging API data over sensible defaults
  const fallbackAddresses = {
    UK: {
      lines: ['31 Collingwood Close', 'Hazel Grove, Stockport', 'SK7 4LB', 'United Kingdom'],
      label: 'United Kingdom',
      flag: '🇬🇧',
    },
  }

  const resolvedAddresses = Object.fromEntries(
    Object.entries(fallbackAddresses).map(([market, defaults]) => {
      const api = addresses[market]
      const lines = api?.lines?.length ? api.lines : defaults.lines
      return [market, {
        label: api?.label || defaults.label,
        flag:  api?.flag  || defaults.flag,
        lines,
        full:  lines.join('\n'),
      }]
    })
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative bg-slate-50 overflow-hidden py-12 px-4 font-sans">
      {/* Liquid Backgrounds */}
      
      
      

      <div className="max-w-5xl mx-auto relative z-10">
        {/* Header - Refined Typography */}
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-black text-[#1e3a5f] mb-4 leading-none tracking-tighter">
            {t('warehouse.title')}
          </h1>
          <p className="text-slate-600 font-medium text-lg">
            Use these addresses when shopping from international retailers
          </p>
        </div>

        {/* Addresses - Crystal Borders & Dynamic Sheen */}
        <div className="space-y-8 mb-12">
          {Object.entries(resolvedAddresses).map(([market, data]) => (
            <div key={market} className="bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-8 relative overflow-hidden glass-sheen transition-transform duration-300 hover:-translate-y-1">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6 relative z-10">
                <span className="text-6xl drop-shadow-md">{data.flag}</span>
                <div>
                  <h2 className="text-3xl font-black text-[#1e3a5f] tracking-tighter leading-none mb-2">
                    {data.label}
                  </h2>
                  <p className="text-slate-500 font-semibold tracking-tight">
                    Your unique warehouse address in {data.label}
                  </p>
                </div>
              </div>

              <div className="bg-white/50 backdrop-blur-md border border-white/60 rounded-xl p-6 mb-6 shadow-sm relative z-10">
                {/* Personal identifiers */}
                <p className="font-mono text-sm md:text-base text-orange-600 font-black mb-1">
                  {user?.name}
                </p>
                <p className="font-mono text-sm md:text-base text-orange-600 font-black mb-3">
                  {tcCode}
                </p>
                {/* Warehouse address lines */}
                {data.lines.map((line, i) => (
                  <p key={i} className="font-mono text-sm md:text-base text-slate-800 font-bold leading-relaxed">
                    {line}
                  </p>
                ))}
                <p className="text-xs text-slate-400 font-semibold mt-3">
                  Use your name and TC code as the recipient name when checking out
                </p>
              </div>

              <div className="flex gap-4 flex-wrap relative z-10">
                <button
                  onClick={() => handleCopyAddress([user?.name, tcCode, ...data.lines].filter(Boolean).join('\n'))}
                  className="group relative overflow-hidden bg-[#1e3a5f] text-white px-6 py-3.5 rounded-xl font-black tracking-tight flex items-center gap-2 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 glass-sheen"
                  aria-label={`Copy ${data.label} warehouse address to clipboard`}
                >
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                  <Copy size={20} className="relative z-10" />
                  <span className="relative z-10">Copy Full Address</span>
                </button>
                <button
                  onClick={() => handleCopyAddress(tcCode)}
                  className="group relative overflow-hidden bg-orange-500 text-white px-6 py-3.5 rounded-xl font-black tracking-tight flex items-center gap-2 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 glass-sheen"
                  aria-label="Copy TC warehouse code to clipboard"
                >
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                  <Copy size={20} className="relative z-10" />
                  <span className="relative z-10">Copy TC Code</span>
                </button>
              </div>

              {/* Market-specific tips */}
              <div className="mt-8 pt-6 border-t border-white/50 relative z-10">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
                  Shopping Tips for {data.label}
                </h3>
                <ul className="space-y-3 text-sm font-semibold text-slate-700">
                  {market === 'UK' && (
                    <>
                      <li className="flex gap-3 items-start">
                        <span className="text-orange-700 text-lg leading-none mt-0.5">•</span>
                        <span>Shop from Amazon UK, Shein, ASOS, Next, Superdrug, and more</span>
                      </li>
                      <li className="flex gap-3 items-start">
                        <span className="text-orange-700 text-lg leading-none mt-0.5">•</span>
                        <span>Enter the full address including your TC code in the delivery address</span>
                      </li>
                      <li className="flex gap-3 items-start">
                        <span className="text-orange-700 text-lg leading-none mt-0.5">•</span>
                        <span>Our warehouse will receive and consolidate your packages</span>
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Instructions Card - Dark Glass & Interactive (Step 2 style) */}
        <div className="group relative overflow-hidden bg-[#0f172a]/90 backdrop-blur-2xl border border-white/10 rounded-[24px] p-8 md:p-10 text-white shadow-2xl mb-8 transition-transform duration-500 hover:-rotate-1 hover:scale-[1.02] transform perspective-1000 glass-sheen">
          {/* Blurred Blue Orb inside Dark Glass */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-500/30 rounded-full blur-[80px] pointer-events-none" />
          
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-blue-500/20 rounded-xl backdrop-blur-md border border-blue-500/30 shadow-sm">
                <AlertCircle className="text-blue-400" size={28} />
              </div>
              <h3 className="text-3xl font-black tracking-tighter leading-none">
                {t('warehouse.instructions')}
              </h3>
            </div>

            <ol className="space-y-5 text-slate-300 font-medium">
              <li className="flex gap-4 items-start bg-white/5 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
                <span className="font-black text-blue-400 text-lg leading-none tracking-tighter">1.</span>
                <span>{t('warehouse.instruction1')}</span>
              </li>
              <li className="flex gap-4 items-start bg-white/5 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
                <span className="font-black text-blue-400 text-lg leading-none tracking-tighter">2.</span>
                <span>{t('warehouse.instruction2')}</span>
              </li>
              <li className="flex gap-4 items-start bg-white/5 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
                <span className="font-black text-blue-400 text-lg leading-none tracking-tighter">3.</span>
                <span>{t('warehouse.instruction3')}</span>
              </li>
              <li className="flex gap-4 items-start bg-white/5 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
                <span className="font-black text-blue-400 text-lg leading-none tracking-tighter">4.</span>
                <span>Track your package using the tracking number provided in your order</span>
              </li>
              <li className="flex gap-4 items-start bg-white/5 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
                <span className="font-black text-blue-400 text-lg leading-none tracking-tighter">5.</span>
                <span>Once all packages arrive, we'll consolidate them and ship to Kenya</span>
              </li>
              <li className="flex gap-4 items-start bg-white/5 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
                <span className="font-black text-blue-400 text-lg leading-none tracking-tighter">6.</span>
                <span>Receive your consolidated shipment in Kenya within 7-14 days</span>
              </li>
            </ol>
          </div>
        </div>

        {/* Info Card - Border Gradient (Step 4 style) */}
        <div className="rounded-2xl">
          <div className="bg-white border border-gray-100 shadow-card rounded-2xl p-8 md:p-10">
            <div className="absolute top-0 right-0 w-48 h-48 bg-green-400/10 rounded-full blur-[50px] pointer-events-none" />
            
            <h3 className="text-2xl font-black text-emerald-900 tracking-tighter leading-none mb-6 relative z-10">Pro Tips</h3>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 text-emerald-800 font-semibold relative z-10">
              <li className="flex gap-3 items-start bg-white/40 p-4 rounded-xl border border-white/50 backdrop-blur-sm">
                <span className="text-emerald-500 font-black text-lg leading-none">✓</span>
                <span className="text-sm">Save on shipping costs by consolidating multiple packages into one shipment</span>
              </li>
              <li className="flex gap-3 items-start bg-white/40 p-4 rounded-xl border border-white/50 backdrop-blur-sm">
                <span className="text-emerald-500 font-black text-lg leading-none">✓</span>
                <span className="text-sm">Keep your TC code safe and use it consistently for all your orders</span>
              </li>
              <li className="flex gap-3 items-start bg-white/40 p-4 rounded-xl border border-white/50 backdrop-blur-sm">
                <span className="text-emerald-500 font-black text-lg leading-none">✓</span>
                <span className="text-sm">Check prohibited items before ordering to avoid customs issues</span>
              </li>
              <li className="flex gap-3 items-start bg-white/40 p-4 rounded-xl border border-white/50 backdrop-blur-sm">
                <span className="text-emerald-500 font-black text-lg leading-none">✓</span>
                <span className="text-sm">Add insurance to valuable items for extra protection during transit</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
