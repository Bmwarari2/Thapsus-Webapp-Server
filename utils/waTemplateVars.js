// utils/waTemplateVars.js
//
// Bridges our named template params onto sent.dm's positional variables.
//
// The approved WhatsApp templates take `var_1`, `var_2`, … in body order —
// the console names them that way and Meta approved them that way, so the
// names carry no meaning and the ORDER is the whole contract. Our senders
// pass meaningful names (`full_name`, `total_kes`) because a call site
// reading `{ var_2: code }` is a bug waiting to happen.
//
// This module is the one place that knows which of our fields fills which
// slot. Getting an order wrong here puts a customer's name where the money
// should be, so each mapping is written next to the approved body text it
// fills, and tests/unit/waTemplateVars.test.js pins them.
//
// A logical key with no entry here sends its named params through
// untouched — harmless for templates whose variables really are named,
// and irrelevant for the free-text fallback.

/**
 * key -> { body, vars } where `vars` lists our field names in var_1..var_N
 * order. `body` is the approved copy, kept verbatim as documentation.
 */
export const TEMPLATE_SLOTS = {
  quote: {
    body: 'Hi {{1}}, your quote for order {{2}} is ready: KES {{3}} all inclusive. Reply to accept and pay.',
    vars: ['full_name', 'order_ref', 'total_kes'],
  },
  payment_prompt: {
    body: 'Hi {{1}}, order {{2}} is still awaiting payment of KES {{3}}. The quote expires {{4}}, after which the price may change.',
    vars: ['full_name', 'order_ref', 'total_kes', 'expires_at'],
  },
  payment_received: {
    body: 'Thanks {{1}} — we have received KES {{2}} for order {{3}}. We are placing your order now.',
    vars: ['full_name', 'total_kes', 'order_ref'],
  },
  purchased: {
    body: 'Good news {{1}} — we have bought the items for order {{2}}. Next stop: shipping to Kenya.',
    vars: ['full_name', 'order_ref'],
  },
  delivered: {
    body: 'Order {{1}} has been delivered. Thanks for shopping with us, {{2}} — how did we do?',
    vars: ['order_ref', 'full_name'],
  },
};

/**
 * Convert named params into the positional shape sent.dm expects.
 *
 * Every declared slot is filled: WhatsApp rejects a template with a
 * missing variable, and an empty string is a far better failure than a
 * bounced message, so a blank falls back to a readable placeholder.
 *
 * @param {string} templateKey  logical key ('quote', 'delivered', …)
 * @param {object} named        our params, e.g. { full_name, order_ref }
 * @returns {object}            { var_1: '…', var_2: '…' } or `named` untouched
 */
export function toPositionalParams(templateKey, named = {}) {
  const slot = TEMPLATE_SLOTS[templateKey];
  if (!slot) return named;

  const out = {};
  slot.vars.forEach((field, i) => {
    const v = named[field];
    out[`var_${i + 1}`] = v == null || v === '' ? FALLBACK[field] || '—' : String(v);
  });
  return out;
}

// What to say when a field is genuinely absent — an order with no tracking
// code yet, a customer who never gave a name. Never leave it blank.
const FALLBACK = {
  full_name: 'there',
  order_ref: 'your order',
  total_kes: '0',
  expires_at: 'soon',
};

/** The fields a caller must supply for a key, for tests and call sites. */
export function requiredFields(templateKey) {
  return TEMPLATE_SLOTS[templateKey]?.vars ?? [];
}
