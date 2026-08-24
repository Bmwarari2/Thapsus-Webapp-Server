// utils/waStateMachine.js
//
// Decides what happens when a WhatsApp message arrives from a customer.
// Called by routes/waWebhook.js AFTER the inbound row is persisted and the
// inbox counters/SSE are updated — this module only produces side effects
// (bot replies, state transitions, operator alerts).
//
// Dispatch order:
//   1. Onboarding — contact not yet 'active'. Leads with what we do and
//      what we charge, then invites a product link; the name and delivery
//      address are asked for while the customer is already waiting on a
//      quote, which is the only moment those questions cost nothing.
//      Name + address mints the Customer Code. No M-Pesa number is
//      collected — payments are identified from the M-Pesa statement.
//   2. Tracking auto-reply — an 'active' contact texting a TRK-#### code
//      gets the order's live status back, no operator needed (Phase 4
//      self-service).
//   3. Quote confirmation — a "yes"-like reply while the contact has
//      exactly one order awaiting confirmation flips it to 'confirmed',
//      opens the awaiting_review payment row, and sends till
//      instructions. Anything ambiguous falls through to a human.
//   3b. Payment claim — "I've paid" / a pasted M-Pesa SMS gets an
//      it's-being-verified reply (never a handoff), the reference stamped
//      onto the open payment, and a staff alert.
//   4. Everything else: when the Gemini layer is enabled (wa_settings
//      ai_enabled + GEMINI_API_KEY), it answers from the operator's
//      knowledge base PLUS a live summary of this customer's own orders
//      (loadOrderContext), so "where is my parcel?" works without an
//      exact code. It can also decline in two distinct ways:
//        HANDOFF   → a person is needed (complaint, refund, a question
//                    about our service we can't answer): acknowledge,
//                    hand the thread over, page staff.
//        OFF_TOPIC → nothing to do with us (wrong number, general
//                    knowledge, jokes): say what we do, once an hour,
//                    and leave the assistant live. No alert, no takeover.
//      On any AI failure the message just sits in the operator inbox
//      (the webhook already bumped unread + SSE before calling us).
//
// The AI is consulted ONLY for onboarding interpretation and the final
// fall-through. Money and state (tracking replies, confirmations, quotes,
// payments, pipeline moves) run BEFORE it and stay fully deterministic.
//
// Human takeover: while wa_contacts.human_takeover_at is set (an operator
// replied, or the assistant handed off) the AI stays quiet. It clears
// itself after ai_resume_after_minutes of silence, or when an operator
// re-enables it for that chat from the inbox.
//
// State lives entirely on wa_contacts.state — no in-memory sessions, so
// deploys/restarts never lose a customer mid-onboarding.

import { sendToContact } from './waSend.js';
import { extractTrackingCode, nextCustomerCode } from './waCodes.js';
import { pushToStaff } from '../routes/events.js';
import { getWaSettings } from './waSettings.js';
import { aiConfigured, chatReply, onboardingTurn, summarizeConversation } from './waAi.js';
import { notifyStaff } from './waStaffAlert.js';
import {
  attachMpesaReference, ensureManualPayment, extractMpesaReference,
  findOpenContactPayment, mpesaTill,
} from './waPayments.js';

const CONFIRM_WORDS = /^(yes+|yeah|yep|ok(ay)?|confirm(ed)?|proceed|sawa( sawa)?|ndio|ndiyo|poa|1)\b/i;

// "I've paid" in the shapes Kenyan customers actually type, including a
// pasted M-Pesa confirmation (which always carries a 10-char reference).
// Deliberately narrower than "sent"/"lipa" on their own — those show up in
// "I sent the link" and in our own "Lipa na M-Pesa" instructions quoted
// back at us, and a false positive here silences the assistant.
const PAID_CLAIM =
  /\bpaid\b|\bnimelipa\b|\bnimeshalipa\b|\bnimetuma\b|\bpayment (sent|made|done|complete)\b|\bsent (the |you )?(money|payment|cash|funds)\b|\bconfirmed\b[\s\S]{0,80}\bksh/i;

// A product link is now the whole point of the first conversation — the
// assistant opens by inviting one, and everything after it (the quote,
// the order, the money) is a person's job. Nothing was watching for it:
// a link landed in the inbox and waited for somebody to look. This is
// the pattern that says "there is a URL in here", kept deliberately
// dumb — any link a customer sends us is worth a person's attention,
// and a false positive costs one alert.
const PRODUCT_LINK = /\bhttps?:\/\/\S+|\b(?:www\.|[a-z0-9-]+\.)(?:com|co\.uk|co\.ke|net|org|shop|store|me|ae|cn|us)\b\/?\S*/i;

