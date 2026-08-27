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

  // The four below cover the stages that had no approved template at all,
  // which meant they could only ever go out as free text — and free text
  // is refused once the customer's 24-hour window shuts. Arrival and
  // dispatch land two to three weeks after a customer last writes to us,
  // so in practice those two could never be delivered to anyone.
  //
  // Declared here ahead of approval so that mapping them in Settings is
  // the only remaining step. Until a key appears in wa_settings
  // template_map nothing reads these, so they are inert.
  arrived_waived: {
    body: 'Your parcel {{1}} has arrived in Kenya. Good news: your delivery fee is on us. We will dispatch it to your address shortly.',
    vars: ['tracking_code'],
  },
  arrived_fee: {
    body: 'Your parcel {{1}} has arrived in Kenya. Last step: a delivery fee of KES {{2}} gets it to your door. Pay on M-Pesa Buy Goods, Till 5530500, then reply here and we will confirm it.',
    vars: ['tracking_code', 'fee_kes'],
  },
  // The two normal arrivals now that the last-mile fee is collected with
  // the order. 'arrived_waived' stays for the promo case, but it says
  // "your delivery fee is on us", which is untrue of a customer who
  // already paid it and meaningless to one who is collecting.
  arrived_paid: {
    body: 'Your parcel {{1}} has arrived in Kenya. Your delivery was paid with your order, so nothing more is due. We will send it on to you shortly.',
    vars: ['tracking_code'],
  },
  arrived_collect: {
    body: 'Your parcel {{1}} has arrived and is ready to collect at Stanbank House, 4th floor, room 28, Nairobi CBD. We are open Monday to Saturday, and closed on Sunday.',
    vars: ['tracking_code'],
  },
  dispatched: {
    body: 'Your parcel {{1}} is out for delivery to your address. Expect it within 24 hours. Our rider will call you on arrival.',
    vars: ['tracking_code'],
  },
  receipt: {
    // The domain is written into the approved body, so this takes the
    // bare token — Meta rejects a body that ends in a variable, which is
    // what a trailing full URL would have been.
    body: 'Your receipt for order {{1}} is ready at thapsus.uk/r/{{2}} — keep it for your records.',
    vars: ['tracking_code', 'receipt_token'],
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
  tracking_code: 'your parcel',
  fee_kes: '0',
  // No sensible stand-in for a link. An order without a tracking code has
  // no receipt to point at, and these templates only fire after payment,
  // so this should never be reached.
  receipt_token: '—',
};

/** The fields a caller must supply for a key, for tests and call sites. */
export function requiredFields(templateKey) {
  return TEMPLATE_SLOTS[templateKey]?.vars ?? [];
}

/**
 * The message a template send actually puts on the customer's phone, with
 * the variables filled in. Used for the transcript: wa_messages.body used
 * to store the free-text fallback even when a template was sent, so the
 * inbox showed staff a message the customer never received — a customer
 * saying "you never sent the till number" while the transcript showed it.
 *
 * @returns {string|null} the rendered body, or null for an unknown key
 *   (the caller keeps its free-text copy — that IS what was sent).
 */
export function renderTemplateBody(templateKey, named = {}) {
  const slot = TEMPLATE_SLOTS[templateKey];
  if (!slot) return null;
  const pos = toPositionalParams(templateKey, named);
  return slot.body.replace(/\{\{(\d+)\}\}/g, (_, n) => pos[`var_${n}`] ?? '');
}
