// utils/waStateMachine.js
//
// Decides what happens when a WhatsApp message arrives from a customer.
// Called by routes/waWebhook.js AFTER the inbound row is persisted and the
// inbox counters/SSE are updated — this module only produces side effects
// (bot replies, state transitions, operator alerts).
//
// Dispatch order:
//   1. Onboarding — contact not yet 'active': welcome → collect full name
//      → delivery address → M-Pesa number → mint Customer Code → done.
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
//      exact code; otherwise — and on any AI failure or handoff — the
//      message just sits in the operator inbox (the webhook already
//      bumped unread + SSE before calling us).
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
import { normalizeKenyanPhone } from './lipanaClient.js';
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

// Stable phrase inside the verification reply — also how we recognise that
// we already sent one recently (template_key isn't recorded for free text).
const VERIFYING_MARKER = 'verifying it with M-Pesa';

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
  in_kenya: 'Arrived in Kenya 🇰🇪',
  delivery_fee_pending: 'Arrived in Kenya — delivery fee pending',
  dispatched: 'Out for delivery 🚚',
  delivered: 'Delivered ✅',
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

  if (contact.state !== 'active') {
    // AI-first: when enabled, Gemini drives onboarding from the very
    // first message — greeting, explaining, answering questions, and
    // gathering the profile in whatever order the conversation flows.
    // Any AI failure drops to the deterministic script below.
    if (ai) {
      try {
        return await aiOnboarding(db, contact, message, body, settings);
      } catch (e) {
        console.warn('[waStateMachine] AI onboarding failed — using scripted flow:', e?.message);
      }
    }
    return handleOnboarding(db, contact, body, { settings });
  }

  // 1b. Human takeover. Once an operator replies (or the assistant hands
  // off) the assistant goes quiet so the customer isn't answered by two
  // voices. It resumes by itself once the conversation has been silent
  // for ai_resume_after_minutes — or the moment an operator flips it back
  // on from the inbox. Deterministic replies (tracking codes, quote
  // confirmations) keep working throughout; only the AI chat pauses.
  let aiPaused = false;
  if (contact.human_takeover_at) {
    const { rows: prev } = await db.query(
      `SELECT MAX(created_at) AS at FROM wa_messages WHERE contact_id = $1 AND id <> $2`,
      [contact.id, message.id]
    );
    const lastAt = prev[0]?.at ? new Date(prev[0].at).getTime() : 0;
    const quietMs = Date.now() - lastAt;
    const resumeAfterMs = Math.max(1, Number(settings?.ai_resume_after_minutes ?? 120)) * 60_000;
    if (lastAt && quietMs >= resumeAfterMs) {
      await db.query(
        `UPDATE wa_contacts SET human_takeover_at = NULL, updated_at = NOW() WHERE id = $1`,
        [contact.id]
      );
      console.info(`[waStateMachine] AI resumed for ${contact.id} after ${Math.round(quietMs / 60000)}m of silence`);
    } else {
      aiPaused = true;
    }
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
        templateParams: { amount_kes: String(order.quote_kes) },
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
    const { rows: recent } = await db.query(
      `SELECT 1 FROM wa_messages
        WHERE contact_id = $1 AND direction = 'out'
          AND body LIKE $2 AND created_at > NOW() - INTERVAL '30 minutes'
        LIMIT 1`,
      [contact.id, `%${VERIFYING_MARKER}%`]
    );
    if (recent.length === 0) {
      await sendToContact(db, contact, {
        templateKey: 'payment_verifying',
        templateParams: { reference: ref || 'pending confirmation' },
        text:
          `Asante 🙏 We've got your payment notification${ref ? ` (ref *${ref}*)` : ''}` +
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
      const reply = await chatReply({
        knowledgeBase: settings.ai_knowledge_base,
        history,
        message: body,
        orderContext: await loadOrderContext(db, contact.id),
        profile: describeContact(contact),
        summary: contact.ai_summary,
      });

      if (reply) {
        await sendToContact(db, contact, { text: reply });
      } else {
        // HANDOFF — the assistant deliberately stepped back (human
        // requested, complaint, something outside the knowledge base).
        // Tell the customer a person is coming rather than going silent
        // on them, hand the thread to the humans, and alert staff.
        await sendToContact(db, contact, {
          text: `Let me get a colleague for you 🙏 Someone from our team will reply here shortly.`,
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

      // Refresh durable memory in the background every so often, so the
      // assistant still recalls this conversation once it scrolls out of
      // the verbatim window. Never blocks the reply.
      maybeRefreshSummary(db, contact).catch(() => {});
    } catch (e) {
      console.warn('[waStateMachine] AI fallthrough failed (non-fatal):', e?.message);
    }
  }
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

/**
 * AI-first onboarding turn. Gemini produces the reply AND any profile
 * fields it spotted in the message; this function stays in charge of the
 * rules: field validation (normalizeKenyanPhone is the hard gate on the
 * M-Pesa number), state bookkeeping (the awaiting_* states track what's
 * still missing, so the scripted flow can take over seamlessly if AI is
 * ever disabled mid-conversation), Customer Code minting, and operator
 * alerts. Throws on AI failure so the caller falls back to the script.
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
      mpesa_number: contact.mpesa_number || null,
    },
  });

  // Apply extracted fields under the same rules as the scripted flow.
  const fields = {};
  if (!contact.full_name && turn.full_name
      && turn.full_name.length >= 2 && !/^https?:\/\//i.test(turn.full_name)) {
    fields.full_name = turn.full_name;
  }
  if (!contact.delivery_address && turn.delivery_address && turn.delivery_address.length >= 5) {
    fields.delivery_address = turn.delivery_address;
  }
  if (!contact.mpesa_number && turn.mpesa_number) {
    const normalized = normalizeKenyanPhone(
      /^(this( one| number)?|same|hii)$/i.test(turn.mpesa_number) ? contact.phone : turn.mpesa_number
    );
    if (normalized) fields.mpesa_number = normalized;
  }

  const merged = { ...contact, ...fields };
  const complete = merged.full_name && merged.delivery_address && merged.mpesa_number;
  const nextState = complete ? 'active'
    : !merged.full_name ? 'awaiting_name'
    : !merged.delivery_address ? 'awaiting_address'
    : 'awaiting_mpesa';

  let customerCode = contact.customer_code;
  if (complete && !customerCode) {
    customerCode = await nextCustomerCode(db);
    fields.customer_code = customerCode;
  }
  if (nextState !== contact.state || Object.keys(fields).length > 0) {
    await setState(db, contact.id, nextState, fields);
  }

  if (turn.reply) {
    await sendToContact(db, contact, { text: turn.reply });
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
        `You're all set! 🎉 Your customer code is *${customerCode}* — keep it handy, it goes on all your parcels.\n\n` +
        `Send us a product link any time and we'll get you a quote.`,
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
          `Karibu Thapsus Cargo! 🛒✈️\n\n` +
          `We buy items from online stores abroad and deliver them to your door in Kenya. ` +
          `How it works:\n` +
          `1️⃣ Send us the product link(s)\n` +
          `2️⃣ We reply with a KES quote\n` +
          `3️⃣ Pay via M-Pesa\n` +
          `4️⃣ We buy & ship it — you track it with your code until it's delivered\n\n` +
          `First, let's set you up. What's your full name?`,
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
      if (body.length < 2 || /^https?:\/\//i.test(body)) {
        return sendToContact(db, contact, {
          text: `Please reply with your full name (as we should write it on your parcels).`,
        });
      }
      await setState(db, contact.id, 'awaiting_address', { full_name: body.slice(0, 120) });
      return sendToContact(db, contact, {
        text: `Thanks ${body.split(/\s+/)[0]}! What's your delivery address? (Estate/building, street, town)`,
      });
    }

    case 'awaiting_address': {
      if (body.length < 5) {
        return sendToContact(db, contact, {
          text: `Please send your delivery address — estate/building, street and town — so our rider can find you.`,
        });
      }
      await setState(db, contact.id, 'awaiting_mpesa', { delivery_address: body.slice(0, 400) });
      return sendToContact(db, contact, {
        text: `Almost done! Which M-Pesa number will you pay with? (You can reply "this one" to use this WhatsApp number.)`,
      });
    }

    case 'awaiting_mpesa': {
      const useThis = /^(this( one| number)?|same|hii)$/i.test(body);
      const normalized = normalizeKenyanPhone(useThis ? contact.phone : body);
      if (!normalized) {
        return sendToContact(db, contact, {
          text: `That doesn't look like a valid Kenyan M-Pesa number 🤔 — please send it like 0712 345 678.`,
        });
      }
      const customerCode = await nextCustomerCode(db);
      await setState(db, contact.id, 'active', {
        mpesa_number: normalized,
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
          `You're all set! 🎉 Your customer code is *${customerCode}* — keep it handy, it goes on all your parcels.\n\n` +
          `Send us a product link any time and we'll get you a quote.`,
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
        `We couldn't find a parcel with code ${trackingCode} 🤔 — double-check the code on your receipt. ` +
        `If it still doesn't work, reply here and our team will help you out.`,
    });
  }

  const lines = [`📦 *${trackingCode}* — ${STATUS_LABEL[order.status] || order.status}`];
  const steps = [
    ['Paid', order.paid_at],
    ['Purchased', order.purchased_at],
    ['Arrived in Kenya', order.arrived_at],
    ['Out for delivery', order.dispatched_at],
    ['Delivered', order.delivered_at],
  ];
  for (const [label, at] of steps) {
    if (at) lines.push(`✅ ${label} — ${new Date(at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}`);
  }
  if (order.status === 'delivery_fee_pending' && !order.delivery_fee_waived && order.delivery_fee_kes) {
    lines.push(`\nLast-mile delivery fee: KSh ${Number(order.delivery_fee_kes).toLocaleString('en-KE')} — we'll send the payment prompt.`);
  }
  return sendToContact(db, contact, { text: lines.join('\n') });
}
