import { useRef, useState, useCallback } from 'react'

/**
 * Guards an async action against double-submit (the rapid double-tap that was
 * creating duplicate tickets / buy-for-me requests / etc.).
 *
 * Returns `[pending, run]`:
 *   const [submitting, run] = useAsyncGuard()
 *   onClick={() => run(async () => { await api.create(...) })}
 *   <button disabled={submitting}>…</button>
 *
 * A synchronous ref blocks re-entry *before* React has a chance to re-render
 * the disabled button, so even two clicks fired in the same tick can't run
 * the action twice. The `pending` flag drives the button's disabled/label UI.
 */
export function useAsyncGuard() {
  const inFlight = useRef(false)
  const [pending, setPending] = useState(false)

  const run = useCallback(async (fn) => {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    try {
      return await fn()
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }, [])

  return [pending, run]
}

export default useAsyncGuard
