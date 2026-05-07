// utils/lipanaClient.js
//
// Minimal client for Lipana's M-Pesa STK Push API (lipana.dev).
//
// Two callsites:
//   1. routes/payments.js — POST /transactions/push-stk on payment create
//      when method=mpesa && provider=lipana.
//   2. routes/payments.js — verifyWebhookSignature on the inbound
//      /payments/lipana/webhook handler (HMAC-SHA256 of raw body).
//
// No new npm dep — Node 22 covers `fetch` and `node:crypto`. Per
// reference_backend_deploy.md we also keep the `globalThis.crypto`
// polyfill in place (loaded via polyfills/webcrypto.js as the first
// import in server.js), so the createHmac path is safe even if a
// future library route accidentally reads `globalThis.crypto.subtle`
// on a Node-version-drift environment.

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Custom error so the route layer can map Lipana failures to a clean 502. */
export class LipanaError extends Error {
  constructor(message, { status = 502, code = 'lipana_error', body = null } = {}) {
    super(message);
    this.name = 'LipanaError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function readApiKey() {
  const key = process.env.LIPANA_API_KEY;
  if (!key) {
    throw new LipanaError(
      'LIPANA_API_KEY is not configured. Set it on Railway before serving STK Push.',
      { status: 503, code: 'lipana_not_configured' }
    );
  }
  return key;
}

function readBaseUrl() {
  const raw = process.env.LIPANA_BASE_URL || 'https://api.lipana.dev/v1';
  return raw.replace(/\/+$/, '');
}

function readWebhookSecret() {
  const secret = process.env.LIPANA_WEBHOOK_SECRET;
  if (!secret) {
    throw new LipanaError(
      'LIPANA_WEBHOOK_SECRET is not configured.',
      { status: 503, code: 'lipana_webhook_not_configured' }
    );
  }
  return secret;
}

/**
 * Normalise Kenyan phone formats to 254XXXXXXXXX (no plus, no spaces).
 * Accepts: +254712345678, 254712345678, 0712345678, 0112345678,
 *          " 254 712 345 678 ".
 * Returns: '254712345678' or null on invalid input.
 */
export function normalizeKenyanPhone(input) {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/[\s+\-()]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  let digits;
  if (cleaned.startsWith('254')) {
    digits = cleaned;
  } else if (cleaned.startsWith('0')) {
    digits = '254' + cleaned.slice(1);
  } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
    digits = '254' + cleaned;
  } else {
    return null;
  }
  // 254 + 9 digits = 12. Safaricom mobile prefixes are 7xx and 1xx.
  if (digits.length !== 12) return null;
  if (!/^254[71]\d{8}$/.test(digits)) return null;
  return digits;
}

/**
 * Initiate an STK Push.
 *
 * @param {object} args
 * @param {string} args.phone        — normalized 254XXXXXXXXX.
 * @param {number} args.amountKes    — integer KES; Lipana enforces >= 10.
 * @param {string} args.idempotencyKey — our payment.id; round-trips so
 *                                       a transient retry of this call
 *                                       doesn't double-prompt the
 *                                       customer. Lipana's docs don't
 *                                       advertise an idempotency header
 *                                       yet, so we send it as
 *                                       `Idempotency-Key` (no-op on
 *                                       their side today, future-proof).
 *
 * @returns {Promise<{
 *   transactionId: string,
 *   checkoutRequestID: string,
 *   status: string,
 *   message: string,
 *   raw: object
 * }>}
 *
 * @throws {LipanaError} on network failure or non-2xx Lipana response.
 */
export async function initiateStkPush({ phone, amountKes, idempotencyKey }) {
  if (!phone || typeof phone !== 'string') {
    throw new LipanaError('phone is required', { status: 400, code: 'invalid_phone' });
  }
  if (!Number.isFinite(amountKes) || amountKes < 10) {
    throw new LipanaError(
      'M-Pesa STK push requires a minimum of KES 10.',
      { status: 400, code: 'amount_too_small' }
    );
  }
  const apiKey  = readApiKey();
  const baseUrl = readBaseUrl();

  let resp;
  try {
    resp = await fetch(`${baseUrl}/transactions/push-stk`, {
      method: 'POST',
      headers: {
        'x-api-key':       apiKey,
        'Content-Type':    'application/json',
        'Accept':          'application/json',
        // Round-trip our payment id so Lipana's logs can be cross-
        // referenced in support tickets. Harmless if unrecognised.
        'Idempotency-Key': idempotencyKey || '',
      },
      body: JSON.stringify({
        phone:  `+${phone}`,           // Lipana docs example uses +254…
        amount: Math.round(amountKes), // integer; their min is 10
      }),
    });
  } catch (e) {
    throw new LipanaError(`Lipana network error: ${e.message}`, {
      status: 502, code: 'lipana_network',
    });
  }

  let body = null;
  try { body = await resp.json(); } catch { /* leave null */ }

  if (!resp.ok || !body || body.success === false) {
    const msg = body?.message || `Lipana STK push failed (HTTP ${resp.status})`;
    throw new LipanaError(msg, {
      status: resp.status >= 500 ? 502 : 400,
      code:   body?.error || 'lipana_stk_failed',
      body,
    });
  }

  const data = body.data || {};
  const transactionId     = data.transactionId     || data.transaction_id;
  const checkoutRequestID = data.checkoutRequestID || data.checkout_request_id;
  if (!transactionId || !checkoutRequestID) {
    throw new LipanaError(
      'Lipana response missing transactionId / checkoutRequestID',
      { status: 502, code: 'lipana_bad_response', body }
    );
  }

  return {
    transactionId,
    checkoutRequestID,
    status:  data.status  || 'pending',
    message: data.message || body.message || 'STK push sent.',
    raw:     body,
  };
}

/**
 * Verify the X-Lipana-Signature header on an inbound webhook.
 *
 * @param {Buffer|string} rawBody — exactly what Lipana POSTed; mount the
 *                                   route under express.raw() so we get
 *                                   the bytes BEFORE express.json()
 *                                   touches them. Same recipe as the
 *                                   Stripe webhook in server.js.
 * @param {string} signatureHeader — value of `X-Lipana-Signature`.
 *
 * @returns {boolean}
 */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!signatureHeader || typeof signatureHeader !== 'string') return false;
  const secret = readWebhookSecret();
  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const expected = createHmac('sha256', secret).update(payload).digest('hex');

  // timingSafeEqual requires equal-length buffers; bail fast on length
  // mismatch so we don't leak via the comparator throwing.
  const got = Buffer.from(signatureHeader, 'utf8');
  const exp = Buffer.from(expected, 'utf8');
  if (got.length !== exp.length) return false;
  try {
    return timingSafeEqual(got, exp);
  } catch {
    return false;
  }
}