// Stable phrases inside two of our own replies — also how we recognise
// that we already sent one recently (template_key isn't recorded for
// free text, so the transcript body is what we have to match on).
const VERIFYING_MARKER = 'verifying it with M-Pesa';
const OFF_TOPIC_MARKER = 'only help with Thapsus Cargo';

// How much verbatim transcript rides in the prompt, and how often the
// durable memory note behind it gets refreshed.
const HISTORY_WINDOW = 30;
const SUMMARY_EVERY_MESSAGES = 20;

const STATUS_LABEL = {
  quoting: 'Being quoted',
  quoted: 'Quote sent — awaiting your confirmation',
  confirmed: 'Confirmed — awaiting payment',
  paid: 'Paid — purchase in progress',
  purchased: 'Purchased — on its way to our facility',
  in_kenya: 'Arrived in Kenya',
  delivery_fee_pending: 'Arrived in Kenya — delivery fee pending',
  dispatched: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/**
 * @param {pg.Pool} db
 * @param {object} contact  fresh wa_contacts row
 * @param {{id: string, body: string|null, mediaUrl: string|null}} message
 */
export async function handleInbound(db, contact, message) {
  if (contact.state === 'blocked') return;

  const body = (message.body || '').trim();

  let settings = null;
  try { settings = await getWaSettings(db); } catch { /* run without AI */ }
  const ai = Boolean(settings?.ai_enabled) && aiConfigured();

  // 1. Human takeover, evaluated before anything else so it applies to
  // onboarding too — the assistant can hand a signup over (a complaint
  // arrives mid-questionnaire) and must then stay quiet like anywhere
  // else. Deterministic replies (tracking codes, quote confirmations)
  // keep working throughout; only the AI chat pauses.
  const aiPaused = await aiOnHold(db, contact, message, settings);

  // 1b. A link means somebody wants a quote, and only a person can give
  // one. Page staff before any of the branching below, so it reaches
  // them whether the sender is a stranger mid-signup or a regular, and
  // whether the AI or an operator is holding the thread. The unread
  // badge in the inbox was the only signal until now, and an unnoticed
  // quote request is the most expensive thing this system can drop.
  if (body && PRODUCT_LINK.test(body)) {
    notifyStaff(db, {
      title: 'Product link received — quote needed',
      detail: `${contact.full_name || contact.phone} (${contact.customer_code || 'no code yet'}): "${body.slice(0, 200)}"`,
      dedupeKey: `link:${contact.id}:${body.slice(0, 80)}`,
    });
    pushToStaff('wa_quote_request', {
      contact_id: contact.id,
      customer_code: contact.customer_code || null,
      full_name: contact.full_name || null,
      phone: contact.phone,
      preview: body.slice(0, 200),
    });
  }

  if (contact.state !== 'active') {
    // AI-first: when enabled, Gemini drives onboarding from the very
    // first message — greeting, explaining, answering questions, and
    // gathering the profile in whatever order the conversation flows.
    // Any AI failure drops to the deterministic script below.
    if (ai && !aiPaused) {
      try {
        return await aiOnboarding(db, contact, message, body, settings);
      } catch (e) {
        console.warn('[waStateMachine] AI onboarding failed — using scripted flow:', e?.message);
      }
    }
    // While a human has the thread, the scripted questionnaire would
    // talk over them just as loudly as the AI would. Leave it in the
    // inbox.
    if (aiPaused) return;
    return handleOnboarding(db, contact, body, { settings });
  }

  // 2. Tracking self-service.
  const trackingCode = extractTrackingCode(body);
  if (trackingCode) {
    return replyTrackingStatus(db, contact, trackingCode);
  }

  // 3. Quote confirmation.
  if (CONFIRM_WORDS.test(body)) {
    const { rows } = await db.query(
      `SELECT id, quote_kes FROM wa_orders
        WHERE contact_id = $1 AND status = 'quoted'
        ORDER BY quoted_at DESC`,
      [contact.id]
    );
    // Only automate the unambiguous case — exactly one quote awaiting a
    // yes. Zero or several quoted orders → let the operator sort it out.
    if (rows.length === 1) {
      const order = rows[0];
      await db.query(
        `UPDATE wa_orders
            SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND status = 'quoted'`,
        [order.id]
      );
      await db.query(
        `INSERT INTO wa_order_events (id, order_id, from_status, to_status, note)
         VALUES (gen_random_uuid()::text, $1, 'quoted', 'confirmed', 'Customer confirmed on WhatsApp')`,
        [order.id]
      );
      pushToStaff('wa_pipeline_update', { order_id: order.id, status: 'confirmed', contact_id: contact.id });
      notifyStaff(db, {
        title: 'Order confirmed — send payment details',
        detail: `${contact.full_name || contact.phone} (${contact.customer_code || 'no code'}) confirmed KSh ${Number(order.quote_kes).toLocaleString('en-KE')}`,
        dedupeKey: `confirmed:${order.id}`,
      });
      // M-Pesa STK is unavailable (provider withdrawn), so every payment
      // is a Buy Goods transfer the team verifies by hand. Open the
      // awaiting_review payment now: the operator's "Approve payment"
      // action needs a row to act on, and the customer is about to pay.
      try {
        await ensureManualPayment(db, {
          orderId: order.id,
          contactId: contact.id,
          amountKes: Number(order.quote_kes),
          phone: contact.mpesa_number || contact.phone || null,
        });
      } catch (e) {
        console.warn('[waStateMachine] could not open payment row:', e?.message);
      }
      const till = mpesaTill();
      await sendToContact(db, contact, {
        templateKey: 'payment_prompt',
        templateParams: {
          full_name: contact.full_name,
          order_ref: order.tracking_code || 'your order',
          total_kes: Number(order.quote_kes).toLocaleString('en-KE'),
        },
        text:
          `Great! Your order is confirmed at KSh ${Number(order.quote_kes).toLocaleString('en-KE')}.\n\n` +
          `To pay: Lipa na M-Pesa → Buy Goods${till ? ` → Till *${till}*` : ''} → ` +
          `KSh ${Number(order.quote_kes).toLocaleString('en-KE')}.\n\n` +
          `Reply here once you've paid and we'll confirm it right away.`,
      });
      return;
    }
  }

  // 3b. Customer says they've paid. With STK unavailable every payment is
  // checked against the M-Pesa statement by hand, so we answer this
  // ourselves rather than letting the AI improvise (it used to read the
  // message as a complaint and hand off with "let me get a colleague",
  // which reads like nobody has their money). Tell them it's being
  // verified, stamp the reference onto their open payment so the operator
  // can match it, and page staff.
  if (body && PAID_CLAIM.test(body)) {
    const ref = extractMpesaReference(body);
    notifyStaff(db, {
      title: 'Payment claimed — verify on M-Pesa',
      detail: `${contact.full_name || contact.phone} (${contact.customer_code || 'no code'}): "${body.slice(0, 160)}"${ref ? ` — ref ${ref}` : ''}`,
      dedupeKey: `paid:${contact.id}:${ref || body.slice(0, 40)}`,
    });

    let amountKes = null;
    try {
      const open = await findOpenContactPayment(db, contact.id);
      if (open) {
        amountKes = Number(open.amount_due_kes);
        if (ref) await attachMpesaReference(db, open.id, ref);
      }
    } catch (e) {
      console.warn('[waStateMachine] payment-claim bookkeeping failed:', e?.message);
    }

    // One reassurance per burst — customers often send the M-Pesa SMS and
    // "I have paid" as two messages seconds apart.
    if (!await sentRecently(db, contact.id, VERIFYING_MARKER, 30)) {
      await sendToContact(db, contact, {
        templateKey: 'payment_verifying',
        templateParams: { reference: ref || 'pending confirmation' },
        text:
          `Asante. We've got your payment notification${ref ? ` (ref *${ref}*)` : ''}` +
          `${amountKes ? ` for KSh ${amountKes.toLocaleString('en-KE')}` : ''} and our team is ` +
          `${VERIFYING_MARKER} now.\n\n` +
          `We'll confirm here as soon as it clears and send your tracking code — usually within a few minutes.`,
      });
    }
    return;
  }

  // 4. AI answer — knowledge base + who they are + what we remember +
  // their live orders. Skipped while a human has the conversation.
  if (ai && body && !aiPaused) {
    try {
      const { rows: history } = await db.query(
        `SELECT direction, body FROM (
           SELECT direction, body, created_at FROM wa_messages
            WHERE contact_id = $1 AND body IS NOT NULL AND id <> $2
            ORDER BY created_at DESC LIMIT ${HISTORY_WINDOW}
         ) h ORDER BY created_at ASC`,
        [contact.id, message.id]
      );
      const answer = await chatReply({
        knowledgeBase: settings.ai_knowledge_base,
        history,
        message: body,
        orderContext: await loadOrderContext(db, contact.id),
        profile: describeContact(contact),
        summary: contact.ai_summary,
      });

      if (answer.kind === 'reply') {
        await sendToContact(db, contact, { text: answer.text });
      } else if (answer.kind === 'off_topic') {
        // Nothing to do with us — a wrong number, a joke, a general
        // question. Say what we do and stop there: no staff alert, no
        // takeover, the assistant stays live for their next real
        // message. Escalating these would page an operator for every
        // stray text.
        await replyOffTopic(db, contact);
      } else {
        await handOffToHuman(db, contact, body);
      }

      // Refresh durable memory in the background every so often, so the
      // assistant still recalls this conversation once it scrolls out of
      // the verbatim window. Never blocks the reply.
      maybeRefreshSummary(db, contact).catch(() => {});
    } catch (e) {
      console.warn('[waStateMachine] AI fallthrough failed (non-fatal):', e?.message);
    }
  }
}

/**
 * How to sign off once a profile is complete.
 *
 * "Send us a product link any time" is right for someone who has never
 * ordered and wrong for everyone else. Eunice was told it three minutes
 * after an operator placed and purchased TRK-8828 for her, and reasonably
 * asked whether anything was happening at all. If there is work in
 * flight, the sign-off should say where it is.
 */
async function signOffLine(db, contactId) {
  const { rows } = await db.query(
    `SELECT tracking_code, status FROM wa_orders
      WHERE contact_id = $1 AND status NOT IN ('cancelled', 'delivered')
      ORDER BY created_at DESC LIMIT 1`,
    [contactId]
  );
  const open = rows[0];
  if (!open) return `Send us a product link any time and we'll get you a quote.`;
  const ref = open.tracking_code || 'Your order';
  return `${ref} is already with us — ${(STATUS_LABEL[open.status] || open.status).toLowerCase()}. `
    + `We'll message you as it moves. No need to send anything else for it.`;
}

/** One-line profile for the prompt: who the assistant is talking to. */
function describeContact(contact) {
  const bits = [];
  if (contact.full_name) bits.push(`Name: ${contact.full_name}`);
  if (contact.customer_code) bits.push(`Customer code: ${contact.customer_code}`);
  if (contact.delivery_address) bits.push(`Delivery address: ${contact.delivery_address}`);
  if (contact.created_at) {
    bits.push(`Customer since: ${new Date(contact.created_at).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}`);
  }
  return bits.length ? bits.join('; ') : '(unknown)';
}

/**
 * Rebuild the durable memory note when enough has been said since the
 * last one. Best-effort and out of band — a failure just means the note
 * is a little stale.
 */
async function maybeRefreshSummary(db, contact) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM wa_messages
      WHERE contact_id = $1 AND ($2::timestamptz IS NULL OR created_at > $2)`,
    [contact.id, contact.ai_summary_at || null]
  );
  if ((rows[0]?.n ?? 0) < SUMMARY_EVERY_MESSAGES) return;

  const { rows: history } = await db.query(
    `SELECT direction, body FROM (
       SELECT direction, body, created_at FROM wa_messages
        WHERE contact_id = $1 AND body IS NOT NULL
        ORDER BY created_at DESC LIMIT 60
     ) h ORDER BY created_at ASC`,
    [contact.id]
  );
  const summary = await summarizeConversation({ previous: contact.ai_summary, history });
  await db.query(
    `UPDATE wa_contacts SET ai_summary = $2, ai_summary_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [contact.id, summary]
  );
  console.info(`[waStateMachine] refreshed AI memory for ${contact.id}`);
}

