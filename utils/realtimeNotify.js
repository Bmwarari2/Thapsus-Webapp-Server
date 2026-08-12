/**
 * utils/realtimeNotify.js — one call to reach a user in any open tab.
 *
 * SSE only (routes/events.js::pushToUser). Web Push was removed with the
 * customer PWA in the lean rebuild. Best-effort: swallows its own errors,
 * callers never need to wrap this in try/catch for correctness.
 */
import { pushToUser } from '../routes/events.js';

/**
 * @param {object} _db             - kept for call-site compatibility
 * @param {string} userId
 * @param {object} opts
 * @param {string} opts.type       - SSE event type (e.g. 'buy_for_me_update')
 * @param {object} opts.data       - SSE payload
 */
export async function notifyUser(_db, userId, { type, data } = {}) {
  if (!userId) return;
  try { if (type) pushToUser(userId, type, data || {}); }
  catch (err) { console.error('[notify] SSE failed:', err?.message); }
}

export default { notifyUser };
