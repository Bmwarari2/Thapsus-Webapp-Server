/**
 * Web Push subscription helpers for the PWA.
 *
 * enablePush()  — request permission, subscribe via the service worker using
 *                 the server's VAPID key, and store the subscription server-side.
 * disablePush() — unsubscribe locally and remove it server-side.
 *
 * All functions degrade gracefully where push isn't supported (e.g. iOS Safari
 * tab that isn't an installed PWA) — they return a status string instead of
 * throwing so callers can show a friendly message.
 */
import { pushApi } from '../api'

export function isPushSupported() {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/**
 * @returns {Promise<'subscribed'|'denied'|'unsupported'|'unconfigured'|'error'>}
 */
export async function enablePush() {
  if (!isPushSupported()) return 'unsupported'

  // Make sure push is configured server-side and grab the VAPID key.
  let publicKey, enabled
  try {
    const res = await pushApi.publicKey()
    publicKey = res.data?.publicKey
    enabled = res.data?.enabled
  } catch { return 'error' }
  if (!enabled || !publicKey) return 'unconfigured'

  // Permission.
  let perm = Notification.permission
  if (perm === 'default') perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'denied'

  try {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
    }
    await pushApi.subscribe(sub.toJSON())
    return 'subscribed'
  } catch (err) {
    console.warn('[push] subscribe failed:', err?.message)
    return 'error'
  }
}

export async function disablePush() {
  if (!isPushSupported()) return 'unsupported'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      try { await pushApi.unsubscribe(sub.endpoint) } catch { /* best-effort */ }
      await sub.unsubscribe()
    }
    return 'unsubscribed'
  } catch {
    return 'error'
  }
}

/** True if this browser already has an active push subscription. */
export async function isPushEnabled() {
  if (!isPushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.ready
    return !!(await reg.pushManager.getSubscription())
  } catch {
    return false
  }
}
