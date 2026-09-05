// utils/sentdm.js
//
// Minimal client for the sent.dm v3 messaging API (WhatsApp channel).
// Every provider-specific assumption lives HERE — if sent.dm changes an
// endpoint or payload shape, this is the only file that should need to
// move. Shapes verified against the official SDK (@sentdm/sentdm 0.33.0,
// generated from their OpenAPI spec) and the @sentdm/n8n-nodes-sent
// webhook verifier, then re-checked line by line against the published
// v3 reference (docs.sent.dm, August 2026) — which is where the
// FILTERED/SCHEDULED statuses, the retry contract and the compliance
// keywords below come from:
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
//   • Statuses: QUEUED / ROUTED / SENT / DELIVERED / READ / FAILED plus
//       SCHEDULED (quiet-hours hold, releases itself), FILTERED (opted
//       out or route denied — never dispatched) and BLOCKED (precondition
//       — unapproved template, no open conversation, account gate). The
//       last three arrive ONLY as a status: a send that is going to be
//       suppressed still answers 202, so an HTTP 2xx is not delivery.
//   • Webhook: headers x-webhook-id / x-webhook-timestamp /
//       x-webhook-signature; signature = "v1," + base64(HMAC-SHA256(
//       base64decode(secret minus "whsec_"), `${id}.${ts}.` + rawBody));
//       timestamp signed once at creation and replayed unchanged on every
//       retry — see WEBHOOK_TOLERANCE_SECONDS. Event JSON: { field: "message",
//       event|sub_type: "message.*", timestamp, payload: { message_id,
//       message_status?, … } }.
//
// No npm dep — Node 22 fetch + node:crypto, same as lipanaClient.js.

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * How stale a signed webhook may be before we refuse it.
 *
 * This started at the Svix-conventional 300s and that was wrong for this
 * provider. Svix's five minutes assumes the sender re-signs each retry
 * with a fresh timestamp; sent.dm signs once when the event is created
 * and replays the identical signature and timestamp on every retry. So
 * whenever their delivery queue backs up — one did on 14 Aug, holding an
 * event 19 minutes — every retry arrives already stale, earns a 401, and
 * is retried again. The event can never land, and it retried once a
 * minute until the provider gave up. That time it was an intermediate
 * 'SENT' status for a message that reached 'delivered' anyway, so nothing
 * was lost. Had the same queue held a message.received, we would have
 * silently dropped a customer's message: no inbox row, no reply, no trace
 * beyond a 401 in the logs.
 *
 * Widening this costs little, because the timestamp was never what makes
 * a replay harmless here — the unique provider_message_id is. Replaying a
 * message.received hits that unique index and does nothing; replaying a
 * status re-applies the status it already had. The window's remaining job
 * is to reject payloads old enough to be obviously not live traffic.
 */
const WEBHOOK_TOLERANCE_SECONDS =
  Number(process.env.SENTDM_WEBHOOK_TOLERANCE_SECONDS) > 0
    ? Number(process.env.SENTDM_WEBHOOK_TOLERANCE_SECONDS)
    : 86_400;

/** Late enough to be worth noticing in the logs, but still processed. */
const WEBHOOK_LATE_SECONDS = 300;

