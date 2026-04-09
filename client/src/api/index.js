/**
 * src/api/index.js
 * Central barrel file – import any API module from '../api' in your pages.
 *
 * Every function returns an Axios Promise so pages can do:
 * const res = await ordersApi.list()
 * res.data.orders  ← the data lives here
 */
import api from './client'

// ─────────────────────────────────────────────────────────────────────────────
// AUTH  (used by AuthContext, not imported directly in pages)
// ─────────────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email, password) =>
    api.post('/auth/login', { email, password }),

  register: (name, email, phone, password, referral_code = null) =>
    api.post('/auth/register', { name, email, phone, password, referral_code }),

  me: () => api.get('/auth/me'),

  updateProfile: (data) => api.put('/auth/profile', data),

  changePassword: (current_password, new_password) =>
    api.put('/auth/password', { current_password, new_password }),
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS  →  GET /api/orders  |  POST /api/orders  |  GET /api/orders/:id
// ─────────────────────────────────────────────────────────────────────────────
export const ordersApi = {
  /** List user's orders. filters = { status, market, page, limit } */
  list: (filters = {}) => api.get('/orders', { params: filters }),

  /** Get a single order by id */
  get: (id) => api.get(`/orders/${id}`),

  /** Create a new order */
  create: (data) => api.post('/orders', data),

  /**
   * Track a package by tracking number.
   */
  track: (trackingNumber) =>
    api.get(`/tracking/${trackingNumber}`),
}

// ─────────────────────────────────────────────────────────────────────────────
// WALLET  →  GET /api/wallet  |  GET /api/wallet/transactions  |  POST /api/wallet/deposit
// ─────────────────────────────────────────────────────────────────────────────
export const walletApi = {
  getBalance: () => api.get('/wallet'),

  getTransactions: (params = {}) => api.get('/wallet/transactions', { params }),

  /**
   * Get Mpesa paybill info.
   */
  getMpesaInfo: () => api.get('/wallet/mpesa-info'),

  /**
   * Submit Mpesa confirmation message after payment.
   * @param {string} mpesa_message - The full Mpesa SMS confirmation
   * @param {string|null} order_id - Optional order ID being paid for
   * @param {number} amount - Amount paid in KES
   */
  submitMpesaConfirmation: (mpesa_message, order_id, amount) =>
    api.post('/wallet/mpesa-confirm', { mpesa_message, order_id, amount }),
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICING  →  POST /api/pricing/calculate  |  GET /api/pricing/exchange-rates
// ─────────────────────────────────────────────────────────────────────────────
export const pricingApi = {
  /**
   * Calculate shipping cost estimate.
   * @param {string} market          - 'UK' | 'China'
   * @param {number} weight_kg
   * @param {object} dimensions      - { length, width, height } in cm
   * @param {string} shipping_speed  - 'economy' | 'express'
   * @param {boolean} insurance
   * @param {number} declared_value  - in KES
   */
  calculate: (market, weight_kg, dimensions, shipping_speed, insurance, declared_value = 0, electronics_item = null) =>
    api.post('/pricing/calculate', {
      market,
      weight_kg,
      dimensions,
      shipping_speed,
      insurance,
      declared_value,
      electronics_item,
    }),

  /** Get current USD/GBP/CNY → KES exchange rates */
  getExchangeRates: () => api.get('/pricing/exchange-rates'),
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN  →  /api/admin/* (requires admin role)
// ─────────────────────────────────────────────────────────────────────────────
export const adminApi = {
  /** Dashboard overview stats */
  getDashboardStats: () => api.get('/admin/stats'),

  /** Orders data for chart (last 30 days) */
  getOrdersChart: (params = {}) => api.get('/admin/orders', { params }),

  /** Revenue data for chart */
  getRevenueChart: (params = {}) => api.get('/admin/revenue', { params }),

  /** Orders grouped by market (for pie chart) */
  getOrdersByMarket: () => api.get('/admin/orders', { params: { groupBy: 'market' } }),

  /** List all users */
  listUsers: (params = {}) => api.get('/admin/users', { params }),

  /** Update a user's role or active status */
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),

  /** List all orders for the orders management table */
  listOrders: (params = {}) => api.get('/admin/orders', { params }),

  /** List all support tickets */
  listTickets: (params = {}) => api.get('/tickets/admin/all', { params }),

  /** Update a ticket's status (admin only) */
  updateTicketStatus: (id, status, admin_message) =>
    api.put(`/tickets/${id}/status`, { status, ...(admin_message ? { admin_message } : {}) }),

  /**
   * Bulk-update multiple orders to a new status.
   * @param {string[]} order_ids
   * @param {string}   status
   */
  bulkUpdateOrders: (order_ids, status) =>
    api.put('/admin/orders/bulk-update', { order_ids, status }),

  /** Export revenue as CSV (returns a Blob) */
  exportRevenue: (params = {}) =>
    api.get('/admin/revenue/export', { params, responseType: 'blob' }),

  /** Get admin-set exchange rates */
  getExchangeRates: () => api.get('/admin/exchange-rates'),

  /** Set exchange rates for the day */
  setExchangeRates: (rates) => api.put('/admin/exchange-rates', { rates }),

  /** Create a new user or admin account */
  createUser: (data) => api.post('/admin/users/create', data),

  /** Get a single user's full details (orders, transactions, referrals) */
  getUser: (id) => api.get(`/admin/users/${id}`),

  /** Trigger password reset email for a user */
  resetUserPassword: (id) => api.post(`/admin/users/${id}/reset-password`),

  /** Delete a user account permanently */
  deleteUser: (id) => api.delete(`/admin/users/${id}`),

  /** Send payment reminder email */
  sendPaymentReminder: (orderId, amount, notes) =>
    api.post(`/admin/orders/${orderId}/send-reminder`, { amount, notes }),

  /** Send test email to verify SMTP configuration */
  testEmail: (to) => api.post('/admin/test-email', { to }),

  /** Create order for a client */
  createOrderForClient: (data) => api.post('/admin/orders/create-for-client', data),

  /** Get pending M-Pesa transactions */
  getPendingPayments: () => api.get('/admin/transactions/pending'),

  /** Approve a payment transaction */
  approvePayment: (id) => api.post(`/admin/transactions/${id}/approve`),

  /** Reject a payment transaction */
  rejectPayment: (id, reason) => api.post(`/admin/transactions/${id}/reject`, { reason }),

  /** View the raw Mpesa message submitted as proof of payment */
  getPaymentProof: (id) => api.get(`/admin/transactions/${id}/proof`),

  /** Get email logs for a user */
  getUserEmails: (id) => api.get(`/admin/users/${id}/emails`),

  /** Get error logs (paginated, filterable) */
  getErrorLogs: (params = {}) => api.get('/admin/error-logs', { params }),

  /** Get error log stats (counts for badges) */
  getErrorLogStats: () => api.get('/admin/error-logs/stats'),

  /** Clear old error logs */
  clearErrorLogs: (keepDays = 30) => api.delete('/admin/error-logs', { params: { keepDays } }),

  /** Get current shipping rates (per-kg rates for standard/express/economy) */
  getShippingRates: () => api.get('/admin/shipping-rates'),

  /** Update shipping rates */
  setShippingRates: (rates) => api.put('/admin/shipping-rates', { rates }),

  /** Update shipping rates (alias) */
  updateShippingRates: (rates) => api.put('/admin/shipping-rates', { rates }),

  /** Request payment for an order — sends a payment request email to the customer */
  requestPayment: (orderId, amount, notes) =>
    api.post(`/admin/orders/${orderId}/request-payment`, { amount, notes }),

  /** Cancel an order */
  cancelOrder: (orderId, reason) =>
    api.post(`/admin/orders/${orderId}/cancel`, { reason }),

  /** Edit an order (weight, dimensions, cost, status, etc.) */
  editOrder: (orderId, data) => api.put(`/admin/orders/${orderId}/edit`, data),

  /** Delete an order permanently */
  deleteOrder: (orderId) => api.delete(`/admin/orders/${orderId}`),

  /** Search customers by name/email for the create-order form */
  searchCustomers: (query) =>
    api.get('/admin/users/search', { params: { q: query } }),

  /** Get revenue analytics */
  getRevenue: (params = {}) => api.get('/admin/revenue', { params }),
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSOLIDATION  →  /api/consolidation/*
// ─────────────────────────────────────────────────────────────────────────────
export const consolidationApi = {
  /** List packages available for consolidation */
  listPackages: () => api.get('/consolidation/packages'),

  /** List existing consolidation requests */
  getRequests: () => api.get('/consolidation/requests'),

  /**
   * Submit a consolidation request.
   * @param {string[]} package_ids
   */
  requestConsolidation: (package_ids) =>
    api.post('/consolidation/request', { package_ids }),
}

