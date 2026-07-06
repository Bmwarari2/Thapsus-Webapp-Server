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

  // Influencers are confined to their own section. Any protected route that
  // doesn't explicitly list the 'influencer' role bounces them back to their
  // dashboard, so they never land on the customer/ops/admin surfaces.
  if (user?.role === 'influencer') {
    const allowsInfluencer = Array.isArray(roles) && roles.includes('influencer')
    if (!allowsInfluencer) return <Navigate to="/influencer" replace />
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  // Finance dashboard is gated to a "selected admin" (can_manage_finances),
  // not every admin.
  if (financeOnly && !canManageFinances) {
    return <Navigate to="/dashboard" replace />
  }

  if (Array.isArray(roles) && roles.length > 0) {
    const role = user?.role
    if (role !== 'admin' && !roles.includes(role)) {
      return <Navigate to="/dashboard" replace />
    }
  }

  return children
}
