// outbox.js — Offline write queue backed by IndexedDB.
//
// Writes that fail because the device is offline get parked here and
// replayed when the connection comes back (online event) OR when the
// user taps the "Flush queue" button on the rider home screen.
//
// Audit W4A.4 — closes the last meaningful iOS-vs-Web parity gap. iOS
// has SQLDelight-backed offline outbox via OutboxView. The web rider
// flow (RiderPwa.jsx) used to silently fail on flaky cellular; this
// brings it to feature parity.
//
// Shape of a queued mutation:
//   {
//     id:        auto-increment integer (IndexedDB key)
//     ts:        Date.now() at enqueue time
//     method:    'POST' | 'PUT' | 'PATCH' | 'DELETE'
//     url:       relative URL passed to axios (e.g. '/last-mile/.../pod')
//     data:      JSON-serialisable body (or null)
//     headers:   { ... } — only kept if non-empty
//     attempts:  0 on enqueue; incremented on each failed replay
//     lastError: string or null — last network error message (for diagnostics)
//   }
//
// Replay strategy
//   - Loop in insertion order; on first failure, stop and leave the
//     remainder for next time. Avoids deep retry storms when the
//     network is still flaky.
//   - On success, the entry is removed.
//   - On failure, attempts is incremented and lastError stored.
//
// Idempotency
//   - The Express endpoints we replay against (POD record, parcel
//     receive, screen, hold/release) are already idempotent by the
//     server-side pod_otps / parcel-status guards. We do NOT add
//     idempotency keys here — that's a server-side commitment for a
//     future PR.

const DB_NAME = 'thapsus-outbox'
const DB_VERSION = 1
const STORE = 'mutations'

let _dbPromise = null

function openDB() {
  if (_dbPromise) return _dbPromise
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment'))
  }
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        store.createIndex('ts', 'ts')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return _dbPromise
}

function tx(mode = 'readonly') {
  return openDB().then((db) => db.transaction(STORE, mode).objectStore(STORE))
}

/** Append a mutation to the queue. Returns the assigned id. */
export async function outboxEnqueue({ method, url, data = null, headers = null }) {
  if (!method || !url) {
    throw new Error('outboxEnqueue: method + url are required')
  }
  const store = await tx('readwrite')
  return new Promise((resolve, reject) => {
    const req = store.add({
      ts: Date.now(),
      method: String(method).toUpperCase(),
      url,
      data,
      headers: headers && Object.keys(headers).length ? headers : null,
      attempts: 0,
      lastError: null,
    })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Read every queued mutation, sorted by enqueue time ascending. */
export async function outboxList() {
  const store = await tx('readonly')
  const idx = store.index('ts')
  return new Promise((resolve, reject) => {
    const out = []
    const req = idx.openCursor(null, 'next')
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) { out.push(cursor.value); cursor.continue() } else { resolve(out) }
    }
    req.onerror = () => reject(req.error)
  })
}

/** Number of queued mutations. Used by the flush-button badge. */
export async function outboxCount() {
  const store = await tx('readonly')
  return new Promise((resolve, reject) => {
    const req = store.count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Remove a single entry (called after successful replay). */
export async function outboxRemove(id) {
  const store = await tx('readwrite')
  return new Promise((resolve, reject) => {
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/** Stamp an entry with a new attempt count + error message. */
export async function outboxRecordFailure(id, errorMessage) {
  const store = await tx('readwrite')
  return new Promise((resolve, reject) => {
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const row = getReq.result
      if (!row) return resolve()
      row.attempts = (row.attempts || 0) + 1
      row.lastError = String(errorMessage || '').slice(0, 500)
      const putReq = store.put(row)
      putReq.onsuccess = () => resolve()
      putReq.onerror = () => reject(putReq.error)
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

/** Wipe everything. Used by tests and the "Clear queue" admin action. */
export async function outboxClear() {
  const store = await tx('readwrite')
  return new Promise((resolve, reject) => {
    const req = store.clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/**
 * Replay every queued mutation through the supplied axios instance.
 * Stops on the first failure so we don't burn through a flaky connection
 * with N retries; the remainder stays queued for the next online event
 * or flush-button tap.
 *
 * @param {import('axios').AxiosInstance} api  the configured axios client
 *                                             (with Bearer auth interceptor).
 * @returns {Promise<{ replayed: number, failed: number, remaining: number }>}
 */
export async function outboxFlush(api) {
  const items = await outboxList()
  let replayed = 0
  let failed = 0
  for (const item of items) {
    try {
      // Pass _outboxReplay: true so the request interceptor below the
      // axios instance can opt the request out of being re-queued on
      // failure. Without this, a still-offline replay would just bloat
      // the queue.
      await api.request({
        method: item.method,
        url: item.url,
        data: item.data,
        headers: item.headers || undefined,
        _outboxReplay: true,
      })
      await outboxRemove(item.id)
      replayed += 1
    } catch (err) {
      await outboxRecordFailure(item.id, err?.message)
      failed += 1
      break
    }
  }
  const remaining = (await outboxCount())
  return { replayed, failed, remaining }
}

/**
 * Predicate: should this axios error be retried via the outbox?
 *
 * Yes when:
 *   - There's no `error.response` (request never reached the server),
 *     OR
 *   - The error code indicates network failure (ECONNABORTED, ERR_NETWORK).
 *
 * No when:
 *   - The server responded with any status (2xx, 4xx, 5xx — those need
 *     real handling, not retry).
 *   - The original request was already a replay (`_outboxReplay`).
 *   - The method is GET/HEAD (idempotent reads should fail loudly).
 *   - Auth-related routes (login/logout/etc.) — queueing those would
 *     trap the user in a sign-in loop.
 */
export function shouldQueue(error) {
  if (!error) return false
  if (error.config?._outboxReplay) return false
  const method = String(error.config?.method || '').toUpperCase()
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return false
  const url = String(error.config?.url || '')
  if (url.includes('/auth/')) return false
  if (error.response) return false
  return true
}

/**
 * Convenience: enqueue from an axios error config without callers having
 * to dig fields out themselves. Mirrors AxiosRequestConfig fields one-to-one.
 */
export async function outboxEnqueueFromError(error) {
  const cfg = error?.config || {}
  return outboxEnqueue({
    method: cfg.method,
    url: cfg.url,
    data: cfg.data ? safeJsonParse(cfg.data) : null,
    headers: cfg.headers || null,
  })
}

function safeJsonParse(raw) {
  if (raw == null) return null
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return raw }
}
