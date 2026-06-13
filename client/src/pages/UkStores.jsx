import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ExternalLink, ShoppingBag, Store } from 'lucide-react'
import { UK_STORES, UK_STORE_CATEGORIES, storeInitials } from '../data/ukStores'

/**
 * /uk-stores — a searchable directory of popular UK retailers. Customers use
 * the UK version of a store so we can buy + ship from the UK. Each card opens
 * the store; "Buy this for me" deep-links into the concierge form.
 */
export const UkStores = () => {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return UK_STORES.filter((s) => {
      if (cat !== 'All' && s.category !== cat) return false
      if (!needle) return true
      return s.name.toLowerCase().includes(needle) || s.category.toLowerCase().includes(needle)
    })
  }, [q, cat])

  return (
    <div className="min-h-screen relative bg-white/[0.03] py-12 px-4 font-sans">
      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-ember-500/10 border border-ember-500/20 mb-4">
            <Store size={14} className="text-ember-400" />
            <span className="text-[11px] font-black uppercase tracking-widest text-ember-300">UK stores directory</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-3 leading-none tracking-tighter">
            Popular UK stores
          </h1>
          <p className="text-mute font-medium text-lg max-w-2xl">
            Shop the <span className="text-white font-bold">UK version</span> of these stores (e.g. amazon.co.uk),
            then paste the product link into a Buy-for-me request and we'll handle the rest.
          </p>
        </div>

        {/* Search + category filter */}
        <div className="sticky top-[calc(4rem+env(safe-area-inset-top,0px))] z-20 -mx-4 px-4 py-3 bg-ink/70 backdrop-blur-xl">
          <div className="relative mb-3">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-mute" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search stores…"
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-surface-2 border border-line text-white font-semibold placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-500 transition-all"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {['All', ...UK_STORE_CATEGORIES].map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`shrink-0 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest border transition-all ${
                  cat === c
                    ? 'bg-ember-gradient text-white border-transparent'
                    : 'bg-surface-2 text-mute border-line hover:text-white'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {filtered.map((s) => (
            <div key={s.name} className="group rounded-3xl bg-surface-2 border border-line p-5 hover:border-line-strong transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="w-12 h-12 rounded-2xl grid place-items-center text-sm font-black text-white shadow-inner shrink-0"
                  style={{ background: s.color }}
                >
                  {storeInitials(s.name)}
                </span>
                <div className="min-w-0">
                  <h3 className="font-black text-white truncate">{s.name}</h3>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-mute">{s.category}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-surface border border-line text-ember-400 hover:bg-white/[0.04] text-xs font-bold transition-colors"
                >
                  <ExternalLink size={13} /> Visit store
                </a>
                <button
                  onClick={() => navigate(`/buy-for-me?store=${encodeURIComponent(s.url)}`)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-colors"
                >
                  <ShoppingBag size={13} /> Buy for me
                </button>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-20 text-mute">
            <Store size={40} className="mx-auto mb-4 opacity-40" />
            <p className="font-semibold">No stores match “{q}”.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default UkStores