/**
 * Is the assistant paused on this conversation? True while a human has
 * it (an operator replied, or the AI handed off). Clears itself once the
 * chat has been silent for ai_resume_after_minutes, so a customer who
 * comes back days later isn't stuck waiting on a person who has moved on.
 */
async function aiOnHold(db, contact, message, settings) {
  if (!contact.human_takeover_at) return false;

  const { rows } = await db.query(
    `SELECT MAX(created_at) AS at FROM wa_messages WHERE contact_id = $1 AND id <> $2`,
    [contact.id, message.id]
  );
  const lastAt = rows[0]?.at ? new Date(rows[0].at).getTime() : 0;
  const quietMs = Date.now() - lastAt;
  const resumeAfterMs = Math.max(1, Number(settings?.ai_resume_after_minutes ?? 120)) * 60_000;
  if (!lastAt || quietMs < resumeAfterMs) return true;

  await db.query(
    `UPDATE wa_contacts SET human_takeover_at = NULL, updated_at = NOW() WHERE id = $1`,
    [contact.id]
  );
  console.info(`[waStateMachine] AI resumed for ${contact.id} after ${Math.round(quietMs / 60000)}m of silence`);
  return false;
}

/** Did we already send this line to this contact recently? */
async function sentRecently(db, contactId, marker, minutes) {
  const { rows } = await db.query(
    `SELECT 1 FROM wa_messages
      WHERE contact_id = $1 AND direction = 'out' AND body LIKE $2
        AND created_at > NOW() - ($3 || ' minutes')::interval
      LIMIT 1`,
    [contactId, `%${marker}%`, String(minutes)]
  );
  return rows.length > 0;
}

