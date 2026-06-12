import React, { useEffect, useState } from 'react'
import { Truck, MapPin, Plus, Play, RefreshCw, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { lastMileApi } from '../api'
import { GlassStyles, GlassCard, LiquidBlob, PageHeading, StatusBadge } from '../components/GlassUI'

/**
 * /ops/dispatch — Nairobi rider board (Spec §4.6).
 */
export const OpsDispatch = () => {
  const [pending, setPending] = useState([])
  const [runs,    setRuns]    = useState([])
  const [zones,   setZones]   = useState([])
  const [riders,  setRiders]  = useState([])
  const [picked,  setPicked]  = useState([])
  const [zone,    setZone]    = useState('')
  const [date,    setDate]    = useState(new Date().toISOString().slice(0,10))
  const [riderId, setRiderId] = useState('')

  const refresh = () => lastMileApi.dispatch()
    .then(r => {
      setPending(r.data?.pending || [])
      setRuns(r.data?.runs || [])
      setZones(r.data?.zones || [])
      if (!zone && r.data?.zones?.length) setZone(r.data.zones[0])
    })
    .catch(() => toast.error('Failed to load dispatch'))

  const refreshRiders = () => lastMileApi.riders()
    .then(r => setRiders(r.data?.riders || []))
    .catch(() => { /* operator may not be admin in some envs; fall through silently */ })

  useEffect(() => {
    refresh()
    refreshRiders()
    /* eslint-disable-next-line */
  }, [])

  const togglePick = (id) => {
    setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  const onCreateRun = async () => {
    if (!zone || !date || picked.length === 0) {
      toast.error('Pick a zone, date and at least one parcel'); return
    }
    try {
      await lastMileApi.createRun({
        rider_id: riderId || null, zone, run_date: date, parcel_ids: picked,
      })
      toast.success('Run created')
      setPicked([])
      refresh()
    } catch { toast.error('Failed to create run') }
  }

  const onStartRun = async (run) => {
    if (!run.rider_id) { toast.error('Assign a rider before starting'); return }
    if (!window.confirm(
      `Start run for ${run.zone}? This flips ${run.total_stops || 0} parcels to ` +
      `out_for_delivery and notifies recipients with a one-time delivery code.`
    )) return
    try {
      await lastMileApi.updateRun(run.id, { status: 'in_progress' })
      toast.success('Run started — recipients notified')
      refresh()
    } catch { toast.error('Failed to start run') }
  }

  return (
    <div className="relative min-h-screen bg-white/[0.03]">
      <GlassStyles />
      <LiquidBlob className="top-[-15%] left-[-15%] w-[40rem] h-[40rem]" color="bg-orange-200" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 py-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <PageHeading icon={Truck} title="Last-mile dispatch" subtitle="Nairobi rider runs by zone" />
          <button onClick={refresh}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-ember-gradient text-white text-sm font-bold">
            <RefreshCw size={14}/> Refresh
          </button>
        </div>

        {/* Run builder */}
        <GlassCard className="p-5 md:p-6 mb-8">
          <h3 className="text-lg font-black text-white mb-4">Create rider run</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Select label="Zone" value={zone} onChange={setZone}
                    options={zones.map(z => [z, z])} />
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-line bg-surface-2" />
            <Select label="Rider" value={riderId} onChange={setRiderId}
                    options={[
                      ['', riders.length === 0 ? '— no riders provisioned —' : '— unassigned —'],
                      ...riders.map(r => [r.id, riderLabel(r)]),
                    ]} />
            <button onClick={onCreateRun}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold">
              <Plus size={16}/> Create run ({picked.length})
            </button>
          </div>
        </GlassCard>

        {/* Pending parcels */}
        <GlassCard className="p-5 md:p-6 mb-8">
          <h3 className="text-lg font-black text-white mb-4">Awaiting dispatch ({pending.length})</h3>
          {pending.length === 0 ? (
            <p className="text-mute text-sm">No parcels awaiting last-mile.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pending.map(p => (
                <label key={p.id}
                  className={`block cursor-pointer p-4 rounded-xl border-2 transition-all
                    ${picked.includes(p.id)
                      ? 'border-orange-500 bg-ember-500/10'
                      : 'border-line bg-surface-2 hover:border-slate-300'}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={picked.includes(p.id)}
                      onChange={() => togglePick(p.id)}
                      className="mt-1 accent-ember-500" />
                    <div className="flex-1">
                      <p className="font-mono text-xs text-mute">{p.tracking_number}</p>
                      <p className="font-semibold text-white">{p.name}</p>
                      <p className="text-xs text-mute mt-1 inline-flex items-center gap-1">
                        <MapPin size={12}/> {p.delivery_address || 'No address on file'}
                      </p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </GlassCard>

        {/* Active runs */}
        <GlassCard className="p-5 md:p-6">
          <h3 className="text-lg font-black text-white mb-4">Active runs</h3>
          {runs.length === 0 ? (
            <p className="text-mute text-sm">No active runs.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {runs.map(r => (
                <GlassCard key={r.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-[10px] uppercase text-mute font-black">Zone</p>
                      <p className="text-lg font-black text-white">{r.zone}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-mute">Date: {r.run_date}</p>
                  <p className="text-xs text-mute">Rider: {r.rider_name || '— unassigned —'}</p>
                  <p className="text-xs mt-2">
                    <span className="font-bold">{r.completed_stops}</span>/{r.total_stops} delivered
                  </p>
                  {r.status === 'planned' && (
                    <button
                      onClick={() => onStartRun(r)}
                      disabled={!r.rider_id}
                      title={r.rider_id ? '' : 'Assign a rider first'}
                      className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold">
                      <Play size={14}/> Start run
                    </button>
                  )}
                </GlassCard>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  )
}

const Select = ({ label, value, onChange, options }) => (
  <label className="block">
    <span className="block text-[10px] uppercase tracking-widest text-mute font-black mb-1">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-line bg-surface-2">
      {options.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  </label>
)

const riderLabel = (r) => {
  const name = (r.name || '').trim()
  if (name) return r.phone ? `${name} · ${r.phone}` : name
  return r.email || r.id
}
