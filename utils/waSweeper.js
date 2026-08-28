// utils/waSweeper.js
//
// The safety net for everything that fires once and can be missed. Every
// staff alert in this system is a single fire-and-forget WhatsApp
// message, every outbound send has no retry, and the post-payment hooks
// run best-effort after COMMIT — so one missed page, one provider blip,
// or one crash at the wrong moment used to leave a customer waiting on a
// promise ("someone will reply shortly", "usually within a few minutes")
// with nothing anywhere saying so. This sweeper re-checks, on a timer,
// the states that mean somebody is waiting:
//
//   1. Payments sitting in awaiting_review        → page staff once, 15m in
//   2. Inbound messages nothing has answered      → page staff once, 15m in
//   3. Orders stalled in 'paid' or 'dispatched'   → page staff once, at 48h
//   4. Failed free-text sends                     → retry once, in-window
//   5. Paid orders missing their receipt          → re-fire the post-paid
//      hook (crash-between-commit-and-hook recovery)
//
// All best-effort: a sweep failure is logged and the next tick tries
// again. Reminder discipline (staff asked for this explicitly): every
// staff page fires ONCE per condition — the eligibility is excluded in
// SQL by a durable claim (payments.review_alerted_at,
// wa_contacts.unanswered_alerted_at, or a wa_order_events note), written
// BEFORE the page goes out so a crash pages zero times rather than
// twice. The claims double as the mute mechanism: the payments queue and
// the inbox each have a bell-off button that writes the same stamp, so a
// page that needs no action can be silenced before it fires. A condition
// that recurs (a new customer message, a new payment row) re-arms its
// reminder naturally.
//
// Started from server.js next to log retention and FX refresh; returns
// a stop function for tests/shutdown.

import { notifyStaff } from './waStaffAlert.js';
import { getWaSettings } from './waSettings.js';
import { sentDmConfigured, sendText } from './sentdm.js';
import { sessionWindowOpen } from './waSend.js';
import { fireWaOrderPostPaidHook } from './markPaymentPaid.js';
import { runNudges } from './waNudges.js';

const MIN = 60 * 1000;
const WARMUP_MS = 90 * 1000;

function minutes(envKey, fallback) {
  const n = parseInt(process.env[envKey] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}


// Post-paid re-fires attempted this process, so a receipt that keeps
// failing is retried hourly, not every sweep.
const hookAttempts = new Map(); // paymentId -> last attempt ms

export function startWaSweeper(pool) {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try { await sweepOnce(pool); } catch (e) {
      console.error('[wa-sweeper] sweep failed:', e?.message);
    }
  };

  assertAlertConfig(pool).catch(() => {});
  const warm = setTimeout(tick, WARMUP_MS);
  const iv = setInterval(tick, minutes('WA_SWEEP_INTERVAL_MINUTES', 5) * MIN);
  if (iv.unref) iv.unref();
  console.log(`✓ WhatsApp sweeper started (every ${minutes('WA_SWEEP_INTERVAL_MINUTES', 5)}m)`);

  return () => { stopped = true; clearTimeout(warm); clearInterval(iv); };
}

/**
 * Boot-time loud check: a fresh or misconfigured install pages nobody
 * and says nothing — notifyStaff returns silently on an empty number
 * list, so every alert in this file would be a no-op.
 */
async function assertAlertConfig(pool) {
  if (!sentDmConfigured()) {
    console.error('[wa-sweeper] ⚠ SENTDM_API_KEY is not set — no WhatsApp message (customer or staff alert) can be sent.');
  }
  try {
    const settings = await getWaSettings(pool);
    if (!Array.isArray(settings.staff_alert_numbers) || settings.staff_alert_numbers.length === 0) {
      console.error('[wa-sweeper] ⚠ wa_settings.staff_alert_numbers is empty — staff alerts (quote requests, payment claims, SLA pages) go nowhere. Set it in /ops/settings.');
    }
  } catch (e) {
    console.warn('[wa-sweeper] could not read wa_settings at boot:', e?.message);
  }
}

