// utils/notifications.js
//
// In-app notification rows for legacy (accounts-based) customers.
//
// ⚠ History worth knowing: this module used to be a stack of stub
// channels — sendSMS / sendWhatsApp / sendEmail that console.log'd and
// returned `success: true` with a fabricated message id, and a
// sendInAppNotification whose db path called better-sqlite3's
// `db.prepare()` against a pg Pool (throwing, swallowed). Six admin and
// tracking call sites believed for months that they were notifying
// customers. Everything fake is gone; what remains actually writes the
// row and pushes it over SSE.
//
// The WhatsApp flow does not use this — its customers have no accounts
// and are messaged via utils/waSend.js. Real parcel-status fan-out for
// the legacy pipeline (email + SSE + this row) lives in
// utils/parcelStatusNotify.js.

import { pushToUser } from '../routes/events.js';

/**
 * Write an in-app notification row for a user and push it over SSE.
 * Best-effort: failures are logged, never thrown — every caller is in
 * the happy path of an already-committed change.
 *
 * @param {pg.Pool|pg.PoolClient} db
 * @param {string} userId
 * @param {string} message
 * @param {string} [type]
 * @returns {Promise<boolean>} whether the row was written
 */
export async function sendInAppNotification(db, userId, message, type = 'in_app') {
  if (!db || !userId || !message) return false;
  try {
    await db.query(
      `INSERT INTO notifications (id, user_id, type, message)
       VALUES ($1, $2, $3, $4)`,
      [`NOTIF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, userId, type, String(message).slice(0, 1000)]
    );
    try {
      pushToUser(userId, 'notification', { message, type });
    } catch { /* SSE best-effort */ }
    return true;
  } catch (err) {
    console.warn('[notifications] in-app insert failed:', err?.message);
    return false;
  }
}
