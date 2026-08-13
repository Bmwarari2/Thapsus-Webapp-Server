import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { KanbanSquare, Search, ScanLine, MessageSquareText, RefreshCw, UserPlus, PackagePlus} from 'lucide-react'
import toast from 'react-hot-toast'
import { waApi } from '../../api'
import { GlassStyles, GlassCard, PageHeading, StatusBadge } from '../../components/GlassUI'
import { BarcodeScanner } from '../../components/BarcodeScanner'
import { AddOrderModal, AddCustomerModal } from '../../components/AddOrderModal'
import { useWaPipelineUpdates } from '../../hooks/useRealtimeUpdates'

// The five visual columns of the spec, each grouping its DB statuses.
const COLUMNS = [
  { title: 'Quoting', statuses: ['quoting', 'quoted', 'confirmed'] },
  { title: 'Paid', statuses: ['paid'] },
  { title: 'Purchased', statuses: ['purchased'] },
  { title: 'In Kenya', statuses: ['in_kenya', 'delivery_fee_pending'] },
  { title: 'Delivered', statuses: ['dispatched', 'delivered'] },
]

export function Pipeline() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  const [addOrderOpen, setAddOrderOpen] = useState(false)
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)
  const navigate = useNavigate()

  const load = useCallback(async (query = '') => {
    setLoading(true)
    try {
      const res = await waApi.orders(query ? { q: query } : {})
      setOrders(res.data.orders || [])
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load orders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useWaPipelineUpdates(() => load(q))

  const onSearch = (e) => {
    e.preventDefault()
    load(q.trim())
  }

  const onScan = async (code) => {
    setScanOpen(false)
    try {
      const res = await waApi.scan(code)
      navigate(`/ops/orders/${res.data.order.id}`)
    } catch (e) {
      toast.error(e.response?.data?.message || `No order found for ${code}`)
    }
  }

  const byColumn = useMemo(() => COLUMNS.map((col) => ({
    ...col,
    orders: orders.filter((o) => col.statuses.includes(o.status)),
  })), [orders])

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <GlassStyles />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading icon={KanbanSquare} title="Order Pipeline"
          subtitle="Quoting → Paid → Purchased → In Kenya → Delivered" />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setAddCustomerOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-line text-white hover:bg-white/10 transition-colors">
            <UserPlus size={18} /> Customer
          </button>
          <button onClick={() => setAddOrderOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ember-600 hover:bg-ember-500 text-white font-semibold transition-colors">
            <PackagePlus size={18} /> Add order
          </button>
          <button onClick={() => setScanOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-line text-white hover:bg-white/10 transition-colors">
            <ScanLine size={18} /> Scan
          </button>
          <button onClick={() => load(q)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-line text-white hover:bg-white/10 transition-colors">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <form onSubmit={onSearch} className="relative mb-6 max-w-xl">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-mute" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by TRK-code, TC-code, name or phone… (USB scanners type here too)"
          className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/5 border border-line text-white placeholder:text-mute focus:outline-none focus:border-ember-500/50"
        />
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {byColumn.map((col) => (
          <div key={col.title}>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-sm font-bold uppercase tracking-wider text-mute">{col.title}</h2>
              <span className="text-xs font-bold text-white bg-white/10 rounded-full px-2 py-0.5">
                {col.orders.length}
              </span>
            </div>
            <div className="space-y-3 min-h-[80px]">
              {col.orders.map((o) => (
                <Link key={o.id} to={`/ops/orders/${o.id}`} className="block">
                  <GlassCard className="p-4 hover:border-ember-500/40 transition-colors">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-bold text-white text-sm truncate">
                        {o.tracking_code || o.customer_code || 'New quote'}
                      </span>
                      <StatusBadge status={o.status} />
                    </div>
                    <p className="text-xs text-mute truncate">
                      {o.full_name || o.phone}
                      {o.quote_kes ? ` · KSh ${Number(o.quote_kes).toLocaleString()}` : ''}
                    </p>
                  </GlassCard>
                </Link>
              ))}
              {!loading && col.orders.length === 0 && (
                <p className="text-xs text-mute/60 px-1">Nothing here</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <Link to="/ops/inbox" className="inline-flex items-center gap-2 text-ember-400 hover:text-ember-300 text-sm font-semibold">
          <MessageSquareText size={16} /> Open the WhatsApp inbox to start a new quote
        </Link>
      </div>

      <BarcodeScanner open={scanOpen} onScan={onScan} onClose={() => setScanOpen(false)} />
      {addCustomerOpen && (
        <AddCustomerModal onClose={() => setAddCustomerOpen(false)} onAdded={() => load(q)} />
      )}
      {addOrderOpen && (
        <AddOrderModal onClose={() => setAddOrderOpen(false)}
          onCreated={(o) => navigate(`/ops/orders/${o.id}`)} />
      )}
    </div>
  )
}
