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

import {
  notifyStaff, staffAlertHealth, usableStaffNumbers,
  lostAlertBatches, deadStaffNumbers, claimAlertRescue,
} from './waStaffAlert.js';
import { getWaSettings } from './waSettings.js';
import { sentDmConfigured, sendText } from './sentdm.js';
import { sessionWindowOpen } from './waSend.js';
import { fireWaOrderPostPaidHook } from './markPaymentPaid.js';
import { runNudges } from './waNudges.js';
import { PRODUCT_LINK, needsSheinCart } from './waStateMachine.js';

const MIN = 60 * 1000;
const WARMUP_MS = 90 * 1000;

// How many failures in a row make a staff number "not receiving pages".
// Two, because one is a bad minute and two in a row to the same number
// has never once been a coincidence here.
const DEAD_AFTER_FAILURES = 2;

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
 *
 * "Is a number set?" was the wrong question and it passed for a week.
 * A number was set, every page to it was accepted by sent.dm and then
 * failed at delivery, and this check reported a healthy channel
 * throughout. It now asks what actually happened to the last few pages —
 * the thing that breaks, not a thing shaped like it.
 */
async function assertAlertConfig(pool) {
  if (!sentDmConfigured()) {
    console.error('[wa-sweeper] ⚠ SENTDM_API_KEY is not set — no WhatsApp message (customer or staff alert) can be sent.');
  }
  try {
    const settings = await getWaSettings(pool);
    const { numbers, rejected } = usableStaffNumbers(settings.staff_alert_numbers);
    for (const bad of rejected) {
      console.error(`[wa-sweeper] ⚠ staff_alert_numbers contains the business's own WhatsApp number (${bad}) — WhatsApp cannot deliver to its own sender, so that entry pages nobody.`);
    }
    if (numbers.length === 0) {
      console.error('[wa-sweeper] ⚠ wa_settings.staff_alert_numbers is empty — staff alerts (quote requests, payment claims, SLA pages) go nowhere. Set it in /ops/settings.');
      return;
    }
    for (const h of await staffAlertHealth(pool)) {
      if (h.own_number) continue;
      if (h.total === 0 && !h.last_at) {
        console.warn(`[wa-sweeper] ${h.phone} has never been sent a staff alert — nothing has proved it can receive one.`);
      } else if (h.failed_since_ok >= DEAD_AFTER_FAILURES) {
        console.error(`[wa-sweeper] ⚠ ${h.phone} has failed its last ${h.failed_since_ok} staff alerts `
          + `(last: ${h.last_error || 'no reason given'})`
          + `${h.last_ok_at ? `, and has not confirmed one since ${new Date(h.last_ok_at).toISOString()}` : ' and has never confirmed one'}. `
          + `That number is not receiving pages.`);
      } else if (h.last_status === 'failed') {
        console.warn(`[wa-sweeper] last staff alert to ${h.phone} failed to deliver (${h.last_error || 'no reason given'}).`);
      }
    }
  } catch (e) {
    console.warn('[wa-sweeper] could not read wa_settings at boot:', e?.message);
  }
}

export async function sweepOnce(pool) {
  await Promise.allSettled([
    sweepStalePayments(pool),
    sweepUnansweredInbound(pool),
    sweepUnquotedLinks(pool),
    sweepStalledOrders(pool),
    retryFailedSends(pool),
    reconcilePostPaidHooks(pool),
    remindUnpaidConfirmed(pool),
    flagExpiredQuotes(pool),
    // Revenue follow-ups (quote/browse/repeat nudges + stalled-quote
    // staff pages) — utils/waNudges.js, gated by wa_settings.nudges_enabled.
    runNudges(pool),
    // Last, and deliberately: everything above pages through WhatsApp,
    // so this runs with the current sweep's failures already recorded.
    sweepAlertChannel(pool),
  ]);
}

