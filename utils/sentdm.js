// utils/sentdm.js
//
// Minimal client for the sent.dm v3 messaging API (WhatsApp channel).
// Every provider-specific assumption lives HERE — if sent.dm changes an
// endpoint or payload shape, this is the only file that should need to
// move. Shapes verified against the official SDK (@sentdm/sentdm 0.33.0,
// generated from their OpenAPI spec) and the @sentdm/n8n-nodes-sent
// webhook verifier:
//
//   • Auth: `x-api-key: sk_live_*` header, base https://api.sent.dm
//   • Send: POST /v3/messages
//       { to: ["+2547…"], channel: ["whatsapp"],
//         text: "…" | template: { name, parameters: {k: v} } }
//       + optional `Idempotency-Key` header (cached 24h per key).
//       202 envelope: { success, data: { status: "QUEUED",
//                       recipients: [{ message_id, to, channel }] } }
//       NOTE: v3 has no free-form media — images/PDFs ride on a template
//       with a media header whose URL is a template parameter.
//   • Read:  GET /v3/messages/{id} → { data: { phone, direction, status,
//       message_body: { content, … }, … } } — used to hydrate inbound
//       messages, since webhook payloads only carry ids reliably.
//   • Webhook: headers x-webhook-id / x-webhook-timestamp /
//       x-webhook-signature; signature = "v1," + base64(HMAC-SHA256(
//       base64decode(secret minus "whsec_"), `${id}.${ts}.` + rawBody));
//       ±300s timestamp tolerance. Event JSON: { field: "message",
//       event|sub_type: "message.*", timestamp, payload: { message_id,
//       message_status?, … } }.
//
// No npm dep — Node 22 fetch + node:crypto, same as lipanaClient.js.

import { createHmac, timingSafeEqual } from 'node:crypto';

const WEBHOOK_TOLERANCE_SECONDS = 300;

