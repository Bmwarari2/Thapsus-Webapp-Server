import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Package, Truck, Plane, ShieldAlert, Clock, RefreshCw,
  Search, ArrowRight, CheckCircle, XCircle, Scale, Camera, Scan
} from 'lucide-react'
import toast from 'react-hot-toast'
import { opsApi, consolidationsApi } from '../api'
import { GlassStyles, GlassCard, LiquidBlob, PageHeading, StatusBadge } from '../components/GlassUI'
import { BarcodeScanner } from '../components/BarcodeScanner'

/**
 * /ops — Operator console (Spec §3.3, §4.3).
 *
 *   Today summary • parcels grid • barcode-driven receive • screening •
 *   hold/release.  Consolidation builder lives at /ops/consolidations.
 */
export const OpsConsole = () => {
  const [today,    setToday]    = useState({})
  const [parcels,  setParcels]  = useState([])
  const [filter,   setFilter]   = useState('')
  const [status,   setStatus]   = useState('')
  const [loading,  setLoading]  = useState(true)
  const [active,   setActive]   = useState(null) // parcel being worked on
  const [receive,  setReceive]  = useState({ weight_kg: '', length: '', width: '', height: '', barcode: '', customs_duty: '', hs_tier: '' })
  const [scanOpen, setScanOpen] = useState(false)

  const fetchToday   = () => opsApi.today().then(r => setToday(r.data?.today || {})).catch(() => {})
  const fetchParcels = () => opsApi.parcels({ status: status || undefined, q: filter || undefined })
                                    .then(r => setParcels(r.data?.parcels || []))
                                    .catch(() => toast.error('Failed to load parcels'))

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchToday(), fetchParcels()]).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onReceive = async () => {
    if (!active) return
    try {
      const dims = (receive.length && receive.width && receive.height)
        ? { length: +receive.length, width: +receive.width, height: +receive.height }
        : null
      const res = await opsApi.receive(active.id, {
        weight_kg: receive.weight_kg ? +receive.weight_kg : null,
        dimensions: dims,
        barcode: receive.barcode || null,
        // Customs duty (KES) — operator-stamped here so the Phase 2
        // invoice prefill can sum it across the customer's bundle.
        customs_duty: receive.customs_duty ? +receive.customs_duty : null,
        // Audit P2.3: BFM auto-create stubs every parcel as
        // hs_tier='general'. Receive is the operator's first physical
        // look at the box — they pick the real tier here so duty/VAT
        // calc on the eventual invoice prefill matches the goods.
        hs_tier: receive.hs_tier || null,
      })
      toast.success(`Received — chargeable ${res.data?.chargeable_kg || 0} kg`)
      setActive(null)
      setReceive({ weight_kg: '', length: '', width: '', height: '', barcode: '', customs_duty: '', hs_tier: '' })
      fetchParcels(); fetchToday()
    } catch {
      toast.error('Failed to receive parcel')
    }
  }

  const onScreen = async (parcel) => {
    try {
      const res = await opsApi.screen(parcel.id, parcel.description)
      const r = res.data?.screening_result
      if (r === 'held')      toast.error('Parcel held — prohibited content detected')
      else if (r === 'dg_suspect') toast.error('Restricted — DG suspect')
      else                   toast.success('Screen clean')
      fetchParcels()
    } catch { toast.error('Screen failed') }
  }

  const onHold = async (parcel) => {
    const reason = prompt('Reason for hold')
    if (!reason) return
    try {
      await opsApi.hold(parcel.id, reason)
      toast.success('Parcel held')
      fetchParcels(); fetchToday()
    } catch { toast.error('Failed to hold parcel') }
  }

  const onRelease = async (parcel) => {
    try {
      await opsApi.release(parcel.id)
      toast.success('Released')
      fetchParcels(); fetchToday()
    } catch { toast.error('Failed to release') }
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50">
      <GlassStyles />
      <LiquidBlob className="top-[-15%] left-[-15%] w-[40rem] h-[40rem]" color="bg-orange-200" />
      <LiquidBlob className="bottom-[-15%] right-[-15%] w-[40rem] h-[40rem]" color="bg-blue-200"  />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-14">
        <PageHeading icon={Package} title="Operations Console"
          subtitle="Receive, screen, consolidate. Stockport hub overview." />

        {/* Today's view */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-8">
          <Tile label="Expected"      value={today.expected      ?? 0} icon={<Clock size={20}/>}      tone="text-blue-700" />
          <Tile label="Received"      value={today.received      ?? 0} icon={<Package size={20}/>}    tone="text-emerald-700" />
          <Tile label="Consolidating" value={today.consolidating ?? 0} icon={<Truck size={20}/>}      tone="text-purple-700" />
          <Tile label="In transit"    value={today.in_transit    ?? 0} icon={<Plane size={20}/>}      tone="text-indigo-700" />
          <Tile label="Held"          value={today.held          ?? 0} icon={<ShieldAlert size={20}/>} tone="text-red-700" />
        </div>

        {/* Quick links */}
        <div className="flex flex-wrap gap-3 mb-8">
          <QuickLink to="/ops/consolidations" label="Consolidations" />
          <QuickLink to="/ops/dispatch"       label="Dispatch board" />
          <QuickLink to="/ops/buy-for-me"     label="Buy-for-me queue" />
          <QuickLink to="/ops/settings"       label="Pricing settings" />
        </div>

        {/* Parcel filter */}
        <GlassCard className="p-4 md:p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search tracking, email, description…"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white/80">
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="received_at_warehouse">Received</option>
              <option value="consolidating">Consolidating</option>
              <option value="in_transit">In transit</option>
              <option value="customs">Customs</option>
              <option value="out_for_delivery">Out for delivery</option>
              <option value="delivered">Delivered</option>
            </select>
            <button onClick={fetchParcels}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e3a5f] text-white font-bold text-sm hover:bg-[#2a4a7f]">
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </GlassCard>

        {/* Parcels table */}
        <GlassCard className="p-4 md:p-6">
          {loading ? (
            <p className="py-10 text-center text-slate-500">Loading…</p>
          ) : parcels.length === 0 ? (
            <p className="py-10 text-center text-slate-500">No parcels match your filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <th className="text-left py-3 px-3">Tracking</th>
                    <th className="text-left py-3 px-3">Customer</th>
                    <th className="text-left py-3 px-3">Description</th>
                    <th className="text-left py-3 px-3">Status</th>
                    <th className="text-right py-3 px-3">Weight</th>
                    <th className="text-right py-3 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {parcels.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-orange-50/30 transition-colors">
                      <td className="py-3 px-3 font-mono text-xs">{p.tracking_number}</td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-700">{p.name}</div>
                        <div className="text-xs text-slate-500">{p.email} · {p.warehouse_id}</div>
                      </td>
                      <td className="py-3 px-3 max-w-xs truncate">{p.description}</td>
                      <td className="py-3 px-3"><StatusBadge status={p.status} /></td>
                      <td className="py-3 px-3 text-right">
                        {p.chargeable_kg ? <span className="font-bold">{p.chargeable_kg} kg</span>
                                         : p.weight_kg ? `${p.weight_kg} kg` : '—'}
                      </td>
                      <td className="py-3 px-3 text-right space-x-1">
                        <button onClick={() => setActive(p)} className="text-xs px-2 py-1 rounded bg-orange-500 hover:bg-orange-600 text-white inline-flex items-center gap-1">
                          <Scale size={12}/> Receive
                        </button>
                        <button onClick={() => onScreen(p)} className="text-xs px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-800">Screen</button>
                        {p.hold_reason ? (
                          <button onClick={() => onRelease(p)} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700">Release</button>
                        ) : (
                          <button onClick={() => onHold(p)} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700">Hold</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Camera-driven barcode scanner. Mounted at the page root so the
          overlay sits above the receive modal when both are open. */}
      <BarcodeScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onScan={(text) => {
          setReceive((prev) => ({ ...prev, barcode: text }))
          setScanOpen(false)
          toast.success(`Scanned ${text}`)
        }}
      />

      {/* Receive modal */}
      {active && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <GlassCard className="bg-white max-w-lg w-full p-6">
            <h3 className="text-xl font-black text-[#1e3a5f] mb-1">Receive parcel</h3>
            <p className="text-xs text-slate-500 mb-4">{active.tracking_number} · {active.name}</p>

            <div className="grid grid-cols-2 gap-3">
              <Input label="Actual weight (kg)" type="number" step="0.01" value={receive.weight_kg}
                onChange={(v) => setReceive({ ...receive, weight_kg: v })} />
              <BarcodeField
                value={receive.barcode}
                onChange={(v) => setReceive({ ...receive, barcode: v })}
                onScanClick={() => setScanOpen(true)}
              />
              <Input label="Length (cm)"        type="number" value={receive.length}
                onChange={(v) => setReceive({ ...receive, length: v })} />
              <Input label="Width (cm)"         type="number" value={receive.width}
                onChange={(v) => setReceive({ ...receive, width: v })} />
              <Input label="Height (cm)"        type="number" value={receive.height}
                onChange={(v) => setReceive({ ...receive, height: v })} />
              <Input label="Customs duty (KES)" type="number" step="1" value={receive.customs_duty}
                onChange={(v) => setReceive({ ...receive, customs_duty: v })} />
            </div>

            <div className="mt-3">
              <label className="block">
                <span className="block text-[10px] uppercase tracking-widest text-slate-500 font-black mb-1">
                  HS tier (customs category)
                </span>
                <select value={receive.hs_tier}
                        onChange={(e) => setReceive({ ...receive, hs_tier: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="">— Leave unchanged —</option>
                  {HS_TIER_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <p className="text-[11px] text-slate-500 mt-1">
                Buy-for-me parcels default to <strong>general</strong> at accept time. Pick the right tier here so duty/VAT on the invoice matches the goods.
              </p>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Volumetric kg = (L × W × H) / 6 000.  Chargeable = max(actual, volumetric).
              Duty feeds the Phase 2 invoice prefill on the admin console.
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button onClick={() => setActive(null)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm">
                Cancel
              </button>
              <button onClick={onReceive}
                      className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm inline-flex items-center gap-2">
                <CheckCircle size={16}/> Confirm receipt
              </button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  )
}

const Tile = ({ label, value, icon, tone = 'text-slate-700' }) => (
  <GlassCard className="p-4 md:p-5">
    <div className={`flex items-center gap-2 ${tone}`}>
      {icon}
      <span className="text-[10px] uppercase tracking-widest font-black">{label}</span>
    </div>
    <div className="text-3xl md:text-4xl font-black tracking-tighter text-[#1e3a5f] mt-2">{value}</div>
  </GlassCard>
)

const QuickLink = ({ to, label }) => (
  <Link to={to} className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-white/70 hover:bg-white text-[#1e3a5f] text-sm font-bold border border-slate-200 transition-colors">
    {label} <ArrowRight size={14}/>
  </Link>
)

// Audit P2.3: keep webapp HS tier list in sync with utils/pricing.js
// (HS_TIERS) and shared/.../AdminOrdersView.swift::hsCategories. Changes
// here must land in both places.
const HS_TIER_OPTIONS = [
  { value: 'general',           label: 'General goods (25% duty)' },
  { value: 'electronics',       label: 'Consumer electronics (0% duty, 16% VAT)' },
  { value: 'clothing_textiles', label: 'Clothing & textiles (25% duty)' },
  { value: 'food_processed',    label: 'Processed food / supplements (35% duty)' },
  { value: 'raw_materials',     label: 'Raw materials (0% duty)' },
  { value: 'books_media',       label: 'Books / printed media (zero-rated)' },
  { value: 'zero_rated',        label: 'Medical / gazetted exempt (zero-rated)' },
]

const Input = ({ label, value, onChange, type = 'text', step }) => (
  <label className="block">
    <span className="block text-[10px] uppercase tracking-widest text-slate-500 font-black mb-1">{label}</span>
    <input type={type} step={step} value={value} onChange={(e) => onChange(e.target.value)}
           className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-orange-400" />
  </label>
)

// Specialised barcode input — text field on the left, "Scan" button on
// the right that opens the camera overlay. Clearing the value on scan
// happens in the parent component (the scanner replaces it on success).
const BarcodeField = ({ value, onChange, onScanClick }) => (
  <label className="block">
    <span className="block text-[10px] uppercase tracking-widest text-slate-500 font-black mb-1">Barcode</span>
    <div className="flex items-stretch gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Scan or type"
        className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-orange-400"
      />
      <button
        type="button"
        onClick={onScanClick}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1e3a5f] text-white text-sm font-bold hover:bg-[#2a4a7f]"
        aria-label="Scan barcode with camera"
      >
        <Scan size={14} /> Scan
      </button>
    </div>
  </label>
)
