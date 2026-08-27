import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * ProtectedRoute — wrap any route to require auth and (optionally) one or
 * more roles.  `adminOnly` is kept for backwards compatibility.
 *
 *   <ProtectedRoute adminOnly>{...}</ProtectedRoute>
 *   <ProtectedRoute roles={['operator','admin']}>{...}</ProtectedRoute>
 *   <ProtectedRoute financeOnly>{...}</ProtectedRoute>
 */
export const ProtectedRoute = ({ children, adminOnly = false, roles = null, financeOnly = false }) => {
  const { isAuthenticated, isAdmin, canManageFinances, user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Where a rejected user lands. The old fallbacks pointed at /dashboard
  // and /influencer — routes that no longer exist, so every role failure
  // ended on the 404 page. Staff go to their console; anyone else home.
  const fallback = ['operator', 'admin'].includes(user?.role) ? '/ops/inbox' : '/'

  if (adminOnly && !isAdmin) {
    return <Navigate to={fallback} replace />
  }

  // Finance dashboard is gated to a "selected admin" (can_manage_finances),
  // not every admin.
  if (financeOnly && !canManageFinances) {
    return <Navigate to={fallback} replace />
  }

  if (Array.isArray(roles) && roles.length > 0) {
    const role = user?.role
    if (role !== 'admin' && !roles.includes(role)) {
      return <Navigate to={fallback} replace />
    }
  }

  return children
}
