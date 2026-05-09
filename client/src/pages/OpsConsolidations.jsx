import React, { useEffect, useState } from 'react'
import { useNavigate, Link, useParams } from 'react-router-dom'
import {
  Plane, FileText, Plus, ArrowRight, Truck, Boxes, AlertCircle, Save, Printer
} from 'lucide-react'
import toast from 'react-hot-toast'
import { consolidationsApi, opsApi } from '../api'
import { GlassStyles, GlassCard, LiquidBlob, PageHeading, StatusBadge } from '../components/GlassUI'
import { PrintableManifest } from '../components/PrintableManifest'

export const OpsConsolidations = () => {
  const [list,    setList]    = useState([])
  const [creating, setCreating] = useState(false)
  const [form,    setForm]    = useState({ week_start: '', cutoff_at: '', departure_at: '', notes: '' })
  const navigate = useNavigate()

  const fetchList = () => consolidationsApi.list().then(r => setList(r.data?.consolidations || []))
                                                  .catch(() => toast.error('Failed to load consolidations'))

  useEffect(() => { fetchList() }, [])

  const onCreate = async () => {
    try {
      const res = await consolidationsApi.create(form)
      toast.success('Consolidation created')
      setCreating(false)
      setForm({ week_start: '', cutoff_at: '', departure_at: '', notes: '' })
      fetchList()
      if (res.data?.consolidation_id) navigate(`/ops/consolidations/${res.data.consolidation_id}`)
    } catch { toast.error('Failed to create') }
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50">
      <GlassStyles />
      <LiquidBlob className="top-[-15%] right-[-15%] w-[40rem] h-[40rem]" color="bg-orange-200" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 py-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <PageHeading icon={Plane} title="Consolidations"
            subtitle="Weekly UK → Nairobi flight units" />
          <button onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg">
            <Plus size={18}/> New consolidation
          </button>
        </div>

        {list.length === 0 ? (
          <GlassCard className="p-10 text-center">
            <Boxes size={40} className="mx-auto text-slate-400 mb-3" />
            <p className="text-slate-600">No consolidations yet. Create one to start booking parcels onto a weekly flight.</p>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {list.map((c) => (
              <Link key={c.id} to={`/ops/consolidations/${c.id}`}
                className="block group">
                <GlassCard className="p-5 hover:shadow-lg transition-shadow">
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <p className="text-xs text-slate-500">Week of</p>
                      <p className="text-lg font-black text-[#1e3a5f]">
                        {c.week_start ? new Date(c.week_start).toLocaleDateString() : '—'}
                      </p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-4 text-center">
                    <Stat label="Parcels" value={c.total_parcels || 0} />
                    <Stat label="Total kg" value={Number(c.total_kg || 0).toFixed(1)} />
                    <Stat label="AWB" value={c.master_awb_no || '—'} small />
                  </div>
                  <div className="text-xs text-slate-500 mt-4">
                    Cut-off: {c.cutoff_at ? new Date(c.cutoff_at).toLocaleString() : '—'}
                  </div>
                  <div className="flex items-center text-xs font-bold text-orange-700 mt-2">
                    Open <ArrowRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform"/>
                  </div>
                </GlassCard>
              </Link>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <GlassCard className="bg-white max-w-md w-full p-6">
            <h3 className="text-xl font-black text-[#1e3a5f] mb-4">Create consolidation</h3>
            <div className="space-y-3">
              <Field label="Week start (Monday)" type="date"
                     value={form.week_start} onChange={(v) => setForm({ ...form, week_start: v })}/>
              <Field label="Cut-off (Wednesday 17:00)" type="datetime-local"
                     value={form.cutoff_at} onChange={(v) => setForm({ ...form, cutoff_at: v })}/>
              <Field label="Planned departure" type="datetime-local"
                     value={form.departure_at} onChange={(v) => setForm({ ...form, departure_at: v })}/>
              <Field label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })}/>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button onClick={() => setCreating(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-bold">Cancel</button>
              <button onClick={onCreate}
                className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm">Create</button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  )
}

/** Detail view: /ops/consolidations/:id  */
export const OpsConsolidationDetail = () => {
  const { id } = useParams()
  const [data,     setData]     = useState(null)
  const [parcels,  setParcels]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [available, setAvailable] = useState([])
  // Drives the print container. When non-null, the hidden manifest
  // <div class="print:block"> renders the consolidation + parcels and
  // an effect fires window.print(). afterprint clears the state, so
  // the next print call re-mounts and refreshes the printedAt stamp.
  const [printingManifest, setPrintingManifest] = useState(null)

  useEffect(() => {
    if (!printingManifest) return
    const onAfter = () => setPrintingManifest(null)
    window.addEventListener('afterprint', onAfter)
    const raf = requestAnimationFrame(() => {
      try { window.print() } catch (_) { /* surfaced by toast in caller */ }
    })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('afterprint', onAfter)
    }
  }, [printingManifest])

  const refetch = () => consolidationsApi.get(id).then(r => {
    setData(r.data)
    setParcels(r.data?.parcels || [])
    setLoading(false)
  }).catch(() => { toast.error('Failed to load'); setLoading(false) })

  useEffect(() => {
    refetch()
    opsApi.parcels({ status: 'received_at_warehouse' })
      .then(r => setAvailable(r.data?.parcels || []))
      .catch(() => {})
  }, [id])

  const onAssign = async (parcelId) => {
    try {
      await consolidationsApi.assignParcel(id, parcelId)
      toast.success('Assigned')
      refetch()
      setAvailable(av => av.filter(p => p.id !== parcelId))
    } catch { toast.error('Failed to assign') }
  }
  const onRemove = async (parcelId) => {
    try {
      await consolidationsApi.removeParcel(id, parcelId)
      toast.success('Removed')
      refetch()
    } catch { toast.error('Failed to remove') }
  }

  const onUpdate = async (patch) => {
    try {
      await consolidationsApi.update(id, patch)
      toast.success('Saved')
      refetch()
    } catch { toast.error('Save failed') }
  }

  const onManifest = async () => {
    try {
      const res = await consolidationsApi.manifest(id)
      const blob = new Blob([JSON.stringify(res.data?.manifest || {}, null, 2)],
                            { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `manifest-${id}.json`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('Manifest failed') }
  }

  if (loading) return <div className="p-10 text-center">Loading…</div>
  if (!data?.consolidation) return <div className="p-10 text-center">Not found</div>

  const c = data.consolidation
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50">
      <GlassStyles />
      <LiquidBlob className="top-[-15%] left-[-15%] w-[40rem] h-[40rem]" color="bg-blue-200"  />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 py-10 space-y-6">
        <Link to="/ops/consolidations" className="text-sm text-orange-700 font-bold">← Back to consolidations</Link>

        <PageHeading icon={Plane}
          title={`Consolidation ${c.id}`}
          subtitle={`Week of ${c.week_start ? new Date(c.week_start).toLocaleDateString() : '—'}`} />

        {/* Header card */}
        <GlassCard className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Stat label="Status"   value={<StatusBadge status={c.status} />} />
            <Stat label="Parcels"  value={c.total_parcels || 0} />
            <Stat label="Total kg" value={Number(c.total_kg || 0).toFixed(1)} />
            <Stat label="Cut-off"  value={c.cutoff_at ? new Date(c.cutoff_at).toLocaleString() : '—'} small />
            <Stat label="Departure" value={c.departure_at ? new Date(c.departure_at).toLocaleString() : '—'} small />
          </div>

          {/* Action bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
            <Field label="Master AWB number" value={c.master_awb_no || ''}
                   onChange={(v) => onUpdate({ master_awb_no: v })} debounce />
            <Field label="Tudor invoice no." value={c.tudor_invoice_no || ''}
                   onChange={(v) => onUpdate({ tudor_invoice_no: v })} debounce />
            <Field label="Status"
              type="select"
              value={c.status}
              options={[
                ['open','Open'], ['closed','Closed'], ['in_transit','In transit'],
                ['arrived','Arrived'], ['cleared','Cleared'], ['delivered','Delivered'],
                ['cancelled','Cancelled']
              ]}
              onChange={(v) => onUpdate({ status: v })}
            />
          </div>

          <div className="flex flex-wrap gap-3 mt-5">
            <button onClick={onManifest}
              className="inline-flex items-center gap-2 bg-[#1e3a5f] text-white px-4 py-2 rounded-xl text-sm font-bold">
              <FileText size={14}/> Download JSON
            </button>
            <button onClick={() => setPrintingManifest({ consolidation: c, parcels })}
              className="inline-flex items-center gap-2 bg-white text-[#1e3a5f] ring-1 ring-slate-200 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-bold">
              <Printer size={14}/> Print manifest
            </button>
            <button onClick={() => onUpdate({ status: 'in_transit' })}
              className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-bold">
              <Truck size={14}/> Mark as in transit
            </button>
          </div>
        </GlassCard>

        {/* Booked parcels */}
        <GlassCard className="p-6">
          <h3 className="text-lg font-black text-[#1e3a5f] mb-4">Booked parcels ({parcels.length})</h3>
          {parcels.length === 0 ? (
            <p className="text-slate-500 text-sm">No parcels assigned yet — pick from the list below.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-[10px] uppercase text-slate-500 border-b">
                  <tr>
                    <th className="text-left py-2 px-2">Tracking</th>
                    <th className="text-left py-2 px-2">Customer</th>
                    <th className="text-left py-2 px-2">Description</th>
                    <th className="text-right py-2 px-2">kg</th>
                    <th className="text-right py-2 px-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {parcels.map(p => (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className="py-2 px-2 font-mono text-xs">{p.tracking_number}</td>
                      <td className="py-2 px-2">{p.name}</td>
                      <td className="py-2 px-2 max-w-xs truncate">{p.retailer}</td>
                      <td className="py-2 px-2 text-right">{p.chargeable_kg || p.weight_kg || '—'}</td>
                      <td className="py-2 px-2 text-right">
                        <button onClick={() => onRemove(p.id)} className="text-xs text-red-500 hover:underline">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        {/* Available to add */}
        <GlassCard className="p-6">
          <h3 className="text-lg font-black text-[#1e3a5f] mb-4">Available parcels (received, not yet assigned)</h3>
          {available.length === 0 ? (
            <p className="text-slate-500 text-sm">No received parcels are awaiting assignment.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {available.map(p => (
                <div key={p.id} className="flex justify-between items-center bg-white/70 px-4 py-3 rounded-xl border border-slate-200">
                  <div>
                    <p className="font-mono text-xs text-slate-500">{p.tracking_number}</p>
                    <p className="font-semibold text-slate-700">{p.name}</p>
                    <p className="text-xs text-slate-500 truncate">{p.description}</p>
                  </div>
                  <button onClick={() => onAssign(p.id)}
                    className="text-xs px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold">
                    Assign
                  </button>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Print container. Only visible inside @media print so the
          manifest sheet is the only thing that lands on paper. The
          @page rule sets standard A4 portrait; if the operator has a
          printer set to thermal-label paper, the table just spans
          multiple pages and the thead repeats per
          `display: table-header-group` inside PrintableManifest. */}
      <div className="hidden print:block fixed inset-0 bg-white">
        {printingManifest && (
          <PrintableManifest
            consolidation={printingManifest.consolidation}
            parcels={printingManifest.parcels}
          />
        )}
      </div>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { background: #ffffff !important; }
          body > *:not(#root) { display: none !important; }
          #root > *:not(.print\\:block) { display: none !important; }
        }
      `}</style>
    </div>
  )
}

const Stat = ({ label, value, small }) => (
  <div>
    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">{label}</p>
    <p className={`mt-1 text-[#1e3a5f] font-black ${small ? 'text-sm' : 'text-2xl'}`}>{value}</p>
  </div>
)

const Field = ({ label, value, onChange, type = 'text', options, debounce }) => {
  const [local, setLocal] = useState(value || '')
  useEffect(() => { setLocal(value || '') }, [value])
  const commit = (v) => { onChange(v) }
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-widest text-slate-500 font-black mb-1">{label}</span>
      {type === 'select' ? (
        <select value={local} onChange={(e) => { setLocal(e.target.value); commit(e.target.value) }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white/80">
          {options?.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : (
        <input type={type} value={local}
               onChange={(e) => setLocal(e.target.value)}
               onBlur={() => debounce && local !== value && commit(local)}
               className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-orange-400" />
      )}
    </label>
  )
}