// ─────────────────────────────────────────────────────────────────────────────
// REFERRAL  →  /api/referral/*
// ─────────────────────────────────────────────────────────────────────────────
export const referralApi = {
  /** Get referral info (code, stats, referred users) — maps to GET /api/referral */
  getInfo: () => api.get('/referral'),

  /** Get referral history (paginated) */
  getHistory: (params = {}) => api.get('/referral/history', { params }),

  /** Validate a referral code */
  validate: (referral_code) => api.post('/referral/validate', { referral_code }),
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORT / TICKETS  →  /api/tickets/*
// ─────────────────────────────────────────────────────────────────────────────
export const supportApi = {
  /** List the user's support tickets */
  listTickets: () => api.get('/tickets'),

  /** Get a single ticket with all messages */
  getTicket: (id) => api.get(`/tickets/${id}`),

  /**
   * Create a new support ticket.
   * File attachment is optional – sent as multipart/form-data when present.
   */
  createTicket: (subject, description, file = null) => {
    if (file) {
      const form = new FormData()
      form.append('subject', subject)
      form.append('description', description)
      form.append('photo', file)
      return api.post('/tickets', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    }
    return api.post('/tickets', { subject, description })
  },

  /** Reply to an existing ticket */
  replyToTicket: (id, message) =>
    api.post(`/tickets/${id}/message`, { message }),
}

// ─────────────────────────────────────────────────────────────────────────────
// WAREHOUSE  →  /api/warehouse/*
// ─────────────────────────────────────────────────────────────────────────────
export const warehouseApi = {
  /** Get warehouse addresses for all markets */
  getAddresses: () => api.get('/warehouse/addresses'),
}

// ─────────────────────────────────────────────────────────────────────────────
// PROHIBITED ITEMS  →  /api/prohibited/*
// ─────────────────────────────────────────────────────────────────────────────
export const prohibitedApi = {
  /**
   * Check whether an item is allowed / prohibited.
   * @param {string} itemName
   */
  checkItem: (itemName) =>
    api.get('/prohibited/check', { params: { item: itemName } }),

  /** Get the full list of prohibited item categories */
  getCategories: () => api.get('/prohibited/categories'),
}

// ─────────────────────────────────────────────────────────────────────────────
// Default export (raw axios instance) – handy for one-off calls
// ─────────────────────────────────────────────────────────────────────────────
export { default as apiClient } from './client'
