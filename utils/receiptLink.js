// utils/receiptLink.js
//
// Short, shareable receipt links. Supabase signed URLs are ~600
// characters of JWT — on WhatsApp that arrives as a wall of green text
// nobody wants to tap. Instead we send
//
//     https://thapsus.uk/r/TRK-8821.k3n9x2qp4a
//
// and routes/receiptRedirect.js swaps it for a freshly signed URL at
// click time. Two side benefits: the link never expires (we mint a new
// signature on each visit, so a 7-day-old WhatsApp message still works),
// and rotating JWT_SECRET invalidates every outstanding link.
//
// The token is stateless — tracking code plus a truncated HMAC over the
// order id — so there is no column to migrate and no row to clean up.
// It is unguessable, which is what matters: receipts carry the
// customer's name and delivery address.

import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET || '';
const SIG_LEN = 12; // base64url chars ≈ 72 bits — far past guessing

function signature(orderId) {
  return crypto.createHmac('sha256', SECRET)
    .update(`wa-receipt:${orderId}`)
    .digest('base64url')
    .slice(0, SIG_LEN);
}

/**
 * Public site origin. Prefers the explicit vars, and drops a leading
 * `www.` — that host isn't served (it's what broke the sent.dm webhook
 * registration), so a receipt link pointing at it would 404.
 */
export function publicBaseUrl() {
  const raw = process.env.PUBLIC_BASE_URL || process.env.SITE_URL
    || process.env.APP_URL || process.env.FRONTEND_URL || 'https://thapsus.uk';
  return String(raw).trim().replace(/\/+$/, '').replace(/^(https?:\/\/)www\./i, '$1');
}

/**
 * @param {{id: string, tracking_code: string|null}} order
 * @returns {string|null} the short URL, or null if the order has no
 *   tracking code yet (nothing to name the link after).
 */
export function receiptShortUrl(order) {
  const token = receiptToken(order);
  return token ? `${publicBaseUrl()}/r/${token}` : null;
}

/**
 * Just the `TRK-8821.k3n9x2qp4a` part, with no origin in front.
 *
 * The approved WhatsApp template writes the domain itself — "…ready at
 * thapsus.uk/r/{{2}}" — because Meta will not approve a body that ends in
 * a variable, and a hardcoded domain reads as more trustworthy than a
 * variable that is nothing but a URL. So the template gets the token and
 * the free-text fallback still gets the whole link.
 *
 * @param {{id: string, tracking_code: string|null}} order
 * @returns {string|null} null when there is no tracking code to name it after.
 */
export function receiptToken(order) {
  if (!order?.id || !order?.tracking_code || !SECRET) return null;
  return `${order.tracking_code}.${signature(order.id)}`;
}

/**
 * Split `TRK-8821.k3n9x2qp4a` into its parts. Returns null on anything
 * malformed so the route can 404 without touching the database.
 */
export function parseReceiptToken(token) {
  const m = /^([A-Za-z0-9-]{3,32})\.([A-Za-z0-9_-]{8,64})$/.exec(String(token || ''));
  if (!m) return null;
  return { trackingCode: m[1].toUpperCase(), signature: m[2] };
}

/** Constant-time check that `sig` belongs to `orderId`. */
export function verifyReceiptToken(orderId, sig) {
  if (!SECRET || !orderId || !sig) return false;
  const expected = Buffer.from(signature(orderId));
  const given = Buffer.from(String(sig));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
