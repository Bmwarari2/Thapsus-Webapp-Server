const CACHE_NAME = 'swiftcargo-v1'
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/index.css',
]

// Install event - cache files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  )
})

// Activate event - clean up old caches
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

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return
  }

  // Skip API calls - always fetch from network
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone the response
          const responseToCache = response.clone()

          // Cache successful responses
          if (response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache)
            })
          }

          return response
        })
        .catch(() => {
          // Return cached response if network fails
          return caches.match(event.request)
        })
    )
    return
  }

  // For other requests, try cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response
        }

        return fetch(event.request).then((response) => {
          // Don't cache if not successful
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response
          }

          // Clone the response
          const responseToCache = response.clone()

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache)
          })

          return response
        })
      })
      .catch(() => {
        // Return offline page or cached response
        return caches.match('/')
      })
  )
})

// Background sync (optional)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(
      // Sync pending orders when connection is restored
      fetch('/api/orders/sync', { method: 'POST' })
        .then(() => console.log('Orders synced'))
        .catch(() => console.log('Sync failed'))
    )
  }
})

// Push notifications (optional)
self.addEventListener('push', (event) => {
  if (!event.data) {
    return
  }

  const data = event.data.json()

  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    tag: data.tag || 'notification',
    requireInteraction: data.requireInteraction || false,
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'SwiftCargo', options)
  )
})

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Check if there's already a window with the target URL open
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i]
        if (client.url === event.notification.tag && 'focus' in client) {
          return client.focus()
        }
      }

      // If not, open a new window
      if (clients.openWindow) {
        return clients.openWindow(event.notification.tag || '/')
      }
    })
  )
})
