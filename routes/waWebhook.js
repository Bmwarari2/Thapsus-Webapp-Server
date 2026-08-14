// routes/waWebhook.js
//
// Inbound webhook for sent.dm message events. MOUNTED SEPARATELY in
// server.js with express.raw({type:'application/json'}) BEFORE
// express.json() — signature verification needs the unparsed bytes, same
// recipe as the Lipana webhook.
//
// Flow per delivery:
//   verify HMAC (x-webhook-id/-timestamp/-signature) → parse → normalize
//   → 'message_received':  ingest the sender phone + text straight from
//        the webhook payload (live payloads carry both; GET
//        /v3/messages/{id} is the fallback when they don't), upsert the
//        wa_contacts row, insert the wa_messages row (provider_message_id
//        UNIQUE = replay idempotency), bump unread + SSE, ACK — and only
//        THEN run the conversation state machine. The bot's replies can
//        take seconds (several outbound sends); doing them before the ACK
//        risked tripping sent.dm's delivery timeout, which surfaces as
//        RETRYING deliveries and duplicate processing.
//   → 'message_status':    map the provider status onto our wa_messages row.
//
// Always 200 once the signature checks out — sent.dm retries non-2xx
// deliveries, and a poison event must not be redelivered forever.

import { v4 as uuidv4 } from 'uuid';
import {
  verifyWebhookSignature,
  parseInboundEvent,
  fetchMessage,
  fromE164,
  mapProviderStatus,
} from '../utils/sentdm.js';
import { handleInbound } from '../utils/waStateMachine.js';
import { pushToStaff } from './events.js';
import { logError } from '../utils/errorLogger.js';

const PREVIEW_LEN = 120;

export async function waWebhookHandler(req, res) {
  const { valid, reason, lateBySeconds } = verifyWebhookSignature(req.headers, req.body);
  if (!valid) {
    console.warn(`[wa-webhook] rejected: ${reason}`);
    return res.status(401).json({ success: false, message: reason });
  }
  if (lateBySeconds) {
    // Authentic, just slow to arrive. Process it — an inbound message is
    // worth answering late — but say so, because a backed-up provider
    // queue is the shape of trouble that looks like silence.
    console.warn(`[wa-webhook] delivery was ${lateBySeconds}s late — provider queue is behind`);
  }

  let payload;
  try {
    const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
    payload = JSON.parse(text);
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const event = parseInboundEvent(payload);

  try {
    if (event.kind === 'message_received') {
      const result = await ingestInboundMessage(req.db, event);
      res.json({ received: true, ...(result.ingested ? { ok: true } : result) });
      // Bot logic runs AFTER the ACK — see the header comment.
      if (result.ingested) {
        handleInbound(req.db, result.contact, result.message).catch((err) => {
          console.error('[wa-webhook] state machine failed:', err);
          logError({
            level: 'error', source: 'wa-webhook',
            message: `state machine failed: ${err?.message}`,
            stack: err?.stack,
          });
        });
      }
      return;
    }
    if (event.kind === 'message_status') {
      const mapped = mapProviderStatus(event.status);
      if (mapped) {
        // Record WHY a send failed, not just that it did.
        //
        // waSend only fills wa_messages.error when the send call itself
        // throws. A message the provider accepts and WhatsApp rejects
        // later fails asynchronously, right here — and this used to write
        // the status and nothing else, so every such failure read as a
        // bare "failed" with no reason anywhere. The archived platform
        // kept these (that is where "131026 Message undeliverable" in the
        // old rows comes from); this one had quietly stopped.
        const reason = mapped === 'failed'
          ? (event.error || await failureReasonFor(event.messageId))
          : null;
        await req.db.query(
          `UPDATE wa_messages
              SET status = $2,
                  error = COALESCE($3, error)
            WHERE provider_message_id = $1`,
          [event.messageId, mapped, reason]
        );
        if (mapped === 'failed') {
          console.warn(`[wa-webhook] delivery failed for ${event.messageId}: ${reason || 'no reason given'}`);
        }
      }
      return res.json({ received: true, status: mapped || 'ignored' });
    }
    return res.json({ received: true, ignored: event.reason });
  } catch (err) {
    // Log loudly but still 200 — the event is signature-verified and our
    // failure is internal; endless provider retries would just re-fail.
    console.error('[wa-webhook] processing failed:', err);
    logError({
      level: 'error', source: 'wa-webhook',
      message: err?.message || 'processing failed',
      stack: err?.stack,
    });
    return res.json({ received: true, error: 'processing_failed' });
  }
}

/**
 * Ask the provider why a message failed, when the status event didn't say.
 *
 * Best-effort by design: this runs inside the webhook ACK path, and a
 * reason we couldn't fetch is not worth failing the delivery over. The
 * status still lands either way.
 */
async function failureReasonFor(messageId) {
  try {
    const data = await fetchMessage(messageId);
    const m = data?.data ?? data ?? {};
    for (const key of ['error', 'errors', 'error_message', 'failure_reason']) {
      const v = m[key];
      if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 2000);
      if (v && typeof v === 'object') return JSON.stringify(v).slice(0, 2000);
    }
    return null;
  } catch (e) {
    console.warn(`[wa-webhook] could not fetch failure reason for ${messageId}: ${e?.message}`);
    return null;
  }
}

