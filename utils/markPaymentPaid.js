// utils/markPaymentPaid.js
// Single atomic state-machine for "money received" — called from the
// Lipana webhook AND the admin M-Pesa approval route. Same code path means
// the same downstream side-effects (target row update + customer notify +
// credit ledger debit) regardless of how the money arrived.
//
// Caller must NOT have an open transaction — this function opens its own
// so it can FOR UPDATE the target rows safely.

import { v4 as uuidv4 } from 'uuid';
import { sendUnifiedPaymentReceiptEmail } from './email.js';
import { insertWithUniqueTrackingNumber } from './trackingNumber.js';
import { nextTrackingCode } from './waCodes.js';

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

    // Recover a payment we'd already recorded as 'failed'. This is the
    // M-Pesa STK "timeout callback fired, but the customer still completed
    // the payment" race: Lipana sends payment.failed/payment.timeout when
    // the Daraja prompt expires (row flips pending → failed), then sends
    // the genuine payment.success once the money actually lands. Without
    // this, the merchant receives the funds but the payment stays 'failed'
    // and the order never clears — the exact "customer got an error but I
    // received the money" report.
    //
    // Every caller of markPaymentPaid has already proven money arrived:
    // an HMAC-verified Lipana webhook, a signature-verified Stripe webhook,
    // or a manual admin M-Pesa approval. So recovering 'failed' → 'paid' is
    // always correct. We deliberately do NOT recover 'cancelled' (a row
    // superseded by a fresh payment attempt — recovering it could settle a
    // target twice) or 'rejected' (an explicit admin decision).
    const recovering = payment.status === 'failed';
    if (payment.status !== 'pending' && payment.status !== 'awaiting_review' && !recovering) {
      await client.query('ROLLBACK');
      return { ok: false, reason: `Cannot mark paid from status '${payment.status}'` };
    }
    if (recovering) {
      console.warn(
        `[markPaymentPaid:${paymentId}] recovering 'failed' → 'paid' on a ` +
        `verified late success signal (STK timeout/decline that settled anyway)`
      );
    }

    // Deduct credit consumed for this payment from the user's balance and
    // append a ledger entry. Skip if amount_credit_kes is 0 (always true
    // for wa_order payments, which have no users row to hold credit).
    if (payment.amount_credit_kes > 0 && payment.user_id) {
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

    return { ok: true, alreadyPaid: false, recovered: recovering,
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
    case 'wa_order': {
      // Two payment moments in the WhatsApp pipeline, distinguished by the
      // order's current status:
      //   confirmed (or a late quoted)          → the main order payment:
      //     flip to 'paid' and mint the Tracking Code in the same
      //     transaction so the code exists the instant money lands.
      //   in_kenya / delivery_fee_pending       → the last-mile fee:
      //     stamp delivery_fee_paid_at; the operator dispatches next.
      const { rows } = await client.query(
        `SELECT id, status, tracking_code FROM wa_orders WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const order = rows[0];
      if (!order) throw new Error(`wa_order ${id} not found`);
      if (['quoting', 'quoted', 'confirmed'].includes(order.status)) {
        const trackingCode = order.tracking_code || await nextTrackingCode(client);
        await client.query(
          `UPDATE wa_orders
              SET status = 'paid', paid_at = COALESCE(paid_at, NOW()),
                  tracking_code = COALESCE(tracking_code, $2), updated_at = NOW()
            WHERE id = $1`,
          [id, trackingCode]
        );
        await client.query(
          `INSERT INTO wa_order_events (id, order_id, from_status, to_status, note)
           VALUES ($1, $2, $3, 'paid', 'Payment received')`,
          [uuidv4(), id, order.status]
        );
      } else if (['in_kenya', 'delivery_fee_pending'].includes(order.status)) {
        await client.query(
          `UPDATE wa_orders SET delivery_fee_paid_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [id]
        );
        await client.query(
          `INSERT INTO wa_order_events (id, order_id, from_status, to_status, note)
           VALUES ($1, $2, $3, $3, 'Delivery fee received')`,
          [uuidv4(), id, order.status]
        );
      }
      // Terminal/other statuses: leave the order alone (idempotent replay).
      break;
    }
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
      // Auto-create a pre-registered parcel so the customer immediately
      // sees a tracking entry + the operator gets it in the warehouse
      // intake queue. Idempotent: if buy_for_me_orders.parcel_id is
      // already set, skip.
      await maybeCreatePreRegisteredParcelForBfm(client, id);
      break;
    default:
      throw new Error(`Unknown payment target_kind: ${kind}`);
  }
}

