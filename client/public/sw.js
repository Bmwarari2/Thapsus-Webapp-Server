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

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  '/logo.png',
      badge: '/logo.png',
      tag,
      data:  { url: orderId ? `/orders/${orderId}` : '/orders' },
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
