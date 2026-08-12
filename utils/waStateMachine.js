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
//      exactly one order awaiting confirmation flips it to 'confirmed'
//      and prompts for payment. Anything ambiguous falls through to a
//      human.
//   4. Everything else: when the Gemini layer is enabled (wa_settings
//      ai_enabled + GEMINI_API_KEY), it answers from the operator's
//      knowledge base; otherwise — and on any AI failure or handoff —
//      the message just sits in the operator inbox (the webhook already
//      bumped unread + SSE before calling us).
//
// The AI is consulted ONLY for onboarding interpretation and the final
// fall-through. Money and state (tracking replies, confirmations, quotes,
// payments, pipeline moves) run BEFORE it and stay fully deterministic.
//
// State lives entirely on wa_contacts.state — no in-memory sessions, so
// deploys/restarts never lose a customer mid-onboarding.

import { sendToContact } from './waSend.js';
import { extractTrackingCode, nextCustomerCode } from './waCodes.js';
import { normalizeKenyanPhone } from './lipanaClient.js';
import { pushToStaff } from '../routes/events.js';
import { getWaSettings } from './waSettings.js';
import { aiConfigured, chatReply, onboardingTurn } from './waAi.js';

const CONFIRM_WORDS = /^(yes+|yeah|yep|ok(ay)?|confirm(ed)?|proceed|sawa( sawa)?|ndio|ndiyo|poa|1)\b/i;

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
      await sendToContact(db, contact, {
        templateKey: 'payment_prompt',
        templateParams: { amount_kes: String(order.quote_kes) },
        text:
          `Great! Your order is confirmed at KSh ${Number(order.quote_kes).toLocaleString('en-KE')}. ` +
          `We'll send an M-Pesa payment prompt to your phone shortly — just enter your PIN when it pops up. ` +
          `If you'd rather pay another way, reply here and we'll help.`,
      });
      return;
    }
  }

  // 4. AI answer from the knowledge base — or the operator inbox.
  if (ai && body) {
    try {
      const { rows: history } = await db.query(
        `SELECT direction, body FROM (
           SELECT direction, body, created_at FROM wa_messages
            WHERE contact_id = $1 AND body IS NOT NULL AND id <> $2
            ORDER BY created_at DESC LIMIT 10
         ) h ORDER BY created_at ASC`,
        [contact.id, message.id]
      );
      const reply = await chatReply({
        knowledgeBase: settings.ai_knowledge_base,
        history,
        message: body,
      });
      if (reply) await sendToContact(db, contact, { text: reply });
      // null = HANDOFF → stay silent; the inbox already has the message.
    } catch (e) {
      console.warn('[waStateMachine] AI fallthrough failed (non-fatal):', e?.message);
    }
  }
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