/** Custom error so route layers can map sent.dm failures to clean 502s. */
export class SentDmError extends Error {
  constructor(message, { status = 502, code = 'sentdm_error', body = null, requestId = null } = {}) {
    super(message);
    this.name = 'SentDmError';
    this.status = status;
    this.code = code;
    this.body = body;
    this.requestId = requestId;
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

/**
 * Our own WhatsApp line, in stored digit form.
 *
 * Needed because a message from the business number to the business
 * number is the one send WhatsApp will never deliver, and it fails the
 * way that is hardest to see: the API accepts it, and the failure
 * arrives minutes later as a status webhook with no reason on it.
 * utils/waStaffAlert.js refuses to page that number for exactly that
 * reason. Override with WA_BUSINESS_NUMBER if the line ever moves.
 */
export function businessWhatsAppNumber() {
  return fromE164(process.env.WA_BUSINESS_NUMBER || '254740825215');
}

/**
 * How many times one call may be attempted, and the longest we will wait
 * between attempts. Every call in this file runs on a path somebody is
 * waiting on — a customer mid-conversation, an operator hitting send, a
 * webhook ACK the provider times out after 30s — so a 60-second
 * `Retry-After` is not something to sleep through here. Past the cap we
 * fail fast with the provider's code intact; waSweeper retries failed
 * sends within five minutes, which is where a wait that long belongs.
 */
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_MAX_WAIT_MS = 2_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Which failures are worth repeating, from the documented v3 contract.
 *
 *   429 BUSINESS_002 — rate limit (200/min), or the lockout that follows
 *                      10 failed auth attempts.
 *   409 CONFLICT_001 — a request with the same Idempotency-Key is still
 *                      in flight; retrying once it lands returns its
 *                      cached response.
 *   503 SERVICE_001  — the idempotency cache is down and the API refused
 *                      rather than risk executing twice.
 *
 * None of those three ran, so repeating one cannot duplicate a message
 * whatever the method. A 5xx or a dropped connection IS ambiguous — the
 * send may already be queued — so those repeat only when the caller gave
 * us an Idempotency-Key, which turns a duplicate into a replay of the
 * cached 202 rather than a second WhatsApp message to a real person.
 * The webhook-management calls carry no key, so they never repeat on a
 * 5xx: two registered webhooks would double every inbound event.
 */
function retryableStatus(status, idempotent) {
  if (status === 429 || status === 409 || status === 503) return true;
  return status >= 500 && idempotent;
}

/** `Retry-After` when the provider names one, else 300ms doubling. */
function retryDelayMs(res, attempt) {
  const advised = Number(res?.headers?.get?.('retry-after'));
  if (Number.isFinite(advised) && advised > 0) return advised * 1000;
  return 300 * 2 ** (attempt - 1);
}

async function api(method, path, { body, idempotencyKey } = {}) {
  const headers = {
    'x-api-key': readApiKey(),
    'Accept': 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  // A GET changes nothing, and a keyed mutation replays instead of
  // executing twice. Anything else is repeated only when the provider
  // has told us it did not run. See retryableStatus().
  //
  // `let`, because SERVICE_001 makes us drop the key mid-flight and the
  // remaining attempts are then unkeyed. See the branch below.
  let idempotent = method === 'GET' || Boolean(idempotencyKey);

  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`${readBaseUrl()}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      const err = new SentDmError(`sent.dm unreachable: ${e.message}`, { code: 'sentdm_unreachable' });
      if (!idempotent || attempt >= RETRY_MAX_ATTEMPTS) throw err;
      await sleep(300 * 2 ** (attempt - 1));
      continue;
    }

    let json = null;
    try { json = await res.json(); } catch { /* non-JSON error body */ }

    if (res.ok && json?.success !== false) return json?.data ?? json;

    // meta.request_id is the only handle sent.dm support can trace, and
    // the ERR_* code behind a suppressed send is only retrievable by
    // quoting it. Keep it on the error rather than in a log line nobody
    // will still have by the time somebody asks.
    const requestId = json?.meta?.request_id || res.headers?.get?.('x-request-id') || null;
    const err = new SentDmError(
      json?.error?.message || `sent.dm ${method} ${path} → HTTP ${res.status}`,
      {
        status: res.status >= 400 && res.status < 600 ? res.status : 502,
        code: json?.error?.code || 'sentdm_error',
        body: json,
        requestId,
      }
    );

    if (attempt >= RETRY_MAX_ATTEMPTS || !retryableStatus(res.status, idempotent)) throw err;

    // SERVICE_001 is the idempotency cache being unavailable, and the key
    // is the only reason this request needs it: sent.dm refused rather
    // than risk executing twice, so by their own contract NOTHING RAN and
    // an unkeyed repeat cannot double-send. Repeating WITH the key just
    // asks the same dead cache again — which is exactly what happened on
    // 5 September: three sends and two sweeper retries, eighteen attempts
    // in all, every one keyed and every one refused, while the keyless
    // staff alert about each failure went out in the same second and was
    // read. The third one lost a customer's quote.
    //
    // The key is dropped for good on this call rather than for one
    // attempt: the cache is down for as long as it is down, and a request
    // that has never executed has nothing to replay.
    if (err.code === 'SERVICE_001' && headers['Idempotency-Key']) {
      delete headers['Idempotency-Key'];
      idempotent = method === 'GET';
      console.warn(`[sentdm] ${method} ${path} → ${res.status} SERVICE_001; the idempotency cache is down, repeating WITHOUT the key (the request never ran)`);
      continue;
    }

    const delay = retryDelayMs(res, attempt);
    if (delay > RETRY_MAX_WAIT_MS) throw err;
    console.warn(`[sentdm] ${method} ${path} → ${res.status} ${err.code}; retrying in ${delay}ms`);
    await sleep(delay);
  }
}

/**
 * sent.dm delivers free-form text through a system template
 * (FREE_TEXT_SYS_TEMPLATE) with the text as the template variable, and
 * WhatsApp forbids newlines/tabs/4+ consecutive spaces inside template
 * variables — a multi-line body is rejected at request time with
 * VALIDATION_008 (observed in production, and since confirmed word for
 * word in the error catalog: "param text cannot have new-line/tab
 * characters or more than 4 consecutive spaces", rejected because
 * WhatsApp does not accept them in a parameter). There is no way to send
 * a line break in a free-text reply; every one of them arrives as one
 * paragraph.
 *
 * So the structure has to be carried by characters instead. A list keeps
 * its shape rather than being flattened into a run of separators: a
 * bullet becomes "•", a numbered step keeps its number and gets a wider
 * gap in front of it, a paragraph break becomes " — " and any other line
 * break becomes " · ". Before this, a three-step answer arrived as
 * "How it works: · - Send your cart link · - Pay on the till", which
 * reads worse than the paragraph it replaced.
 */
export function flattenForFreeText(text) {
  return String(text)
    // The break IS the bullet — don't keep both.
    .replace(/\s*\n+\s*[-*•]\s+/g, ' • ')
    // A numbered step already carries its marker; it needs a gap, not a
    // second one. Two spaces, well inside WhatsApp's limit of four.
    .replace(/\s*\n+\s*(?=\d+[.)]\s)/g, '  ')
    .replace(/\s*\n{2,}\s*/g, '  —  ')
    .replace(/\s*\n\s*/g, ' · ')
    .replace(/\t/g, ' ')
    .replace(/ {4,}/g, '   ')
    .trim();
}

// Set the first time the API rejects line structure. After that we
// flatten up front instead of paying a rejected round-trip on every
// multi-line message. Resets on restart, so if sent.dm ever starts
// accepting newlines the next deploy picks that up for free.
let freeTextRejectsNewlines = false;

/**
 * Send a free-form text (works inside WhatsApp's 24h customer-service
 * window, which every reply-to-a-customer flow is in). Multi-line bodies
 * are tried as-is and retried flattened when the API rejects the line
 * structure (VALIDATION_008).
 *
 * @returns {Promise<{messageId: string|null}>}
 */
export async function sendText(phoneDigits, text, { idempotencyKey } = {}) {
  const flattened = flattenForFreeText(text);
  const body = freeTextRejectsNewlines ? flattened : text;
  try {
    const data = await api('POST', '/v3/messages', {
      idempotencyKey,
      body: { to: [toE164(phoneDigits)], channel: ['whatsapp'], text: body },
    });
    return { messageId: data?.recipients?.[0]?.message_id ?? null };
  } catch (e) {
    const validationReject = e instanceof SentDmError
      && (String(e.code).startsWith('VALIDATION') || /template variable/i.test(e.message));
    if (!validationReject || flattened === body) throw e;
    freeTextRejectsNewlines = true;
    console.warn('[sentdm] free text rejected newlines — flattening from here on');
    // Fresh idempotency key. Only 2xx responses are cached, so reusing
    // the original would in fact re-execute — but the flattened body is a
    // different operation from the one that was rejected, and a key is
    // documented as never being reused for a different operation.
    const data = await api('POST', '/v3/messages', {
      idempotencyKey: idempotencyKey ? `${idempotencyKey}-flat` : undefined,
      body: { to: [toE164(phoneDigits)], channel: ['whatsapp'], text: flattened },
    });
    return { messageId: data?.recipients?.[0]?.message_id ?? null };
  }
}

/** Activity log for one message — per-step status + provider descriptions
 *  (the place downstream WhatsApp failures explain themselves). */
export async function fetchMessageActivities(messageId) {
  const data = await api('GET', `/v3/messages/${encodeURIComponent(messageId)}/activities`);
  return data?.activities ?? [];
}

/**
 * Send a pre-registered template ({ name, parameters }). Required for
 * business-initiated messages outside the 24h session window, and the only
 * way to attach media (image/document header) on the v3 API.
 *
 * @returns {Promise<{messageId: string|null}>}
 */
export async function sendTemplate(phoneDigits, templateRef, parameters = {}, { idempotencyKey } = {}) {
  // Operators may paste either the template name or its UUID from the
  // sent.dm console; the API takes one or the other (mutually exclusive).
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(templateRef));
  const data = await api('POST', '/v3/messages', {
    idempotencyKey,
    body: {
      to: [toE164(phoneDigits)],
      channel: ['whatsapp'],
      template: { ...(isUuid ? { id: templateRef } : { name: templateRef }), parameters },
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

// ── Webhook management (admin diagnostics / self-repair) ────────────────────

/** @returns {Promise<Array>} registered webhooks (url, active, failure counters) */
export async function listWebhooks() {
  const data = await api('GET', '/v3/webhooks?page=1&page_size=20');
  return data?.webhooks ?? [];
}

/** @returns {Promise<Array>} recent delivery attempts for a webhook */
export async function listWebhookEvents(webhookId) {
  const data = await api('GET', `/v3/webhooks/${encodeURIComponent(webhookId)}/events?page=1&page_size=10`);
  return data?.events ?? [];
}

/** Create the inbound-message webhook. Response includes signing_secret (shown only once). */
export async function createWebhook(endpointUrl) {
  return api('POST', '/v3/webhooks', {
    body: {
      display_name: 'Thapsus Cargo — WhatsApp flow',
      endpoint_url: endpointUrl,
      event_types: ['message'],
    },
  });
}

/** Point an existing webhook at a new endpoint URL. */
export async function updateWebhookUrl(webhookId, endpointUrl) {
  return api('PUT', `/v3/webhooks/${encodeURIComponent(webhookId)}`, {
    body: { endpoint_url: endpointUrl },
  });
}

/** Re-enable a webhook that sent.dm auto-disabled after failures. */
export async function activateWebhook(webhookId) {
  return api('PATCH', `/v3/webhooks/${encodeURIComponent(webhookId)}/toggle-status`, {
    body: { is_active: true },
  });
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
  const ageSeconds = Math.floor(Date.now() / 1000) - tsSeconds;
  if (Math.abs(ageSeconds) > WEBHOOK_TOLERANCE_SECONDS) {
    return { valid: false, reason: `timestamp outside tolerance (${ageSeconds}s)` };
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
  // lateBySeconds is reported, not enforced: a delivery this old means the
  // provider's queue is backed up, which is worth seeing in the logs
  // before it turns into customers waiting on replies.
  return { valid: true, lateBySeconds: ageSeconds > WEBHOOK_LATE_SECONDS ? ageSeconds : 0 };
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
      // The whole payload rides along because inbound media is not in the
      // hydrated message: GET /v3/messages/{id} came back with
      // {"header":null,"content":"","footer":null,"buttons":null} for a
      // photo. If a URL reaches us at all, this is where it is.
      payload: p,
      text: typeof p.text === 'string' ? p.text : undefined,
      inboundNumber: typeof p.inbound_number === 'string' && p.inbound_number
        ? p.inbound_number : undefined,
      outboundNumber: typeof p.outbound_number === 'string' && p.outbound_number
        ? p.outbound_number : undefined,
    };
  }
  if (typeof p.message_status === 'string' && p.message_status) {
    return { kind: 'message_status', messageId, status: p.message_status, error: extractError(p) };
  }
  // Status encoded in the event name (message.delivered, message.failed …)
  const m = name.match(/^message\.(\w+)$/i);
  if (m) {
    return { kind: 'message_status', messageId, status: m[1].toUpperCase(), error: extractError(p) };
  }
  return { kind: 'ignored', reason: `unrecognized event ${name || '∅'}` };
}

/**
 * Pull whatever the provider said about a failure out of a status payload.
 *
 * Which key carries it is not documented and has varied — the archived
 * platform's rows show both a bare WhatsApp error array (code 131026,
 * "Message undeliverable") and sent.dm's own envelope. So try the
 * plausible names rather than betting on one, and keep the raw JSON: the
 * Meta error code is the part worth reading, and summarising it here
 * would throw away the only thing that identifies the failure.
 */
function extractError(payload) {
  for (const key of ['error', 'errors', 'error_message', 'failure_reason', 'message_error']) {
    const v = payload?.[key];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 2000);
    if (v && typeof v === 'object') return JSON.stringify(v).slice(0, 2000);
  }
  return null;
}

/**
 * Pull an attachment out of a hydrated inbound message.
 *
 * Inbound media was dropped on the floor: the ingest INSERT never named
 * media_url or media_type, so a customer's M-Pesa screenshot arrived as
 * a row with an empty body and nothing else. The operator saw a blank
 * bubble and had to ask them to send it again.
 *
 * Which key carries the URL is not documented, and the same guesswork
 * already bit us on failure reasons (see extractError). So try the
 * plausible shapes rather than betting on one, and return null quietly
 * when none match — the caller logs the raw envelope in that case, so
 * the next attachment tells us the shape instead of us guessing again.
 *
 * @param {object} msg  the v3 message from fetchMessage()
 * @returns {{url: string, type: string}|null}
 */
export function extractInboundMedia(msg, webhookPayload = null) {
  const body = msg?.message_body ?? {};
  const candidates = [
    body.media_url, body.mediaUrl, body.media, body.url, body.link,
    body.image?.url, body.image?.link, body.document?.url, body.document?.link,
    body.video?.url, body.audio?.url, body.sticker?.url,
    Array.isArray(body.attachments) ? body.attachments[0]?.url : null,
    Array.isArray(body.media) ? body.media[0]?.url : null,
    msg?.media_url, msg?.media?.url,
  ];
  let url = candidates.find((v) => typeof v === 'string' && /^https?:\/\//i.test(v));

  // Nothing under a name we know. The provider's inbound shape is not
  // documented and the hydrated message turned out to carry no media at
  // all, so rather than add a sixth guess every time this fails, sweep
  // both objects for a URL that looks like a file. Bounded, and only
  // consulted once the named keys have missed.
  if (!url) url = findMediaUrlDeep(msg) || findMediaUrlDeep(webhookPayload);
  if (!url) return null;

  const declared = String(
    body.media_type || body.mediaType || body.type || msg?.media_type || ''
  ).toLowerCase();
  return { url, type: classifyMedia(declared, url) };
}

// A file extension, or a path segment that reads like one, is what tells
// an attachment apart from the other URLs floating in a webhook envelope
// (callback URLs, profile links). Anything vaguer is left alone: showing
// the wrong link as an attachment is worse than showing none.
const MEDIA_URL_HINT =
  /\.(jpe?g|png|webp|gif|heic|mp4|mov|3gp|ogg|opus|mp3|m4a|pdf|docx?|xlsx?|csv)(\?|$)|\/(media|attachments?|files?|downloads?)\//i;

// Deep enough for a Meta-style envelope (entry[].changes[].value.image),
// which is six levels before the URL. Capped so a malformed or
// self-referential payload cannot spin.
const MAX_MEDIA_SCAN_DEPTH = 8;

/** Walk an object for the first URL that looks like a file. Depth-capped. */
function findMediaUrlDeep(root, depth = 0) {
  if (!root || typeof root !== 'object' || depth > MAX_MEDIA_SCAN_DEPTH) return null;
  for (const value of Object.values(root)) {
    if (typeof value === 'string') {
      if (/^https?:\/\//i.test(value) && MEDIA_URL_HINT.test(value)) return value;
    } else if (value && typeof value === 'object') {
      const found = findMediaUrlDeep(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 'image' | 'document' | 'video' | 'audio' — what the inbox needs to know
 * to decide between showing a thumbnail and showing a paperclip.
 */
function classifyMedia(declared, url) {
  const from = (v) => {
    if (/image|photo|jpe?g|png|webp|gif|heic/.test(v)) return 'image';
    if (/video|mp4|mov|3gp/.test(v)) return 'video';
    if (/audio|voice|ogg|mp3|m4a|opus/.test(v)) return 'audio';
    if (/pdf|document|doc|xls|csv|sheet/.test(v)) return 'document';
    return null;
  };
  return from(declared) || from(url.split('?')[0].toLowerCase()) || 'document';
}

/**
 * Map sent.dm delivery statuses onto wa_messages.status values.
 *
 * The full v3 set is QUEUED, ROUTED, SENT, DELIVERED, READ, FAILED,
 * SCHEDULED, FILTERED and BLOCKED (PROCESSED shows up in the activity
 * log). FILTERED and SCHEDULED used to fall through to `null`, which
 * left the row on 'queued' and told nobody:
 *
 *   • FILTERED is a message that was never dispatched — the contact is
 *     opted out or suppressed, or routing denied every route. A customer
 *     who types nothing but CANCEL, END or STOP is opted out by sent.dm's
 *     own compliance engine, contact-level and across every channel, and
 *     from that moment everything we send them is filtered. Reading it as
 *     "queued" is the difference between an operator seeing that a
 *     customer went dark and an operator seeing nothing at all.
 *   • SCHEDULED is a quiet-hours hold, released automatically, so it is
 *     genuinely still in flight — 'queued' rather than a failure.
 */
export function mapProviderStatus(providerStatus) {
  switch (String(providerStatus || '').toUpperCase()) {
    case 'QUEUED': case 'PROCESSED': case 'ROUTED': case 'SCHEDULED': return 'queued';
    case 'SENT':      return 'sent';
    case 'DELIVERED': return 'delivered';
    case 'READ':      return 'read';
    case 'FAILED': case 'BLOCKED': case 'FILTERED': return 'failed';
    default: return null; // unknown — leave the row as-is
  }
}

/**
 * What a terminal status means, for the two that never carry a reason.
 *
 * The send-time ERR_* codes (ERR_CONSENT_BLOCKED, ERR_ROUTE_DENIED,
 * CONVERSATION_TEMPLATE_REQUIRED …) are recorded inside sent.dm and are
 * documented as absent from both the API response and the webhook
 * payload, and the matching activity description is generic ("Message
 * updated to FILTERED"). So there is nothing to fetch: the status itself
 * is the whole signal, and an operator reading "failed — no reason
 * given" is worse served than one told what the status can mean.
 *
 * The leading token is load-bearing: waSweeper reads it to keep a
 * suppressed message out of the retry queue, because a consent-blocked
 * send is filtered again every time, forever.
 */
export function terminalStatusReason(providerStatus) {
  switch (String(providerStatus || '').toUpperCase()) {
    case 'FILTERED':
      return 'FILTERED: suppressed before dispatch — the contact is opted out '
        + '(they sent STOP/CANCEL/UNSUBSCRIBE/QUIT/END, or opt_out is set on '
        + 'their sent.dm contact) or routing denied the send. Not retryable: '
        + 'they must send START to be reachable again.';
    case 'BLOCKED':
      return 'BLOCKED: gated before dispatch — an account precondition '
        + '(balance or onboarding quota), a template not approved for sending, '
        + 'or a free-form send with no open conversation.';
    default:
      return null;
  }
}

/**
 * Pull a failure description out of a hydrated message.
 *
 * The first version of this guessed at top-level keys — `error`,
 * `failure_reason` — that GET /v3/messages/{id} does not have, so it
 * returned null every time and every asynchronous failure reached staff
 * as "no reason given". The documented shape carries the history in
 * `events[]` ({ status, timestamp, description }), newest last, and the
 * same descriptions are served by GET /v3/messages/{id}/activities. The
 * old key guesses stay as a tail: production rows in the archived
 * platform did carry a bare WhatsApp error array (131026, "Message
 * undeliverable"), and dropping the Meta code would throw away the only
 * thing that identifies the failure.
 */
export function failureReasonFromMessage(msg) {
  const m = msg?.data ?? msg ?? {};
  const events = Array.isArray(m.events) ? m.events
    : (Array.isArray(m.activities) ? m.activities : []);
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] || {};
    if (!/^(FAILED|FILTERED|BLOCKED)$/i.test(String(e.status || ''))) continue;
    const description = typeof e.description === 'string' ? e.description.trim() : '';
    // Generic descriptions ("Message updated to FILTERED") say nothing the
    // status did not; let terminalStatusReason() answer those instead.
    if (description && !/^message updated to/i.test(description)) {
      return description.slice(0, 2000);
    }
    return terminalStatusReason(e.status);
  }
  for (const key of ['error', 'errors', 'error_message', 'failure_reason']) {
    const v = m[key];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 2000);
    if (v && typeof v === 'object') return JSON.stringify(v).slice(0, 2000);
  }
  return null;
}

/**
 * sent.dm's compliance keywords, matched the way its consent engine
 * matches them: the ENTIRE trimmed body, case-insensitive. "Please stop
 * messaging me" is not a keyword; "Cancel" is.
 *
 * This matters here more than it would elsewhere. A parcel customer who
 * types "CANCEL" means their order, and a customer who types "END" or
 * "INFO" means neither — but sent.dm opts the first two out of every
 * channel before we ever see the event, and nothing we send afterwards
 * is delivered. Knowing which keyword arrived is the only way to tell an
 * operator why a conversation went quiet.
 */
const OPT_OUT_KEYWORDS = new Set(['STOP', 'CANCEL', 'UNSUBSCRIBE', 'QUIT', 'END']);
const OPT_IN_KEYWORDS = new Set(['START', 'UNSTOP', 'SUBSCRIBE']);
const HELP_KEYWORDS = new Set(['HELP', 'INFO']);

/** @returns {'opt_out'|'opt_in'|'help'|null} */
export function complianceKeyword(text) {
  const word = String(text ?? '').trim().toUpperCase();
  if (!word) return null;
  if (OPT_OUT_KEYWORDS.has(word)) return 'opt_out';
  if (OPT_IN_KEYWORDS.has(word)) return 'opt_in';
  if (HELP_KEYWORDS.has(word)) return 'help';
  return null;
}
