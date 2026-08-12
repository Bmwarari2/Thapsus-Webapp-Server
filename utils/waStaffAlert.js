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

import { sendTemplate, sentDmConfigured } from './sentdm.js';
import { getWaSettings } from './waSettings.js';
import { normalizeKenyanPhone } from './lipanaClient.js';

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
    const numbers = (settings.staff_alert_numbers || [])
      .map((n) => normalizeKenyanPhone(n) || String(n).replace(/[^\d]/g, ''))
      .filter(Boolean);
    if (numbers.length === 0) return;
    if (dedupeKey && seenRecently(dedupeKey)) return;

    // WhatsApp rejects newlines/tabs inside template variables.
    const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
    const params = { var_1: clean(title, 120), var_2: clean(detail, 400) };

    await Promise.all(numbers.map(async (phone) => {
      try {
        await sendTemplate(phone, settings.staff_alert_template, params);
      } catch (e) {
        console.warn(`[waStaffAlert] send to ${phone} failed:`, e?.message);
      }
    }));
  } catch (e) {
    console.warn('[waStaffAlert] failed (non-fatal):', e?.message);
  }
}

export default { notifyStaff };
