// BarcodeScanner.jsx
// Reusable camera-driven barcode scanner backed by @zxing/browser. Mounts
// a fullscreen overlay with the rear camera, draws a framing reticle, and
// fires onScan(text) the first time a code is read cleanly. Clean-up
// closes the camera stream so the indicator light goes off the moment
// the operator dismisses the sheet.
//
// Used by the pipeline board to scan a parcel back in.
// Designed to also work inside the Receive modal (see usage there).

import React, { useEffect, useRef, useState } from 'react'
import { Camera, X, AlertTriangle, Loader2 } from 'lucide-react'

// Lazy-load @zxing/browser so the operator console only pays the
// ~50kb cost when they actually open the scanner. Keeps the
// initial pipeline bundle small.
async function loadReader() {
  const mod = await import('@zxing/browser')
  return new mod.BrowserMultiFormatReader()
}

export function BarcodeScanner({ open, onScan, onClose }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null) // returned by decodeFromVideoDevice; .stop() closes the stream
  const readerRef = useRef(null)
  const [state, setState]   = useState('idle') // 'idle' | 'starting' | 'running' | 'error'
  const [error, setError]   = useState('')

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setState('starting')
    setError('')

    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('This browser cannot access the camera.')
        }

        const reader = await loadReader()
        readerRef.current = reader

        // `undefined` deviceId → @zxing/browser picks the back camera
        // when one is available and falls back to the default otherwise.
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result, err, controls2) => {
            if (cancelled) return
            if (result) {
              const text = result.getText()
              if (text) {
                // Stop the camera *before* surfacing the value so the
                // indicator light goes off immediately and the parent
                // doesn't have to wait for cleanup.
                try { controls2.stop() } catch { /* ignore */ }
                onScan(text)
              }
            }
            // err is fired roughly per video frame when no code is
            // visible — that's not actionable noise, so we ignore it.
          }
        )

        if (cancelled) {
          try { controls.stop() } catch { /* ignore */ }
          return
        }

        controlsRef.current = controls
        setState('running')
      } catch (e) {
        if (cancelled) return
        // Map common DOMException names to friendlier copy.
        const name = e?.name || ''
        let msg = e?.message || 'Could not start the camera.'
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          msg = 'Camera permission denied. Allow access in your browser settings and try again.'
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          msg = 'No camera found on this device.'
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          msg = 'Camera is already in use by another app or tab.'
        }
        setError(msg)
        setState('error')
      }
    })()

    return () => {
      cancelled = true
      const controls = controlsRef.current
      if (controls?.stop) {
        try { controls.stop() } catch { /* ignore */ }
      }
      controlsRef.current = null
      readerRef.current = null
    }
  }, [open, onScan])

  // ESC closes the overlay.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Barcode scanner"
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
    >
      <div className="relative w-full max-w-lg aspect-[4/5] sm:aspect-[3/4] rounded-2xl overflow-hidden bg-black ring-1 ring-white/20">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />

        {/* Framing reticle. Pure decorative overlay — the decoder is
            decoding the entire video frame, but the reticle gives the
            operator a clear "aim here" target. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-3/4 h-1/3 border-2 border-orange-400 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>

        {/* Status banner */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
          <span className="px-3 py-1.5 rounded-full bg-black/55 text-white text-xs font-bold inline-flex items-center gap-2">
            {state === 'starting' && <><Loader2 size={12} className="animate-spin" /> Starting camera…</>}
            {state === 'running'  && <><Camera   size={12} /> Aim at the barcode</>}
            {state === 'error'    && <><AlertTriangle size={12} /> Camera error</>}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-black/55 text-white inline-flex items-center justify-center hover:bg-black/75"
            aria-label="Close scanner"
          >
            <X size={16} />
          </button>
        </div>

        {/* Error fallback panel */}
        {state === 'error' && (
          <div className="absolute inset-x-3 bottom-3 rounded-xl bg-rose-50 ring-1 ring-rose-200 p-3 text-rose-800 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-bold">Couldn't start the camera</p>
                <p className="text-xs leading-snug mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
