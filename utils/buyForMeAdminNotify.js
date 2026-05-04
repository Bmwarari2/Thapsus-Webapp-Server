/**
 * utils/buyForMeAdminNotify.js
 *
 * Single fan-out for "new Buy-for-me request" admin awareness:
 *   • inserts an in-app notification row for every admin user,
 *   • emails every admin (best-effort — errors are logged, not thrown),
 *   • pushes an SSE event so any open admin console refreshes.
 *
 * Called from both customer-side and admin-create-on-behalf POST paths in
 * routes/buyForMe.js. Wrapped in try/catch by the caller so a notification
 * outage never rolls back the row insert.
 */
import crypto from 'node:crypto';
import { sendBuyForMeAdminNewRequestEmail } from './email.js';
import { pushToAdmins } from '../routes/events.js';

/**
 * @param {object} db - pg Pool / Client
 * @param {object} req
 * @param {{ id: string, item_name: string|null, retailer_url: string|null,
 *           qty: number|null, notes: string|null }} bfm
 * @param {{ id: string, name: string|null, email: string|null }} owner
 */
export async function notifyAdminsOfBuyForMe(db, req, bfm, owner) {
  // Always try to wake any live admin consoles first — cheapest, no I/O.
  try {
    pushToAdmins('admin_stats', {
      action: 'buy_for_me_created',
      bfm_id: bfm.id,
      owner_id: owner?.id,
      item_name: bfm.item_name,
    });
  } catch (e) {
    console.error('[BFM admin SSE push failed, non-fatal]', e?.message);
  }

  let admins = [];
  try {
    const { rows } = await db.query(
      `SELECT id, email, name FROM users WHERE role = 'admin' AND COALESCE(is_active, true) = true`
    );
    admins = rows;
  } catch (e) {
    console.error('[BFM admin lookup failed]', e?.message);
    return;
  }

  // Build a single human-readable message — re-used for every admin row.
  const itemSnippet = (bfm.item_name || 'item').slice(0, 80);
  const ownerLabel  = owner?.name || owner?.email || 'a customer';
  const message     = `New Buy-for-me request from ${ownerLabel}: ${itemSnippet}`;

  await Promise.all(admins.map(async (admin) => {
    // In-app notification row. Failure on one admin must not block the rest.
    try {
      const id = crypto.randomUUID();
      await db.query(
        `INSERT INTO notifications (id, user_id, type, message)
         VALUES ($1, $2, 'in_app', $3)`,
        [id, admin.id, message]
      );
    } catch (e) {
      console.error('[BFM admin notification insert failed]', admin.id, e?.message);
    }
    // Email. Same best-effort guarantee.
    if (admin.email) {
      try {
        await sendBuyForMeAdminNewRequestEmail(
          admin.email,
          admin.name,
          bfm.id,
          ownerLabel,
          owner?.email || null,
          itemSnippet,
          bfm.retailer_url,
          bfm.qty,
          bfm.notes
        );
      } catch (e) {
        console.error('[BFM admin email failed]', admin.email, e?.message);
      }
    }
  }));
}
