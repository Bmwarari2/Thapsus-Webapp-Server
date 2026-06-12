import React, { useEffect, useState } from 'react'
import { Plane, FileCheck, Save, Receipt } from 'lucide-react'
import toast from 'react-hot-toast'
import { customsApi } from '../../api'
import { GlassStyles, GlassCard, LiquidBlob, PageHeading, StatusBadge } from '../../components/GlassUI'

/**
 * /partner/agent — Kenya clearing agent portal (Spec §3.4, §4.5).
 */
export const AgentPortal = () => {
  const [consolidations, setConsolidations] = useState([])
  const [active, setActive] = useState(null)
  const [parcels, setParcels] = useState([])
  const [edit, setEdit] = useState({})

  const fetchList = () => customsApi.agentConsolidations()
    .then(r => setConsolidations(r.data?.consolidations || []))
    .catch(() => toast.error('Failed to load consolidations'))

  useEffect(() => { fetchList() }, [])

  const onOpen = async (cons) => {
    setActive(cons)
    try {
      const r = await customsApi.agentParcels(cons.id)
      setParcels(r.data?.parcels || [])
    } catch { toast.error('Failed to load parcels') }
  }

  const onSubmitEntry = async (parcel) => {
    const e = edit[parcel.id] || {}
    try {
      if (parcel.entry_id) {
        await customsApi.updateEntry(parcel.entry_id, e)
      } else {
        await customsApi.createEntry({ parcel_id: parcel.id, ...e })
      }
      toast.success('Entry saved')
      onOpen(active)
    } catch { toast.error('Failed to save entry') }
  }

  const onMarkReleased = async (entryId) => {
    try {
      await customsApi.updateEntry(entryId, { status: 'released' })
      // Audit P2.1: the parcel is now KRA-cleared but stays on
      // orders.status='customs' until an operator puts it on a rider
      // run (activateRunDispatch flips it to 'out_for_delivery' and
      // mints the OTP). Copy reflects the new invariant.
      toast.success('Released — awaiting dispatch')
      onOpen(active)
    } catch { toast.error('Failed to mark released') }
  }

  return (
    <div className="relative min-h-screen bg-gray-50">
      <GlassStyles />
      <LiquidBlob className="top-[-15%] right-[-15%] w-[40rem] h-[40rem]" color="bg-blue-200" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 py-10">
        <PageHeading icon={Plane} title="Clearing-agent portal"
          subtitle="Pre-alert pack · IDF / KRA entry · duty pass-through" />

        {!active ? (
          <>
            <h3 className="text-lg font-black text-[#1e3a5f] mb-3">Assigned consolidations</h3>
            {consolidations.length === 0 ? (
              <GlassCard className="p-8 text-center text-slate-500">No consolidations assigned to you yet.</GlassCard>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {consolidations.map(c => (
                  <GlassCard key={c.id} className="p-5 cursor-pointer hover:shadow-lg" onClick={() => onOpen(c)}>
                    <div className="flex justify-between items-start gap-3 mb-3">
                      <div>
                        <p className="text-xs text-slate-500">Week of</p>
                        <p className="text-lg font-black text-[#1e3a5f]">
                          {new Date(c.week_start).toLocaleDateString()}
                        </p>
                      </div>
                      <StatusBadge status={c.status}/>
                    </div>
                    <div className="text-sm space-y-1">
                      <p>AWB: <span className="font-mono">{c.master_awb_no || '—'}</span></p>
                      <p>{c.total_parcels || 0} parcels · {Number(c.total_kg || 0).toFixed(1)} kg</p>
                      <p>Departure: {c.departure_at ? new Date(c.departure_at).toLocaleString() : '—'}</p>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <button onClick={() => { setActive(null); setParcels([]); setEdit({}) }}
              className="text-sm text-orange-700 font-bold mb-4">← Back to assigned consolidations</button>

            <GlassCard className="p-5 md:p-6 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-[#1e3a5f]">Consolidation {active.id}</h3>
                  <p className="text-xs text-slate-500">
                    AWB <span className="font-mono">{active.master_awb_no || '—'}</span> ·
                    {' '}{active.total_parcels} parcels ·
                    {' '}{Number(active.total_kg || 0).toFixed(1)} kg
                  </p>
                </div>
                <StatusBadge status={active.status}/>
              </div>
            </GlassCard>

            <h3 className="text-lg font-black text-[#1e3a5f] mb-3">Per-parcel customs entries</h3>
            <div className="space-y-3">
              {parcels.map(p => {
                const e = edit[p.id] || {}
                const set = (k, v) => setEdit({ ...edit, [p.id]: { ...e, [k]: v } })
                return (
                  <GlassCard key={p.id} className="p-5">
                    <div className="flex flex-wrap justify-between gap-2 mb-3">
                      <div>
                        <p className="font-mono text-xs text-slate-500">{p.tracking_number}</p>
                        <p className="font-semibold text-slate-800">{p.consignee_name}</p>
                        <p className="text-xs text-slate-500">£{p.declared_value || 0} declared · {p.weight_kg || '—'} kg</p>
                      </div>
                      <StatusBadge status={p.entry_status || 'draft'}/>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Field label="IDF no." defaultValue={p.idf_no} onCommit={(v) => set('idf_no', v)} />
                      <Field label="Entry no." defaultValue={p.entry_no} onCommit={(v) => set('entry_no', v)} />
                      <Field label="Duty (KES)" type="number" defaultValue={p.duty_kes} onCommit={(v) => set('duty_kes', +v || 0)} />
                      <Field label="VAT (KES)" type="number" defaultValue={p.vat_kes} onCommit={(v) => set('vat_kes', +v || 0)} />
                      <Field label="IDF fee (KES)" type="number" defaultValue={p.idf_kes} onCommit={(v) => set('idf_kes', +v || 0)} />
                      <Field label="RDL (KES)" type="number" defaultValue={p.rdl_kes} onCommit={(v) => set('rdl_kes', +v || 0)} />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-4">
                      <button onClick={() => onSubmitEntry(p)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold">
                        <Save size={14}/> Save entry
                      </button>
                      {p.entry_id && (
                        <button onClick={() => onMarkReleased(p.entry_id)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold">
                          <FileCheck size={14}/> Mark released
                        </button>
                      )}
                    </div>
                  </GlassCard>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const Field = ({ label, type = 'text', defaultValue = '', onCommit }) => {
  const [val, setVal] = useState(defaultValue || '')
  useEffect(() => { setVal(defaultValue || '') }, [defaultValue])
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-widest text-slate-500 font-black mb-1">{label}</span>
      <input type={type} value={val}
             onChange={e => setVal(e.target.value)}
             onBlur={() => onCommit(val)}
             className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white/80 text-sm" />
    </label>
  )
}

/**
 * /partner/agent/invoices — agent's own invoices to Thapsus
 */
export const AgentInvoices = () => {
  const [invoices, setInvoices] = useState([])
  const [draft, setDraft] = useState({ consolidation_id: '', invoice_no: '', amount_kes: '', notes: '' })

  const refresh = () => customsApi.listInvoices().then(r => setInvoices(r.data?.invoices || []))
  useEffect(() => { refresh() }, [])

  const onSubmit = async () => {
    if (!draft.amount_kes) { toast.error('Amount required'); return }
    try {
      await customsApi.submitInvoice({ ...draft, amount_kes: +draft.amount_kes })
      setDraft({ consolidation_id: '', invoice_no: '', amount_kes: '', notes: '' })
      refresh()
      toast.success('Invoice submitted')
    } catch { toast.error('Failed to submit invoice') }
  }

  return (
    <div className="relative min-h-screen bg-gray-50">
      <GlassStyles />
      <div className="relative z-10 max-w-5xl mx-auto px-4 md:px-8 py-10">
        <PageHeading icon={Receipt} title="My invoices"
          subtitle="Submit and track invoices to Thapsus" />

        <GlassCard className="p-5 md:p-6 mb-6">
          <h3 className="text-lg font-black text-[#1e3a5f] mb-3">Submit a new invoice</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input placeholder="Consolidation ID (optional)" value={draft.consolidation_id}
              onChange={e => setDraft({ ...draft, consolidation_id: e.target.value })}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white/80" />
            <input placeholder="Invoice no." value={draft.invoice_no}
              onChange={e => setDraft({ ...draft, invoice_no: e.target.value })}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white/80" />
            <input placeholder="Amount KES" type="number" value={draft.amount_kes}
              onChange={e => setDraft({ ...draft, amount_kes: e.target.value })}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white/80" />
            <input placeholder="Notes" value={draft.notes}
              onChange={e => setDraft({ ...draft, notes: e.target.value })}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white/80" />
          </div>
          <button onClick={onSubmit}
            className="mt-3 px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm">
            Submit invoice
          </button>
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="text-lg font-black text-[#1e3a5f] mb-3">My submitted invoices</h3>
          <table className="min-w-full text-sm">
            <thead className="text-[10px] uppercase text-slate-500">
              <tr>
                <th className="text-left py-2">Invoice</th>
                <th className="text-left py-2">Consolidation</th>
                <th className="text-right py-2">Amount KES</th>
                <th className="text-left py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(i => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="py-2 font-mono text-xs">{i.invoice_no || i.id}</td>
                  <td className="py-2 text-xs">{i.consolidation_id || '—'}</td>
                  <td className="py-2 text-right font-bold">{(i.amount_kes || 0).toLocaleString()}</td>
                  <td className="py-2"><StatusBadge status={i.status}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      </div>
    </div>
  )
}