export async function sweepOnce(pool) {
  await Promise.allSettled([
    sweepStalePayments(pool),
    sweepUnansweredInbound(pool),
    sweepStalledOrders(pool),
    retryFailedSends(pool),
    reconcilePostPaidHooks(pool),
    remindUnpaidConfirmed(pool),
    flagExpiredQuotes(pool),
    // Revenue follow-ups (quote/browse/repeat nudges + stalled-quote
    // staff pages) — utils/waNudges.js, gated by wa_settings.nudges_enabled.
    runNudges(pool),
  ]);
}

// ── 6. Confirmed but unpaid: one payment reminder ───────────────────────────
// The customer said YES and got the till details, then life happened.
// One reminder a day later (the approved Payment_Reminder template
// exists for exactly this, and now carries a real expiry date). Sent
// once per order, deduped through the audit trail so restarts and
// multiple instances can't double-remind.
async function remindUnpaidConfirmed(pool) {
  const { rows } = await pool.query(
    `SELECT o.id, o.quote_kes, o.quote_expires_at, o.tracking_code, o.product_note,
            c.id AS contact_id, c.phone, c.full_name
       FROM wa_orders o JOIN wa_contacts c ON c.id = o.contact_id
      WHERE o.status = 'confirmed'
        AND o.confirmed_at < NOW() - interval '24 hours'
        AND o.confirmed_at > NOW() - interval '14 days'
        AND (o.quote_expires_at IS NULL OR o.quote_expires_at > NOW())
        AND NOT EXISTS (
          SELECT 1 FROM wa_order_events e
           WHERE e.order_id = o.id AND e.note = 'Payment reminder sent'
        )
      ORDER BY o.confirmed_at ASC
      LIMIT 10`
  );
  for (const o of rows) {
    // Claim the reminder in the audit trail BEFORE sending, so a crash
    // mid-loop reminds zero times rather than twice.
    await pool.query(
      `INSERT INTO wa_order_events (id, order_id, from_status, to_status, note)
       VALUES (gen_random_uuid()::text, $1, 'confirmed', 'confirmed', 'Payment reminder sent')`,
      [o.id]
    );
    const { sendToContact } = await import('./waSend.js');
    const { mpesaTill } = await import('./waPayments.js');
    const amount = Number(o.quote_kes);
    await sendToContact(pool, { id: o.contact_id, phone: o.phone }, {
      templateKey: 'payment_prompt',
      templateParams: {
        full_name: o.full_name,
        order_ref: o.tracking_code || 'your order',
        total_kes: amount.toLocaleString('en-KE'),
        expires_at: o.quote_expires_at
          ? new Date(o.quote_expires_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'long' })
          : undefined,
      },
      text:
        `A quick reminder about your confirmed order: KSh ${amount.toLocaleString('en-KE')} is still due.\n` +
        `To pay: Lipa na M-Pesa, Buy Goods, Till *${mpesaTill()}*.\n` +
        `Reply here once you've paid — or tell us if you've changed your mind, no problem at all.`,
    });
    console.info(`[wa-sweeper] payment reminder sent for order ${o.id}`);
  }
}

// ── 7. Expired quotes: staff decide, once ───────────────────────────────────
// Nothing auto-cancels — the customer may still want it at a fresh
// price. ONE page per order (claimed in the audit trail before paging);
// this used to repeat daily while the quote sat expired.
async function flagExpiredQuotes(pool) {
  const { rows } = await pool.query(
    `SELECT o.id, o.quote_kes, o.quote_expires_at, c.full_name, c.phone, c.customer_code
       FROM wa_orders o JOIN wa_contacts c ON c.id = o.contact_id
      WHERE o.status = 'quoted' AND o.quote_expires_at < NOW()
        AND o.quote_expires_at > NOW() - interval '7 days'
        AND NOT EXISTS (SELECT 1 FROM wa_order_events e
                         WHERE e.order_id = o.id AND e.note = 'Expired-quote staff page sent')
      ORDER BY o.quote_expires_at ASC
      LIMIT 10`
  );
  for (const o of rows) {
    await pool.query(
      `INSERT INTO wa_order_events (id, order_id, from_status, to_status, note)
       VALUES (gen_random_uuid()::text, $1, 'quoted', 'quoted', 'Expired-quote staff page sent')`,
      [o.id]
    );
    await notifyStaff(pool, {
      title: 'Quote expired without an answer',
      detail: `${o.full_name || o.phone} (${o.customer_code || 'no code'}) — KSh ${Number(o.quote_kes).toLocaleString('en-KE')} `
        + `quote expired. Re-quote at today's rate, or cancel the order. This reminder won't repeat.`,
      dedupeKey: `quote-expired:${o.id}`,
    });
  }
}

