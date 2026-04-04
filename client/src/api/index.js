/**
 * src/api/index.js
 * Central barrel file – import any API module from '../api' in your pages.
 *
 * Every function returns an Axios Promise so pages can do:
 *   const res = await ordersApi.list()
 *   res.data.orders  ← the data lives here
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
   * Falls back to searching the orders list if no dedicated track endpoint exists.
   */
  track: (trackingNumber) =>
    api.get('/tracking', { params: { tracking_number: trackingNumber } }),
}

// ─────────────────────────────────────────────────────────────────────────────
// WALLET  →  GET /api/wallet  |  GET /api/wallet/transactions  |  POST /api/wallet/deposit
// ─────────────────────────────────────────────────────────────────────────────
export const walletApi = {
  getBalance: () => api.get('/wallet'),

  getTransactions: (params = {}) => api.get('/wallet/transactions', { params }),

  /**
   * Initiate a deposit.
   * @param {string} method  - e.g. 'mpesa' | 'card'
   * @param {number} amount  - amount in KES
   * @param {string} phone   - M-Pesa phone number (required for mpesa)
   */
  deposit: (method, amount, phone) =>
    api.post('/wallet/deposit', { method, amount, phone }),
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICING  →  POST /api/pricing/calculate  |  GET /api/pricing/exchange-rates
// ─────────────────────────────────────────────────────────────────────────────
export const pricingApi = {
  /**
   * Calculate shipping cost estimate.
   * @param {string} market          - 'UK' | 'USA' | 'China'
   * @param {number} weight_kg
   * @param {object} dimensions      - { length, width, height } in cm
   * @param {string} shipping_speed  - 'economy' | 'express'
   * @param {boolean} insurance
   * @param {number} declared_value  - in KES
   */
  calculate: (market, weight_kg, dimensions, shipping_speed, insurance, declared_value = 0) =>
    api.post('/pricing/calculate', {
      market,
      weight_kg,
      dimensions,
      shipping_speed,
      insurance,
      declared_value,
    }),

  /** Get current USD/GBP/CNY → KES exchange rates */
  getExchangeRates: () => api.get('/pricing/exchange-rates'),
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN  →  /api/admin/*  (requires admin role)
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
  listTickets: (params = {}) => api.get('/tickets', { params }),

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

  /** Delete a user account permanently */
  deleteUser: (id) => api.delete(`/admin/users/${id}`),

  /** Send test email to verify SMTP configuration */
  testEmail: (to) => api.post('/admin/test-email', { to }),

  /** Search customers by name/email */
  searchCustomers: (q) => api.get('/admin/users/search', { params: { q } }),

  /** Request payment from customer */
  requestPayment: (orderId, amount, notes) =>
    api.post(`/admin/orders/${orderId}/request-payment`, { amount, notes }),

  /** Send payment reminder email */
  sendPaymentReminder: (orderId, amount, notes) =>
    api.post(`/admin/orders/${orderId}/send-reminder`, { amount, notes }),

  /** Cancel an order */
  cancelOrder: (orderId, reason) =>
    api.put(`/admin/orders/${orderId}/cancel`, { reason }),

  /** Delete an order */
  deleteOrder: (orderId) => api.delete(`/admin/orders/${orderId}`),

  /** Create order for a client */
  createOrderForClient: (data) => api.post('/admin/orders/create-for-client', data),
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
  /** Get the current user's referral code */
  getCode: () => api.get('/referral/code'),

  /** Get referral programme statistics */
  getStats: () => api.get('/referral/stats'),

  /** Get referral history */
  getHistory: () => api.get('/referral/history'),
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
  createTicket: (subject, description, priority = 'medium', file = null) => {
    if (file) {
      const form = new FormData()
      form.append('subject', subject)
      form.append('description', description)
      form.append('priority', priority)
      form.append('file', file)
      return api.post('/tickets', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    }
    return api.post('/tickets', { subject, description, priority })
  },

  /** Reply to an existing ticket */
  replyToTicket: (id, message) =>
    api.post(`/tickets/${id}/reply`, { message }),
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
