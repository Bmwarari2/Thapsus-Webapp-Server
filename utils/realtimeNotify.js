/**
 * utils/realtimeNotify.js — one call to reach a user on every channel.
 *
 * Fans a single event out to:
 *   • SSE  (routes/events.js::pushToUser)  → live update in an open tab
 *   • Web Push (utils/webpush.js)          → notification on a closed PWA
 *
 * Both are best-effort and swallow their own errors; callers should never
 * have to wrap this in try/catch for correctness.
 */
import { pushToUser } from '../routes/events.js';
import { sendWebPushToUser } from './webpush.js';

/**
 * @param {object} db
 * @param {string} userId
 * @param {object} opts
 * @param {string} opts.type        - SSE event type (e.g. 'buy_for_me_update')
 * @param {object} opts.data        - SSE payload
 * @param {object} [opts.push]      - { title, body, url?, tag? }; omit to skip push
 */
export async function notifyUser(db, userId, { type, data, push } = {}) {
  if (!userId) return;
  try { if (type) pushToUser(userId, type, data || {}); }
  catch (err) { console.error('[notify] SSE failed:', err?.message); }

  if (push) {
    try { await sendWebPushToUser(db, userId, push); }
    catch (err) { console.error('[notify] web push failed:', err?.message); }
  }
}

export default { notifyUser };