/**
 * The message has nothing to do with us. Say what we do, once, and stay
 * out of the way — no operator alert, no takeover, the assistant is
 * still live for their next real message. Repeats are suppressed for an
 * hour so a chatty wrong number doesn't get the same line ten times;
 * their messages still land in the inbox either way.
 *
 * @param {string} [followUp] appended when we still need something from
 *   them (mid-onboarding), so the redirect also moves the flow along.
 */
async function replyOffTopic(db, contact, followUp = '') {
  if (await sentRecently(db, contact.id, OFF_TOPIC_MARKER, 60)) return;
  await sendToContact(db, contact, {
    text:
      `Sorry, I can ${OFF_TOPIC_MARKER} orders — quotes, payments, tracking and delivery. `
      + (followUp || `Send us a product link any time and we'll get you a quote, `
        + `or text your tracking code for an update.`),
  });
}

/**
 * A person is needed: a complaint, a refund, a human request, or a
 * question about our service the assistant can't answer. Acknowledge so
 * the customer isn't left in silence, hand the thread over (the AI goes
 * quiet until it times out or an operator re-enables it), and page staff.
 */
async function handOffToHuman(db, contact, body) {
  await sendToContact(db, contact, {
    text: `Let me get a colleague for you — someone from our team will reply here shortly.`,
  });
  await db.query(
    `UPDATE wa_contacts SET human_takeover_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [contact.id]
  );
  notifyStaff(db, {
    title: 'Customer needs a human',
    detail: `${contact.full_name || contact.phone} (${contact.customer_code || 'no code'}): "${body.slice(0, 200)}"`,
    dedupeKey: `handoff:${contact.id}:${body.slice(0, 40)}`,
  });
}

// ── Onboarding ──────────────────────────────────────────────────────────────

async function setState(db, contactId, state, fields = {}) {
  const sets = ['state = $2', 'updated_at = NOW()'];
  const params = [contactId, state];
  for (const [col, val] of Object.entries(fields)) {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  }
  await db.query(`UPDATE wa_contacts SET ${sets.join(', ')} WHERE id = $1`, params);
}

/**
 * Render this customer's orders for the AI prompt so questions like
 * "where is my parcel?" or a half-remembered code can be answered without
 * an exact TRK match. Read-only: the model is told these are live facts it
 * may state, and that it must hand off for anything not listed.
 */
async function loadOrderContext(db, contactId) {
  const { rows } = await db.query(
    `SELECT tracking_code, status, quote_kes, delivery_fee_kes, delivery_fee_waived,
            delivery_fee_paid_at, paid_at, purchased_at, arrived_at,
            dispatched_at, delivered_at, created_at
       FROM wa_orders
      WHERE contact_id = $1 AND status <> 'cancelled'
      ORDER BY created_at DESC LIMIT 5`,
    [contactId]
  );
  if (rows.length === 0) return '(none on file)';

  const day = (d) => (d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) : null);
  return rows.map((o) => {
    const steps = [
      ['paid', o.paid_at], ['purchased', o.purchased_at], ['arrived in Kenya', o.arrived_at],
      ['out for delivery', o.dispatched_at], ['delivered', o.delivered_at],
    ].filter(([, at]) => at).map(([label, at]) => `${label} ${day(at)}`);

    const bits = [
      o.tracking_code ? `Tracking ${o.tracking_code}` : 'No tracking code yet (not paid)',
      `status: ${STATUS_LABEL[o.status] || o.status}`,
    ];
    if (o.quote_kes) bits.push(`agreed total KSh ${Number(o.quote_kes).toLocaleString('en-KE')}`);
    if (steps.length) bits.push(`history: ${steps.join(', ')}`);
    if (o.status === 'delivery_fee_pending' && !o.delivery_fee_waived && !o.delivery_fee_paid_at) {
      bits.push(`delivery fee outstanding: KSh ${Number(o.delivery_fee_kes || 0).toLocaleString('en-KE')}`);
    }
    if (o.delivery_fee_waived) bits.push('delivery fee waived');
    return `- ${bits.join('; ')}`;
  }).join('\n');
}

// What to ask for next, keyed by the awaiting_* state. Used when an
// off-topic message interrupts signup — the redirect carries the
// question so the flow keeps moving.
const MISSING_FIELD_PROMPT = {
  awaiting_name: `To set you up, what's your full name?`,
  awaiting_address: `To set you up: where should the parcel go? Send a delivery address (estate/building, street, town), or tell us the pickup point you'd rather collect from.`,
};

// Somewhere we can actually send a parcel — a street address, or a
// collection point. Collection answers are short by nature ("CBD",
// "Mtaani", "Stanbank"), so a length floor on its own would re-ask a
// customer who has already answered perfectly well.
const PICKUP_WORDS = /\b(cbd|town|stanbank|pick\s?up|pickup|mtaani|collect(ion)?|office)\b/i;

/** Is this plausibly a destination — an address, or a pickup point? */
export function looksLikeDestination(value) {
  const v = String(value || '').trim();
  return v.length >= 5 || PICKUP_WORDS.test(v);
}

/**
 * Greetings and pleasantries people open with, which are not names.
 *
 * Eunice said "Hi" while we were waiting on her name and was answered
 * with "Thanks Hi! What's your delivery address?" — the greeting went
 * into full_name and the profile moved on. The prompt now tells the model
 * the same thing, but the model is not the place to enforce it: this runs
 * on the scripted path too, and a rule this cheap should not depend on
 * whether the AI is having a good day.
 */
const NOT_A_NAME = /^(hi|hey|hello+|yo|habari|niaje|sasa|mambo|karibu|jambo|salamu|hola|good\s*(morning|afternoon|evening|day)|asante|thanks?|thank\s*you|ok(ay)?|sawa(sawa)?|yes|no|please|help|start|hi\s*there)\b[\s!.,]*$/i;

/** Is this plausibly someone's name, rather than a greeting or a link? */
export function looksLikeName(value) {
  const name = String(value || '').trim();
  if (name.length < 2 || name.length > 120) return false;
  if (/^https?:\/\//i.test(name)) return false;
  if (NOT_A_NAME.test(name)) return false;
  // A name has letters in it; "0700092005" and "..." do not.
  return /\p{L}{2,}/u.test(name);
}

/**
 * AI-first onboarding turn. Gemini produces the reply AND any profile
 * fields it spotted in the message; this function stays in charge of the
 * rules: field validation (looksLikeName is the hard gate on the name),
 * state bookkeeping (the awaiting_* states track what's still missing, so
 * the scripted flow can take over seamlessly if AI is ever disabled
 * mid-conversation), Customer Code minting, and operator alerts. Throws
 * on AI failure so the caller falls back to the script.
 */
async function aiOnboarding(db, contact, message, body, settings) {
  const { rows: history } = await db.query(
    `SELECT direction, body FROM (
       SELECT direction, body, created_at FROM wa_messages
        WHERE contact_id = $1 AND body IS NOT NULL AND id <> $2
        ORDER BY created_at DESC LIMIT 10
     ) h ORDER BY created_at ASC`,
    [contact.id, message.id]
  );

  const turn = await onboardingTurn({
    knowledgeBase: settings.ai_knowledge_base,
    history,
    message: body,
    orderContext: await loadOrderContext(db, contact.id),
    profile: {
      full_name: contact.full_name || null,
      delivery_address: contact.delivery_address || null,
    },
  });

  // Apply extracted fields under the same rules as the scripted flow.
  const fields = {};
  if (!contact.full_name && looksLikeName(turn.full_name)) {
    fields.full_name = turn.full_name.trim();
  }
  if (!contact.delivery_address && looksLikeDestination(turn.delivery_address)) {
    fields.delivery_address = turn.delivery_address;
  }

  // A name and somewhere to send the parcel. The M-Pesa number used to be
  // the third thing we held people up for, and it earned nothing: payments
  // are read off the M-Pesa statement, so knowing the number in advance
  // never once told us anything we could not see afterwards.
  const merged = { ...contact, ...fields };
  const complete = merged.full_name && merged.delivery_address;
  const nextState = complete ? 'active'
    : !merged.full_name ? 'awaiting_name'
    : 'awaiting_address';

  let customerCode = contact.customer_code;
  if (complete && !customerCode) {
    customerCode = await nextCustomerCode(db);
    fields.customer_code = customerCode;
  }
  if (nextState !== contact.state || Object.keys(fields).length > 0) {
    await setState(db, contact.id, nextState, fields);
  }

  if (turn.kind === 'reply' && turn.reply) {
    await sendToContact(db, contact, { text: turn.reply });
  } else if (turn.kind === 'off_topic') {
    // Off-topic mid-signup: redirect, then re-ask whatever we still
    // need so the conversation doesn't stall. (Before this branch
    // existed the sentinel was stripped to null and the customer got
    // nothing back at all.)
    await replyOffTopic(db, contact, complete ? '' : `${MISSING_FIELD_PROMPT[nextState]}`);
  } else if (turn.kind === 'handoff') {
    await handOffToHuman(db, contact, body);
    return; // a person has the thread now — don't also run the welcome media
  }

  // First-ever exchange: send the welcome infographics (best-effort).
  if (contact.state === 'new') {
    for (const url of (settings.welcome_media_urls || []).slice(0, 3)) {
      await sendToContact(db, contact, { templateKey: 'welcome_media', mediaUrl: url, mediaType: 'image' });
    }
  }

  if (complete && !contact.customer_code) {
    pushToStaff('wa_new_customer', {
      contact_id: contact.id,
      customer_code: customerCode,
      full_name: merged.full_name,
      phone: contact.phone,
    });
    notifyStaff(db, {
      title: 'New customer onboarded',
      detail: `${merged.full_name || contact.phone} — ${customerCode} — ${merged.delivery_address || 'no address'}`,
      dedupeKey: `onboarded:${contact.id}`,
    });
    await sendToContact(db, contact, {
      templateKey: 'onboarded',
      templateParams: { customer_code: customerCode },
      text:
        `You're all set. Your customer code is *${customerCode}* — keep it handy, it goes on all your parcels.\n\n` +
        `${await signOffLine(db, contact.id)}`,
    });
  }
}

// The deterministic onboarding script — the fallback whenever the AI is
// disabled, unconfigured, or errored on a turn.
async function handleOnboarding(db, contact, body, { settings = null } = {}) {
  switch (contact.state) {
    case 'new': {
      await setState(db, contact.id, 'awaiting_name');
      await sendToContact(db, contact, {
        templateKey: 'welcome',
        text:
          `Karibu Thapsus Cargo.\n\n` +
          `We buy items from online stores abroad and deliver them to your door in Kenya. ` +
          `How it works:\n` +
          `1. Send us the product link(s)\n` +
          `2. We reply with a KES quote\n` +
          `3. Pay via M-Pesa\n` +
          `4. We buy and ship it — you track it with your code until it's delivered\n\n` +
          `What would you like to do? Send a product link for a quote, or ask us anything.`,
      });
      // Welcome infographics (operator-configurable). Best-effort.
      try {
        const settings = await getWaSettings(db);
        for (const url of (settings.welcome_media_urls || []).slice(0, 3)) {
          await sendToContact(db, contact, { templateKey: 'welcome_media', mediaUrl: url, mediaType: 'image' });
        }
      } catch { /* non-fatal */ }
      return;
    }

    case 'awaiting_name': {
      // A link is the likeliest second message now that the welcome asks
      // for one. Answer what they actually sent before asking anything:
      // "please reply with your full name" to somebody who just sent a
      // product link reads like nobody looked at it. Staff were paged the
      // moment it arrived, so the quote really is in motion.
      if (PRODUCT_LINK.test(body)) {
        return sendToContact(db, contact, {
          text:
            `Got it — our team is pricing that now and your quote will come through here shortly.\n\n` +
            `While you wait: what's your full name? (As we should write it on your parcels.)`,
        });
      }
      if (!looksLikeName(body)) {
        return sendToContact(db, contact, {
          text: `Please reply with your full name (as we should write it on your parcels).`,
        });
      }
      await setState(db, contact.id, 'awaiting_address', { full_name: body.slice(0, 120) });
      return sendToContact(db, contact, {
        text: `Thanks ${body.split(/\s+/)[0]}! Where should we send it? A delivery address (estate/building, street, town), or the pickup point you'd rather collect from.`,
      });
    }

    case 'awaiting_address': {
      if (PRODUCT_LINK.test(body)) {
        return sendToContact(db, contact, {
          text:
            `Got it — our team is pricing that now and your quote will come through here shortly.\n\n` +
            `While you wait: where should the parcel go? A delivery address (estate/building, street, town), or the pickup point you'd rather collect from.`,
        });
      }
      if (!looksLikeDestination(body)) {
        return sendToContact(db, contact, {
          text: `Please tell us where the parcel should go — a delivery address (estate/building, street and town), or the pickup point you'd rather collect from.`,
        });
      }
      // Last question. There used to be one more, for an M-Pesa number we
      // never needed: payments are read off the M-Pesa statement.
      const customerCode = await nextCustomerCode(db);
      await setState(db, contact.id, 'active', {
        delivery_address: body.slice(0, 400),
        customer_code: customerCode,
      });
      pushToStaff('wa_new_customer', {
        contact_id: contact.id,
        customer_code: customerCode,
        full_name: contact.full_name,
        phone: contact.phone,
      });
      notifyStaff(db, {
        title: 'New customer onboarded',
        detail: `${contact.full_name || contact.phone} — ${customerCode}`,
        dedupeKey: `onboarded:${contact.id}`,
      });
      return sendToContact(db, contact, {
        templateKey: 'onboarded',
        templateParams: { customer_code: customerCode },
        text:
          `You're all set. Your customer code is *${customerCode}* — keep it handy, it goes on all your parcels.\n\n` +
          `${await signOffLine(db, contact.id)}`,
      });
    }

    default:
      return; // 'blocked' handled upstream; unknown states stay silent
  }
}

// ── Tracking self-service ───────────────────────────────────────────────────

async function replyTrackingStatus(db, contact, trackingCode) {
  const { rows } = await db.query(
    `SELECT o.*, c.customer_code
       FROM wa_orders o
       JOIN wa_contacts c ON c.id = o.contact_id
      WHERE o.tracking_code = $1`,
    [trackingCode]
  );
  const order = rows[0];
  if (!order) {
    return sendToContact(db, contact, {
      text:
        `We couldn't find a parcel with code ${trackingCode} — double-check the code on your receipt. ` +
        `If it still doesn't work, reply here and our team will help you out.`,
    });
  }

  return sendToContact(db, contact, { text: parcelStateSentence(order, trackingCode) });
}

/**
 * Where the parcel is, in a sentence or two. That is the entire question
 * behind "TRK-8822?" — an earlier version answered with a status label, a
 * progress bar, a next-step line and the amount paid, which restated the
 * same fact three times and buried it. Each status owns its own wording
 * so the update reads like a person wrote it.
 */
function parcelStateSentence(order, trackingCode) {
  const on = (d) => (d ? ` on ${new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'long' })}` : '');
  const feeDue = order.status === 'delivery_fee_pending' && !order.delivery_fee_waived
    && !order.delivery_fee_paid_at && Number(order.delivery_fee_kes) > 0;

  switch (order.status) {
    case 'paid':
      return `${trackingCode} — we received your payment${on(order.paid_at)} and we're buying your item now. `
        + `We'll let you know the moment it's purchased.`;

    case 'purchased':
      return `${trackingCode} — your item was purchased${on(order.purchased_at)} and is on its way to our facility. `
        + `We'll message you as soon as it lands in Kenya.`;

    case 'in_kenya':
      return `${trackingCode} — your parcel arrived in Kenya${on(order.arrived_at)}. `
        + `We're getting it ready and will dispatch it to your address shortly.`;

    case 'delivery_fee_pending':
      return feeDue
        ? `${trackingCode} — your parcel arrived in Kenya${on(order.arrived_at)} and is ready to send out. `
          + `Last step is the delivery fee of KSh ${Number(order.delivery_fee_kes).toLocaleString('en-KE')}: `
          + `Lipa na M-Pesa, Buy Goods, Till ${mpesaTill()}. Reply here once you've paid and we'll dispatch it.`
        : `${trackingCode} — your parcel arrived in Kenya${on(order.arrived_at)} and will be dispatched to your address shortly.`;

    case 'dispatched':
      return `${trackingCode} — your parcel went out for delivery${on(order.dispatched_at)}. `
        + `Our rider will call you when they arrive, usually within 24 hours.`;

    case 'delivered':
      return `${trackingCode} — delivered${on(order.delivered_at)}. Asante for shopping with Thapsus Cargo. `
        + `Send us another link whenever you're ready.`;

    case 'cancelled':
      return `${trackingCode} — this order was cancelled. Reply here if that's unexpected and we'll sort it out.`;

    // Pre-payment states can't normally be reached by a tracking lookup
    // (the code is minted when the payment settles), but an operator can
    // move an order backwards, so answer rather than say nothing.
    case 'confirmed':
      return `${trackingCode} — we're waiting on your payment to start buying. Reply here if you need the till details again.`;
    case 'quoting':
    case 'quoted':
      return `${trackingCode} — we're still finalising your quote. We'll send it here shortly.`;

    default:
      return `${trackingCode} — ${STATUS_LABEL[order.status] || order.status}. Reply here if you need anything else.`;
  }
}