/**
 * After a BFM accept payment lands, create a pre_registered parcel for
 * the customer. Mirrors the customer POST /api/orders flow so this row
 * shows up in tracking + the operator intake queue.
 *
 * Idempotent: if buy_for_me_orders.parcel_id is already set, no-op.
 *
 * Runs inside the same transaction as the buy_for_me_orders status flip.
 */
async function maybeCreatePreRegisteredParcelForBfm(client, bfmId) {
  const { rows: bfmRows } = await client.query(
    `SELECT id, user_id, retailer_url, item_name, parcel_id
       FROM buy_for_me_orders WHERE id = $1`, [bfmId]
  );
  const bfm = bfmRows[0];
  if (!bfm) return;
  if (bfm.parcel_id) return; // already linked — idempotent

  const orderId  = uuidv4();
  const retailer = parseRetailerLabel(bfm.retailer_url);

  // Audit P2.4: Stripe webhook redelivery + concurrent BFM accepts
  // were both 23505-prone here — the whole `markPaymentPaid` would
  // 500 to Stripe, the webhook would retry, the payment row stayed
  // 'pending' and the customer's BFM order never showed paid.
  // Shared helper retries on the unique-index violation.
  await insertWithUniqueTrackingNumber(client, (tn) =>
    client.query(
      `INSERT INTO orders (id, user_id, tracking_number, retailer,
          status, description, weight_kg, dimensions_json, shipping_speed,
          insurance, declared_value, estimated_cost, hs_tier, electronics_item)
       VALUES ($1,$2,$3,$4,'pending',$5,NULL,NULL,'economy',false,0,0,'general',NULL)`,
      [orderId, bfm.user_id, tn, retailer, bfm.item_name]
    )
  );
  await client.query(
    `INSERT INTO packages (id, order_id, user_id, description, weight_kg, status)
     VALUES ($1,$2,$3,$4,NULL,'pre_registered')`,
    [uuidv4(), orderId, bfm.user_id, bfm.item_name]
  );
  await client.query(
    `UPDATE buy_for_me_orders SET parcel_id = $1, updated_at = NOW() WHERE id = $2`,
    [orderId, bfmId]
  );
}

function parseRetailerLabel(url) {
  if (!url) return 'Buy-for-me';
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '');
    return host || 'Buy-for-me';
  } catch {
    return 'Buy-for-me';
  }
}

async function firePostPaidHook(db, payment) {
  if (payment.target_kind === 'wa_order') {
    return fireWaOrderPostPaidHook(db, payment);
  }
  // 1) Look up the customer's email + name.
  const { rows: userRows } = await db.query(
    `SELECT email, name FROM users WHERE id = $1`,
    [payment.user_id]
  );
  const user = userRows[0];
  if (!user?.email) {
    console.warn(`[firePostPaidHook:${payment.id}] no user/email for ${payment.user_id} — skip receipt`);
    return;
  }

  // 2) Look up a human-readable label for the target.
  const targetLabel = await lookupTargetLabel(db, payment.target_kind, payment.target_id);

  // 3) Pick the reference field that matches the method.
  const reference = payment.method === 'stripe'
    ? payment.stripe_payment_intent_id
    : payment.mpesa_reference;

  await sendUnifiedPaymentReceiptEmail(user.email, user.name, {
    paymentId:            payment.id,
    method:               payment.method,
    amountGrossKes:       Number(payment.amount_gross_kes || 0),
    amountCreditKes:      Number(payment.amount_credit_kes || 0),
    amountDueKes:         Number(payment.amount_due_kes || 0),
    reference,
    paidAt:               payment.paid_at || new Date(),
    stripeAmountPenceGbp: payment.stripe_amount_pence_gbp
                            ? Number(payment.stripe_amount_pence_gbp)
                            : null,
    targetKind:           payment.target_kind,
    targetLabel,
    userId:               payment.user_id,
  });
}

