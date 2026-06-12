// AdminCreateBuyForMe.jsx
// Admin form for creating a Buy-for-me request on behalf of a customer
// who placed the order off-platform (WhatsApp, phone, in person). Can
// optionally pre-quote in the same submission so the customer just
// needs to accept + pay.

import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, Search, Send, Wand2 } from 'lucide-react'
import { adminApi, buyForMeApi, retailersApi } from '../api'
import { GlassStyles, GlassCard, LiquidBlob, PageHeading } from '../components/GlassUI'

const OTHER_RETAILER_ID = '__other__'

export const AdminCreateBuyForMe = () => {
  const [users, setUsers] = useState([])
  const [retailers, setRetailers] = useState([])
  const [search, setSearch] = useState('')
  const [userId, setUserId] = useState('')

  const [retailerId, setRetailerId] = useState('')
  const [retailerUrl, setRetailerUrl] = useState('')
  const [itemName, setItemName] = useState('')
  const [size, setSize] = useState('')
  const [qty, setQty] = useState(1)
  const [notes, setNotes] = useState('')

  // Pre-quote (optional) — admin can skip and let an operator quote later.
  const [includeQuote, setIncludeQuote] = useState(false)
  const [estimateGbp, setEstimateGbp] = useState('')
  const [markupPct, setMarkupPct] = useState('10')

  const [submitting, setSubmitting] = useState(false)
  const [recentlyCreated, setRecentlyCreated] = useState(null)

  useEffect(() => {
    adminApi.listUsers({ limit: 500 }).then(r => setUsers(r.data?.users || []))
      .catch(() => toast.error('Failed to load customers'))
    retailersApi.list().then(r => setRetailers(r.data?.retailers || []))
      .catch(() => {/* enhancement — fall back to URL field */})
  }, [])

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users.slice(0, 25)
    return users.filter(u =>
      (u.email || '').toLowerCase().includes(q) ||
      (u.name || '').toLowerCase().includes(q) ||
      (u.id || '').toLowerCase().includes(q)
    ).slice(0, 25)
  }, [users, search])

  const retailerGroups = useMemo(() => {
    const groups = {}
    for (const r of retailers) {
      groups[r.country] = groups[r.country] || []
      groups[r.country].push(r)
    }
    return groups
  }, [retailers])

  const selectedUser = users.find(u => u.id === userId)
  const isOther = retailerId === OTHER_RETAILER_ID

  const canSubmit = (() => {
    if (submitting) return false
    if (!userId) return false
    if (!itemName.trim()) return false
    if (!retailerId) return false
    if (isOther && !retailerUrl.trim()) return false
    if (includeQuote && !(Number(estimateGbp) > 0)) return false
    return true
  })()

  const onSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const r = await buyForMeApi.adminCreate({
        user_id:      userId,
        retailer_id:  isOther ? null : retailerId,
        retailer_url: retailerUrl.trim() || null,
        item_name:    itemName.trim(),
        size:         size.trim() || null,
        qty:          Number(qty) || 1,
        notes:        notes.trim() || null,
        estimate_gbp: includeQuote ? Number(estimateGbp) : null,
        markup_pct:   includeQuote ? (Number(markupPct) || 10) : null,
      })
      setRecentlyCreated({
        id:         r.data?.order_id,
        item:       itemName.trim(),
        userEmail:  selectedUser?.email,
        preQuoted:  !!r.data?.pre_quoted,
      })
      toast.success(includeQuote
        ? 'Concierge order created + quote emailed'
        : 'Concierge order created — operator will quote')
      setItemName(''); setSize(''); setQty(1); setNotes('')
      setEstimateGbp(''); setMarkupPct('10')
      setRetailerId(''); setRetailerUrl('')
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to create')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-gray-50">
      <GlassStyles />
      <LiquidBlob className="top-[-15%] right-[-15%] w-[40rem] h-[40rem]" color="bg-orange-200" />

      <div className="relative z-10 max-w-3xl mx-auto px-4 md:px-8 py-10">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#0f172a] mb-4">
          <ArrowLeft size={16} /> Back to admin
        </Link>
        <PageHeading icon={Wand2}
          title="Create Buy-for-me on behalf"
          subtitle="For customers who placed an order via WhatsApp / phone. Optionally pre-quote." />

        {recentlyCreated && (
          <GlassCard className="p-4 mb-6 bg-emerald-50/70">
            <p className="text-sm font-bold text-emerald-800">Order created ✓</p>
            <p className="text-xs text-emerald-700 mt-1">
              <span className="font-mono">{recentlyCreated.id}</span> · {recentlyCreated.item}
              {recentlyCreated.userEmail && <> · {recentlyCreated.userEmail}</>}
              {recentlyCreated.preQuoted ? ' · quote emailed' : ' · awaiting operator quote'}
            </p>
          </GlassCard>
        )}

        <GlassCard className="p-6 mb-6">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-500 mb-3">Customer</h3>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email, name, or warehouse ID"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white/80 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-100 bg-white/60">
            {filteredUsers.length === 0 ? (
              <p className="text-xs text-slate-500 px-3 py-4">No matching customers.</p>
            ) : filteredUsers.map(u => (
              <button
                key={u.id} type="button"
                onClick={() => setUserId(u.id)}
                className={`w-full text-left px-3 py-2 text-sm border-b border-slate-100 last:border-b-0 hover:bg-orange-50 ${userId === u.id ? 'bg-orange-100/70' : ''}`}
              >
                <p className="font-semibold text-[#0f172a]">{u.name || u.email}</p>
                <p className="text-xs text-slate-500">{u.email}</p>
              </button>
            ))}
          </div>
          {selectedUser && (
            <p className="mt-2 text-xs text-emerald-700 font-semibold">Selected: {selectedUser.name || selectedUser.email}</p>
          )}
        </GlassCard>

        <GlassCard className="p-6 mb-6">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-500 mb-3">Item</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Retailer</label>
              <select
                value={retailerId}
                onChange={(e) => setRetailerId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white/80 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-orange-300"
              >
                <option value="">— Choose a retailer —</option>
                {Object.entries(retailerGroups).map(([country, rs]) => (
                  <optgroup key={country} label={country}>
                    {rs.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </optgroup>
                ))}
                <option value={OTHER_RETAILER_ID}>Other (paste a URL)</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <Field
                label={isOther ? 'Retailer URL (required)' : 'Item URL (optional)'}
                value={retailerUrl} onChange={setRetailerUrl}
                placeholder="https://…"
              />
            </div>
            <Field label="Item name" value={itemName} onChange={setItemName} placeholder="e.g. Blue hoodie size M" />
            <Field label="Size / variant" value={size} onChange={setSize} />
            <Field label="Quantity" type="number" value={qty} onChange={(v) => setQty(+v || 1)} />
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Notes (visible to customer)</label>
              <textarea
                value={notes} onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Anything we should know — colour, alternatives, deadlines."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white/80 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-6 mb-6">
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input type="checkbox" checked={includeQuote} onChange={(e) => setIncludeQuote(e.target.checked)} />
            <span className="text-sm font-bold text-[#0f172a]">Pre-quote in this submission</span>
          </label>
          <p className="text-xs text-slate-500 mb-3">
            Tick to set the price now. The customer gets the quote email immediately and can pay straight away —
            otherwise the request joins the operator queue at <strong>pending_quote</strong>.
          </p>
          {includeQuote && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Estimate (GBP)" type="number" value={estimateGbp} onChange={setEstimateGbp} placeholder="e.g. 25.00" />
              <Field label="Service markup %" type="number" value={markupPct} onChange={setMarkupPct} />
            </div>
          )}
        </GlassCard>

        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#1e3a5f] hover:bg-[#142640] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-sm"
        >
          <Send size={16}/> {submitting ? 'Creating…' : (includeQuote ? 'Create + send quote' : 'Create request')}
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white/80 text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-orange-300"
      />
    </div>
  )
}
