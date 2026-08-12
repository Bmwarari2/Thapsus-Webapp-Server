// routes/waWebhook.js
//
// Inbound webhook for sent.dm message events. MOUNTED SEPARATELY in
// server.js with express.raw({type:'application/json'}) BEFORE
// express.json() — signature verification needs the unparsed bytes, same
// recipe as the Lipana webhook.
//
// Flow per delivery:
//   verify HMAC (x-webhook-id/-timestamp/-signature) → parse → normalize
//   → 'message_received':  GET /v3/messages/{id} to hydrate sender phone
//        + body (webhook payloads only carry ids reliably), upsert the
//        wa_contacts row, insert the wa_messages row (provider_message_id
//        UNIQUE = replay idempotency), bump unread + SSE, then hand off
//        to the conversation state machine.
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
  const { valid, reason } = verifyWebhookSignature(req.headers, req.body);
  if (!valid) {
    console.warn(`[wa-webhook] rejected: ${reason}`);
    return res.status(401).json({ success: false, message: reason });
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
      const result = await ingestInboundMessage(req.db, event.messageId);
      return res.json({ received: true, ...result });
    }
    if (event.kind === 'message_status') {
      const mapped = mapProviderStatus(event.status);
      if (mapped) {
        await req.db.query(
          `UPDATE wa_messages SET status = $2 WHERE provider_message_id = $1`,
          [event.messageId, mapped]
        );
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

async function ingestInboundMessage(db, providerMessageId) {
  // Replay short-circuit before the API round-trip.
  const { rows: seen } = await db.query(
    `SELECT 1 FROM wa_messages WHERE provider_message_id = $1`,
    [providerMessageId]
  );
  if (seen.length > 0) return { duplicate: true };

  const msg = await fetchMessage(providerMessageId);
  // Only ingest genuine inbound traffic — our own sends also generate
  // message events, and those are already in wa_messages via waSend.
  if (msg?.direction && !/^in/i.test(String(msg.direction))) {
    return { ignored: 'outbound message event' };
  }
  const phone = fromE164(msg?.phone_international || msg?.phone);
  if (!phone) return { ignored: 'no sender phone' };

  const body = msg?.message_body?.content ?? null;

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

  // Bot logic — onboarding, tracking auto-reply, quote confirmation.
  await handleInbound(db, contact, { id: messageId, body, mediaUrl: null });

  return { ok: true };
}
