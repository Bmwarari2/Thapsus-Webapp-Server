// routes/adminPayments.js
// Staff queue for M-Pesa payment review (operators and admins). Stripe
// payments don't need this touch — the webhook flips them automatically.
// M-Pesa payments arrive as 'awaiting_review' once the customer pastes
// their confirmation SMS (legacy flow) or confirms a quote on WhatsApp;
// a reviewer verifies the reference + amount against the actual M-Pesa
// statement before approving.

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { logRouteError } from '../utils/errorLogger.js';
import { markPaymentPaid } from '../utils/markPaymentPaid.js';
import { sendToContact } from '../utils/waSend.js';
import { mpesaTill } from '../utils/waPayments.js';
import { pushToStaff } from './events.js';

const router = express.Router();

// Operators approve too (admins pass via requireRole's bypass). This
// queue used to be admin-only, which made one admin the serial bottleneck
// for every order in the business — operators were even shown a button
// pointing at a page they could not open. The audit trail holds either
// way: markPaymentPaid stamps reviewed_by/reviewed_at with whoever
// approved, and the override reason is persisted on the row.
const REVIEWER = requireRole('operator');

/** GET /api/admin/payments/pending — every M-Pesa payment awaiting review. */
router.get('/pending', authMiddleware, REVIEWER, async (req, res) => {
  try {
    // LEFT JOINs: legacy payments hang off a users row, WhatsApp-flow
    // payments hang off a wa_contacts row (user_id IS NULL).
    const { rows } = await req.db.query(
      `SELECT p.*,
              COALESCE(u.name, wc.full_name)          AS user_name,
              COALESCE(u.email, wc.phone)             AS user_email,
              wc.customer_code                        AS wa_customer_code,
              wo.tracking_code                        AS wa_tracking_code
         FROM payments p
         LEFT JOIN users u        ON u.id = p.user_id
         LEFT JOIN wa_contacts wc ON wc.id = p.wa_contact_id
         LEFT JOIN wa_orders wo   ON p.target_kind = 'wa_order' AND wo.id = p.target_id
        WHERE p.status = 'awaiting_review' AND p.method = 'mpesa'
        ORDER BY p.created_at ASC`
    );
    res.json({ success: true, payments: rows });
  } catch (err) {
    logRouteError(req, res, err, 'GET /admin/payments/pending');
    res.status(500).json({ success: false, message: 'Failed to load pending payments' });
  }
});

/**
 * POST /api/admin/payments/:id/approve — admin confirms the M-Pesa SMS.
 *
 * Audit P1.2 enforcement layered on top of the existing
 * markPaymentPaid state machine:
 *
 *   1. Block approval when the parsed SMS amount is LESS than the
 *      payment's amount_due_kes. The webapp surfaces a red mismatch chip
 *      already; this is the belt-and-braces server check so a misclick
 *      can't settle a short payment. Equal or greater is fine — the
 *      customer over-paid, the admin can refund the difference offline.
 *
 *   2. Allow override when the admin supplies `override_reason` (>=10
 *      chars). The justification is persisted on the payments row in
 *      `approval_override_reason` so the audit trail captures *why* a
 *      mismatched approval went through.
 *
 *   3. Reject-with-409 when no SMS has been pasted yet
 *      (mpesa_message_amount_kes IS NULL) — admins should not approve
 *      a payment that never received its confirmation step.
 *
 * Cross-payment reference reuse is blocked by migration 032's
 * `uq_payments_mpesa_ref` partial unique index, which fires at the
 * `mpesa-confirmation` step (not here).
 */
