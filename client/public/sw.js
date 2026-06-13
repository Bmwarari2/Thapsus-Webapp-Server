// Thapsus Cargo — Service Worker
// Served from client/public/sw.js → /sw.js at runtime.
// Handles: caching (network-first), Web Push notifications, notification clicks.

const CACHE_NAME = 'thapsus-cargo-v1';

self.addEventListener('install', event => {
  // Activate immediately without waiting for old tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Push Notifications ────────────────────────────────────────────────────────
// Fired when the server sends a Web Push message (background / app-closed state).
// The payload shape mirrors the SSE order_update event for consistency.
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {}

  const title   = payload.title   || '📦 Thapsus Cargo';
  const body    = payload.body    || 'Your shipment status has been updated.';
  const orderId = payload.orderId || null;
  const tag     = payload.tag     || (orderId ? `order-${orderId}` : 'thapsus-update');
  // Prefer an explicit url from the payload; fall back to the order page.
  const url     = payload.url || (orderId ? `/orders/${orderId}` : '/orders');

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  '/logo.png',
      badge: '/logo.png',
      tag,
      data:  { url },
    })
  );
});

// ── Notification Click ────────────────────────────────────────────────────────
// Open / focus the relevant page when the user taps a notification.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/orders';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      // If a tab is already open, focus it and navigate
      for (const win of windows) {
        if (win.url.includes(self.location.origin)) {
          win.focus();
          return win.navigate(targetUrl);
        }
      }
      // Otherwise open a new tab
      return self.clients.openWindow(targetUrl);
    })
  );
});

// ── Background Sync: outbox flush ────────────────────────────────────────────
// Audit F-21 — closes the closed-tab gap in the Web Outbox. The window-side
// outbox already replays on the navigator `online` event (api/client.js), but
// that only fires when a tab is open. SyncManager hands the retry to the
// browser so a queued POD/receive/screen mutation completes even if the rider
// closed the PWA on the dead-zone side of a journey.
//
// The window-side enqueue path (api/client.js) registers a sync with tag
// 'outbox-flush' after every successful outboxEnqueue. The browser fires
// this event when the device next has connectivity (with exponential backoff
// on repeated failures). On a successful run we postMessage open clients so
// OutboxIndicator clears.
//
// Reads the same IndexedDB the window-side outbox.js uses
// (db: 'thapsus-outbox', version 1, store: 'mutations'). If you change the
// schema there, mirror it here.
const OUTBOX_DB_NAME = 'thapsus-outbox'
const OUTBOX_DB_VERSION = 1
const OUTBOX_STORE = 'mutations'
const OUTBOX_API_BASE = '/api'

self.addEventListener('sync', event => {
  if (event.tag !== 'outbox-flush') return
  event.waitUntil(flushOutboxFromSW())
})

async function flushOutboxFromSW() {
  let db
  try { db = await openOutboxDB() } catch { return }

  const records = await listOutbox(db)
  if (!records.length) return

  for (const rec of records) {
    let res
    try {
      const url = rec.url?.startsWith('http') ? rec.url : OUTBOX_API_BASE + (rec.url || '')
      const init = {
        method: rec.method,
        headers: { 'Content-Type': 'application/json', ...(rec.headers || {}) },
      }
      if (rec.data != null && rec.method !== 'GET' && rec.method !== 'HEAD') {
        init.body = typeof rec.data === 'string' ? rec.data : JSON.stringify(rec.data)
      }
      res = await fetch(url, init)
    } catch (err) {
      // Network error — keep entry, throw to keep SyncManager retrying
      await recordOutboxFailure(db, rec.id, err?.message || String(err))
      throw err
    }

    if (res.ok || (res.status >= 400 && res.status < 500)) {
      // 2xx success OR 4xx caller-side error — either way drop the entry.
      // 4xx isn't going to start succeeding on retry (auth failed / bad
      // payload / route gone) so retrying it just bloats the queue.
      await removeOutbox(db, rec.id)
    } else {
      // 5xx — keep + throw so SyncManager retries with backoff
      await recordOutboxFailure(db, rec.id, `HTTP ${res.status}`)
      throw new Error(`HTTP ${res.status}`)
    }
  }

  // Notify any open clients that the queue cleared so OutboxIndicator
  // refreshes its count (it listens for outbox:flushed CustomEvents
  // fired by api/client.js; we re-dispatch via postMessage).
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const c of windows) {
    c.postMessage({ type: 'outbox-flushed' })
  }
}

function openOutboxDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB_NAME, OUTBOX_DB_VERSION)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

function listOutbox(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readonly')
    const out = []
    const cursorReq = tx.objectStore(OUTBOX_STORE).index('ts').openCursor(null, 'next')
    cursorReq.onsuccess = () => {
      const cur = cursorReq.result
      if (cur) { out.push(cur.value); cur.continue() } else { resolve(out) }
    }
    cursorReq.onerror = () => reject(cursorReq.error)
  })
}

function removeOutbox(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite')
    tx.objectStore(OUTBOX_STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

function recordOutboxFailure(db, id, errorMessage) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite')
    const store = tx.objectStore(OUTBOX_STORE)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const row = getReq.result
      if (!row) return // entry already removed
      row.attempts = (row.attempts || 0) + 1
      row.lastError = String(errorMessage || '').slice(0, 500)
      store.put(row)
    }
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

// ── Network-first fetch ───────────────────────────────────────────────────────
// Always try the network, fall back to cache for GET requests.
self.addEventListener('fetch', event => {
  // Only handle GET requests; let everything else pass through
  if (event.request.method !== 'GET') return;

  // Don't intercept API or auth calls — always go to network
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache a clone of successful responses for static assets
        if (response.ok && (url.pathname.match(/\.(js|css|png|svg|ico|woff2?)$/))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
