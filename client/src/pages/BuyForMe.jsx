import React, { useEffect, useState } from 'react'
import { ShoppingBag, ExternalLink, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { buyForMeApi } from '../api'
import { GlassStyles, GlassCard, LiquidBlob, PageHeading, StatusBadge } from '../components/GlassUI'

/**
 * /app/buy-for-me — concierge orders (Spec §4.10).
 *
 * Customer pastes a retailer URL → we buy + ship to UK → consolidate.
 */
export const BuyForMe = () => {
  const [orders, setOrders] = useState([])
  const [draft, setDraft] = useState({
    retailer_url: '', item_name: '', size: '', qty: 1, notes: '',
  })

  const refresh = () => buyForMeApi.mine().then(r => setOrders(r.data?.orders || []))
                                          .catch(() => toast.error('Failed to load orders'))

  useEffect(() => { refresh() }, [])

  const onSubmit = async () => {
    if (!draft.retailer_url || !draft.item_name) {
      toast.error('Retailer URL and item name are required'); return
    }
    try {
      await buyForMeApi.create(draft)
      toast.success('Concierge request submitted — we will quote within 24h')
      setDraft({ retailer_url: '', item_name: '', size: '', qty: 1, notes: '' })
      refresh()
    } catch { toast.error('Failed to submit') }
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50">
      <GlassStyles />
      <LiquidBlob className="top-[-15%] right-[-15%] w-[40rem] h-[40rem]" color="bg-orange-200" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 md:px-8 py-10">
        <PageHeading icon={ShoppingBag}
          title="Buy for me"
          subtitle="Don't have a UK card? Paste the link — we'll buy and ship for you." />

        <GlassCard className="p-6 mb-8">
          <h3 className="text-lg font-black text-[#1e3a5f] mb-4">New concierge order</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Retailer URL" value={draft.retailer_url}
                   onChange={(v) => setDraft({ ...draft, retailer_url: v })}
                   placeholder="https://www.amazon.co.uk/…" />
            <Field label="Item name" value={draft.item_name}
                   onChange={(v) => setDraft({ ...draft, item_name: v })} />
            <Field label="Size / variant" value={draft.size}
                   onChange={(v) => setDraft({ ...draft, size: v })} />
            <Field label="Quantity" type="number" value={draft.qty}
                   onChange={(v) => setDraft({ ...draft, qty: +v || 1 })} />
            <div className="md:col-span-2">
              <Field label="Notes" value={draft.notes}
                     onChange={(v) => setDraft({ ...draft, notes: v })}/>
            </div>
          </div>
          <button onClick={onSubmit}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm">
            <Plus size={16}/> Request a quote
          </button>
        </GlassCard>

        <h3 className="text-lg font-black text-[#1e3a5f] mb-3">My concierge orders</h3>
        {orders.length === 0 ? (
          <GlassCard className="p-8 text-center text-slate-500">No concierge orders yet.</GlassCard>
        ) : (
          <div className="space-y-3">
            {orders.map(o => (
              <GlassCard key={o.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-slate-500">{o.id}</p>
                    <p className="font-semibold text-slate-800 truncate">{o.item_name}</p>
                    <a href={o.retailer_url} target="_blank" rel="noreferrer"
                       className="text-xs text-orange-500 inline-flex items-center gap-1 hover:underline">
                      <ExternalLink size={11}/> {o.retailer_url}
                    </a>
                    {o.size && <p className="text-xs text-slate-500">Size: {o.size}</p>}
                    <p className="text-xs text-slate-500">Qty: {o.qty}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={o.status}/>
                    {o.estimate_gbp != null && (
                      <p className="mt-2 text-sm font-bold text-[#1e3a5f]">£{o.estimate_gbp}</p>
                    )}
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const Field = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <label className="block">
    <span className="block text-[10px] uppercase tracking-widest text-slate-500 font-black mb-1">{label}</span>
    <input value={value} type={type} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-orange-400" />
  </label>
)
