import { useEffect, useRef, useCallback } from 'react'

/**
 * Custom hook that auto-logs out the user after a period of inactivity.
 *
 * @param {Function} onLogout   – Function to call when inactivity timeout is reached
 * @param {number}   timeoutMs  – Inactivity timeout in milliseconds (default: 10 minutes)
 * @param {boolean}  enabled    – Whether the hook is active (pass false for unauthenticated users)
 */
export function useInactivityLogout(onLogout, timeoutMs = 10 * 60 * 1000, enabled = true) {
  const timerRef = useRef(null)
  const lastActivityRef = useRef(Date.now())

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now()

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    if (enabled) {
      timerRef.current = setTimeout(() => {
        console.log('⏰ Inactivity timeout reached — logging out')
        onLogout()
      }, timeoutMs)
    }
  }, [onLogout, timeoutMs, enabled])

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }

    // Events that count as "activity"
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
      'wheel',
    ]

    // Throttle activity detection to avoid excessive timer resets
    let throttleTimeout = null
    const handleActivity = () => {
      if (throttleTimeout) return
      throttleTimeout = setTimeout(() => {
        throttleTimeout = null
      }, 1000) // Only reset timer at most once per second
      resetTimer()
    }

    // Register listeners
    activityEvents.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true })
    })

    // Also listen for visibility changes (user switches tabs and comes back)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Check if we should have timed out while the tab was hidden
        const elapsed = Date.now() - lastActivityRef.current
        if (elapsed >= timeoutMs) {
          console.log('⏰ Tab was hidden past timeout — logging out')
          onLogout()
        } else {
          resetTimer()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Start the initial timer
    resetTimer()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (throttleTimeout) clearTimeout(throttleTimeout)
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleActivity)
      })
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, resetTimer, onLogout, timeoutMs])
}

export default useInactivityLogout
