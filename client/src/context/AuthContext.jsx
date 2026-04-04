import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi } from '../api'
import { saveSession, getSession, clearSession } from '../api/client'
import { useInactivityLogout } from '../hooks/useInactivityLogout'

const AuthContext = createContext(null)

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

  // ── On mount: restore session from localStorage ──────────────────────────
  useEffect(() => {
    const { token, user: storedUser } = getSession()

    if (token && storedUser) {
      // Optimistically restore from cache, then verify with the server
      setUser(storedUser)
      authApi
        .me()
        .then((res) => {
          const freshUser = res.data.user
          setUser(freshUser)
          saveSession(token, freshUser)
        })
        .catch(() => {
          // Token is invalid / expired – clear everything
          clearSession()
          setUser(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

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
   */
  const register = useCallback(
    async (name, email, phone, password, referralCode = null) => {
      const res = await authApi.register(name, email, phone, password, referralCode)
      const { token, user: newUser } = res.data
      saveSession(token, newUser)
      setUser(newUser)
      return newUser
    },
    []
  )

  // ── logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    clearSession()
    setUser(null)
    // Redirect to login if not already there
    if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
      window.location.href = '/login'
    }
  }, [])

  // ── Auto-logout after 10 minutes of inactivity ───────────────────────────
  useInactivityLogout(logout, 10 * 60 * 1000, !!user)

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
    logout,
    updateProfile,
    isAdmin: user?.role === 'admin',
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
