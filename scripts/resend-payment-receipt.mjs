#!/usr/bin/env node
// scripts/resend-payment-receipt.mjs
//
// Sends (or re-sends) the unified payment receipt email for a single, already
// PAID payment — using the exact same lookups + template as the normal
// post-paid hook in utils/markPaymentPaid.js (firePostPaidHook).
//
// Why this exists: the receipt is normally a side-effect of markPaymentPaid().
// When a payment has to be reconciled to 'paid' out-of-band (e.g. the M-Pesa
// "STK timed out but the customer still paid" race, where the row was already
// marked 'failed' before the late success landed), markPaymentPaid() would
// no-op on the already-paid row and never send the receipt. This script closes
// that gap without re-triggering any of the other settlement side-effects.
//
// Must run in an environment that has the Gmail OAuth credentials configured
// (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN) and a valid
// DATABASE_URL — i.e. the deployment (Railway), not a bare local checkout.
//
// Usage:
//   node scripts/resend-payment-receipt.mjs PAY-1783372063545-j2i66g
//   DRY_RUN=true node scripts/resend-payment-receipt.mjs PAY-...   # look, don't send

import dotenv from 'dotenv';
dotenv.config();

import { getPool } from '../database/init.js';
import { sendUnifiedPaymentReceiptEmail } from '../utils/email.js';

const paymentId = process.argv[2];
const DRY_RUN = process.env.DRY_RUN === 'true';

if (!paymentId) {
  console.error('Usage: node scripts/resend-payment-receipt.mjs <paymentId> [DRY_RUN=true]');
  process.exit(2);
}

// Mirror of lookupTargetLabel() in utils/markPaymentPaid.js.
async function lookupTargetLabel(db, kind, id) {
  try {
    if (kind === 'order') {
      const { rows } = await db.query(`SELECT tracking_number FROM orders WHERE id = $1`, [id]);
      return rows[0]?.tracking_number || id;
    }
    if (kind === 'consolidation') {
      const { rows } = await db.query(`SELECT id FROM customer_consolidations WHERE id = $1`, [id]);
      return rows[0] ? String(rows[0].id).slice(0, 8) : String(id).slice(0, 8);
    }
    if (kind === 'buy_for_me') {
      const { rows } = await db.query(`SELECT item_name FROM buy_for_me_orders WHERE id = $1`, [id]);
      return rows[0]?.item_name || id;
    }
  } catch (e) {
    console.warn(`[lookupTargetLabel] failed for ${kind}/${id}:`, e?.message);
  }
  return String(id);
}

async function main() {
  const db = getPool();

  const { rows: payRows } = await db.query(`SELECT * FROM payments WHERE id = $1`, [paymentId]);
  const payment = payRows[0];
  if (!payment) {
    console.error(`✗ payment ${paymentId} not found`);
    process.exit(1);
  }
  if (payment.status !== 'paid') {
    console.error(`✗ payment ${paymentId} is '${payment.status}', not 'paid' — refusing to send a receipt for an unsettled payment.`);
    process.exit(1);
  }

  const { rows: userRows } = await db.query(`SELECT email, name FROM users WHERE id = $1`, [payment.user_id]);
  const user = userRows[0];
  if (!user?.email) {
    console.error(`✗ no user/email for ${payment.user_id} — cannot send receipt`);
    process.exit(1);
  }

  const targetLabel = await lookupTargetLabel(db, payment.target_kind, payment.target_id);
  const reference = payment.method === 'stripe'
    ? payment.stripe_payment_intent_id
    : payment.mpesa_reference;

  console.log(`→ ${DRY_RUN ? '[DRY RUN] would send' : 'sending'} receipt for ${paymentId}`);
  console.log(`   to:      ${user.name || '(no name)'} <${user.email}>`);
  console.log(`   method:  ${payment.method}   amount_due_kes: ${payment.amount_due_kes}`);
  console.log(`   target:  ${payment.target_kind} — ${targetLabel}`);
  console.log(`   paid_at: ${payment.paid_at}`);

  if (DRY_RUN) {
    console.log('✓ dry run — no email sent');
    await db.end?.();
    return;
  }

  await sendUnifiedPaymentReceiptEmail(user.email, user.name, {
    paymentId:            payment.id,
    method:               payment.method,
    amountGrossKes:       Number(payment.amount_gross_kes || 0),
    amountCreditKes:      Number(payment.amount_credit_kes || 0),
    amountDueKes:         Number(payment.amount_due_kes || 0),
    reference,
    paidAt:               payment.paid_at || new Date(),
    stripeAmountPenceGbp: payment.stripe_amount_pence_gbp ? Number(payment.stripe_amount_pence_gbp) : null,
    targetKind:           payment.target_kind,
    targetLabel,
    userId:               payment.user_id,
  });

  console.log(`✓ receipt sent to ${user.email}`);
  await db.end?.();
}

main().catch((err) => {
  console.error('✗ failed:', err?.message || err);
  process.exit(1);
});
