import React, { useEffect, useState } from 'react'
import { MapPin, Camera, CheckCircle, XCircle, RefreshCw, Phone } from 'lucide-react'
import toast from 'react-hot-toast'
import { lastMileApi } from '../../api'
import { GlassStyles, GlassCard, PageHeading } from '../../components/GlassUI'

/**
 * /partner/rider — Nairobi rider PWA (Spec §3.4, §4.6).
 *
 * Low-bandwidth screen — shows today's runs, the next stop, recipient
 * phone, photo capture, OTP entry, and delivered/failed actions.
 */
export const RiderPwa = () => {
  const [runs, setRuns] = useState([])
  const [active, setActive] = useState(null)        // currently picked parcel
  const [otp, setOtp] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [recipientName, setRecipientName] = useState('')

  const refresh = () => lastMileApi.riderToday()
    .then(r => setRuns(r.data?.runs || []))
    .catch(() => toast.error('Failed to load runs'))

  useEffect(() => { refresh() }, [])

  const onDelivered = async () => {
    if (!active) return
    if (!otp || otp.length !== 4) { toast.error('Enter the 4-digit OTP'); return }
    try {
      await lastMileApi.pod(active.run_id, {
        parcel_id: active.parcel.id,
        otp_used: otp,
        photo_url: photoUrl || null,
        recipient_name: recipientName || null,
        recipient_phone: active.parcel.phone || null,
      })
      toast.success('POD captured')
      setActive(null); setOtp(''); setPhotoUrl(''); setRecipientName('')
      refresh()
    } catch { toast.error('Failed to record POD') }
  }

  const onFailed = async () => {
    if (!active) return
    const reason = prompt('Reason for failed delivery')
    if (!reason) return
    try {
      await lastMileApi.failPod(active.run_id, active.parcel.id, reason)
      toast('Marked as failed', { icon: 'ℹ️' })
      setActive(null)
      refresh()
    } catch { toast.error('Failed to record failure') }
  }

  return (
    <div className="relative min-h-screen bg-slate-100">
      <GlassStyles />
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <PageHeading title="Today's runs" subtitle="Tap a stop to deliver" />
          <button onClick={refresh}
            className="p-2 rounded-full bg-white shadow text-[#1e3a5f]"><RefreshCw size={16}/></button>
        </div>

        {runs.length === 0 ? (
          <GlassCard className="p-6 text-center text-slate-500 bg-white">No runs assigned today.</GlassCard>
        ) : (
          runs.map(run => (
            <GlassCard key={run.id} className="p-4 mb-4 bg-white">
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-black text-[#1e3a5f] uppercase">{run.zone}</p>
                <p className="text-xs text-slate-500">{run.completed_stops}/{run.total_stops}</p>
              </div>
              <div className="space-y-2">
                {run.parcels?.map(p => (
                  <button key={p.id}
                    disabled={p.has_pod}
                    onClick={() => setActive({ run_id: run.id, parcel: p })}
                    className={`w-full flex items-start justify-between gap-3 p-3 rounded-xl border-2 text-left
                      ${p.has_pod
                        ? 'border-emerald-200 bg-emerald-50/60 opacity-60'
                        : 'border-slate-200 hover:border-orange-400'}`}>
                    <div>
                      <p className="font-mono text-xs text-slate-500">{p.tracking_number}</p>
                      <p className="font-semibold text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-500 inline-flex items-center gap-1">
                        <MapPin size={11}/> {p.delivery_address || 'No address'}
                      </p>
                      <p className="text-xs text-slate-500 inline-flex items-center gap-1">
                        <Phone size={11}/> {p.phone}
                      </p>
                    </div>
                    {p.has_pod
                      ? <CheckCircle size={18} className="text-emerald-500 flex-shrink-0"/>
                      : <span className="px-2 py-1 rounded bg-orange-500 text-white text-[10px] font-bold uppercase">Deliver</span>}
                  </button>
                ))}
              </div>
            </GlassCard>
          ))
        )}
      </div>

      {/* POD capture sheet */}
      {active && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4">
          <GlassCard className="bg-white w-full md:max-w-md p-6 rounded-t-3xl md:rounded-3xl">
            <h3 className="text-lg font-black text-[#1e3a5f]">Capture POD</h3>
            <p className="text-xs text-slate-500 mb-4">{active.parcel.tracking_number} · {active.parcel.name}</p>

            <div className="space-y-3">
              <input value={recipientName} onChange={e => setRecipientName(e.target.value)}
                placeholder="Recipient name"
                className="w-full px-3 py-3 rounded-xl border border-slate-200" />

              <div className="grid grid-cols-4 gap-2">
                {[0,1,2,3].map(i => (
                  <input key={i} maxLength={1} value={otp[i] || ''}
                    onChange={e => {
                      const next = otp.split('')
                      next[i] = e.target.value.replace(/\D/g, '').slice(0,1)
                      setOtp(next.join(''))
                      if (e.target.value && e.target.nextSibling) e.target.nextSibling.focus?.()
                    }}
                    className="text-center text-2xl font-black py-3 rounded-xl border border-slate-200" />
                ))}
              </div>
              <p className="text-xs text-slate-500 text-center">Recipient was sent a 4-digit code via WhatsApp.</p>

              <input value={photoUrl} onChange={e => setPhotoUrl(e.target.value)}
                placeholder="Photo URL (optional)"
                className="w-full px-3 py-3 rounded-xl border border-slate-200" />
            </div>

            <div className="grid grid-cols-2 gap-3 mt-5">
              <button onClick={onFailed}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-100 text-red-700 font-bold">
                <XCircle size={16}/> Failed
              </button>
              <button onClick={onDelivered}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold">
                <CheckCircle size={16}/> Delivered
              </button>
            </div>
            <button onClick={() => setActive(null)}
              className="block mx-auto mt-3 text-xs text-slate-500 hover:underline">Close</button>
          </GlassCard>
        </div>
      )}
    </div>
  )
}