// ── 1. Payments waiting on a reviewer ───────────────────────────────────────
// The customer was told "usually within a few minutes". ONE page, 15
// minutes in — this used to re-page hourly for as long as the row sat
// unreviewed, which staff found more annoying than useful. Same rule as
// the conversation reminder: payments.review_alerted_at records that the
// page went out (or was silenced from the queue's mute button), the
// sweep only picks rows where it is NULL, and the stamp is claimed
// before paging so a crash pages zero times rather than twice.
async function sweepStalePayments(pool) {
  const staleMin = minutes('WA_SLA_PAYMENT_MINUTES', 15);
  const { rows } = await pool.query(
    `SELECT p.id, p.amount_due_kes, p.created_at,
            wc.full_name, wc.phone, wc.customer_code, wo.tracking_code
       FROM payments p
       LEFT JOIN wa_contacts wc ON wc.id = p.wa_contact_id
       LEFT JOIN wa_orders wo ON p.target_kind = 'wa_order' AND wo.id = p.target_id
      WHERE p.status = 'awaiting_review' AND p.method = 'mpesa'
        AND p.created_at < NOW() - ($1 || ' minutes')::interval
        AND p.review_alerted_at IS NULL
      ORDER BY p.created_at ASC
      LIMIT 20`,
    [String(staleMin)]
  );
  for (const p of rows) {
    await pool.query(
      `UPDATE payments SET review_alerted_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [p.id]
    );
    const ageMin = Math.round((Date.now() - new Date(p.created_at).getTime()) / MIN);
    await notifyStaff(pool, {
      title: 'Payment waiting for review',
      detail: `${p.full_name || p.phone || 'Customer'} (${p.customer_code || 'no code'}${p.tracking_code ? ` · ${p.tracking_code}` : ''}) — `
        + `KSh ${Number(p.amount_due_kes).toLocaleString('en-KE')} has been awaiting review for ${ageMin} minutes. `
        + `Open /ops/payments. This reminder won't repeat.`,
      dedupeKey: `sla-payment:${p.id}`,
    });
  }
}

// ── 2. Inbound messages nothing answered ────────────────────────────────────
// The AI answers most things; what reaches this sweep is a conversation
// whose LAST message is still the customer's — a handoff nobody picked
// up, an AI outage, a link waiting on a quote. Capped at 24h back so a
// restart doesn't replay ancient history.
//
// ONE reminder per unanswered stretch, 15 minutes in — this used to
// re-page hourly for as long as the conversation sat unanswered, which
// staff found more annoying than useful. wa_contacts.unanswered_alerted_at
// records the stretch already alerted (or silenced via the inbox's
// "No reply needed" button); a fresh customer message after a reply
// re-arms it because the stamp is then older than the latest inbound.
async function sweepUnansweredInbound(pool) {
  const staleMin = minutes('WA_SLA_UNANSWERED_MINUTES', 15);
  const { rows } = await pool.query(
    `SELECT c.id, c.full_name, c.phone, c.customer_code,
            c.last_message_at, c.last_message_preview
       FROM wa_contacts c
      WHERE c.last_message_at < NOW() - ($1 || ' minutes')::interval
        AND c.last_message_at > NOW() - interval '24 hours'
        AND c.state <> 'blocked'
        AND (SELECT m.direction FROM wa_messages m
              WHERE m.contact_id = c.id
              ORDER BY m.created_at DESC LIMIT 1) = 'in'
        AND (c.unanswered_alerted_at IS NULL
             OR c.unanswered_alerted_at < c.last_message_at)
      ORDER BY c.last_message_at ASC
      LIMIT 20`,
    [String(staleMin)]
  );
  for (const c of rows) {
    // Claim before paging — a crash mid-loop reminds zero times, not two.
    await pool.query(
      `UPDATE wa_contacts SET unanswered_alerted_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [c.id]
    );
    const ageMin = Math.round((Date.now() - new Date(c.last_message_at).getTime()) / MIN);
    await notifyStaff(pool, {
      title: 'Customer message unanswered',
      detail: `${c.full_name || c.phone} (${c.customer_code || 'no code'}) has been waiting ${ageMin} minutes: `
        + `"${String(c.last_message_preview || '').slice(0, 120)}". `
        + `Reply from the inbox, or tap "No reply needed" there if nothing is required. This reminder won't repeat.`,
      dedupeKey: `sla-unanswered:${c.id}:${c.last_message_at}`,
    });
  }
}

