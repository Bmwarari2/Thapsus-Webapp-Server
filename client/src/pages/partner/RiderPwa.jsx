import React, { useEffect, useRef, useState } from 'react'
import { MapPin, Camera, CheckCircle, XCircle, RefreshCw, Phone, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { lastMileApi } from '../../api'
import { GlassStyles, GlassCard, PageHeading } from '../../components/GlassUI'
import { OutboxIndicator } from '../../components/OutboxIndicator'

/**
 * /partner/rider — Nairobi rider PWA (Spec §3.4, §4.6).
 *
 * Audit P3.1: this surface used to take a free-text photo URL, which
 * couldn't possibly satisfy the POD photo gate (server returns 422
 * `photo_required` unless photo_url *or* photo_path is non-empty —
 * routes/lastMile.js:978-983) AND couldn't survive the private bucket
 * (migration 015). Riders who tried the webapp got "Failed to record
 * POD" with no path forward.
 *
 * The replacement mirrors the iOS/Android signed-URL flow already
 * documented in `feedback_signed_upload_urls.md`:
 *
 *   1. Rider taps "Take photo" → file picker (mobile uses rear camera
 *      via `capture="environment"`).
 *   2. Browser POSTs /api/last-mile/pod/upload-url with {parcel_id,
 *      kind:'photo'}; server returns {signed_url, path}.
 *   3. Browser PUTs the JPEG bytes directly to signed_url with
 *      Content-Type: image/jpeg.
 *   4. POD submit sends `photo_path` (not photo_url) so the server's
 *      private-bucket read path keeps working.
 */
export const RiderPwa = () => {
  const [runs, setRuns] = useState([])
  const [active, setActive] = useState(null)        // currently picked parcel
  const [otp, setOtp] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [photoPath, setPhotoPath] = useState('')
  const [photoPreview, setPhotoPreview] = useState('')  // local data URL for thumb
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef(null)

  const refresh = () => lastMileApi.riderToday()
    .then(r => setRuns(r.data?.runs || []))
    .catch(() => toast.error('Failed to load runs'))

  useEffect(() => { refresh() }, [])

  const resetSheet = () => {
    setActive(null)
    setOtp('')
    setRecipientName('')
    setPhotoPath('')
    setPhotoPreview('')
    setPhotoError('')
    setPhotoUploading(false)
  }

  // Mint a signed PUT URL, upload the bytes directly. Stays in component
  // scope rather than a util so the photo_path state lives next to its
  // owner and a remount cleanly resets it.
  const onPickPhoto = () => {
    if (!active || photoUploading) return
    fileInputRef.current?.click()
  }

  const onFileChosen = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''  // allow re-picking the same file
    if (!file || !active) return
    setPhotoError('')
    setPhotoUploading(true)
    setPhotoPath('')
    try {
      // Local preview while the upload is in flight — visual cue that
      // the rider's tap actually picked the photo they meant to send.
      const previewUrl = URL.createObjectURL(file)
      setPhotoPreview(previewUrl)

      const sign = await lastMileApi.podUploadUrl(active.parcel.id, 'photo')
      const { signed_url: signedUrl, path } = sign.data || {}
      if (!signedUrl || !path) {
        throw new Error('Server did not return a signed URL')
      }

      // PUT the bytes. Server-side bucket policy (mig 015) allows the
      // signed URL holder to write once. fetch() rather than axios
      // because axios was wrapping the upload in a JSON content-type
      // body in some configs and Supabase storage 400s on type mismatch.
      const putResp = await fetch(signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'image/jpeg',
          'Cache-Control': '3600',
        },
        body: file,
      })
      if (!putResp.ok) {
        throw new Error(`Upload rejected (HTTP ${putResp.status})`)
      }

      setPhotoPath(path)
      toast.success('Photo uploaded')
    } catch (err) {
      setPhotoError(err?.message || 'Upload failed')
      setPhotoPreview('')
      // Keep photoPath empty so the Delivered button stays disabled —
      // POD submit without a photo would 422 anyway.
    } finally {
      setPhotoUploading(false)
    }
  }

  const onDelivered = async () => {
    if (!active) return
    if (!otp || otp.length !== 4) { toast.error('Enter the 4-digit OTP'); return }
    if (!photoPath) { toast.error('Take a delivery photo first'); return }
    setSubmitting(true)
    try {
      await lastMileApi.pod(active.run_id, {
        parcel_id: active.parcel.id,
        otp_used: otp,
        // Send `photo_path` not `photo_url`. Server prefers the path
        // column (migration 023) and `photo_url` from a signed-upload
        // URL would be a 5-min throwaway with a token query string —
        // useless to anyone reading the POD later.
        photo_path: photoPath,
        recipient_name: recipientName || null,
        recipient_phone: active.parcel.phone || null,
      })
      toast.success('POD captured')
      resetSheet()
      refresh()
    } catch (err) {
      // Surface the server's diagnostic so a rider knows whether to
      // ask the operator to start the run (otp_not_issued), retype the
      // OTP (otp_invalid), or call support.
      const code = err?.response?.data?.error
      const msg  = err?.response?.data?.message
      if (code === 'otp_not_issued') toast.error('Operator hasn\'t started this run yet — ask them to dispatch.')
      else if (code === 'otp_invalid') toast.error('OTP doesn\'t match — re-check with the recipient.')
      else if (code === 'photo_required') toast.error('Photo upload didn\'t register — try retaking.')
      else toast.error(msg || 'Failed to record POD')
    } finally {
      setSubmitting(false)
    }
  }

  const onFailed = async () => {
    if (!active) return
    const reason = prompt('Reason for failed delivery')
    if (!reason) return
    try {
      await lastMileApi.failPod(active.run_id, active.parcel.id, reason)
      toast('Marked as failed', { icon: 'ℹ️' })
      resetSheet()
      refresh()
    } catch { toast.error('Failed to record failure') }
  }

  return (
    <div className="relative min-h-screen bg-white/[0.05]">
      <GlassStyles />
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <PageHeading title="Today's runs" subtitle="Tap a stop to deliver" />
          <button onClick={refresh}
            className="p-2 rounded-full bg-surface shadow text-white"><RefreshCw size={16}/></button>
        </div>

        {/* Audit W4A.4 — Web Outbox indicator. Hidden when nothing is
            queued. Auto-flushes on the `online` event; tappable here so a
            rider on patchy cell can manually retry without waiting for
            the browser to surface a connectivity transition. */}
        <div className="mb-4">
          <OutboxIndicator />
        </div>

        {runs.length === 0 ? (
          <GlassCard className="p-6 text-center text-mute bg-surface">No runs assigned today.</GlassCard>
        ) : (
          runs.map(run => (
            <GlassCard key={run.id} className="p-4 mb-4 bg-surface">
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-black text-white uppercase">{run.zone}</p>
                <p className="text-xs text-mute">{run.completed_stops}/{run.total_stops}</p>
              </div>
              <div className="space-y-2">
                {run.parcels?.map(p => (
                  <button key={p.id}
                    disabled={p.has_pod}
                    onClick={() => setActive({ run_id: run.id, parcel: p })}
                    className={`w-full flex items-start justify-between gap-3 p-3 rounded-xl border-2 text-left
                      ${p.has_pod
                        ? 'border-emerald-500/20 bg-emerald-500/10 opacity-60'
                        : 'border-line hover:border-orange-400'}`}>
                    <div>
                      <p className="font-mono text-xs text-mute">{p.tracking_number}</p>
                      <p className="font-semibold text-white">{p.name}</p>
                      <p className="text-xs text-mute inline-flex items-center gap-1">
                        <MapPin size={11}/> {p.delivery_address_override || p.delivery_address || 'No address'}
                      </p>
                      <p className="text-xs text-mute inline-flex items-center gap-1">
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
          <GlassCard className="bg-surface w-full md:max-w-md p-6 rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-y-auto">
            <h3 className="text-lg font-black text-white">Capture POD</h3>
            <p className="text-xs text-mute mb-4">{active.parcel.tracking_number} · {active.parcel.name}</p>

            <div className="space-y-3">
              <input value={recipientName} onChange={e => setRecipientName(e.target.value)}
                placeholder="Recipient name"
                className="w-full px-3 py-3 rounded-xl border border-line" />

              <div>
                <p className="text-xs text-mute mb-2 font-bold uppercase tracking-wider">4-digit OTP</p>
                <div className="grid grid-cols-4 gap-2">
                  {[0,1,2,3].map(i => (
                    <input key={i}
                      maxLength={1}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={otp[i] || ''}
                      onChange={e => {
                        const next = otp.split('')
                        next[i] = e.target.value.replace(/\D/g, '').slice(0,1)
                        setOtp(next.join(''))
                        if (e.target.value && e.target.nextSibling) e.target.nextSibling.focus?.()
                      }}
                      className="text-center text-2xl font-black py-3 rounded-xl border border-line" />
                  ))}
                </div>
                <p className="text-xs text-mute text-center mt-1">Recipient was sent a 4-digit code via WhatsApp.</p>
              </div>

              <div>
                <p className="text-xs text-mute mb-2 font-bold uppercase tracking-wider">Delivery photo</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onFileChosen}
                  className="hidden"
                />
                {photoPreview ? (
                  <div className="relative">
                    <img src={photoPreview} alt="Delivery preview"
                      className="w-full h-44 object-cover rounded-xl border border-line" />
                    {photoUploading && (
                      <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center text-white text-xs gap-2">
                        <Loader2 size={16} className="animate-spin"/> Uploading…
                      </div>
                    )}
                    {photoPath && !photoUploading && (
                      <span className="absolute top-2 right-2 px-2 py-1 rounded bg-emerald-500/90 text-white text-[10px] font-bold uppercase">
                        Uploaded
                      </span>
                    )}
                  </div>
                ) : (
                  <button onClick={onPickPhoto}
                    disabled={photoUploading}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 text-mute hover:border-orange-400 hover:text-ember-400">
                    {photoUploading
                      ? <><Loader2 size={16} className="animate-spin"/> Uploading…</>
                      : <><Camera size={16}/> Take photo</>}
                  </button>
                )}
                {photoPath && !photoUploading && (
                  <button onClick={onPickPhoto}
                    className="block mx-auto mt-2 text-xs text-ember-400 font-bold hover:underline">
                    Re-take
                  </button>
                )}
                {photoError && (
                  <p className="text-xs text-red-300 mt-2">{photoError}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-5">
              <button onClick={onFailed}
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/15 text-red-300 font-bold disabled:opacity-50">
                <XCircle size={16}/> Failed
              </button>
              <button onClick={onDelivered}
                disabled={submitting || photoUploading || !photoPath || otp.length !== 4}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold">
                {submitting
                  ? <><Loader2 size={16} className="animate-spin"/> Saving…</>
                  : <><CheckCircle size={16}/> Delivered</>}
              </button>
            </div>
            <button onClick={resetSheet}
              disabled={submitting}
              className="block mx-auto mt-3 text-xs text-mute hover:underline disabled:opacity-50">Close</button>
          </GlassCard>
        </div>
      )}
    </div>
  )
}
