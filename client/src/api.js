import api from './api/client'

// Auth
export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (name, email, phone, password, referralCode) =>
    api.post('/auth/register', { name, email, phone, password, referral_code: referralCode }),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  updateProfile: (updates) => api.put('/auth/profile', updates),
  changePassword: (currentPassword, newPassword) =>
    api.put('/auth/password', { current_password: currentPassword, new_password: newPassword }),
}

// Orders
export const ordersApi = {
  list: (filters = {}) => api.get('/orders', { params: filters }),
  get: (id) => api.get(`/orders/${id}`),
  create: (data) => api.post('/orders', data),
  update: (id, data) => api.put(`/orders/${id}`, data),
  delete: (id) => api.delete(`/orders/${id}`),
  track: (trackingNumber) => api.get(`/tracking/${trackingNumber}`),
}

// Wallet — balance lives at GET /wallet (returns { wallet: { balance } })
export const walletApi = {
  // Returns { success, wallet: { balance, currency, ... }, recent_transactions }
  getWallet: () => api.get('/wallet'),
  // Convenience: returns the wallet balance as a number
  getBalance: () => api.get('/wallet'),
  getTransactions: () => api.get('/wallet/transactions'),
  getTransactionDetails: (id) => api.get(`/wallet/transactions/${id}`),
  // Pay for an order from wallet
  payFromWallet: (orderId, amount) => api.post('/wallet/pay', { order_id: orderId, amount }),
}

// Pricing
export const pricingApi = {
  calculate: (market, weight_kg, dimensions, shipping_speed, insurance) =>
    api.post('/pricing/calculate', {
      market,
      weight_kg,
      dimensions,
      shipping_speed,
      insurance: insurance?.enabled || false,
      declared_value: insurance?.declaredValue || 0,
    }),
  // Exchange rates are managed by admin; pricing calculator uses hardcoded rates on the backend
  // No separate /pricing/exchange-rates endpoint exists
}

// Warehouse
export const warehouseApi = {
  getAddresses: () => api.get('/warehouse/addresses'),
  getAddress: (market) => api.get(`/warehouse/addresses/${market}`),
}

// Consolidation
export const consolidationApi = {
  listPackages: () => api.get('/consolidation/packages'),
  requestConsolidation: (packageIds) =>
    api.post('/consolidation/request', { packageIds }),
  getRequests: () => api.get('/consolidation/requests'),
  cancelRequest: (id) => api.delete(`/consolidation/requests/${id}`),
}

// Prohibited Items
export const prohibitedApi = {
  checkItem: (itemName) => api.get(`/prohibited/check/${itemName}`),
  getCategories: () => api.get('/prohibited/categories'),
}

// Support Tickets
export const supportApi = {
  createTicket: (subject, description, priority, file) => {
    const formData = new FormData()
    formData.append('subject', subject)
    formData.append('description', description)
    formData.append('priority', priority)
    if (file) formData.append('photo', file)
    return api.post('/tickets', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  listTickets: () => api.get('/tickets'),
  getTicket: (id) => api.get(`/tickets/${id}`),
  replyToTicket: (id, message) => api.post(`/tickets/${id}/message`, { message }),
  closeTicket: (id) => api.put(`/tickets/${id}`, { status: 'closed' }),
}

// Referral
export const referralApi = {
  getCode: () => api.get('/referral/code'),
  getStats: () => api.get('/referral/stats'),
  getHistory: () => api.get('/referral/history'),
}

// Admin
export const adminApi = {
  getDashboardStats: () => api.get('/admin/stats'),

  listUsers: (filters = {}) => api.get('/admin/users', { params: filters }),
  getUser: (id) => api.get(`/admin/users/${id}`),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
  resetUserPassword: (id) => api.post(`/admin/users/${id}/reset-password`),

  listOrders: (filters = {}) => api.get('/admin/orders', { params: filters }),
  deleteOrder: (id) => api.delete(`/admin/orders/${id}`),
  cancelOrder: (id, reason) => api.put(`/admin/orders/${id}/cancel`, { reason }),
  createOrderForClient: (data) => api.post('/admin/orders/create-for-client', data),
  requestPayment: (orderId, amount, notes) =>
    api.post(`/admin/orders/${orderId}/request-payment`, { amount, notes }),
  searchCustomers: (query) => api.get('/admin/users/search', { params: { q: query } }),
  bulkUpdateOrders: (orderIds, status) =>
    api.put('/admin/orders/bulk-update', { order_ids: orderIds, status }),

  getRevenue: (startDate, endDate) =>
    api.get('/admin/revenue', { params: { startDate, endDate } }),
  exportRevenue: (startDate, endDate) =>
    api.get('/admin/revenue/export', { params: { startDate, endDate }, responseType: 'blob' }),

  listTickets: (filters = {}) => api.get('/admin/tickets', { params: filters }),
  assignTicket: (id, assignedTo) => api.put(`/admin/tickets/${id}`, { assignedTo }),
  updateTicketStatus: (id, status) => api.put(`/admin/tickets/${id}`, { status }),

  // Exchange rate management
  getExchangeRates: () => api.get('/admin/exchange-rates'),
  setExchangeRates: (rates) => api.put('/admin/exchange-rates', { rates }),

  // Create user/admin account
  createUser: (data) => api.post('/admin/users/create', data),

  // Delete a user account permanently
  deleteUser: (id) => api.delete(`/admin/users/${id}`),

  // Send payment reminder email
  sendPaymentReminder: (orderId, amount, notes) =>
    api.post(`/admin/orders/${orderId}/send-reminder`, { amount, notes }),

  // Send test email to verify SMTP configuration
  testEmail: (to) => api.post('/admin/test-email', { to }),

  // Backups
  listBackups: (filters = {}) => api.get('/admin/backups', { params: filters }),
  createBackup: () => api.post('/admin/backups'),
  downloadBackup: (id) => api.get(`/admin/backups/${id}/download`, { responseType: 'blob' }),
}

export default api
