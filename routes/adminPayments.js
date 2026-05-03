// routes/adminPayments.js
// Admin queue for M-Pesa payment review. Stripe payments don't need admin
// touch — the webhook flips them automatically. M-Pesa payments arrive as
// 'awaiting_review' once the customer pastes their confirmation SMS; an
// admin verifies the parsed reference + amount against the actual M-Pesa
// statement before approving.

import express from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { logRouteError } from '../utils/errorLogger.js';
import { markPaymentPaid } from '../utils/markPaymentPaid.js';

const router = express.Router();

const ADMIN = requireRole('admin'); // tighter than the staff list — only admins approve money

/** GET /api/admin/payments/pending — every M-Pesa payment awaiting review. */
router.get('/pending', authMiddleware, ADMIN, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT p.*, u.email AS user_email, u.name AS user_name
         FROM payments p
         JOIN users u ON u.id = p.user_id
        WHERE p.status = 'awaiting_review' AND p.method = 'mpesa'
        ORDER BY p.created_at ASC`
    );
    res.json({ success: true, payments: rows });
  } catch (err) {
    logRouteError(req, res, err, 'GET /admin/payments/pending');
    res.status(500).json({ success: false, message: 'Failed to load pending payments' });
  }
});

/** POST /api/admin/payments/:id/approve — admin confirms the M-Pesa SMS. */
router.post('/:id/approve', authMiddleware, ADMIN, async (req, res) => {
  try {
    const result = await markPaymentPaid(req.db, req.params.id, { adminUserId: req.user.id });
    if (!result.ok) {
      return res.status(409).json({ success: false, message: result.reason || 'Failed to approve' });
    }
    res.json({ success: true, alreadyPaid: result.alreadyPaid, target_kind: result.target_kind, target_id: result.target_id });
  } catch (err) {
    logRouteError(req, res, err, 'POST /admin/payments/:id/approve');
    res.status(500).json({ success: false, message: 'Failed to approve payment' });
  }
});

/** POST /api/admin/payments/:id/reject — admin rejects with a reason; customer can resubmit. */
router.post('/:id/reject', authMiddleware, ADMIN, async (req, res) => {
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
        RETURNING id, status`,
      [req.params.id, reason.trim(), req.user.id]
    );
    if (!rows[0]) {
      return res.status(409).json({ success: false, message: 'Payment is not awaiting review' });
    }
    res.json({ success: true, payment_id: rows[0].id, status: rows[0].status });
  } catch (err) {
    logRouteError(req, res, err, 'POST /admin/payments/:id/reject');
    res.status(500).json({ success: false, message: 'Failed to reject payment' });
  }
});

export default router;
