/**
 * utils/influencerConversion.js — record an influencer referral conversion.
 *
 * Called (best-effort) whenever an attributed customer places an order, so
 * the admin's influencer dashboard can count how many of the people who
 * received a code's link actually became paying customers — the number they
 * pay the influencer against.
 *
 * A "conversion" is a customer's FIRST order of either kind. The UNIQUE
 * constraint on influencer_conversions.user_id means re-calling this for a
 * customer's later orders is a harmless no-op. The whole thing is wrapped so
 * a failure here can NEVER break order creation — attribution is a reporting
 * concern, not part of the order's success path.
 */
import { v4 as uuidv4 } from 'uuid';

/**
 * @param {object} db     - pg pool / client with .query()
 * @param {string} userId - the customer who just placed the order
 * @param {string} orderRef - the order id (orders.id or buy_for_me_orders.id)
 * @param {'order'|'buy_for_me'} kind
 */
export async function recordInfluencerConversion(db, userId, orderRef, kind = 'order') {
  try {
    if (!userId) return;

    // Only attributed customers count. The column is NULL for everyone who
    // signed up without an influencer code.
    const { rows } = await db.query(
      'SELECT influencer_code FROM users WHERE id = $1',
      [userId]
    );
    const code = rows[0]?.influencer_code;
    if (!code) return;

    // ON CONFLICT (user_id) DO NOTHING makes this idempotent: the customer is
    // counted on their first order and ignored on every subsequent one.
    await db.query(
      `INSERT INTO influencer_conversions (id, code, user_id, order_ref, order_kind)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO NOTHING`,
      [uuidv4(), code, userId, orderRef || null, kind === 'buy_for_me' ? 'buy_for_me' : 'order']
    );
  } catch (err) {
    // Never surface — reporting must not break the order.
    console.error('recordInfluencerConversion failed (non-fatal):', err?.message);
  }
}

export default recordInfluencerConversion;