// ── 3. Orders stalled where money already moved ─────────────────────────────
// 'paid' means we hold the customer's money and have bought nothing;
// 'dispatched' promised delivery within 24 hours. Neither should sit for
// days without a person at least knowing. ONE page per order per stage
// (claimed in the audit trail before paging) — these used to repeat
// daily.
async function sweepStalledOrders(pool) {
  const { rows } = await pool.query(
    `SELECT o.id, o.tracking_code, o.status, o.paid_at, o.dispatched_at,
            c.full_name, c.phone, c.customer_code
       FROM wa_orders o JOIN wa_contacts c ON c.id = o.contact_id
      WHERE ((o.status = 'paid' AND o.paid_at < NOW() - interval '48 hours')
         OR (o.status = 'dispatched' AND o.dispatched_at < NOW() - interval '48 hours'))
        AND NOT EXISTS (SELECT 1 FROM wa_order_events e
                         WHERE e.order_id = o.id
                           AND e.note = 'Stalled-order staff page sent: ' || o.status)
      ORDER BY o.updated_at ASC
      LIMIT 20`
  );
  for (const o of rows) {
    await pool.query(
      `INSERT INTO wa_order_events (id, order_id, from_status, to_status, note)
       VALUES (gen_random_uuid()::text, $1, $2, $2, 'Stalled-order staff page sent: ' || $2)`,
      [o.id, o.status]
    );
    const stalledSince = o.status === 'paid' ? o.paid_at : o.dispatched_at;
    const days = Math.round((Date.now() - new Date(stalledSince).getTime()) / (24 * 60 * MIN));
    await notifyStaff(pool, {
      title: o.status === 'paid'
        ? 'Paid order not yet purchased'
        : 'Dispatched parcel not yet delivered',
      detail: `${o.tracking_code || o.id} — ${o.full_name || o.phone} (${o.customer_code || 'no code'}) has been `
        + `'${o.status}' for ${days} day(s). This reminder won't repeat.`,
      dedupeKey: `sla-stalled:${o.id}:${o.status}`,
    });
  }
}

