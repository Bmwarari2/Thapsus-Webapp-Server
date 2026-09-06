// utils/waStaffAlert.js
//
// Pings operators/admins on WhatsApp when something needs a human. Uses
// the approved "staff_alert" template (two variables: what happened, and
// the detail), so it works regardless of WhatsApp's 24-hour session
// window — staff rarely message the business line themselves.
//
// This matters more now that M-Pesa STK is unavailable: every payment is
// confirmed by hand, so "customer says they paid" has to reach a person.
//
// Staff numbers + the template name/ID are operator-configurable in
// /ops/settings (wa_settings.staff_alert_numbers / staff_alert_template);
// an empty list disables alerts. Never throws — alerting must never take
// down the conversation it is reporting on.
//
// EVERY PAGE IS RECORDED (wa_staff_alerts). It used not to be, and that
// is how the whole alerting channel could be dead for a week without a
// single visible symptom: sendTemplate() was called, sent.dm accepted it,
// WhatsApp failed the delivery minutes later, and the status webhook
// looked the provider id up in wa_messages, missed, and returned. Seven
// consecutive alerts between 30 August and 4 September 2026 — including
// two of Diane Mworia's handoffs — failed that way, leaving one log line
// each and nothing else. A page nobody can see failing is not a page.

import { v4 as uuidv4 } from 'uuid';
import { sendTemplate, sentDmConfigured, businessWhatsAppNumber } from './sentdm.js';
import { getWaSettings } from './waSettings.js';
import { normalizeKenyanPhone } from './lipanaClient.js';
import { logError } from './errorLogger.js';

// Collapse duplicates (retries, a customer repeating themselves) so a
// staff phone never gets the same alert twice in quick succession.
const DEDUPE_MS = 5 * 60 * 1000;
const _recent = new Map();

function seenRecently(key) {
  const now = Date.now();
  for (const [k, at] of _recent) if (now - at > DEDUPE_MS) _recent.delete(k);
  if (_recent.has(key)) return true;
  _recent.set(key, now);
  return false;
}

/**
 * Staff numbers as the provider will see them, minus the ones that can
 * never work.
 *
 * WhatsApp will not deliver a message from a business number to itself:
 * the API accepts the send, and the delivery fails later with no reason
 * attached — which reads exactly like an alerting channel that works.
 * A number cheap to reject in code does not belong only in a runbook.
 *
 * @returns {{numbers: string[], rejected: string[]}}
 */
export function usableStaffNumbers(raw) {
  const own = businessWhatsAppNumber();
  const numbers = [];
  const rejected = [];
  for (const n of raw || []) {
    const digits = normalizeKenyanPhone(n) || String(n).replace(/[^\d]/g, '');
    if (!digits) continue;
    if (own && digits === own) rejected.push(digits);
    else numbers.push(digits);
  }
  return { numbers, rejected };
}

/**
 * @param {pg.Pool} db
 * @param {object} p
 * @param {string} p.title   var_1 — what happened ("Customer needs help")
 * @param {string} p.detail  var_2 — the specifics (who, what, how much)
 * @param {string} [p.dedupeKey]  suppress repeats for 5 minutes
 * @returns {Promise<{batchId: string|null, attempted: number, rejected: number}>}
 *   never throws; batchId is null when nothing was attempted at all.
 */
export async function notifyStaff(db, { title, detail, dedupeKey }) {
  // One id per page, shared by every number it goes to. Per-phone rows
  // can say "this number did not get it"; only the batch can answer the
  // question that decides whether anybody has to be told twice — did
  // ANY number get it? See migration 0020.
  const batchId = uuidv4();
  try {
    if (!sentDmConfigured()) return { batchId: null, attempted: 0, rejected: 0 };
    const settings = await getWaSettings(db);
    const { numbers, rejected } = usableStaffNumbers(settings.staff_alert_numbers);
    for (const bad of rejected) {
      console.error(`[waStaffAlert] ⚠ staff_alert_numbers contains the business's own WhatsApp number (${bad}) — WhatsApp cannot deliver a message to its own sender, so that entry pages nobody. Set a personal number in /ops/settings.`);
    }
    if (numbers.length === 0) return { batchId: null, attempted: 0, rejected: rejected.length };
    if (dedupeKey && seenRecently(dedupeKey)) return { batchId: null, attempted: 0, rejected: rejected.length };

    // WhatsApp rejects newlines/tabs inside template variables.
    const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
    const params = { var_1: clean(title, 120), var_2: clean(detail, 400) };

    await Promise.all(numbers.map(async (phone) => {
      let providerMessageId = null;
      let error = null;
      try {
        ({ messageId: providerMessageId } = await sendTemplate(phone, settings.staff_alert_template, params));
      } catch (e) {
        error = e?.message || 'send failed';
        console.warn(`[waStaffAlert] send to ${phone} failed:`, error);
      }
      await recordStaffAlert(db, {
        batchId, phone, title: params.var_1, detail: params.var_2, dedupeKey,
        template: settings.staff_alert_template, providerMessageId, error,
      });
    }));
    return { batchId, attempted: numbers.length, rejected: rejected.length };
  } catch (e) {
    console.warn('[waStaffAlert] failed (non-fatal):', e?.message);
    return { batchId: null, attempted: 0, rejected: 0 };
  }
}