/**
 * WhatsApp-flow post-payment side effects (best-effort; the money is in):
 *   main order payment  → PDF receipt to Supabase Storage, pushed to the
 *     customer as a signed URL, plus the Tracking Code announcement.
 *   delivery fee        → short confirmation; operator dispatches next.
 * Dynamic imports keep the legacy payment path free of the wa modules.
 */
async function fireWaOrderPostPaidHook(db, payment) {
  const { rows } = await db.query(
    `SELECT o.*, c.id AS c_id, c.phone, c.full_name, c.customer_code
       FROM wa_orders o JOIN wa_contacts c ON c.id = o.contact_id
      WHERE o.id = $1`,
    [payment.target_id]
  );
  const order = rows[0];
  if (!order) {
    console.warn(`[firePostPaidHook:${payment.id}] wa_order ${payment.target_id} missing`);
    return;
  }
  const contact = {
    id: order.c_id, phone: order.phone,
    full_name: order.full_name, customer_code: order.customer_code,
  };
  const { sendToContact } = await import('./waSend.js');
  const { pushToStaff } = await import('../routes/events.js');

  try {
    pushToStaff('wa_pipeline_update', {
      order_id: order.id, contact_id: contact.id, status: order.status,
    });
  } catch { /* SSE best-effort */ }

  // Delivery-fee settlement → short confirmation only.
  if (['in_kenya', 'delivery_fee_pending'].includes(order.status)) {
    await sendToContact(db, contact, {
      text:
        `Delivery fee received for ${order.tracking_code}. ` +
        `Your parcel will be dispatched to your address shortly.`,
    });
    return;
  }
  if (order.status !== 'paid') return; // replay of an old event — nothing to say

  // Main payment: tracking code announcement + PDF receipt.
  await sendToContact(db, contact, {
    templateKey: 'payment_received',
    templateParams: { tracking_code: order.tracking_code || '' },
    text:
      `Payment received — asante!\n` +
      `Your tracking code is *${order.tracking_code}*. Text it to us any time to check on your parcel.\n` +
      `We're purchasing your item now and will keep you posted.`,
  });

  try {
    const { generateAndStoreReceipt } = await import('./receiptPdf.js');
    const { receiptShortUrl } = await import('./receiptLink.js');
    const path = await generateAndStoreReceipt({ order, contact, payment });
    await db.query(
      `UPDATE wa_orders SET receipt_path = $2, updated_at = NOW() WHERE id = $1`,
      [order.id, path]
    );
    // Short link rather than the ~600-character Supabase signed URL —
    // /r/:token re-signs on click, so it also never goes stale.
    const url = receiptShortUrl(order);
    if (url) {
      await sendToContact(db, contact, {
        templateKey: 'receipt',
        templateParams: { tracking_code: order.tracking_code || '', receipt_url: url },
        text: `Here's your receipt for ${order.tracking_code}: ${url}`,
      });
    }
  } catch (e) {
    // Receipt failures never block the payment; the operator can resend
    // from the order screen (POST /api/wa/orders/:id/receipt/resend).
    console.warn(`[firePostPaidHook:${payment.id}] receipt generation failed:`, e?.message);
  }
}

async function lookupTargetLabel(db, kind, id) {
  try {
    if (kind === 'order') {
      const { rows } = await db.query(
        `SELECT tracking_number FROM orders WHERE id = $1`, [id]
      );
      return rows[0]?.tracking_number || id;
    }
    if (kind === 'consolidation') {
      const { rows } = await db.query(
        `SELECT id FROM customer_consolidations WHERE id = $1`, [id]
      );
      // Use the short prefix of the uuid as a human label
      return rows[0] ? String(rows[0].id).slice(0, 8) : String(id).slice(0, 8);
    }
    if (kind === 'buy_for_me') {
      const { rows } = await db.query(
        `SELECT item_name FROM buy_for_me_orders WHERE id = $1`, [id]
      );
      return rows[0]?.item_name || id;
    }
  } catch (e) {
    console.warn(`[lookupTargetLabel] failed for ${kind}/${id}:`, e?.message);
  }
  return String(id);
}
