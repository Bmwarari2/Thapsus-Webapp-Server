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
// CUSTOMER INVOICES — read-only list of the signed-in user's customer
// consolidations (the invoiceable batches). Mirror of iOS CustomerInvoicesView.
// ─────────────────────────────────────────────────────────────────────────────
export const customerInvoicesApi = {
  /** GET /api/customer-consolidations/me → { customer_consolidations: [...] } */
  listMine: () => api.get('/customer-consolidations/me'),
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT DELETION (14-day cooldown). Mirror of iOS AccountDeletionView.
// ─────────────────────────────────────────────────────────────────────────────
export const accountDeletionApi = {
  /** GET — current request (or null) */
  status:        () => api.get('/account/deletion-request'),
  /** POST — start the 14-day cooldown, build + email export */
  request:       () => api.post('/account/deletion-request'),
  /** DELETE — cancel an active request */
  cancel:        (reason) =>
    api.delete('/account/deletion-request', reason ? { data: { reason } } : undefined),
  /** GET — refresh the signed download URL when the previous one expires */
  refreshExport: () => api.get('/account/deletion-request/export'),
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
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICING  →  POST /api/pricing/calculate  |  GET /api/pricing/exchange-rates
// ─────────────────────────────────────────────────────────────────────────────
export const pricingApi = {
  /**
   * Calculate shipping cost estimate.
   * @param {number} weight_kg
   * @param {object} dimensions      - { length, width, height } in cm
   * @param {string} shipping_speed  - 'economy' | 'express'
   * @param {object|boolean} insurance - boolean or { enabled, declaredValue }
   * @param {string|null} electronics_item - electronics category key or null
   */
  calculate: (weight_kg, dimensions, shipping_speed, insurance, declared_value_or_electronics = null, electronics_item = null) => {
    // Normalise: PricingCalculator passes insurance as { enabled, declaredValue } + electronics as 5th arg
    //            Pricing.jsx passes insurance as boolean + declared_value as 5th + electronics as 6th
    const isInsuranceObj = insurance && typeof insurance === 'object'
    const insuranceBool  = isInsuranceObj ? !!insurance.enabled : !!insurance
    let declaredValue    = 0
    let electronicsKey   = electronics_item

    if (isInsuranceObj) {
      // PricingCalculator style: 5th arg is electronics_item
      declaredValue  = insurance.declaredValue || 0
      electronicsKey = declared_value_or_electronics || null
    } else {
      // Pricing.jsx style: 5th arg is declared_value, 6th is electronics_item
      declaredValue  = typeof declared_value_or_electronics === 'number' ? declared_value_or_electronics : 0
      electronicsKey = electronics_item || null
    }

    return api.post('/pricing/calculate', {
      weight_kg,
      dimensions,
      shipping_speed,
      insurance: insuranceBool,
      declared_value: declaredValue,
      electronics_item: electronicsKey,
    })
  },

  /** Get current USD/GBP/CNY → KES exchange rates */
  getExchangeRates: () => api.get('/exchange/rates'),

  /**
   * Six-knob pricing model (migration 051):
   *   getSettings()       → { base_shipping_per_kg, base_handling_fee,
   *                            card_processing_pct, dim_divisor }
   *   updateSettings(p)   → admin PUT — body shape { settings: { key: value, ... } }
   *   getCustomsTiers()   → public read of duty/VAT/IDF/RDL bands
   *   updateCustomsTiers(map) → admin PUT — body { tiers: { tier_key: {...} } }
   *   getHsCodes()        → array of { hs_prefix, tier_key }
   *   updateHsCodes(p)    → admin PUT — body { upsert: [...], remove: [...] }
   */
  getSettings:       ()    => api.get('/pricing/settings'),
  updateSettings:    (p)   => api.put('/pricing/settings',      { settings: p }),
  getCustomsTiers:   ()    => api.get('/pricing/hs-tiers'),
  updateCustomsTiers:(t)   => api.put('/pricing/customs-tiers', { tiers: t }),
  getHsCodes:        ()    => api.get('/pricing/hs-codes'),
  updateHsCodes:     (p)   => api.put('/pricing/hs-codes',      p),
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
   *
   * A per-submission idempotency key rides along in the body. If the request
   * fails without a response (timeout / dropped socket) the offline outbox
   * replays it verbatim on reconnect — the key lets the server coalesce that
   * replay to the original ticket instead of creating a duplicate.
   */
  createTicket: (subject, description, file = null) => {
    const idempotencyKey = newIdempotencyKey()
    if (file) {
      const form = new FormData()
      form.append('subject', subject)
      form.append('description', description)
      form.append('photo', file)
      form.append('idempotency_key', idempotencyKey)
      return api.post('/tickets', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    }
    return api.post('/tickets', { subject, description, idempotency_key: idempotencyKey })
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
// FRAMEWORK v2 — new modules
// ─────────────────────────────────────────────────────────────────────────────

/** Consolidations v2 — operator-facing weekly flight units */
export const consolidationsApi = {
  current:      ()             => api.get('/consolidations/current'),
  list:         (params = {})  => api.get('/consolidations', { params }),
  create:       (data)         => api.post('/consolidations', data),
  get:          (id)           => api.get(`/consolidations/${id}`),
  update:       (id, data)     => api.patch(`/consolidations/${id}`, data),
  assignParcel: (id, parcelId) => api.post(`/consolidations/${id}/assign-parcel`, { parcel_id: parcelId }),
  removeParcel: (id, parcelId) => api.post(`/consolidations/${id}/remove-parcel`, { parcel_id: parcelId }),
  addPallet:    (id, data)     => api.post(`/consolidations/${id}/pallets`, data),
  manifest:     (id)           => api.post(`/consolidations/${id}/manifest`),
}

/** Customs / clearing-agent portal */
export const customsApi = {
  agentConsolidations: ()       => api.get('/customs/agent/consolidations'),
  agentParcels:        (consId) => api.get(`/customs/agent/consolidations/${consId}/parcels`),
  createEntry:         (data)   => api.post('/customs/entries', data),
  updateEntry:         (id,d)   => api.patch(`/customs/entries/${id}`, d),
  listEntries:         (params={}) => api.get('/customs/entries', { params }),
  submitInvoice:       (data)   => api.post('/customs/agent-invoices', data),
  listInvoices:        ()       => api.get('/customs/agent-invoices'),
  approveInvoice:      (id, st) => api.patch(`/customs/agent-invoices/${id}`, { status: st }),
}

/** Last-mile dispatch + rider PWA */
export const lastMileApi = {
  dispatch:    ()                  => api.get('/last-mile/dispatch'),
  riders:      ()                  => api.get('/last-mile/riders'),
  createRun:   (data)              => api.post('/last-mile/runs', data),
  updateRun:   (id, data)          => api.patch(`/last-mile/runs/${id}`, data),
  riderToday:  ()                  => api.get('/last-mile/rider/today'),
  pod:         (runId, data)       => api.post(`/last-mile/rider/runs/${runId}/pod`, data),
  failPod:     (runId, parcelId, reason) =>
    api.post(`/last-mile/rider/runs/${runId}/fail`, { parcel_id: parcelId, reason }),
  // Audit P3.1: pods bucket is private (migration 015), so the rider
  // PWA cannot just paste a URL. Server mints a 5-min signed-upload URL
  // into pod/<parcel_id>/<ts>.jpg via /last-mile/pod/upload-url; the
  // browser PUTs the JPEG bytes directly. POD submit then sends
  // `photo_path` (not photo_url) — server keys reads on the path,
  // not the throwaway signed URL.
  podUploadUrl:   (parcelId, kind = 'photo') =>
    api.post('/last-mile/pod/upload-url', { parcel_id: parcelId, kind }),
  podDocumentUrl: (parcelId, kind = 'photo') =>
    api.post('/last-mile/pod/document-url', { parcel_id: parcelId, kind }),
}

/** Founder KPI dashboard */
export const kpiApi = {
  summary:   () => api.get('/kpi'),
  marketing: () => api.get('/kpi/marketing'),
}

/** GDPR DSAR */
export const dsarApi = {
  create:    (type, notes) => api.post('/dsar', { type, notes }),
  mine:      ()            => api.get('/dsar/me'),
  queue:     ()            => api.get('/dsar/queue'),
  update:    (id, data)    => api.patch(`/dsar/${id}`, data),
  export:    (id)          => api.post(`/dsar/${id}/export`),
}

/** Curated retailers catalog (PR 4 / migration 029). Backs the BFM picker. */
export const retailersApi = {
  list: () => api.get('/retailers'),
}

/** Buy-for-me concierge */
export const buyForMeApi = {
  create:    (data)         => api.post('/buy-for-me', data),
  mine:      ()             => api.get('/buy-for-me'),
  queue:     ()             => api.get('/buy-for-me/queue'),
  update:    (id, data)     => api.patch(`/buy-for-me/${id}`, data),
  // Operator: submit a quote (also fires the customer's "quote ready" email).
  quote:     (id, data)     => api.post(`/buy-for-me/${id}/quote`, data),
  // Customer accept (debits wallet) / reject (with reason).
  accept:    (id, reason)   => api.post(`/buy-for-me/${id}/accept`, { reason }),
  reject:    (id, reason)   => api.post(`/buy-for-me/${id}/reject`, { reason }),
  cancel:    (id)           => api.post(`/buy-for-me/${id}/cancel`),
  // Operator/admin: decline a request with a reason (shown to the customer).
  adminReject: (id, reason) => api.post(`/buy-for-me/${id}/admin-reject`, { reason }),
  // Operator/admin: offer an alternative product when the item is unavailable.
  suggestAlternative: (id, data) => api.post(`/buy-for-me/${id}/suggest-alternative`, data),
  // Customer responses to an alternative offer.
  alternativeAccept:  (id)         => api.post(`/buy-for-me/${id}/alternative/accept`),
  alternativeDecline: (id, reason) => api.post(`/buy-for-me/${id}/alternative/decline`, { reason }),
  alternativeCounter: (id, retailer_url) => api.post(`/buy-for-me/${id}/alternative/counter`, { retailer_url }),
  /** Admin: create a BFM on behalf of a customer (e.g. WhatsApp order).
   *  Optionally pre-quote in the same call so the customer can pay
   *  immediately without waiting for an operator round-trip. */
  adminCreate: (data) => api.post('/buy-for-me/admin-create', data),
}

/** Operator console */

/** Editable pricing tiers + fees + promotions */
export const pricingTiersApi = {
  listTiers:        ()                => api.get('/pricing-tiers/tiers'),
  createTier:       (data)            => api.post('/pricing-tiers/tiers', data),
  updateTier:       (id, data)        => api.patch(`/pricing-tiers/tiers/${id}`, data),
  listFees:         ()                => api.get('/pricing-tiers/fees'),
  updateFee:        (id, data)        => api.patch(`/pricing-tiers/fees/${id}`, data),
  listPromotions:   ()                => api.get('/pricing-tiers/promotions'),
  createPromotion:  (data)            => api.post('/pricing-tiers/promotions', data),
  validatePromotion:(code)            => api.post('/pricing-tiers/promotions/validate', { code }),
}

/**
 * Notifications inbox — backed by routes/notifications.js. Same surface
 * the iOS app's inbox view consumes; the webapp page lives at
 * /notifications.
 */
export const notificationsApi = {
  /** GET /api/notifications?limit=&offset= → { notifications[], unread } */
  list:       (params = {}) => api.get('/notifications', { params }),
  /** PUT /api/notifications/:id/read */
  markRead:   (id)          => api.put(`/notifications/${id}/read`),
  /** PUT /api/notifications/read-all */
  markAllRead: ()           => api.put('/notifications/read-all'),
}

/** NPS responses */
export const npsApi = {
  submit:    (score, comment, parcelId) =>
    api.post('/nps', { score, comment, parcel_id: parcelId }),
  summary:   () => api.get('/nps/summary'),
  // Returns the open invitations for the caller — server flips
  // responded_at on submit so this list shrinks naturally. Used by
  // <NpsAutoPrompt> on the customer dashboard.
  pending:   () => api.get('/nps/pending'),
}

/**
 * Customer-consolidations — per-user grouping of parcels with one shared
 * invoice. Admin-only writes; the customer-side read uses Supabase
 * realtime via the iOS client.  See routes/customerConsolidations.js
 * for endpoint behaviour.
 */
export const customerConsolidationsApi = {
  /** GET /api/customer-consolidations  — filters: { user_id, status, shipping_consolidation_id }. */
  list:      (params = {}) => api.get('/customer-consolidations', { params }),
  /** POST /api/customer-consolidations  — { user_id, parcel_ids[], notes? }. */
  create:    (data)        => api.post('/customer-consolidations', data),
  /** PATCH /api/customer-consolidations/:id/invoice  — { amount, currency? }. */
  setInvoice:(id, amount, currency) =>
    api.patch(`/customer-consolidations/${id}/invoice`, { amount, currency }),
  /** GET /api/customer-consolidations/:id/suggested-invoice — admin invoice prefill. */
  suggestedInvoice: (id) => api.get(`/customer-consolidations/${id}/suggested-invoice`),
  /** POST /api/customer-consolidations/standalone-invoice — admin one-off invoice (PR 5). */
  issueStandaloneInvoice: (data) => api.post('/customer-consolidations/standalone-invoice', data),
  /** POST /api/customer-consolidations/:id/mark-paid  — admin marks invoice settled. */
  markPaid:  (id)          => api.post(`/customer-consolidations/${id}/mark-paid`),
  /** POST /api/customer-consolidations/attach-to-shipping/:shippingId  — { customer_consolidation_ids[] }. */
  attachToShipping: (shippingId, customerConsolidationIds) =>
    api.post(`/customer-consolidations/attach-to-shipping/${shippingId}`, {
      customer_consolidation_ids: customerConsolidationIds,
    }),
}

// ─────────────────────────────────────────────────────────────────────────────
// WEB PUSH  →  /api/push/*
// ─────────────────────────────────────────────────────────────────────────────
export const pushApi = {
  /** VAPID public key + whether push is configured server-side. */
  publicKey:   ()    => api.get('/push/public-key'),
  /** Store a PushSubscription (JSON from PushManager.subscribe). */
  subscribe:   (sub) => api.post('/push/subscribe', sub),
  /** Remove a subscription by endpoint. */
  unsubscribe: (endpoint) => api.post('/push/unsubscribe', { endpoint }),
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCE MANAGEMENT  →  /api/finance/*   (selected-admin only)
// All amounts are MINOR units (GBP pence / KES cents); divide by 100 for display.
// ─────────────────────────────────────────────────────────────────────────────
export const financeApi = {
  overview:      (currency = 'GBP') => api.get('/finance/overview', { params: { currency } }),

  listTransactions:  (params = {}) => api.get('/finance/transactions', { params }),
  createTransaction: (data)        => api.post('/finance/transactions', data),
  updateTransaction: (id, data)    => api.patch(`/finance/transactions/${id}`, data),
  voidTransaction:   (id)          => api.post(`/finance/transactions/${id}/void`),

  listCategories: ()       => api.get('/finance/categories'),
  createCategory: (data)   => api.post('/finance/categories', data),
  updateCategory: (id, d)  => api.patch(`/finance/categories/${id}`, d),

  listAccounts:    ()      => api.get('/finance/accounts'),
  accountBalances: ()      => api.get('/finance/accounts/balances'),
  createAccount:   (data)  => api.post('/finance/accounts', data),
  updateAccount:   (id, d) => api.patch(`/finance/accounts/${id}`, d),

  listTaxCodes:  ()        => api.get('/finance/tax/codes'),
  createTaxCode: (data)    => api.post('/finance/tax/codes', data),
  updateTaxCode: (id, d)   => api.patch(`/finance/tax/codes/${id}`, d),

  listTaxPeriods:  ()      => api.get('/finance/tax/periods'),
  createTaxPeriod: (data)  => api.post('/finance/tax/periods', data),
  updateTaxPeriod: (id, d) => api.patch(`/finance/tax/periods/${id}`, d),

  reportPnl:      (params = {}) => api.get('/finance/reports/pnl', { params }),
  reportCashflow: (params = {}) => api.get('/finance/reports/cashflow', { params }),
  reportTax:      (params = {}) => api.get('/finance/reports/tax', { params }),
  exportReport:   (type, params = {}) =>
    api.get(`/finance/reports/${type}/export`, { params: { ...params, format: 'csv' }, responseType: 'blob' }),

  sync: () => api.post('/finance/sync'),
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
// INFLUENCER REFERRALS — admin-generated codes handed to marketing
// influencers (no account of their own). Public landing/signup + admin CRUD.
// ─────────────────────────────────────────────────────────────────────────────
export const influencerApi = {
  // ── Public (landing page) ──────────────────────────────────────────────
  /** GET /api/influencer/:code → { valid, influencer_name } */
  lookup: (code) => api.get(`/influencer/${encodeURIComponent(code)}`),
  /** POST /api/influencer/:code/visit — record a rich link open, returns { visit_id } */
  visit: (code) => api.post(`/influencer/${encodeURIComponent(code)}/visit`),
  /** POST /api/influencer/:code/click — legacy counter bump (fire-and-forget) */
  click: (code) => api.post(`/influencer/${encodeURIComponent(code)}/click`),
  /** POST /api/influencer/:code/signup — create account + submit item links */
  signup: (code, payload) => api.post(`/influencer/${encodeURIComponent(code)}/signup`, payload),

  // ── Admin ──────────────────────────────────────────────────────────────
  list:    () => api.get('/admin/influencers'),
  get:     (code) => api.get(`/admin/influencers/${encodeURIComponent(code)}`),
  create:  (payload) => api.post('/admin/influencers', payload),
  update:  (code, payload) => api.patch(`/admin/influencers/${encodeURIComponent(code)}`, payload),
  markPaid: (conversionId, paid = true, note = null) =>
    api.post(`/admin/influencers/conversions/${encodeURIComponent(conversionId)}/pay`, { paid, note }),
  /** POST /api/admin/influencers/:code/account — provision + invite a dashboard login */
  provisionAccount: (code, payload) => api.post(`/admin/influencers/${encodeURIComponent(code)}/account`, payload),
}

// ─────────────────────────────────────────────────────────────────────────────
// INFLUENCER PORTAL — the influencer's own self-serve analytics dashboard
// (role=influencer). One call returns KPIs, per-link, time-series, locations.
// ─────────────────────────────────────────────────────────────────────────────
export const influencerPortalApi = {
  dashboard: (days) => api.get('/influencer-portal/dashboard', { params: days ? { days } : {} }),
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
  setAi: (contactId, enabled) => api.post(`/wa/conversations/${contactId}/ai`, { enabled }),
  updateContact: (contactId, data) => api.put(`/wa/contacts/${contactId}`, data),
  uploadUrl: (filename, content_type) =>
    api.post('/wa/upload-url', { filename, content_type }),

  // Orders / pipeline
  orders: (params = {}) => api.get('/wa/orders', { params }),
  order: (id) => api.get(`/wa/orders/${id}`),
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