/**
 * The audit row. Best-effort like everything else here — a page that
 * went out and was not written down still went out.
 */
async function recordStaffAlert(db, { batchId, phone, title, detail, dedupeKey, template, providerMessageId, error }) {
  try {
    await db.query(
      `INSERT INTO wa_staff_alerts (id, batch_id, phone, title, detail, dedupe_key, template, provider_message_id, status, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (provider_message_id) DO NOTHING`,
      [uuidv4(), batchId || null, phone, title, detail, dedupeKey || null, template || null,
        providerMessageId, error ? 'failed' : 'sent', error]
    );
  } catch (e) {
    console.warn('[waStaffAlert] could not record alert (non-fatal):', e?.message);
  }
}

/**
 * A status webhook for a provider id that is not in wa_messages may be a
 * staff alert. Returns true when this was one of ours, so the caller
 * knows the event is accounted for.
 *
 * A FAILED page is the one failure in this system that cannot report
 * itself — paging about it would use the channel that just failed — so
 * it goes to the error log, which /ops reads over HTTP.
 */
export async function recordStaffAlertStatus(db, providerMessageId, status, error) {
  try {
    const { rows } = await db.query(
      `UPDATE wa_staff_alerts
          SET status = $2, error = COALESCE($3, error)
        WHERE provider_message_id = $1
        RETURNING phone, title`,
      [providerMessageId, status, error || null]
    );
    const alert = rows[0];
    if (!alert) return false;
    if (status === 'failed') {
      const reason = error || 'no reason given';
      console.error(`[waStaffAlert] ⚠ staff alert to ${alert.phone} was NOT delivered ("${alert.title}") — ${reason}. Nobody was told.`);
      logError({
        level: 'error', source: 'wa-staff-alert',
        message: `staff alert to ${alert.phone} failed: ${reason}`,
        meta: { phone: alert.phone, title: alert.title, provider_message_id: providerMessageId },
      }).catch(() => {});
    }
    return true;
  } catch (e) {
    console.warn('[waStaffAlert] could not record alert status (non-fatal):', e?.message);
    return false;
  }
}

/**
 * Per-number delivery health, newest first: what each configured phone
 * has actually received lately.
 *
 * The boot check and /ops/settings both ask the same question, and it is
 * the question that went unasked for a week — not "is a number set?" but
 * "is anything reaching it?".
 *
 * `last_ok_at` is the newest page WhatsApp confirmed it put in front of
 * somebody, and `failed_since_ok` counts the failures after it. Those two
 * are the ones that answer the operator's actual question — "is this
 * number receiving pages RIGHT NOW?" — which a 7-day total cannot:
 * +447346813917 was added on 6 September and failed both of the pages it
 * has ever been sent, and a "2 of 2 failed" in a week that also contains
 * eleven successes to a different number reads like noise.
 *
 * @returns {Promise<Array<{phone: string, own_number: boolean, total: number,
 *   failed: number, last_status: string|null, last_at: string|null, last_error: string|null,
 *   last_ok_at: string|null, failed_since_ok: number}>>}
 */
export async function staffAlertHealth(db, { days = 7 } = {}) {
  const settings = await getWaSettings(db);
  const { numbers, rejected } = usableStaffNumbers(settings.staff_alert_numbers);
  const out = [];
  for (const phone of [...numbers, ...rejected]) {
    const { rows } = await db.query(
      `WITH ok AS (
         SELECT max(created_at) AS at FROM wa_staff_alerts
          WHERE phone = $1 AND status IN ('delivered', 'read')
       )
       SELECT count(*) FILTER (WHERE created_at > NOW() - ($2 || ' days')::interval)::int AS total,
              count(*) FILTER (WHERE created_at > NOW() - ($2 || ' days')::interval
                                 AND status = 'failed')::int AS failed,
              (SELECT status FROM wa_staff_alerts WHERE phone = $1 ORDER BY created_at DESC LIMIT 1) AS last_status,
              (SELECT created_at FROM wa_staff_alerts WHERE phone = $1 ORDER BY created_at DESC LIMIT 1) AS last_at,
              (SELECT error FROM wa_staff_alerts WHERE phone = $1 ORDER BY created_at DESC LIMIT 1) AS last_error,
              (SELECT at FROM ok) AS last_ok_at,
              count(*) FILTER (WHERE status = 'failed'
                                 AND created_at > COALESCE((SELECT at FROM ok), '-infinity'::timestamptz))::int
                AS failed_since_ok
         FROM wa_staff_alerts
        WHERE phone = $1`,
      [phone, String(days)]
    );
    out.push({ phone, own_number: rejected.includes(phone), ...rows[0] });
  }
  return out;
}

