import axios from 'axios'

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

// ── Request interceptor: attach Bearer token ──────────────────────────────────
api.interceptors.request.use((config) => {
  const token = storageGet('sc_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response interceptor: handle 401 + unwrap errors ─────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthRoute = error.config?.url?.includes('/auth/')
    if (error.response?.status === 401 && !isAuthRoute) {
      clearSession()
      window.location.href = '/login'
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
      message = 'Cannot reach the server. Please check your connection.'
    } else if (error.message) {
      message = error.message
    }

    return Promise.reject(new Error(message))
  }
)

export default api