/** Custom error so route layers can map sent.dm failures to clean 502s. */
export class SentDmError extends Error {
  constructor(message, { status = 502, code = 'sentdm_error', body = null } = {}) {
    super(message);
    this.name = 'SentDmError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function readApiKey() {
  const key = process.env.SENTDM_API_KEY;
  if (!key) {
    throw new SentDmError(
      'SENTDM_API_KEY is not configured. Set it on Railway before serving WhatsApp flows.',
      { status: 503, code: 'sentdm_not_configured' }
    );
  }
  return key;
}

function readBaseUrl() {
  const raw = process.env.SENTDM_BASE_URL || 'https://api.sent.dm';
  return raw.replace(/\/+$/, '');
}

export function sentDmConfigured() {
  return Boolean(process.env.SENTDM_API_KEY);
}

/** '2547XXXXXXXX' (stored form) → '+2547XXXXXXXX' (E.164 for the API). */
export function toE164(phoneDigits) {
  const d = String(phoneDigits || '').replace(/^\+/, '');
  return `+${d}`;
}

/** '+2547 XX…' / '2547XX…' → canonical stored digits '2547XX…'. */
export function fromE164(phone) {
  return String(phone || '').replace(/[^\d]/g, '');
}

async function api(method, path, { body, idempotencyKey } = {}) {
  const headers = {
    'x-api-key': readApiKey(),
    'Accept': 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  let res;
  try {
    res = await fetch(`${readBaseUrl()}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new SentDmError(`sent.dm unreachable: ${e.message}`, { code: 'sentdm_unreachable' });
  }

  let json = null;
  try { json = await res.json(); } catch { /* non-JSON error body */ }

  if (!res.ok || json?.success === false) {
    const msg = json?.error?.message || `sent.dm ${method} ${path} → HTTP ${res.status}`;
    throw new SentDmError(msg, {
      status: res.status >= 400 && res.status < 600 ? res.status : 502,
      code: json?.error?.code || 'sentdm_error',
      body: json,
    });
  }
  return json?.data ?? json;
}

/**
 * Send a free-form text (works inside WhatsApp's 24h customer-service
 * window, which every reply-to-a-customer flow is in).
 *
 * @returns {Promise<{messageId: string|null}>}
 */
export async function sendText(phoneDigits, text, { idempotencyKey } = {}) {
  const data = await api('POST', '/v3/messages', {
    idempotencyKey,
    body: { to: [toE164(phoneDigits)], channel: ['whatsapp'], text },
  });
  return { messageId: data?.recipients?.[0]?.message_id ?? null };
}

/**
 * Send a pre-registered template ({ name, parameters }). Required for
 * business-initiated messages outside the 24h session window, and the only
 * way to attach media (image/document header) on the v3 API.
 *
 * @returns {Promise<{messageId: string|null}>}
 */
export async function sendTemplate(phoneDigits, templateName, parameters = {}, { idempotencyKey } = {}) {
  const data = await api('POST', '/v3/messages', {
    idempotencyKey,
    body: {
      to: [toE164(phoneDigits)],
      channel: ['whatsapp'],
      template: { name: templateName, parameters },
    },
  });
  return { messageId: data?.recipients?.[0]?.message_id ?? null };
}

/**
 * Fetch a message's full details — used to hydrate inbound webhook events
 * (sender phone + body) and to reconcile delivery status.
 * @returns {Promise<object>} v3 message shape (phone, direction, status, message_body…)
 */
export async function fetchMessage(messageId) {
  return api('GET', `/v3/messages/${encodeURIComponent(messageId)}`);
}

/**
 * Verify a sent.dm webhook delivery (Svix-style scheme, verified against
 * @sentdm/n8n-nodes-sent). Throws nothing; returns { valid, reason }.
 *
 * @param {object} headers  lower-cased header map (Express req.headers)
 * @param {Buffer} rawBody  the unparsed request body
 */
export function verifyWebhookSignature(headers, rawBody) {
  const secret = process.env.SENTDM_WEBHOOK_SECRET;
  if (!secret) return { valid: false, reason: 'SENTDM_WEBHOOK_SECRET not configured' };

  const webhookId = headers['x-webhook-id'];
  const timestamp = headers['x-webhook-timestamp'];
  const signature = headers['x-webhook-signature'];
  if (!webhookId || !timestamp || !signature) {
    return { valid: false, reason: 'missing signature headers' };
  }
  if (!/^v1,[A-Za-z0-9+/]+={0,2}$/.test(signature)) {
    return { valid: false, reason: 'malformed signature' };
  }

  const tsSeconds = Number(timestamp);
  if (!Number.isInteger(tsSeconds)) return { valid: false, reason: 'malformed timestamp' };
  if (Math.abs(Math.floor(Date.now() / 1000) - tsSeconds) > WEBHOOK_TOLERANCE_SECONDS) {
    return { valid: false, reason: 'timestamp outside tolerance' };
  }

  if (!secret.startsWith('whsec_')) return { valid: false, reason: 'malformed signing secret' };
  const encodedKey = secret.slice('whsec_'.length);
  if (!encodedKey || !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedKey)) {
    return { valid: false, reason: 'malformed signing secret' };
  }
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length === 0) return { valid: false, reason: 'malformed signing secret' };

  const signedContent = Buffer.concat([
    Buffer.from(`${webhookId}.${timestamp}.`, 'utf8'),
    Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8'),
  ]);
  const expected = Buffer.from(
    `v1,${createHmac('sha256', key).update(signedContent).digest('base64')}`,
    'utf8'
  );
  const received = Buffer.from(signature, 'utf8');
  if (expected.length !== received.length) return { valid: false, reason: 'signature mismatch' };
  if (!timingSafeEqual(expected, received)) return { valid: false, reason: 'signature mismatch' };
  return { valid: true };
}

/**
 * Normalize a verified webhook body into one of:
 *   { kind: 'message_received', messageId, text?, inboundNumber?, outboundNumber? }
 *   { kind: 'message_status',   messageId, status }   status: sent.dm's
 *       QUEUED/PROCESSED/ROUTED/SENT/DELIVERED/READ/FAILED
 *   { kind: 'ignored', reason }
 *
 * Live message.received payloads (verified against production deliveries)
 * carry the content inline:
 *   payload: { text, channel, message_id, inbound_number (the EXTERNAL
 *              sender the inbound came from), outbound_number (OUR
 *              business line — the number replies go out from),
 *              received_at, … }
 * Field semantics confirmed against a production event where the
 * business's sent.dm line appeared as outbound_number. The sender phone
 * is still resolved authoritatively via GET /v3/messages/{id} during
 * ingestion — these fields are the fast path / fallback only.
 */
export function parseInboundEvent(payloadJson) {
  const event = payloadJson || {};
  const name = typeof event.sub_type === 'string' && event.sub_type
    ? event.sub_type
    : (typeof event.event === 'string' ? event.event : '');
  const p = (typeof event.payload === 'object' && event.payload !== null) ? event.payload : {};
  const messageId = typeof p.message_id === 'string' ? p.message_id : null;

  if (event.field && event.field !== 'message') {
    return { kind: 'ignored', reason: `field ${event.field}` };
  }
  if (!messageId) return { kind: 'ignored', reason: 'no payload.message_id' };

  if (/received/i.test(name)) {
    return {
      kind: 'message_received',
      messageId,
      text: typeof p.text === 'string' ? p.text : undefined,
      inboundNumber: typeof p.inbound_number === 'string' && p.inbound_number
        ? p.inbound_number : undefined,
      outboundNumber: typeof p.outbound_number === 'string' && p.outbound_number
        ? p.outbound_number : undefined,
    };
  }
  if (typeof p.message_status === 'string' && p.message_status) {
    return { kind: 'message_status', messageId, status: p.message_status };
  }
  // Status encoded in the event name (message.delivered, message.failed …)
  const m = name.match(/^message\.(\w+)$/i);
  if (m) return { kind: 'message_status', messageId, status: m[1].toUpperCase() };
  return { kind: 'ignored', reason: `unrecognized event ${name || '∅'}` };
}

/** Map sent.dm delivery statuses onto wa_messages.status values. */
export function mapProviderStatus(providerStatus) {
  switch (String(providerStatus || '').toUpperCase()) {
    case 'QUEUED': case 'PROCESSED': case 'ROUTED': return 'queued';
    case 'SENT':      return 'sent';
    case 'DELIVERED': return 'delivered';
    case 'READ':      return 'read';
    case 'FAILED': case 'BLOCKED': return 'failed';
    default: return null; // unknown — leave the row as-is
  }
}
