/**
 * utils/webpush.js — Web Push (VAPID) sender for the PWA.
 *
 * Companion to the in-tab SSE channel (routes/events.js): SSE updates a tab
 * that's already open; Web Push reaches a home-screen/installed PWA whose tab
 * is closed. Both are best-effort — a push failure must never break the
 * request that triggered it.
 *
 * Requires three env vars (see .env.example):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:… or https URL)
 * Without them, web push silently no-ops so the app still runs in dev.
 */
import webpush from 'web-push';

const PUBLIC  = process.env.VAPID_PUBLIC_KEY  || '';
const PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT     || 'mailto:support@thapsus.uk';

let configured = false;
if (PUBLIC && PRIVATE) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
    configured = true;
  } catch (err) {
    console.error('[webpush] VAPID config invalid:', err?.message);
  }
}

export function webPushConfigured() {
  return configured;
}

export function getVapidPublicKey() {
  return PUBLIC;
}

/**
 * Send a push to every subscription a user has. Dead endpoints (404/410) are
 * pruned so the table doesn't accumulate stale rows.
 *
 * @param {object} db   - pg pool / client with .query
 * @param {string} userId
 * @param {{title:string, body:string, url?:string, tag?:string}} payload
 */
export async function sendWebPushToUser(db, userId, payload) {
  if (!configured || !userId) return;
  let rows;
  try {
    ({ rows } = await db.query(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
      [userId]
    ));
  } catch (err) {
    console.error('[webpush] subscription lookup failed:', err?.message);
    return;
  }
  if (!rows.length) return;

  const body = JSON.stringify(payload || {});
  await Promise.all(rows.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body
      );
    } catch (err) {
      const code = err?.statusCode;
      if (code === 404 || code === 410) {
        // Subscription expired/unsubscribed — drop it.
        try { await db.query(`DELETE FROM push_subscriptions WHERE id = $1`, [sub.id]); }
        catch { /* best-effort */ }
      } else {
        console.error('[webpush] send failed:', code, err?.message);
      }
    }
  }));
}

export default { sendWebPushToUser, getVapidPublicKey, webPushConfigured };