// ── 0. The pages that reached nobody ────────────────────────────────────────
//
// Every sweep above ends in notifyStaff(), and notifyStaff() is one
// WhatsApp template send per staff number. When that send fails there is
// no retry, no second channel and — until this — nothing that told a
// human. Seven pages died that way on 5 and 6 September 2026, one of them
// a customer's cart waiting to be quoted; she waited eighteen hours and
// asked twice before anybody found out.
//
// Two failures are worth spending another channel on:
//
//   LOST   — a page where every configured number failed. Nobody has seen
//            it, so the page itself is re-sent, by email, verbatim.
//   DEAD   — a number that has failed every page since the last one it
//            confirmed. That check existed and ran only at boot, which
//            meant it ran once per deploy: +447346813917 was added at
//            15:26 on 6 September, failed both pages it has ever been
//            sent, and the container that would have warned had started
//            the previous day.
//
// Both are reported by every route that is not the one that just failed:
// the staff numbers that ARE working (a page that failed on one number is
// reportable on another — "a failed page cannot page about itself" is
// true of a number, not of a channel), and email, which shares nothing
// with WhatsApp at all.
//
// The claim (wa_staff_alerts.rescued_at) is written BEFORE anything is
// sent, so a crash reports zero times rather than twice, and so two
// instances cannot both email the same lost page.
async function sweepAlertChannel(pool) {
  let lost = [];
  let dead = [];
  try {
    [lost, dead] = await Promise.all([
      lostAlertBatches(pool),
      deadStaffNumbers(pool, { minFailures: DEAD_AFTER_FAILURES }),
    ]);
  } catch (e) {
    // The table is missing (migration 0020 not yet applied) or the query
    // failed. Say so — this is the sweep that exists because a silent
    // alerting channel looks exactly like a quiet one.
    console.error('[wa-sweeper] ⚠ could not check alert-channel health:', e?.message);
    return;
  }
  if (lost.length === 0 && dead.length === 0) return;

  const claimed = await claimAlertRescue(pool, [
    ...lost.flatMap((b) => b.ids),
    ...dead.flatMap((d) => d.ids),
  ]);
  if (claimed === 0) return; // another instance got there first

  const lines = [];
  for (const b of lost) {
    lines.push(`LOST PAGE (${new Date(b.at).toISOString()}) — reached none of ${b.phones.join(', ')}:`);
    lines.push(`  ${b.title}`);
    if (b.detail) lines.push(`  ${b.detail}`);
    lines.push('');
  }
  for (const d of dead) {
    lines.push(`NUMBER NOT RECEIVING PAGES — ${d.phone}: ${d.failures} consecutive failure(s), `
      + `last ${new Date(d.last_at).toISOString()} (${d.last_error || 'no reason given'}). `
      + (d.last_ok_at
        ? `Last confirmed page ${new Date(d.last_ok_at).toISOString()}.`
        : `It has never confirmed a page.`));
    lines.push('');
  }

  for (const line of lines) if (line) console.error(`[wa-sweeper] ⚠ ${line}`);

  // Route 1: the staff numbers that are still working. A page lost on one
  // number is not lost on another, and a dead number is exactly the thing
  // its colleague should hear about. Skipped for a lost page, which by
  // definition failed everywhere — re-sending it down the same channel
  // that just dropped it is the retry that is not a retry.
  if (dead.length > 0) {
    const deadPhones = new Set(dead.map((d) => d.phone));
    const healthy = (await staffAlertHealth(pool))
      .filter((h) => !h.own_number && !deadPhones.has(h.phone));
    if (healthy.length > 0) {
      await notifyStaff(pool, {
        title: 'A staff number is not receiving alerts',
        detail: dead.map((d) => `${d.phone}: ${d.failures} page(s) failed in a row`
          + `${d.last_ok_at ? '' : ', and it has never received one'}. `
          + `Check it in /ops/settings — until it is fixed those alerts reach nobody.`).join(' '),
        dedupeKey: `alert-channel-dead:${dead.map((d) => d.phone).sort().join(',')}`,
      });
    }
  }

  // Route 2: email, which shares nothing with WhatsApp. This is the only
  // thing that can carry a page whose every number failed.
  const to = process.env.ALERT_FALLBACK_EMAIL || process.env.ADMIN_EMAIL;
  if (!to) {
    console.error('[wa-sweeper] ⚠ no ADMIN_EMAIL (or ALERT_FALLBACK_EMAIL) set — '
      + 'a staff page that WhatsApp refused has nowhere else to go.');
    return;
  }
  try {
    const { sendStaffAlertFallbackEmail } = await import('./email.js');
    await sendStaffAlertFallbackEmail(to, {
      subject: lost.length > 0
        ? `[Thapsus] ${lost.length} staff alert(s) reached nobody`
        : `[Thapsus] a staff alert number is not receiving pages`,
      lines,
    });
  } catch (e) {
    // Both channels are down. There is no third; the log is what is left.
    console.error('[wa-sweeper] ⚠ the staff-alert fallback email ALSO failed '
      + `(${e?.message}) — ${lost.length} lost page(s) and ${dead.length} dead number(s) `
      + 'are recorded in wa_staff_alerts and nowhere else.');
  }
}

