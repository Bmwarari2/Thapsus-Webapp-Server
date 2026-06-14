import axios from 'axios'
import { shouldQueue, outboxEnqueueFromError, outboxFlush } from '../lib/outbox'
import { newIdempotencyKey } from '../lib/idempotencyKey'

// In production (Railway) the frontend is served by the same Express process
// that also handles /api — so we use a relative base URL ('/api') which avoids
// all CORS issues entirely.  In development, Vite's proxy forwards /api to
// localhost:5000, so relative URLs work there too.
//
// VITE_API_URL should only be set if the frontend and backend are on DIFFERENT
// domains (e.g. separate Railway services).  Leave it unset for the default
// single-service Railway deployment.
const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

// ── Robust storage helpers ────────────────────────────────────────────────────
// Try sessionStorage → localStorage → in-memory fallback.
// This handles sandboxed iframes and Railway environments where storage
// may be restricted.
const memStore = {}

function storageSet(key, value) {
  try { sessionStorage.setItem(key, value) } catch (_) {}
  try { localStorage.setItem(key, value) }   catch (_) {}
  memStore[key] = value
}

function storageGet(key) {
  try { const v = sessionStorage.getItem(key); if (v) return v } catch (_) {}
  try { const v = localStorage.getItem(key);   if (v) return v } catch (_) {}
  return memStore[key] || null
}

function storageRemove(key) {
  try { sessionStorage.removeItem(key) } catch (_) {}
  try { localStorage.removeItem(key) }   catch (_) {}
  delete memStore[key]
}

// ── Session helpers ───────────────────────────────────────────────────────────
export function saveSession(token, user) {
  storageSet('sc_token', token)
  storageSet('sc_user', JSON.stringify(user))
}

export function getSession() {
  const token = storageGet('sc_token')
  try {
    const user = JSON.parse(storageGet('sc_user') || 'null')
    return { token, user }
  } catch {
    return { token, user: null }
  }
}

export function clearSession() {
  storageRemove('sc_token')
  storageRemove('sc_user')
}

export function isLoggedIn() {
  return !!storageGet('sc_token')
}

// ── Request interceptor: attach Bearer token + idempotency key ────────────────
api.interceptors.request.use((config) => {
  const token = storageGet('sc_token')
  if (token) config.headers.Authorization = `Bearer ${token}`

  // Tag every replayable write with a stable Idempotency-Key so the server can
  // coalesce a retry (outbox replay of a lost-response write, or a double
  // submit) instead of duplicating side effects. The key is minted once on the
  // original send; on an outbox replay it is restored via config.idempotencyKey
  // (see outboxFlush) and passed through unchanged. GET/HEAD and auth routes
  // are skipped — reads are idempotent and queueing auth would trap sign-in.
  const method = String(config.method || '').toUpperCase()
  const url = String(config.url || '')
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !url.includes('/auth/')) {
    const key = config.headers['Idempotency-Key'] || config.idempotencyKey || newIdempotencyKey()
    config.idempotencyKey = key
    config.headers['Idempotency-Key'] = key
  }
  return config
})

// ── Response interceptor: handle 401 + unwrap errors ─────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const isAuthRoute = error.config?.url?.includes('/auth/')
    if (error.response?.status === 401 && !isAuthRoute) {
      clearSession()
      // Soft signal — AuthContext listens for this and decides how to
      // route the user (toast + react-router navigate with ?next=…).
      // Avoids the hard window.location reload that ate any unsaved
      // state and never let the user see a "session expired" toast.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:expired'))
      }
    }

    // Audit W4A.4 — Web Outbox. Network-only failures (no response from
    // server, no auth route, write method) get queued for replay when the
    // device comes back online. The caller still sees a rejected
    // Promise, but the queue retains the mutation so the rider's
    // POD/receive/screen action survives a flaky cellular blip.
    if (shouldQueue(error)) {
      try {
        await outboxEnqueueFromError(error)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('outbox:enqueued'))
        }
        // Audit F-21 — register a Background Sync so the queued mutation
        // gets retried by the Service Worker even if this tab closes
        // before the device comes back online. Window-side `online`
        // listener still handles the foreground case; this covers the
        // closed-tab gap. SyncManager isn't supported on Firefox or
        // iOS Safari yet — feature-check + silent fallback.
        if (
          typeof navigator !== 'undefined' &&
          'serviceWorker' in navigator &&
          typeof window !== 'undefined' &&
          'SyncManager' in window
        ) {
          try {
            const reg = await navigator.serviceWorker.ready
            if (reg && reg.sync && typeof reg.sync.register === 'function') {
              await reg.sync.register('outbox-flush')
            }
          } catch (_) {
            // Permission denied / not supported — fall through.
          }
        }
      } catch (e) {
        // IndexedDB might be unavailable in private windows / iframes.
        // Best-effort — fall through to the normal rejection path.
        console.warn('[outbox] enqueue failed:', e?.message)
      }
    }

    let message = 'Something went wrong. Please try again.'
    const data = error.response?.data
    if (data) {
      if (typeof data === 'string' && data.length < 300) {
        message = data
      } else if (typeof data === 'object' && data.message) {
        message = data.message
      }
    } else if (error.code === 'ECONNABORTED') {
      message = 'Request timed out. Please check your connection.'
    } else if (!error.response) {
      message = 'Saved locally — will retry when you are back online.'
    } else if (error.message) {
      message = error.message
    }

    // Preserve the original Axios error object (response, config, etc.)
    // but normalize the message so UI code can rely on error.message.
    if (error && typeof error === 'object') {
      error.message = message
    }

    return Promise.reject(error)
  }
)

// ── Auto-flush on online events ──────────────────────────────────────────────
// When the navigator transitions back from offline → online, kick the
// outbox so any queued POD captures / parcel receives replay without
// waiting for the user to navigate. The callback throws on failure
// (network still flaky); outboxFlush stops on the first failure and
// preserves the queue for the next event or manual flush.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    outboxFlush(api).then((res) => {
      if (res.replayed > 0) {
        window.dispatchEvent(new CustomEvent('outbox:flushed', { detail: res }))
      }
    }).catch((e) => {
      console.warn('[outbox] auto-flush failed:', e?.message)
    })
  })

  // Audit F-21 — bridge SW Background Sync flushes back into the existing
  // window-side outbox:flushed event channel so OutboxIndicator clears
  // its count when the SW empties the queue from a closed-tab context.
  // The SW posts {type: 'outbox-flushed'} after a successful sync run.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event?.data?.type === 'outbox-flushed') {
        window.dispatchEvent(new CustomEvent('outbox:flushed', {
          detail: { replayed: 0, failed: 0, remaining: 0, source: 'sw-sync' },
        }))
      }
    })
  }
}

// Public helper so UI components can flush manually (rider home button).
export async function flushOutbox() {
  return outboxFlush(api)
}

export default api
