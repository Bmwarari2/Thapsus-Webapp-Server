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
 */
export async function notifyStaff(db, { title, detail, dedupeKey }) {
  try {
    if (!sentDmConfigured()) return;
    const settings = await getWaSettings(db);
    const { numbers, rejected } = usableStaffNumbers(settings.staff_alert_numbers);
    for (const bad of rejected) {
      console.error(`[waStaffAlert] ⚠ staff_alert_numbers contains the business's own WhatsApp number (${bad}) — WhatsApp cannot deliver a message to its own sender, so that entry pages nobody. Set a personal number in /ops/settings.`);
    }
    if (numbers.length === 0) return;
    if (dedupeKey && seenRecently(dedupeKey)) return;

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
        phone, title: params.var_1, detail: params.var_2, dedupeKey,
        template: settings.staff_alert_template, providerMessageId, error,
      });
    }));
  } catch (e) {
    console.warn('[waStaffAlert] failed (non-fatal):', e?.message);
  }
}

/**
 * The audit row. Best-effort like everything else here — a page that
 * went out and was not written down still went out.
 */
async function recordStaffAlert(db, { phone, title, detail, dedupeKey, template, providerMessageId, error }) {
  try {
    await db.query(
      `INSERT INTO wa_staff_alerts (id, phone, title, detail, dedupe_key, template, provider_message_id, status, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (provider_message_id) DO NOTHING`,
      [uuidv4(), phone, title, detail, dedupeKey || null, template || null,
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
 * @returns {Promise<Array<{phone: string, own_number: boolean, total: number,
 *   failed: number, last_status: string|null, last_at: string|null, last_error: string|null}>>}
 */
export async function staffAlertHealth(db, { days = 7 } = {}) {
  const settings = await getWaSettings(db);
  const { numbers, rejected } = usableStaffNumbers(settings.staff_alert_numbers);
  const out = [];
  for (const phone of [...numbers, ...rejected]) {
    const { rows } = await db.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'failed')::int AS failed,
              (SELECT status FROM wa_staff_alerts WHERE phone = $1 ORDER BY created_at DESC LIMIT 1) AS last_status,
              (SELECT created_at FROM wa_staff_alerts WHERE phone = $1 ORDER BY created_at DESC LIMIT 1) AS last_at,
              (SELECT error FROM wa_staff_alerts WHERE phone = $1 ORDER BY created_at DESC LIMIT 1) AS last_error
         FROM wa_staff_alerts
        WHERE phone = $1 AND created_at > NOW() - ($2 || ' days')::interval`,
      [phone, String(days)]
    );
    out.push({ phone, own_number: rejected.includes(phone), ...rows[0] });
  }
  return out;
}

export default { notifyStaff, recordStaffAlertStatus, staffAlertHealth, usableStaffNumbers };
