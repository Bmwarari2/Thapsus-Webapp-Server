// AdminIssueInvoice.jsx (PR 5)
// Admin form for creating a one-off ("standalone") invoice — picks a
// customer, sets a KES amount + description, and the customer pays via
// the existing PayInvoiceModal flow (target_kind='consolidation').
//
// No parcels involved — for off-platform settlements, customs penalties,
// storage fees, etc. Standard customer-consolidation receive flows are
// unchanged because we filter `is_standalone = true` out of operator
// dispatch lists server-side.

import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, FileText, Search, Send } from 'lucide-react'
import { adminApi, customerConsolidationsApi } from '../api'
import { GlassStyles, GlassCard, LiquidBlob, PageHeading } from '../components/GlassUI'

export const AdminIssueInvoice = () => {
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [userId, setUserId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recentlyIssued, setRecentlyIssued] = useState(null) // {id, amount, description, user_email}

  useEffect(() => {
    adminApi.listUsers({ limit: 500 })
      .then(r => setUsers(r.data?.users || []))
      .catch(() => toast.error('Failed to load customers'))
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

  const selectedUser = users.find(u => u.id === userId)

  const canSubmit = userId && Number(amount) > 0 && description.trim().length > 0 && !submitting

  const onSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const r = await customerConsolidationsApi.issueStandaloneInvoice({
        user_id:     userId,
        amount_kes:  Number(amount),
        description: description.trim(),
        currency:    'KES',
        notes:       notes.trim() || null,
      })
      const cc = r.data?.customer_consolidation
      toast.success(`Invoice issued — KES ${Number(amount).toLocaleString()}`)
      setRecentlyIssued({
        id:          cc?.id,
        amount:      Number(amount),
        description: description.trim(),
        user_email:  selectedUser?.email,
      })
      setAmount('')
      setDescription('')
      setNotes('')
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to issue invoice')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-white/[0.03]">
      <GlassStyles />
      <LiquidBlob className="top-[-15%] right-[-15%] w-[40rem] h-[40rem]" color="bg-orange-200" />

      <div className="relative z-10 max-w-3xl mx-auto px-4 md:px-8 py-10">
        <Link to="/admin/customer-consolidations" className="inline-flex items-center gap-2 text-sm font-semibold text-mute hover:text-white mb-4">
          <ArrowLeft size={16} /> Back to consolidations
        </Link>
        <PageHeading icon={FileText}
          title="Issue invoice"
          subtitle="One-off charge to a customer (no parcels). They pay via card or M-Pesa." />

        {recentlyIssued && (
          <GlassCard className="p-4 mb-6 bg-emerald-500/10">
            <p className="text-sm font-bold text-emerald-800">Invoice issued ✓</p>
            <p className="text-xs text-emerald-300 mt-1">
              KES {recentlyIssued.amount.toLocaleString()} · {recentlyIssued.description}
              {recentlyIssued.user_email && <> · sent to <span className="font-semibold">{recentlyIssued.user_email}</span></>}
            </p>
          </GlassCard>
        )}

        <GlassCard className="p-6 mb-6">
          <h3 className="text-sm font-black uppercase tracking-wider text-mute mb-3">Customer</h3>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email, name, or warehouse ID"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-line bg-surface-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-line bg-surface-2">
            {filteredUsers.length === 0 ? (
              <p className="text-xs text-mute px-3 py-4">No matching customers.</p>
            ) : (
              filteredUsers.map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setUserId(u.id)}
                  className={`w-full text-left px-3 py-2 text-sm border-b border-line last:border-b-0 hover:bg-ember-500/10 ${userId === u.id ? 'bg-ember-500/15' : ''}`}
                >
                  <p className="font-semibold text-white">{u.name || u.email}</p>
                  <p className="text-xs text-mute">{u.email} {u.warehouse_id && <>· <span className="font-mono">{u.warehouse_id}</span></>}</p>
                </button>
              ))
            )}
          </div>
          {selectedUser && (
            <p className="mt-2 text-xs text-emerald-300 font-semibold">
              Selected: {selectedUser.name || selectedUser.email}
            </p>
          )}
        </GlassCard>

        <GlassCard className="p-6 mb-6">
          <h3 className="text-sm font-black uppercase tracking-wider text-mute mb-3">Invoice</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field
              label="Amount (KES)"
              type="number"
              value={amount}
              onChange={setAmount}
              placeholder="e.g. 1500"
            />
            <Field
              label="Currency"
              value="KES"
              onChange={() => {/* fixed for now */}}
              disabled
            />
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">
                Description (visible to customer)
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Customs penalty for parcel TC-…"
                className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">
                Internal notes (admin only)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional — context for other admins."
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
          </div>
        </GlassCard>

        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-ember-gradient hover:bg-[#142640] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-sm"
        >
          <Send size={16}/> {submitting ? 'Issuing…' : 'Issue invoice + email customer'}
        </button>
        <p className="mt-3 text-xs text-mute text-center">
          The customer receives an email immediately and can pay via card or M-Pesa from their Orders tab.
        </p>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, disabled = false }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-300 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      />
    </div>
  )
}
