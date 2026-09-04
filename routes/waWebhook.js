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
//        A body that is exactly one of sent.dm's opt-out keywords is
//        stored but not answered — the consent engine has already closed
//        the channel, so the bot would be talking to nobody.
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
  mapProviderStatus, extractInboundMedia,
  terminalStatusReason, failureReasonFromMessage, complianceKeyword } from '../utils/sentdm.js';
import { handleInbound } from '../utils/waStateMachine.js';
import { pushToStaff } from './events.js';
import { logError } from '../utils/errorLogger.js';
import { notifyStaff, recordStaffAlertStatus } from '../utils/waStaffAlert.js';

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
      // An opt-out keyword is not a message to answer, it is a channel
      // closing. sent.dm's consent engine has already flipped opt_out on
      // the contact — across every channel, before this event reached us —
      // so a bot reply would be filtered on its way out and land in the
      // transcript as a message the customer never got. Page staff
      // instead: this is how a live order goes silent.
      if (result.ingested && result.keyword === 'opt_out') {
        alertStaffOfOptOut(req.db, result.contact, result.message).catch(() => {});
        return;
      }
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
        // FILTERED and BLOCKED explain themselves: the ERR_* code behind
        // them is documented as absent from both the payload and the
        // activity log, so there is nothing to fetch and the status is
        // the whole signal. Only a bare FAILED is worth a round-trip.
        const documented = terminalStatusReason(event.status);
        const reason = mapped === 'failed'
          ? (event.error || documented || await failureReasonFor(event.messageId))
          : null;
        const { rowCount } = await req.db.query(
          `UPDATE wa_messages
              SET status = $2,
                  error = COALESCE($3, error)
            WHERE provider_message_id = $1`,
          [event.messageId, mapped, reason]
        );
        // A status for a provider id that is not a customer message is
        // almost always a staff alert — those go out through
        // sendTemplate() and live in wa_staff_alerts, not wa_messages.
        // This lookup is the whole reason a dead alerting channel used to
        // be invisible: the miss above was the end of the road, so seven
        // consecutive failed pages logged one line each and told nobody.
        const wasStaffAlert = rowCount === 0
          && await recordStaffAlertStatus(req.db, event.messageId, mapped, reason);
        if (mapped === 'failed' && !wasStaffAlert) {
          console.warn(`[wa-webhook] delivery failed for ${event.messageId}: ${reason || 'no reason given'}`);
          // A customer who was never reached looks exactly like a customer
          // who was, unless somebody opens the inbox and reads the small
          // grey word under the bubble. Tell staff instead.
          alertStaffOfFailedSend(req.db, event.messageId, reason).catch(() => {});
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
 * Tell staff we could not reach a customer.
 *
 * The two live examples are worth naming. One number rejects everything we
 * send it while its owner keeps messaging us; and every arrival and
 * dispatch alert has no approved template, so once a customer's 24-hour
 * window closes those notifications cannot be delivered at all. In both
 * cases the parcel keeps moving and the customer hears nothing, and the
 * only trace is a grey "failed" under a bubble nobody is looking at.
 *
 * Deduped per message, and best-effort: an alert we cannot send is not a
 * reason to fail the webhook.
 */
async function alertStaffOfFailedSend(db, providerMessageId, reason) {
  const { rows } = await db.query(
    `SELECT m.body, c.full_name, c.phone, c.customer_code
       FROM wa_messages m JOIN wa_contacts c ON c.id = m.contact_id
      WHERE m.provider_message_id = $1`,
    [providerMessageId]
  );
  const m = rows[0];
  if (!m) return;
  const who = [m.full_name, m.customer_code, m.phone].filter(Boolean).join(' · ');
  await notifyStaff(db, {
    title: 'Customer did not receive a message',
    detail: `${who} — "${String(m.body || '').slice(0, 140)}" — ${reason || 'no reason given'}`,
    dedupeKey: `send-failed:${providerMessageId}`,
  });
}

/**
 * Tell staff a customer has opted themselves out.
 *
 * The keyword list is sent.dm's, not ours, and it is matched on the whole
 * trimmed body: STOP, CANCEL, UNSUBSCRIBE, QUIT, END. In a parcel
 * conversation "CANCEL" and "END" are things a customer types meaning
 * their order or their sentence, and either one suppresses them on every
 * channel until they send START. Nothing we send after that is
 * delivered — not a quote, not a tracking code, not a receipt — and the
 * only visible symptom is a conversation that stops.
 *
 * Best-effort and deduped per message: an alert we cannot send is not a
 * reason to fail the webhook.
 */
async function alertStaffOfOptOut(db, contact, message) {
  const who = [contact.full_name, contact.customer_code, contact.phone].filter(Boolean).join(' · ');
  await notifyStaff(db, {
    title: 'Customer opted out of WhatsApp',
    detail: `${who} sent "${String(message.body || '').trim().slice(0, 40)}". sent.dm has opted them out, `
      + 'so nothing we send reaches them until they reply START. '
      + 'If they meant to cancel an order rather than leave, call them.',
    dedupeKey: `opt-out:${message.id}`,
  });
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
    return failureReasonFromMessage(await fetchMessage(messageId));
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
  let media = null;
  try {
    const msg = await fetchMessage(providerMessageId);
    // Only ingest genuine inbound traffic — our own sends also generate
    // message events, and those are already in wa_messages via waSend.
    if (msg?.direction && !/^in/i.test(String(msg.direction))) {
      return { ignored: 'outbound message event' };
    }
    phone = fromE164(msg?.phone_international || msg?.phone);
    body = body ?? (msg?.message_body?.content ?? null);
    media = extractInboundMedia(msg, event.payload);
    // Still nothing. The first version of this logged only the hydrated
    // message, which answered the question it was asked — that record
    // carries no media whatsoever — and left the webhook envelope
    // unexamined. Log both, so the next blank message either names its
    // key or proves the provider never sends one.
    if (!body && !media) {
      console.warn('[wa-webhook] inbound with no text and no recognised media.'
        + ' message_body=' + JSON.stringify(msg?.message_body ?? null).slice(0, 600)
        + ' webhook_payload=' + JSON.stringify(event.payload ?? null).slice(0, 900));
    }
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
    `INSERT INTO wa_messages (id, contact_id, direction, body, media_url, media_type,
                              provider_message_id, status)
     VALUES ($1, $2, 'in', $3, $4, $5, $6, 'received')
     ON CONFLICT (provider_message_id) DO NOTHING`,
    [messageId, contact.id, body, media?.url ?? null, media?.type ?? null, providerMessageId]
  );
  if (rowCount === 0) return { duplicate: true };

  const preview = (body || (media ? `[${media.type}]` : '[media message]')).slice(0, PREVIEW_LEN);
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

  // Caller ACKs, then runs the state machine on this — unless the body is
  // one of sent.dm's compliance keywords, which its consent engine has
  // already acted on. Stored either way: the transcript is the record of
  // what the customer said, keyword or not.
  return {
    ingested: true, contact,
    keyword: complianceKeyword(body),
    message: { id: messageId, body, mediaUrl: media?.url ?? null, mediaType: media?.type ?? null },
  };
}