async function ingestInboundMessage(db, event) {
  const providerMessageId = event.messageId;
  // Replay short-circuit before any API round-trip.
  const { rows: seen } = await db.query(
    `SELECT 1 FROM wa_messages WHERE provider_message_id = $1`,
    [providerMessageId]
  );
  if (seen.length > 0) return { duplicate: true };

  // The sender phone comes from the authoritative GET /v3/messages/{id}
  // (its `phone` is the counterparty, alongside an explicit direction).
  // The webhook payload's text rides along as the body fast-path, and its
  // inbound_number (the external sender — semantics confirmed against a
  // production event) is the emergency fallback if the fetch fails.
  let phone = null;
  let body = typeof event.text === 'string' ? event.text : null;
  try {
    const msg = await fetchMessage(providerMessageId);
    // Only ingest genuine inbound traffic — our own sends also generate
    // message events, and those are already in wa_messages via waSend.
    if (msg?.direction && !/^in/i.test(String(msg.direction))) {
      return { ignored: 'outbound message event' };
    }
    phone = fromE164(msg?.phone_international || msg?.phone);
    body = body ?? (msg?.message_body?.content ?? null);
  } catch (e) {
    console.warn(`[wa-webhook] message hydration failed (${e?.message}) — falling back to payload fields`);
    phone = fromE164(event.inboundNumber);
  }
  if (!phone) return { ignored: 'no sender phone' };

  // Upsert the contact (phone is the identity).
  const contactId = uuidv4();
  const { rows: contactRows } = await db.query(
    `INSERT INTO wa_contacts (id, phone)
     VALUES ($1, $2)
     ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [contactId, phone]
  );
  const contact = contactRows[0];

  // Insert the message; the UNIQUE index is the race-safe idempotency guard.
  const messageId = uuidv4();
  const { rowCount } = await db.query(
    `INSERT INTO wa_messages (id, contact_id, direction, body, provider_message_id, status)
     VALUES ($1, $2, 'in', $3, $4, 'received')
     ON CONFLICT (provider_message_id) DO NOTHING`,
    [messageId, contact.id, body, providerMessageId]
  );
  if (rowCount === 0) return { duplicate: true };

  const preview = (body || '[media message]').slice(0, PREVIEW_LEN);
  await db.query(
    `UPDATE wa_contacts
        SET unread_count = unread_count + 1,
            last_message_at = NOW(),
            last_message_preview = $2,
            updated_at = NOW()
      WHERE id = $1`,
    [contact.id, preview]
  );

  pushToStaff('wa_inbox_update', {
    contact_id: contact.id,
    direction: 'in',
    message_id: messageId,
    preview,
    customer_code: contact.customer_code,
    phone: contact.phone,
  });

  // Caller ACKs, then runs the state machine on this.
  return { ingested: true, contact, message: { id: messageId, body, mediaUrl: null } };
}
