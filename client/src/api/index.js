/**
 * src/api/index.js
 * Central barrel file – import any API module from '../api' in your pages.
 *
 * Every function returns an Axios Promise so pages can do:
 * const res = await ordersApi.list()
 * res.data.orders  ← the data lives here
 */
import api from './client'
import { newIdempotencyKey } from '../lib/idempotencyKey'

// ─────────────────────────────────────────────────────────────────────────────
// AUTH  (used by AuthContext, not imported directly in pages)
// ─────────────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email, password) =>
    api.post('/auth/login', { email, password }),

  register: (name, email, phone, password, referral_code = null) =>
    api.post('/auth/register', { name, email, phone, password, referral_code }),

  /**
   * POST /api/auth/verify-email — consumes the one-shot token from the
   * activation email (server PR N). Returns the same auth bundle login
   * does on success so the caller can saveSession + setUser like a
   * normal sign-in.
   */
  verifyEmail: (token) =>
    api.post('/auth/verify-email', { token }),

  /**
   * POST /api/auth/resend-verification — generic anti-enumeration response;
   * always 200 regardless of whether the address exists / is verified.
   */
  resendVerification: (email) =>
    api.post('/auth/resend-verification', { email }),

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
// PAYMENTS  →  POST /api/payments  |  per-user credit  |  Stripe public config
// Replaces the legacy walletApi (server PR #61, migration 028). Two methods
// supported on every "money in" surface:
//   stripe → response.next.client_secret powers Stripe Elements / PaymentSheet
//   mpesa  → response.next.{paybill, account, amount_due_kes}; customer pays
//            in M-Pesa, then submits the SMS via submitMpesaConfirmation()
// ─────────────────────────────────────────────────────────────────────────────
export const paymentsApi = {
  /** GET /api/payments/config/stripe → { publishable_key, apple_pay }.
   *  Legacy single-method endpoint kept for older webapp builds. */
  stripeConfig: () => api.get('/payments/config/stripe'),

  /** PR F: GET /api/payments/methods — full payment-method matrix.
   *  { methods: { stripe: { enabled, publishable_key, apple_pay },
   *              mpesa:  { enabled, till_number } } }
   *  PayInvoiceModal calls this at bootstrap and falls back to
   *  stripeConfig() if /methods isn't deployed yet. */
  methods: () => api.get('/payments/methods'),

  /** GET /api/payments/me/credit → { balance_kes, updated_at } */
  myCredit: () => api.get('/payments/me/credit'),

  /**
   * POST /api/payments
   * @param {'order'|'consolidation'|'buy_for_me'} target_kind
   * @param {string} target_id
   * @param {'stripe'|'mpesa'} method
   * @param {boolean} [apply_credit=true]
   * @param {string} [phone]  Required when M-Pesa env is `lipana` — the
   *                          server fires the STK push to this number.
   */
  create: (target_kind, target_id, method, apply_credit = true, phone = null) => {
    const body = { target_kind, target_id, method, apply_credit }
    if (phone) body.phone = phone
    return api.post('/payments', body)
  },

  /** POST /api/payments/:id/mpesa-confirmation — customer pastes the SMS. */
  submitMpesaConfirmation: (paymentId, message_raw) =>
    api.post(`/payments/${paymentId}/mpesa-confirmation`, { message_raw }),

  list: ({ status, limit, offset, group } = {}) => {
    const qs = new URLSearchParams()
    if (status) qs.set('status', Array.isArray(status) ? status.join(',') : status)
    if (limit  != null) qs.set('limit', String(limit))
    if (offset != null) qs.set('offset', String(offset))
    if (group) qs.set('group', group)
    const tail = qs.toString() ? `?${qs.toString()}` : ''
    return api.get(`/payments${tail}`)
  },
  detail: (id) => api.get(`/payments/${id}`),

  /** GET /api/payments/me/credit/ledger → { entries: [...] } */
  creditLedger: ({ limit, offset } = {}) => {
    const qs = new URLSearchParams()
    if (limit  != null) qs.set('limit', String(limit))
    if (offset != null) qs.set('offset', String(offset))
    const tail = qs.toString() ? `?${qs.toString()}` : ''
    return api.get(`/payments/me/credit/ledger${tail}`)
  },

  // ── Staff (operators + admins) ──
  pendingMpesaQueue: () => api.get('/admin/payments/pending'),
  /**
   * Approve an M-Pesa payment. For WhatsApp-flow payments the server
   * requires `amountReceived` — the figure the reviewer matched on the
   * till statement; it is persisted and printed on the receipt. Pass
   * `overrideReason` when the amount is short of the invoice — server
   * requires >=10 chars and persists it on the payments row as
   * `approval_override_reason` (audit P1.2).
   */
  approve: (id, { overrideReason, amountReceived } = {}) =>
    api.post(`/admin/payments/${id}/approve`, {
      ...(overrideReason ? { override_reason: overrideReason } : {}),
      ...(amountReceived != null ? { amount_received_kes: amountReceived } : {}),
    }),
  reject: (id, reason) => api.post(`/admin/payments/${id}/reject`, { reason }),
  /** Silence the waiting-for-review reminder for one payment. */
  dismissReminder: (id) => api.post(`/admin/payments/${id}/dismiss-reminder`),
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

  /** Get pending M-Pesa payments. Server moved to /admin/payments
   *  in PR A; raw SMS + parsed fields are inlined on each row, so the
   *  separate /proof round-trip from the legacy flow is gone. */
  getPendingPayments: () => paymentsApi.pendingMpesaQueue(),
  approvePayment:    (id, opts)   => paymentsApi.approve(id, opts),
  rejectPayment:     (id, reason) => paymentsApi.reject(id, reason),

  /** Get email logs for a user */
  getUserEmails: (id) => api.get(`/admin/users/${id}/emails`),

  /** Get audit logs — paginated feed of privileged actions (provision user,
   *  reset password, edit pricing, etc.). Backed by `admin_logs` table. */
  getAuditLogs: (params = {}) => api.get('/admin/logs', { params }),

  /** AML risk queue — list flagged users/parcels by status (open by default).
   *  Resolution writes status=cleared|escalated, optional notes. */
  listAmlFlags:   (status = 'open') => api.get('/admin/aml-flags', { params: { status } }),
  resolveAmlFlag: (id, status, notes) =>
    api.patch(`/admin/aml-flags/${id}`, notes ? { status, notes } : { status }),

  /** Get error logs (paginated, filterable) */
  getErrorLogs: (params = {}) => api.get('/admin/error-logs', { params }),

  /** Get error log stats (counts for badges) */
  getErrorLogStats: () => api.get('/admin/error-logs/stats'),

  /** Clear old error logs */
  clearErrorLogs: (keepDays = 30) => api.delete('/admin/error-logs', { params: { keepDays } }),

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
// APP CONFIG — public runtime constants (support WhatsApp/email, warehouse
// code, OTP length…) driven by env vars so ops can rotate them without a
// new build. GET /api/app-config → { config: {...} }.
// ─────────────────────────────────────────────────────────────────────────────
export const appConfigApi = {
  get: () => api.get('/app-config'),
}

// ─────────────────────────────────────────────────────────────────────────────
// Default export (raw axios instance) – handy for one-off calls
// ─────────────────────────────────────────────────────────────────────────────
export { default as apiClient } from './client'

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP FLOW — unified inbox, order pipeline, settings (the lean rebuild's
// primary surfaces; everything above this line is legacy-drain only).
// ─────────────────────────────────────────────────────────────────────────────
export const waApi = {
  // Inbox
  conversations: (q = '') => api.get('/wa/conversations', { params: q ? { q } : {} }),
  conversation: (contactId) => api.get(`/wa/conversations/${contactId}`),
  messages: (contactId, before = null) =>
    api.get(`/wa/conversations/${contactId}/messages`, { params: before ? { before } : {} }),
  sendMessage: (contactId, payload) =>
    api.post(`/wa/conversations/${contactId}/messages`, payload),
  markRead: (contactId) => api.post(`/wa/conversations/${contactId}/read`),
  /** Silence the unanswered-conversation reminder for the current message. */
  dismissReminder: (contactId) => api.post(`/wa/conversations/${contactId}/dismiss-reminder`),
  setAi: (contactId, enabled) => api.post(`/wa/conversations/${contactId}/ai`, { enabled }),
  updateContact: (contactId, data) => api.put(`/wa/contacts/${contactId}`, data),
  uploadUrl: (filename, content_type) =>
    api.post('/wa/upload-url', { filename, content_type }),

  // Orders / pipeline
  orders: (params = {}) => api.get('/wa/orders', { params }),
  order: (id) => api.get(`/wa/orders/${id}`),
  /** Live quote inputs (FX rate, default margin + fee) for the KES preview. */
  quoteDefaults: () => api.get('/wa/orders/quote-defaults'),
  /** Advance many orders one step at once — each fires its own customer alert. */
  advanceBatch: (order_ids, to_status, note = null) =>
    api.post('/wa/orders/advance-batch', { order_ids, to_status, note }),
  /** Create an order. `status` drops it straight into a later stage for
   *  work that arrived mid-flight; `notify` opts into telling the customer. */
  createOrder: (contact_id, product_links = [], product_note = null, extra = {}) =>
    api.post('/wa/orders', { contact_id, product_links, product_note, ...extra }),
  /** Add someone who reached out somewhere other than WhatsApp. */
  addContact: (data) => api.post('/wa/contacts', data),
  scan: (code) => api.get(`/wa/orders/scan/${encodeURIComponent(code)}`),
  /** Tag one or many orders with the retailer's own order number. */
  setSupplierRef: (orderIds, supplierRef) =>
    api.post('/wa/orders/supplier-ref', { order_ids: orderIds, supplier_ref: supplierRef }),
  // markup_pct is per-order: 10% is a SHEIN charge (waived during the
  // promotion), and UK/Dubai weight-based orders carry none. Omit it to
  // fall back to the settings default.
  quote: (id, usd_price, markup_pct, delivery_method) =>
    api.post(`/wa/orders/${id}/quote`, { usd_price, markup_pct, delivery_method },
      { headers: { 'Idempotency-Key': newIdempotencyKey() } }),
  confirm: (id) => api.post(`/wa/orders/${id}/confirm`),
  /** Staff assign the Pickup Mtaani agent; the customer only names an area. */
  setPickupPoint: (id, pickup_point) =>
    api.patch(`/wa/orders/${id}/pickup-point`, { pickup_point }),
  /**
   * Switch an order between delivery and collection so later messages
   * fire on the right branch. Money follows: pre-payment the fee moves
   * in/out of the quote (open payment re-amounted); post-payment a
   * switch to delivery owes the fee on arrival. notify:false skips the
   * customer message.
   */
  setDeliveryMethod: (id, delivery_method, notify = true) =>
    api.patch(`/wa/orders/${id}/delivery-method`, { delivery_method, notify }),
  requestPayment: (id, { method = 'stk', purpose = 'order', phone = undefined } = {}) =>
    api.post(`/wa/orders/${id}/request-payment`, { method, purpose, phone },
      { headers: { 'Idempotency-Key': newIdempotencyKey() } }),
  advance: (id, to_status, note = null) =>
    api.post(`/wa/orders/${id}/advance`, { to_status, note }),
  waiveFee: (id) => api.post(`/wa/orders/${id}/waive-fee`),
  /**
   * Staff: record a manual M-Pesa payment against whatever the order
   * owes. `amount_received_kes` is what the reviewer saw on the till
   * statement; a short amount needs `override_reason` (>=10 chars).
   */
  markPaid: (id, { mpesa_reference = null, note = null, amount_received_kes = null, override_reason = null } = {}) =>
    api.post(`/wa/orders/${id}/mark-paid`, {
      mpesa_reference, note,
      ...(amount_received_kes != null ? { amount_received_kes } : {}),
      ...(override_reason ? { override_reason } : {}),
    }, { headers: { 'Idempotency-Key': newIdempotencyKey() } }),
  receiptUrl: (id) => api.get(`/wa/orders/${id}/receipt`),
  resendReceipt: (id) => api.post(`/wa/orders/${id}/receipt/resend`),

  // Settings
  settings: () => api.get('/wa/settings'),
  saveSettings: (data) => api.put('/wa/settings', data),
}

// WhatsApp webhook diagnostics (admin) — server-side sent.dm inspection.
export const waWebhookApi = {
  status: () => api.get('/wa/settings/webhook-status'),
  repair: () => api.post('/wa/settings/webhook-repair'),
}
