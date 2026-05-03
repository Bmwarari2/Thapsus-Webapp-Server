// utils/markPaymentPaid.js
// Single atomic state-machine for "money received" — called from both the
// Stripe webhook AND the admin M-Pesa approval route. Same code path means
// the same downstream side-effects (target row update + parcel notify +
// credit ledger debit) regardless of payment method.
//
// Caller must NOT have an open transaction — this function opens its own
// so it can FOR UPDATE the target rows safely.

import { sendOrderCreatedEmail } from './email.js'; // existing import surface

/**
 * Marks the payment paid, deducts any consumed credit, and flips the
 * underlying target row to its "paid" state. Returns { ok, target_kind,
 * target_id, alreadyPaid }.
 *
 * Idempotent: if payments.status is already 'paid', returns alreadyPaid:true
 * and does nothing else. Safe to retry from webhook redelivery.
 *
 * @param {pg.Pool} db
 * @param {string} paymentId
 * @param {object} [opts]
 * @param {string} [opts.stripeChargeId]   set on Stripe completion
 * @param {string} [opts.adminUserId]      set on M-Pesa admin approval
 */
export async function markPaymentPaid(db, paymentId, opts = {}) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: payRows } = await client.query(
      `SELECT * FROM payments WHERE id = $1 FOR UPDATE`,
      [paymentId]
    );
    if (payRows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'payment-not-found' };
    }
    const payment = payRows[0];

    if (payment.status === 'paid') {
      await client.query('ROLLBACK');
      return { ok: true, alreadyPaid: true,
               target_kind: payment.target_kind, target_id: payment.target_id };
    }

    if (payment.status !== 'pending' && payment.status !== 'awaiting_review') {
      await client.query('ROLLBACK');
      return { ok: false, reason: `Cannot mark paid from status '${payment.status}'` };
    }

    // Deduct credit consumed for this payment from the user's balance and
    // append a ledger entry. Skip if amount_credit_kes is 0.
    if (payment.amount_credit_kes > 0) {
      await client.query(
        `INSERT INTO user_credits (user_id, balance_kes, updated_at)
         VALUES ($1, 0, NOW())
         ON CONFLICT (user_id) DO NOTHING`,
        [payment.user_id]
      );
      await client.query(
        `UPDATE user_credits
            SET balance_kes = GREATEST(balance_kes - $1, 0),
                updated_at = NOW()
          WHERE user_id = $2`,
        [payment.amount_credit_kes, payment.user_id]
      );
      await client.query(
        `INSERT INTO credit_ledger (id, user_id, delta_kes, reason, source_id, note)
         VALUES ($1, $2, $3, 'consumed_payment', $4, $5)`,
        [`CRD-PAY-${paymentId}`, payment.user_id, -payment.amount_credit_kes,
         paymentId, `Credit applied to payment ${paymentId}`]
      );
    }

    // Flip the payment row.
    await client.query(
      `UPDATE payments
          SET status = 'paid',
              paid_at = NOW(),
              stripe_charge_id = COALESCE($2, stripe_charge_id),
              reviewed_by = COALESCE($3, reviewed_by),
              reviewed_at = COALESCE(reviewed_at, CASE WHEN $3 IS NOT NULL THEN NOW() ELSE reviewed_at END),
              updated_at = NOW()
        WHERE id = $1`,
      [paymentId, opts.stripeChargeId || null, opts.adminUserId || null]
    );

    // Flip the target row.
    await flipTarget(client, payment.target_kind, payment.target_id);

    await client.query('COMMIT');

    // Best-effort post-commit hooks (emails, etc.). Failures here MUST NOT
    // roll back the payment — the customer's money is in.
    try {
      await firePostPaidHook(db, payment);
    } catch (e) {
      console.warn(`[markPaymentPaid:${paymentId}] post-paid hook failed:`, e?.message);
    }

    return { ok: true, alreadyPaid: false,
             target_kind: payment.target_kind, target_id: payment.target_id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`[markPaymentPaid:${paymentId}] error:`, err);
    return { ok: false, reason: 'state-flip-failed', error: err.message };
  } finally {
    client.release();
  }
}

async function flipTarget(client, kind, id) {
  switch (kind) {
    case 'order':
      await client.query(
        `UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = $1 AND status NOT IN ('paid','cancelled','delivered')`,
        [id]
      );
      break;
    case 'consolidation':
      // customer_consolidations table — invoice paid by customer
      await client.query(
        `UPDATE customer_consolidations SET status = 'paid', updated_at = NOW() WHERE id = $1 AND status NOT IN ('paid','shipped','delivered')`,
        [id]
      );
      break;
    case 'buy_for_me':
      await client.query(
        `UPDATE buy_for_me_orders
            SET status = 'paid',
                decided_at = COALESCE(decided_at, NOW()),
                updated_at = NOW()
          WHERE id = $1 AND status = 'quoted'`,
        [id]
      );
      break;
    default:
      throw new Error(`Unknown payment target_kind: ${kind}`);
  }
}

async function firePostPaidHook(_db, _payment) {
  // Placeholder. Plug in:
  //   - sendOrderCreatedEmail / sendBuyForMeReceivedEmail
  //   - parcelStatusNotify for downstream realtime fan-out
  // Left empty in the foundation PR — emails will be wired in PR B/C
  // once the iOS surfaces are confirmed.
}