// ── 0b. A link with no quote behind it ──────────────────────────────────────
//
// The one page that says a customer wants a quote fires once, the moment
// the link arrives (handleInbound, step 1b). Nothing anywhere re-checks
// it, and every stalled-quote sweep in this file and in waNudges keys on
// o.status = 'quoted' — an order that already HAS a quote. A link whose
// page was never delivered therefore has nothing watching it at all.
//
// That is exactly what happened to +254790325255 on 5 September 2026. She
// sent a SHEIN cart at 21:02; the page failed; the assistant told her the
// quote was coming, which was true as far as anything in the system knew;
// the unanswered-inbound sweep never fired because the assistant's own
// reply meant the conversation's last message was always ours. She asked
// again at 10:02, then wrote "No you're not getting my question, I'm
// still waiting on the quote so that I pay" at 13:09. The quote went out
// at 15:22 — eighteen hours after the link.
//
// So: one page per link, claimed in the transcript-independent way the
// rest of this file claims things, when a link has gone unanswered by a
// quote for longer than the customer would expect.
async function sweepUnquotedLinks(pool) {
  const staleMin = minutes('WA_SLA_QUOTE_MINUTES', 60);
  const { rows } = await pool.query(
    // The SQL pattern is a deliberate SUPERSET of PRODUCT_LINK, which is
    // a JS regex with a lookbehind and has no Postgres equivalent. The
    // real test runs below, on the same expression handleInbound used to
    // page in the first place — two link tests that could disagree about
    // the same message is how a customer ends up waiting on a page that
    // was never owed.
    `SELECT c.id, c.full_name, c.phone, c.customer_code,
            l.at, l.at::text AS link_key, l.body
       FROM wa_contacts c
       JOIN LATERAL (
         SELECT m.created_at AS at, m.body
           FROM wa_messages m
          WHERE m.contact_id = c.id AND m.direction = 'in'
            AND m.body ~* '(https?://|www\\.|[a-z0-9-]+\\.[a-z0-9-]+/)'
          ORDER BY m.created_at DESC LIMIT 1
       ) l ON true
      WHERE c.state <> 'blocked'
        AND l.at < NOW() - ($1 || ' minutes')::interval
        AND l.at > NOW() - interval '7 days'
        -- Nothing quoted since the link. A quote sent afterwards is the
        -- answer; an older one belongs to a different order.
        AND NOT EXISTS (
          SELECT 1 FROM wa_orders o
           WHERE o.contact_id = c.id AND o.quoted_at IS NOT NULL AND o.quoted_at > l.at
        )
        AND NOT EXISTS (
          SELECT 1 FROM wa_staff_alerts a
           WHERE a.dedupe_key = 'unquoted-link:' || c.id || ':' || l.at::text
        )
      ORDER BY l.at ASC
      LIMIT 10`,
    [String(staleMin)]
  );
  for (const c of rows) {
    if (!PRODUCT_LINK.test(c.body || '')) continue;
    // A SHEIN product link is not a stalled quote — we asked them for a
    // cart and the ball is theirs. Paging staff for it would report our
    // own correct behaviour as a fault, and the pages nobody needs are
    // how the ones that matter stop being read.
    if (needsSheinCart(c.body || '')) continue;
    const waitedMin = Math.round((Date.now() - new Date(c.at).getTime()) / MIN);
    // notifyStaff writes the wa_staff_alerts row that claims this page —
    // failed sends included — so the NOT EXISTS above is the once-only
    // guard whether or not WhatsApp delivers it, and a page that fails
    // here is picked up by sweepAlertChannel like any other.
    await notifyStaff(pool, {
      title: 'Product link still not quoted',
      detail: `${c.full_name || c.phone} (${c.customer_code || 'no code'}) sent a link `
        + `${waitedMin >= 120 ? `${Math.round(waitedMin / 60)} hours` : `${waitedMin} minutes`} ago `
        + `and has had no quote: "${String(c.body || '').slice(0, 120)}". `
        + `The assistant is telling them it is on its way. This reminder won't repeat.`,
      dedupeKey: `unquoted-link:${c.id}:${c.link_key}`,
    });
  }
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