// ── When the page itself is the thing that failed ───────────────────────────
//
// 0019 made a failed page visible. It did not make one reach anybody:
// the whole response to a failure was a console line and an error_logs
// row, both of which are read by somebody who already suspects a
// problem. The five pages lost on the evening of 5 September 2026 and the
// two lost on 6 September were each seen by nobody, and one of them was a
// customer's cart waiting to be quoted.
//
// "A failed page cannot page about itself" is true of the number that
// failed. It is not true of the channel. There are usually two staff
// numbers and one of them is working; there is always email. The two
// queries below find the failures worth spending those on, and
// utils/waSweeper.js spends them.
//
// Both use wa_staff_alerts.rescued_at as the durable claim — "somebody
// has been told about this failure by a route other than the page
// itself" — stamped BEFORE the fallback goes out, so a crash tells them
// zero times rather than twice, and re-arming naturally because the next
// failure arrives with rescued_at NULL.

/**
 * Pages that reached NOBODY: every number the page was sent to failed,
 * and no fallback has gone out for it yet.
 *
 * The batch is the unit because the phone is not. A page that failed on
 * one number and was read on another did its job, and emailing about it
 * would train staff to ignore the mailbox that exists for the pages that
 * did not.
 *
 * Rows written before migration 0020 carry no batch_id and are skipped:
 * a page from before this existed cannot be un-lost now, and guessing at
 * batches by timestamp would rescue the wrong ones.
 *
 * @returns {Promise<Array<{batch_id: string, at: string, title: string,
 *   detail: string|null, phones: string[], ids: string[]}>>}
 */
export async function lostAlertBatches(db, { hours = 24, limit = 20 } = {}) {
  const { rows } = await db.query(
    `SELECT batch_id,
            min(created_at) AS at,
            min(title)      AS title,
            min(detail)     AS detail,
            array_agg(DISTINCT phone) AS phones,
            array_agg(id)             AS ids
       FROM wa_staff_alerts
      WHERE batch_id IS NOT NULL
        AND created_at > NOW() - ($1 || ' hours')::interval
      GROUP BY batch_id
     HAVING bool_and(status = 'failed') AND bool_and(rescued_at IS NULL)
      ORDER BY min(created_at) ASC
      LIMIT $2`,
    [String(hours), limit]
  );
  return rows;
}

/**
 * Numbers that are not receiving pages at all: at least `minFailures`
 * failures since the last page WhatsApp confirmed they saw, with the run
 * not yet reported.
 *
 * This is the check that already existed and only ran at boot. The last
 * deploy before +447346813917 stopped receiving was the previous day, so
 * the container that would have printed the warning had started fourteen
 * hours before there was anything to warn about. A health check that runs
 * once per deploy is a health check that does not run — the same lesson
 * the FX refresh taught on a 24-hour setInterval.
 *
 * Only currently-configured numbers count: a number an operator has
 * already removed is not a fault to report.
 *
 * @returns {Promise<Array<{phone: string, failures: number, last_at: string,
 *   last_error: string|null, last_ok_at: string|null, ids: string[]}>>}
 */
export async function deadStaffNumbers(db, { minFailures = 2, days = 30 } = {}) {
  const settings = await getWaSettings(db);
  const { numbers } = usableStaffNumbers(settings.staff_alert_numbers);
  if (numbers.length === 0) return [];
  const { rows } = await db.query(
    `WITH ok AS (
       SELECT phone, max(created_at) AS at
         FROM wa_staff_alerts
        WHERE status IN ('delivered', 'read')
        GROUP BY phone
     )
     SELECT a.phone,
            count(*)::int             AS failures,
            max(a.created_at)         AS last_at,
            min(o.at)                 AS last_ok_at,
            (array_agg(a.error ORDER BY a.created_at DESC))[1] AS last_error,
            array_agg(a.id)           AS ids
       FROM wa_staff_alerts a
       LEFT JOIN ok o ON o.phone = a.phone
      WHERE a.phone = ANY($1)
        AND a.status = 'failed'
        AND a.created_at > COALESCE(o.at, '-infinity'::timestamptz)
        AND a.created_at > NOW() - ($2 || ' days')::interval
      GROUP BY a.phone
     HAVING count(*) >= $3 AND bool_or(a.rescued_at IS NULL)
      ORDER BY max(a.created_at) ASC`,
    [numbers, String(days), minFailures]
  );
  return rows;
}

/**
 * Claim the failures we are about to report. Returns how many rows this
 * call actually claimed — a second process claims zero and stays quiet,
 * which is what stops two instances emailing the same lost page.
 */
export async function claimAlertRescue(db, ids) {
  if (!ids || ids.length === 0) return 0;
  const { rowCount } = await db.query(
    `UPDATE wa_staff_alerts SET rescued_at = NOW()
      WHERE id = ANY($1) AND rescued_at IS NULL`,
    [ids]
  );
  return rowCount;
}

export default {
  notifyStaff, recordStaffAlertStatus, staffAlertHealth, usableStaffNumbers,
  lostAlertBatches, deadStaffNumbers, claimAlertRescue,
};
