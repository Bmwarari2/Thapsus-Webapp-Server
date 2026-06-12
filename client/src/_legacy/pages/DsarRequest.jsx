import React, { useEffect, useState } from 'react'
import { ShieldCheck, Download, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { dsarApi } from '../api'
import { GlassStyles, GlassCard, LiquidBlob, PageHeading, StatusBadge } from '../components/GlassUI'

/**
 * /app/profile/dsar — GDPR data subject access requests (Spec §4.11).
 */
export const DsarRequest = () => {
  const [requests, setRequests] = useState([])
  const [type, setType] = useState('export')
  const [notes, setNotes] = useState('')

  const refresh = () => dsarApi.mine().then(r => setRequests(r.data?.requests || []))
                                       .catch(() => toast.error('Failed to load DSAR queue'))

  useEffect(() => { refresh() }, [])

  const onSubmit = async () => {
    try {
      await dsarApi.create(type, notes)
      toast.success('DSAR submitted — you will hear from us within 30 days')
      setNotes('')
      refresh()
    } catch { toast.error('Failed to submit DSAR') }
  }

  return (
    <div className="relative min-h-screen bg-gray-50">
      <GlassStyles />
      <LiquidBlob className="top-[-15%] left-[-15%] w-[40rem] h-[40rem]" color="bg-blue-200" />

      <div className="relative z-10 max-w-3xl mx-auto px-4 md:px-8 py-10">
        <PageHeading icon={ShieldCheck}
          title="Data subject requests"
          subtitle="Export your data or request erasure under GDPR / DPA 2018." />

        <GlassCard className="p-6 mb-6">
          <h3 className="text-lg font-black text-[#1e3a5f] mb-4">New request</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <label className={`flex items-center gap-3 p-4 rounded-2xl cursor-pointer border-2 transition-all
                              ${type === 'export' ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white/70'}`}>
              <input type="radio" checked={type === 'export'} onChange={() => setType('export')}
                     className="accent-orange-500" />
              <div>
                <div className="flex items-center gap-2 font-black text-[#1e3a5f]">
                  <Download size={16}/> Export my data
                </div>
                <p className="text-xs text-slate-500">Receive a JSON copy of every record we hold.</p>
              </div>
            </label>
            <label className={`flex items-center gap-3 p-4 rounded-2xl cursor-pointer border-2 transition-all
                              ${type === 'erase' ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white/70'}`}>
              <input type="radio" checked={type === 'erase'} onChange={() => setType('erase')}
                     className="accent-orange-500" />
              <div>
                <div className="flex items-center gap-2 font-black text-[#1e3a5f]">
                  <Trash2 size={16}/> Erase my account
                </div>
                <p className="text-xs text-slate-500">We may retain records required by HMRC / KRA.</p>
              </div>
            </label>
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Anything you want us to know? (optional)"
            className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white/80 text-sm" rows={3} />
          <button onClick={onSubmit}
            className="mt-3 px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm">
            Submit request
          </button>
        </GlassCard>

        <h3 className="text-lg font-black text-[#1e3a5f] mb-3">Your past requests</h3>
        {requests.length === 0 ? (
          <GlassCard className="p-8 text-center text-slate-500">No DSARs submitted yet.</GlassCard>
        ) : (
          <div className="space-y-3">
            {requests.map(r => (
              <GlassCard key={r.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-slate-500">{r.id}</p>
                  <p className="font-semibold text-slate-800 capitalize">{r.type}</p>
                  <p className="text-xs text-slate-500">
                    Submitted {new Date(r.created_at).toLocaleDateString()} · due {r.due_at ? new Date(r.due_at).toLocaleDateString() : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.status}/>
                  {r.export_url && <a className="text-xs text-orange-700 hover:underline" href={r.export_url} target="_blank" rel="noreferrer">Download</a>}
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
