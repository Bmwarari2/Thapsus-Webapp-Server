const CACHE_NAME = 'thapsuscargo-v2'
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
]

// Install event - cache core files, immediately activate
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  )
})

// Activate event - delete ALL old caches, then take control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      )
    }).then(() => self.clients.claim())
  )
})

// Fetch event - NETWORK FIRST for everything
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Got a network response - cache it for offline fallback
        if (response.status === 200) {
          const responseToCache = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache)
          })
        }
        return response
      })
      .catch(() => {
        // Network failed - try the cache as offline fallback
        return caches.match(event.request).then((cached) => {
          // For navigation requests, fall back to cached index.html
          if (!cached && event.request.mode === 'navigate') {
            return caches.match('/')
          }
          return cached
        })
      })
  )
})

// Background sync (optional)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(
      fetch('/api/orders/sync', { method: 'POST' })
        .then(() => console.log('Orders synced'))
        .catch(() => console.log('Sync failed'))
    )
  }
})

// Push notifications (optional)
self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    tag: data.tag || 'notification',
    requireInteraction: data.requireInteraction || false,
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Thapsus Cargo', options)
  )
})

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i]
        if (client.url === event.notification.tag && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.tag || '/')
      }
    })
  )
})