// ── 4. Failed free-text sends: one retry, in-window ─────────────────────────
// Only free text is retryable — a template send's parameters aren't
// stored, and the failed-send staff alert already covers it. The row is
// claimed (retry_count) before the attempt so a crash mid-retry can't
// double-send.
async function retryFailedSends(pool) {
  if (!sentDmConfigured()) return;
  const { rows } = await pool.query(
    `SELECT m.id, m.contact_id, m.body, c.phone
       FROM wa_messages m JOIN wa_contacts c ON c.id = m.contact_id
      WHERE m.direction = 'out' AND m.status = 'failed' AND m.retry_count = 0
        AND m.template_key IS NULL AND m.body IS NOT NULL
        AND m.error IS DISTINCT FROM 'sentdm_not_configured'
        -- A FILTERED send was suppressed by the consent gate before any
        -- provider call: the contact is opted out or route-denied, so the
        -- retry is filtered too, and its 202 would flip the row back to
        -- 'queued' and erase the one line saying why the customer went
        -- quiet. The opt-out staff alert is what covers these.
        AND (m.error IS NULL OR m.error NOT LIKE 'FILTERED:%')
        AND m.created_at > NOW() - interval '24 hours'
        AND m.created_at < NOW() - interval '2 minutes'
      ORDER BY m.created_at ASC
      LIMIT 10`
  );
  for (const m of rows) {
    const { rowCount } = await pool.query(
      `UPDATE wa_messages SET retry_count = retry_count + 1 WHERE id = $1 AND retry_count = 0`,
      [m.id]
    );
    if (rowCount === 0) continue; // another instance claimed it

    // Free text only delivers inside the 24h window; retrying into a
    // shut window would just fail the same way.
    if (!await sessionWindowOpen(pool, m.contact_id)) continue;

    try {
      const { messageId } = await sendText(m.phone, m.body, { idempotencyKey: `${m.id}-r1` });
      await pool.query(
        `UPDATE wa_messages
            SET status = 'queued', provider_message_id = COALESCE(provider_message_id, $2), error = NULL
          WHERE id = $1`,
        [m.id, messageId]
      );
      console.info(`[wa-sweeper] retried failed send ${m.id} → ${messageId}`);
    } catch (e) {
      console.warn(`[wa-sweeper] retry of ${m.id} failed too:`, e?.message);
    }
  }
}

// ── 5. Paid orders with no receipt: the hook never finished ─────────────────
// markPaymentPaid COMMITs the money, then runs the customer-facing hooks
// best-effort. A crash or provider outage in that gap left a paid
// customer with no tracking-code message and no receipt, forever, unless
// an operator happened to notice. Re-fire the hook — it is idempotent,
// and the receipt upserts to the same storage path.
async function reconcilePostPaidHooks(pool) {
  const { rows } = await pool.query(
    `SELECT p.* FROM payments p
       JOIN wa_orders o ON p.target_kind = 'wa_order' AND o.id = p.target_id
      WHERE p.status = 'paid'
        AND p.paid_at > NOW() - interval '7 days'
        AND p.paid_at < NOW() - interval '10 minutes'
        AND o.status = 'paid' AND o.receipt_path IS NULL
      ORDER BY p.paid_at ASC
      LIMIT 5`
  );
  for (const p of rows) {
    const last = hookAttempts.get(p.id) || 0;
    if (Date.now() - last < 60 * MIN) continue; // hourly per payment
    hookAttempts.set(p.id, Date.now());
    try {
      // Skip the duplicate announcement when the hook already got as far
      // as messaging the customer and only the receipt failed.
      const { rows: announced } = await pool.query(
        `SELECT 1 FROM wa_messages
          WHERE contact_id = $1 AND direction = 'out' AND created_at > $2
            AND (template_key = 'payment_received' OR body ILIKE '%tracking code%')
          LIMIT 1`,
        [p.wa_contact_id, p.paid_at]
      );
      if (announced.length > 0) {
        // One page per payment (claimed in the audit trail first) —
        // repeating daily was noise; the order screen's "Re-send to
        // customer" is the fix either way.
        const { rows: paged } = await pool.query(
          `SELECT 1 FROM wa_order_events
            WHERE order_id = $1 AND note = 'Receipt-missing staff page sent: ' || $2
            LIMIT 1`,
          [p.target_id, p.id]
        );
        if (paged.length === 0) {
          await pool.query(
            `INSERT INTO wa_order_events (id, order_id, from_status, to_status, note)
             VALUES (gen_random_uuid()::text, $1, 'paid', 'paid', 'Receipt-missing staff page sent: ' || $2)`,
            [p.target_id, p.id]
          );
          await notifyStaff(pool, {
            title: 'Paid order has no receipt',
            detail: `Payment ${p.id} announced but its receipt never generated — use "Re-send to customer" on the order screen. This reminder won't repeat.`,
            dedupeKey: `receipt-missing:${p.id}`,
          });
        }
        continue;
      }
      console.info(`[wa-sweeper] re-firing post-paid hook for ${p.id}`);
      await fireWaOrderPostPaidHook(pool, p);
    } catch (e) {
      console.warn(`[wa-sweeper] post-paid reconcile for ${p.id} failed:`, e?.message);
    }
  }
}