router.post('/:id/approve', authMiddleware, REVIEWER, async (req, res) => {
  try {
    const { override_reason } = req.body || {};
    const overrideReason = typeof override_reason === 'string'
      ? override_reason.trim() : '';

    const { rows } = await req.db.query(
      `SELECT id, status, method, amount_due_kes, target_kind,
              mpesa_message_amount_kes, mpesa_reference
         FROM payments WHERE id = $1`,
      [req.params.id]
    );
    const payment = rows[0];
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    if (payment.method !== 'mpesa') {
      return res.status(400).json({
        success: false,
        message: 'Only M-Pesa payments can be approved here. Stripe payments settle via webhook.',
      });
    }
    if (payment.status !== 'awaiting_review') {
      // Already paid → markPaymentPaid still no-ops below; explicit guard
      // here gives the admin a clearer message than a generic 409.
      return res.status(409).json({
        success: false,
        message: `Payment is in status '${payment.status}', not 'awaiting_review'.`,
      });
    }
    // WhatsApp-flow manual payments have no SMS-paste step — the admin
    // approves against the M-Pesa statement directly, and the amount was
    // fixed server-side at request time. Legacy customer-pasted payments
    // keep the SMS requirement + amount cross-check below.
    if (payment.target_kind !== 'wa_order' && payment.mpesa_message_amount_kes == null) {
      return res.status(409).json({
        success: false,
        message: 'No M-Pesa SMS on file. Ask the customer to paste their confirmation message before approving.',
      });
    }

    const claimed = Number(payment.mpesa_message_amount_kes);
    const due     = Number(payment.amount_due_kes);
    const isShort = Number.isFinite(claimed) && Number.isFinite(due) && claimed < due;

    if (isShort && overrideReason.length < 10) {
      return res.status(409).json({
        success: false,
        error: 'amount_mismatch',
        message: `M-Pesa SMS shows KES ${claimed.toLocaleString()} but the invoice is KES ${due.toLocaleString()}. Provide override_reason (>=10 chars) to approve anyway, or reject with a reason.`,
        amount_due_kes: due,
        amount_claimed_kes: claimed,
      });
    }

    // Persist the override BEFORE markPaymentPaid flips the row, since
    // markPaymentPaid sets reviewed_by/reviewed_at + status='paid' and
    // we want the override note to land in the same DB visit. The flip
    // doesn't touch approval_override_reason.
    if (isShort) {
      await req.db.query(
        `UPDATE payments
            SET approval_override_reason = $2,
                updated_at = NOW()
          WHERE id = $1 AND status = 'awaiting_review'`,
        [req.params.id, overrideReason]
      );
    }

    const result = await markPaymentPaid(req.db, req.params.id, { adminUserId: req.user.id });
    if (!result.ok) {
      return res.status(409).json({ success: false, message: result.reason || 'Failed to approve' });
    }
    res.json({
      success: true,
      alreadyPaid: result.alreadyPaid,
      target_kind: result.target_kind,
      target_id: result.target_id,
      override_applied: isShort,
    });
  } catch (err) {
    logRouteError(req, res, err, 'POST /admin/payments/:id/approve');
    res.status(500).json({ success: false, message: 'Failed to approve payment' });
  }
});

/**
 * POST /api/admin/payments/:id/reject — reject with a reason; the
 * customer can pay again.
 *
 * The reason reaches the CUSTOMER for WhatsApp-flow payments. Rejection
 * used to write the reason to the database and send nothing: the
 * customer's last message from us was "our team is verifying it with
 * M-Pesa now", followed by permanent silence — after they had sent
 * money. Tell them what happened and how to put it right.
 */
router.post('/:id/reject', authMiddleware, REVIEWER, async (req, res) => {
  const { reason } = req.body || {};
  if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
    return res.status(400).json({ success: false, message: 'reason is required (min 3 chars)' });
  }
  try {
    const { rows } = await req.db.query(
      `UPDATE payments
          SET status = 'rejected',
              rejection_reason = $2,
              reviewed_by = $3,
              reviewed_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND status = 'awaiting_review'
        RETURNING id, status, target_kind, target_id, wa_contact_id, amount_due_kes`,
      [req.params.id, reason.trim(), req.user.id]
    );
    const payment = rows[0];
    if (!payment) {
      return res.status(409).json({ success: false, message: 'Payment is not awaiting review' });
    }

    // Best-effort customer notice + audit trail; the rejection itself is
    // already committed and must not 500 over a failed send.
    if (payment.target_kind === 'wa_order' && payment.wa_contact_id) {
      try {
        const { rows: contactRows } = await req.db.query(
          `SELECT id, phone, full_name FROM wa_contacts WHERE id = $1`,
          [payment.wa_contact_id]
        );
        const contact = contactRows[0];
        const amount = Number(payment.amount_due_kes);
        if (contact) {
          await sendToContact(req.db, contact, {
            text:
              `We couldn't verify your payment of KSh ${amount.toLocaleString('en-KE')}: ` +
              `${reason.trim()}\n\n` +
              `If you have paid, reply here with the M-Pesa confirmation SMS and we'll check again. ` +
              `To pay: Lipa na M-Pesa, Buy Goods, Till *${mpesaTill()}*.`,
            sentBy: req.user.id,
          });
        }
        await req.db.query(
          `INSERT INTO wa_order_events (id, order_id, from_status, to_status, actor_user_id, note)
           SELECT $1, $2, status, status, $3, $4 FROM wa_orders WHERE id = $2`,
          [uuidv4(), payment.target_id, req.user.id,
           `Payment ${payment.id} rejected — ${reason.trim().slice(0, 180)}`]
        );
        pushToStaff('wa_pipeline_update', {
          order_id: payment.target_id,
          contact_id: payment.wa_contact_id,
          payment_rejected: true,
        });
      } catch (e) {
        console.warn(`[adminPayments] rejection notice for ${payment.id} failed:`, e?.message);
      }
    }

    res.json({ success: true, payment_id: payment.id, status: payment.status });
  } catch (err) {
    logRouteError(req, res, err, 'POST /admin/payments/:id/reject');
    res.status(500).json({ success: false, message: 'Failed to reject payment' });
  }
});

export default router;
