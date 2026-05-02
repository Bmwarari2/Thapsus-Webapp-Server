// AdminCustomerConsolidations.jsx
//
// Webapp admin form for the Phase 2 two-tier consolidation flow. Pairs
// with the iOS admin tab (which handles existing-row lifecycle); this
// page focuses on the *creation* flow which the iOS surface
// intentionally deferred:
//
//   1. Search for a customer.
//   2. Pick which of their `received_at_warehouse` parcels to bundle.
//   3. Submit → POST /api/customer-consolidations.
//   4. On success, jump straight into the invoice step
//      (PATCH /:id/invoice with the amount).
//
// Uses adminApi.searchCustomers + adminApi.getUser for the picker, and
// customerConsolidationsApi for the writes. No new server endpoints.
// Parcels already attached to another customer-consolidation will be
// rejected by the server's POST handler with a 400 — we surface that
// inline so the admin can deselect and retry.

import React, { useState } from 'react'
import { Search, UserCheck, Package as PackageIcon, CheckCircle, XCircle, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { adminApi, customerConsolidationsApi } from '../api'

export const AdminCustomerConsolidations = () => {
  // Step 1: customer search
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState([])

  // Step 2: selected customer + their parcels
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [parcels, setParcels] = useState([])
  const [parcelsLoading, setParcelsLoading] = useState(false)
  const [selectedParcelIds, setSelectedParcelIds] = useState(new Set())
  const [notes, setNotes] = useState('')

  // Step 3: post-create invoice flow
  const [submitting, setSubmitting] = useState(false)
  const [createdId, setCreatedId] = useState(null)
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [invoicing, setInvoicing] = useState(false)
  const [suggestion, setSuggestion] = useState(null)
  const [suggestionLoading, setSuggestionLoading] = useState(false)

  const onSearch = async (e) => {
    e?.preventDefault()
    const q = searchQuery.trim()
    if (q.length < 2) return
    setSearching(true)
    try {
      const res = await adminApi.searchCustomers(q)
      setResults(res.data?.customers || [])
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  const pickCustomer = async (customer) => {
    setSelectedCustomer(customer)
    setResults([])
    setSearchQuery('')
    setSelectedParcelIds(new Set())
    setParcelsLoading(true)
    try {
      const res = await adminApi.getUser(customer.id)
      // Server returns user.orders joined with cost_breakdown. Filter
      // client-side to received_at_warehouse — the only state where a
      // parcel can be added to a customer-consolidation. The server's
      // POST validates that none of the selected parcels are already
      // in another customer-consolidation, so already-grouped rows
      // surface as a 400 with a list of bad ids.
      const eligible = (res.data?.user?.orders || []).filter(
        (o) => o.status === 'received_at_warehouse'
      )
      setParcels(eligible)
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load parcels')
    } finally {
      setParcelsLoading(false)
    }
  }

  const toggleParcel = (id) => {
    setSelectedParcelIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!selectedCustomer || selectedParcelIds.size === 0) return
    setSubmitting(true)
    try {
      const res = await customerConsolidationsApi.create({
        user_id: selectedCustomer.id,
        parcel_ids: Array.from(selectedParcelIds),
        notes: notes || undefined,
      })
      const id = res.data?.customer_consolidation_id
      if (!id) throw new Error('No id returned')
      toast.success('Customer consolidation created')
      setCreatedId(id)
      // Auto-prefill the invoice amount from the server's suggested
      // total (sum of per-parcel shipping + operator-set duty across
      // every parcel). Admin can still override.
      setSuggestionLoading(true)
      try {
        const sugRes = await customerConsolidationsApi.suggestedInvoice(id)
        const total = Number(sugRes.data?.total)
        if (Number.isFinite(total) && total > 0) {
          setSuggestion(sugRes.data)
          setInvoiceAmount(String(Math.round(total)))
        }
      } catch (sugErr) {
        // Suggestion is best-effort — admin still sees a blank field
        // they can fill manually if it doesn't load.
        console.warn('suggested-invoice failed', sugErr)
      } finally {
        setSuggestionLoading(false)
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create consolidation')
    } finally {
      setSubmitting(false)
    }
  }

  const onSetInvoice = async (e) => {
    e.preventDefault()
    if (!createdId || !invoiceAmount) return
    const amount = Number(invoiceAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Amount must be a positive number')
      return
    }
    setInvoicing(true)
    try {
      await customerConsolidationsApi.setInvoice(createdId, amount, 'KES')
      toast.success(`Invoice issued. Customer notified by email.`)
      // Reset the whole form so the admin can mint another one.
      reset()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to set invoice')
    } finally {
      setInvoicing(false)
    }
  }

  const reset = () => {
    setSelectedCustomer(null)
    setParcels([])
    setSelectedParcelIds(new Set())
    setNotes('')
    setCreatedId(null)
    setInvoiceAmount('')
    setSuggestion(null)
    setSuggestionLoading(false)
  }

  // ── Render ──────────────────────────────────────────────────────────────

  // Stage A: invoice step after a successful create.
  if (createdId) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Customer consolidation created
          </h1>
          <p className="text-sm text-gray-600 mb-6 font-mono">{createdId}</p>

          <form onSubmit={onSetInvoice} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
            {suggestionLoading && (
              <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">
                Computing suggested total…
              </div>
            )}
            {suggestion && (
              <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-orange-700 uppercase tracking-wider">
                      Suggested
                    </p>
                    <p className="text-lg font-bold text-orange-900">
                      {suggestion.currency} {Number(suggestion.total).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInvoiceAmount(String(Math.round(Number(suggestion.total))))}
                    className="px-3 py-1.5 bg-orange-500 text-white rounded-md text-sm font-medium hover:bg-orange-600"
                  >
                    Use
                  </button>
                </div>
                <p className="mt-2 text-xs text-orange-700/80">
                  (chargeable kg × shipping rate) + customs duty across {suggestion.breakdown?.length || 0} parcel{(suggestion.breakdown?.length || 0) === 1 ? '' : 's'}.
                  Confirm before issuing.
                </p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Invoice amount (KES)
              </label>
              <input
                type="number"
                inputMode="decimal"
                placeholder="5000"
                value={invoiceAmount}
                onChange={(e) => setInvoiceAmount(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                autoFocus
              />
              <p className="mt-2 text-xs text-gray-500">
                The customer will receive an "Invoice ready" email and an
                in-app notification with this amount. Their iOS Orders tab
                flips to "Pay now" in real time.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={reset}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Skip — invoice later
              </button>
              <button
                type="submit"
                disabled={invoicing || !invoiceAmount}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50"
              >
                {invoicing ? 'Saving…' : 'Issue invoice'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // Stage B: parcel-picker once a customer is chosen.
  if (selectedCustomer) {
    const selectedCount = selectedParcelIds.size
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-3xl mx-auto">
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Pick a different customer
          </button>

          <div className="flex items-center gap-3 mb-6">
            <UserCheck className="w-6 h-6 text-orange-500" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {selectedCustomer.name || selectedCustomer.email}
              </h1>
              <p className="text-sm text-gray-500">{selectedCustomer.email}</p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900">
                  Eligible parcels
                </h2>
                <span className="text-sm text-gray-500">
                  {selectedCount} of {parcels.length} selected
                </span>
              </div>

              {parcelsLoading ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : parcels.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
                  <PackageIcon className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">
                    No parcels at "received at warehouse" for this user.
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Once an operator receives a parcel, it'll show up here.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {parcels.map((p) => {
                    const checked = selectedParcelIds.has(p.id)
                    return (
                      <li
                        key={p.id}
                        className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition ${
                          checked ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => toggleParcel(p.id)}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleParcel(p.id)}
                          className="mt-1 w-4 h-4 text-orange-500 rounded border-gray-300 focus:ring-orange-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-mono text-gray-700">
                              {p.tracking_number || p.id}
                            </p>
                            <span className="text-xs text-gray-500">
                              {p.market} · {p.shipping_speed || 'economy'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mt-1">
                            {p.retailer || '—'}
                          </p>
                          {p.weight_kg ? (
                            <p className="text-xs text-gray-500 mt-1">
                              {p.weight_kg} kg
                            </p>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="p-6 border-b border-gray-100">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes (optional)
              </label>
              <textarea
                rows={2}
                placeholder="Anything ops should know about this group"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>

            <div className="p-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={reset}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || selectedCount === 0}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50"
              >
                {submitting ? 'Creating…' : `Create consolidation (${selectedCount})`}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // Stage C: customer search.
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <Link to="/admin" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to admin
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Create customer consolidation
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Group several of a customer's received parcels under a single shipping
          invoice. The customer pays once and the batch is forwarded to the
          shipping partner together.
        </p>

        <form onSubmit={onSearch} className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <button
            type="submit"
            disabled={searching || searchQuery.trim().length < 2}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50"
          >
            {searching ? '…' : 'Search'}
          </button>
        </form>

        {results.length > 0 && (
          <ul className="bg-white rounded-2xl shadow-sm border border-gray-200 divide-y divide-gray-100">
            {results.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer"
                onClick={() => pickCustomer(c)}
              >
                <div>
                  <p className="font-medium text-gray-900">{c.name || c.email}</p>
                  <p className="text-sm text-gray-500">{c.email}</p>
                </div>
                <span className="text-xs text-gray-400 font-mono">
                  {c.warehouse_id}
                </span>
              </li>
            ))}
          </ul>
        )}

        {results.length === 0 && searchQuery && !searching && (
          <p className="text-sm text-gray-500 text-center py-8">
            No matching customers — try a different name or email.
          </p>
        )}
      </div>
    </div>
  )
}

export default AdminCustomerConsolidations
