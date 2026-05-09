// OutboxIndicator.jsx
//
// Small badge + flush button shown to riders (and any other role with
// flaky-cellular write paths). Three states:
//
//   1. count === 0 + online   → hidden entirely.
//   2. count > 0  + online    → solid pill: "Replay N pending writes"
//                                with a manual replay button.
//   3. count > 0  + offline   → muted amber pill: "N pending — will
//                                retry when online" (no button — replay
//                                would just re-fail).
//
// The component listens for outbox:enqueued / outbox:flushed events
// fired by api/client.js so the count updates without polling.

import React, { useEffect, useState, useCallback } from 'react'
import { CloudOff, CloudUpload, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { outboxCount } from '../lib/outbox'
import { flushOutbox } from '../api/client'

export function OutboxIndicator({ className = '' }) {
  const [count, setCount] = useState(0)
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    outboxCount().then(setCount).catch(() => setCount(0))
  }, [])

  useEffect(() => {
    refresh()
    function onStateChange() { setIsOnline(navigator.onLine); refresh() }
    function onEvent() { refresh() }
    window.addEventListener('online', onStateChange)
    window.addEventListener('offline', onStateChange)
    window.addEventListener('outbox:enqueued', onEvent)
    window.addEventListener('outbox:flushed', onEvent)
    return () => {
      window.removeEventListener('online', onStateChange)
      window.removeEventListener('offline', onStateChange)
      window.removeEventListener('outbox:enqueued', onEvent)
      window.removeEventListener('outbox:flushed', onEvent)
    }
  }, [refresh])

  const onFlush = async () => {
    if (busy || !isOnline) return
    setBusy(true)
    try {
      const res = await flushOutbox()
      if (res.replayed > 0) {
        toast.success(`Replayed ${res.replayed} pending write${res.replayed === 1 ? '' : 's'}`)
      }
      if (res.failed > 0 && res.remaining > 0) {
        toast.error(`${res.remaining} still pending — try again in a moment`)
      }
      refresh()
    } catch (err) {
      toast.error('Replay failed: ' + (err?.message || 'unknown'))
    } finally {
      setBusy(false)
    }
  }

  if (count === 0) return null

  if (!isOnline) {
    return (
      <div className={[
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full',
        'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
        'text-xs font-bold',
        className,
      ].join(' ')}>
        <CloudOff size={12} />
        {count} pending — will retry when online
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onFlush}
      disabled={busy}
      className={[
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full',
        'bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-60',
        'text-xs font-bold transition-colors',
        className,
      ].join(' ')}
      aria-label={`Replay ${count} pending writes`}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <CloudUpload size={12} />}
      Replay {count} pending {count === 1 ? 'write' : 'writes'}
    </button>
  )
}
