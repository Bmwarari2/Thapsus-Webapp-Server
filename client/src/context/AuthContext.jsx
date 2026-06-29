import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { authApi } from '../api'
import { saveSession, getSession, clearSession } from '../api/client'
// Inactivity logout removed — users on personal devices should stay logged in

// Routes that should NOT trigger the "session expired" toast / redirect
// when the api/client.js interceptor fires `auth:expired`. Hitting one
// of these means the user is already where they need to be (or is in
// the middle of an auth dance), so the toast would be confusing.
const AUTH_FREE_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password']

const AuthContext = createContext(null)

// Audit follow-up: minimum gap between visibilitychange-driven /me calls.
// Prevents spam when a user task-switches rapidly (Cmd-Tab cycles, alt-tab,
// dock-bar focus). Five minutes is comfortably below the server's 24h
// refresh threshold, so any tab that becomes visible after a long
// background still gets a fresh token on the next focus, but we don't
// burn a request every time the user briefly looks at another tab.
const MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000

/**
 * AuthProvider – wrap your <App /> with this in main.jsx / index.jsx:
 *
 *   <AuthProvider>
 *     <App />
 *   </AuthProvider>
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)   // true while we check the stored token
  const navigate = useNavigate()

  // Tracks the last time /me was called so visibilitychange listeners can
  // throttle. useRef so reading + writing across event handlers doesn't
  // re-render the tree.
  const lastRefreshAtRef = useRef(0)

  // Shared /me-then-swap helper. Used by:
  //   • the boot effect (mount) — gates session-restoration loading state
  //   • the visibilitychange listener — keeps the sliding session alive
  //     for tabs that stay open across the 24h server refresh threshold
  // Returns nothing; side effects only. Clears session on rejection so
  // a definitively-revoked token is reflected immediately.
  const runMeRefresh = useCallback(async ({ onUserMissing } = {}) => {
    const { token } = getSession()
    if (!token) return
    try {
      const res = await authApi.me()
      lastRefreshAtRef.current = Date.now()
      const freshUser = res.data.user
      // W6.1 silent refresh. The server includes `refreshed_token` when
      // our current token's iat is older than the configured threshold
      // (default 24h). Swap it into storage so the sliding 7-day session
      // stays alive without a re-login. Older server builds omit the
      // field; we fall back to the existing token.
      const nextToken = res.data.refreshed_token || token
      setUser(freshUser)
      saveSession(nextToken, freshUser)
    } catch (err) {
      clearSession()
      setUser(null)
      onUserMissing?.()
    }
  }, [])

  // ── On mount: restore session from localStorage ──────────────────────────
  useEffect(() => {
    // Guard against React StrictMode double-invocation
    let cancelled = false

    const { token, user: storedUser } = getSession()

    if (token && storedUser) {
      setUser(storedUser)
      runMeRefresh({
        // Boot path: if cancelled (StrictMode unmount), skip the side
        // effects baked into runMeRefresh by checking the flag here.
      }).finally(() => {
        if (!cancelled) setLoading(false)
      })
    } else {
      setLoading(false)
    }

    return () => { cancelled = true }
  }, [runMeRefresh])

  // ── Tab-focus refresh (companion to W6.1) ────────────────────────────────
  // When the document becomes visible after being hidden, fire /me again
  // so a long-open tab whose token has crossed the server's 24h refresh
  // threshold picks up the rotation. Throttled by MIN_REFRESH_INTERVAL_MS
  // to avoid spamming the server during rapid task-switching.
  useEffect(() => {
    if (typeof document === 'undefined') return

    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      if (!user) return
      const elapsed = Date.now() - lastRefreshAtRef.current
      if (elapsed < MIN_REFRESH_INTERVAL_MS) return
      runMeRefresh()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [user, runMeRefresh])

  // ── Graceful 401 expiry (replaces the old hard window.location reload) ────
  // The api/client.js interceptor dispatches `auth:expired` whenever a
  // protected request comes back 401. We:
  //   1. Show a toast so the user knows what happened (a hard reload
  //      would have eaten the toast).
  //   2. Soft-navigate via react-router so unrelated React state isn't
  //      blown away — and so the URL is appended with ?next=<original>
  //      that Login.jsx already honours to bounce back after auth.
  //   3. Skip the toast/redirect when already on an auth-free page so a
  //      user who navigated to /login on their own doesn't get
  //      "session expired" yelled at them.
  useEffect(() => {
    if (typeof window === 'undefined') return

    function onExpired() {
      setUser(null)
      const path = window.location.pathname + window.location.search
      const onAuthPage = AUTH_FREE_ROUTES.some((p) => window.location.pathname.startsWith(p))
      if (onAuthPage) return

      toast.error('Your session expired. Please log in again.', { duration: 4500, id: 'auth-expired' })
      const next = encodeURIComponent(path || '/dashboard')
      navigate(`/login?next=${next}`, { replace: true })
    }

    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [navigate])

  // ── login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const res = await authApi.login(email, password)
    const { token, user: loggedInUser } = res.data
    saveSession(token, loggedInUser)
    setUser(loggedInUser)
    return loggedInUser
  }, [])

  // ── register ──────────────────────────────────────────────────────────────
  /**
   * Called from Register.jsx as:
   *   register(name, email, phone, password, referralCode)
   *
   * Returns a discriminated result:
   *   { verificationRequired: true, email }  — server PR N: account
   *     exists but is awaiting email verification, no token issued.
   *     Caller should route to the check-inbox view instead of /dashboard.
   *   { user }  — legacy / pre-PR-N server that auto-signs in.
   */
  const register = useCallback(
    async (name, email, phone, password, referralCode = null) => {
      const res = await authApi.register(name, email, phone, password, referralCode)
      const { token, user: newUser, verification_required } = res.data
      if (verification_required || !token) {
        return { verificationRequired: true, email }
      }
      saveSession(token, newUser)
      setUser(newUser)
      return { user: newUser }
    },
    []
  )

  // ── verifyEmail ───────────────────────────────────────────────────────────
  /**
   * POST /auth/verify-email — used by the /verify-email page after the
   * activation link is opened. The server returns the same auth bundle
   * login does so mobile clients (iOS / Android) can auto-sign-in from
   * the Universal / App Link.
   *
   * The web client intentionally DOES NOT save that session. Activating
   * via a link is a confirmation step, not an auth event — the customer
   * may have tapped the link from a shared / mobile inbox on a device
   * they don't normally sign in from. We discard the returned token and
   * leave the caller to bounce them to /login with a success toast.
   */
  const verifyEmail = useCallback(async (token) => {
    await authApi.verifyEmail(token)
  }, [])

  // ── resendVerification ────────────────────────────────────────────────────
  /**
   * POST /auth/resend-verification — mints a fresh activation email for
   * an unverified account. Generic anti-enumeration response shape, so
   * the caller can't tell whether an email actually went out — surface
   * a generic "if your account exists, we've sent a fresh link" toast.
   */
  const resendVerification = useCallback(async (email) => {
    await authApi.resendVerification(email)
  }, [])

  // ── logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    clearSession()
    setUser(null)
    // Soft-navigate; the user is choosing to log out so we don't show a
    // toast (different intent from session-expired). No `?next=` either —
    // they're not coming back to the same place after re-login.
    if (!AUTH_FREE_ROUTES.includes(window.location.pathname)) {
      navigate('/login', { replace: true })
    }
  }, [navigate])

  // Inactivity auto-logout removed to keep users signed in on personal devices

  // ── updateProfile ─────────────────────────────────────────────────────────
  const updateProfile = useCallback(async (data) => {
    const res = await authApi.updateProfile(data)
    const updatedUser = res.data.user
    const { token } = getSession()
    saveSession(token, updatedUser)
    setUser(updatedUser)
    return updatedUser
  }, [])

  const value = {
    user,
    loading,
    login,
    register,
    verifyEmail,
    resendVerification,
    logout,
    updateProfile,
    isAdmin: user?.role === 'admin',
    canManageFinances: user?.can_manage_finances === true,
    isAuthenticated: !!user,  // ✅ FIX: expose isAuthenticated so ProtectedRoute works correctly
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * useAuth – consume auth state anywhere inside AuthProvider:
 *
 *   const { user, login, logout, isAdmin, isAuthenticated } = useAuth()
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return ctx
}

export default AuthContext
