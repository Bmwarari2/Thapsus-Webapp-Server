import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logRouteError } from '../utils/errorLogger.js';
import { getMpesaConfig } from '../utils/mpesaConfig.js';
import { idempotency } from '../middleware/idempotency.js';

const router = express.Router();

/**
 * GET /api/payment/:orderId
 * Public endpoint (no auth required). Returns non-PII order details for payment page.
 */
router.get('/:orderId', async (req, res) => {
  try {
    const db = req.db;
    const { orderId } = req.params;

    // Get order without exposing customer PII on this public endpoint
    const orderRes = await db.query(
      `SELECT id, tracking_number, actual_cost, estimated_cost, status
       FROM orders
       WHERE id = $1`,
      [orderId]
    );

    if (!orderRes.rows[0]) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orderRes.rows[0];
    const amountDue = order.actual_cost || order.estimated_cost;

    const { paybillNumber, accountNumber } = getMpesaConfig();
    res.json({
      success: true,
      order: {
        id: order.id,
        tracking_number: order.tracking_number,
        amount_due: amountDue,
        status: order.status,
      },
      mpesa_info: {
        paybill: paybillNumber,
        account_number: accountNumber,
      },
    });
  } catch (error) {
    console.error('Get payment order error:', error);
    logRouteError(req, res, error, 'Get payment order error');
    res.status(500).json({ success: false, message: 'Failed to fetch order details' });
  }
});

/**
 * POST /api/payment/:orderId/confirm
 * Public endpoint. Accepts M-Pesa payment confirmation from customer.
 * Validates, extracts code, inserts transaction (pending), logs admin action, notifies admins.
 */
router.post('/:orderId/confirm', idempotency, async (req, res) => {
  try {
    const db = req.db;
    const { orderId } = req.params;
    const { mpesa_message, amount, payer_name, payer_phone } = req.body;

    const trimmedMessage = typeof mpesa_message === 'string' ? mpesa_message.trim() : '';
    const numericAmount = typeof amount === 'number' ? amount : parseFloat(amount) || 0;

    // Frontend was previously only sending mpesa_message and amount, which caused 400s.
    // We now only require these fields and treat payer_name/phone as optional metadata.
    if (!trimmedMessage) {
      return res.status(400).json({ success: false, message: 'Mpesa confirmation message is required' });
    }

    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ success: false, message: 'A valid payment amount is required' });
    }

    // Apply basic sanity bounds to reduce obviously invalid submissions
    if (numericAmount > 1_000_000) {
      return res.status(400).json({ success: false, message: 'Payment amount is too large' });
    }

    // Get order and user (user details used only for logging, not returned to client)
    const orderRes = await db.query(
      `SELECT o.id, o.user_id, u.name FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [orderId]
    );

    if (!orderRes.rows[0]) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orderRes.rows[0];
    const userId = order.user_id;

    // Extract M-Pesa code from message (try strict Mpesa-like prefix first, then fallback)
    const strictMatch = trimmedMessage.match(/^([A-Z0-9]{8,12})\s/i);
    const fallbackMatch = strictMatch || trimmedMessage.match(/([A-Z]+\d+)/);
    const mpesaCode = fallbackMatch ? fallbackMatch[1].toUpperCase() : 'UNKNOWN';

    // Check for duplicate transactions with same M-Pesa code in last 24 hours
    const dupRes = await db.query(
      `SELECT id FROM transactions
       WHERE payment_reference = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
      [mpesaCode]
    );

    if (dupRes.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'This M-Pesa payment has already been submitted' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Insert transaction record with status 'pending'
      const transactionId = uuidv4();
      await client.query(
        `INSERT INTO transactions (id, user_id, type, amount, currency, payment_method, payment_reference, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [transactionId, userId, 'deposit', numericAmount, 'KES', 'mpesa', mpesaCode, 'pending']
      );

      const submittedAt = new Date().toISOString();

      // Store the full Mpesa message in admin_logs so admins can view it from the dashboard.
      // Use the same key (mpesa_message) as the wallet-based flow so /api/admin/transactions/:id/proof works.
      await client.query(
        `INSERT INTO admin_logs (id, admin_id, action, details)
         VALUES ($1, $2, $3, $4)`,
        [
          uuidv4(),
          null,
          'mpesa_payment_submitted',
          JSON.stringify({
            order_id: orderId,
            user_id: userId,
            user_name: order.name,
            payer_name: payer_name || null,
            payer_phone: payer_phone || null,
            amount: numericAmount,
            mpesa_code: mpesaCode,
            mpesa_message: trimmedMessage,
            transaction_id: transactionId,
            submitted_at: submittedAt,
          }),
        ]
      );

      await client.query('COMMIT');

      // Notify all admins via in-app notifications (best effort; failures should not break the flow)
      try {
        const adminsRes = await db.query("SELECT id FROM users WHERE role = 'admin' AND is_active = true");
        for (const admin of adminsRes.rows) {
          try {
            await db.query(
              `INSERT INTO notifications (id, user_id, type, message) VALUES ($1, $2, 'in_app', $3)`,
              [
                uuidv4(),
                admin.id,
                `New M-Pesa payment submitted for order ${orderId}. Reference: ${mpesaCode}. Amount: KES ${numericAmount}. Awaiting verification.`,
              ]
            );
          } catch (notifErr) {
            console.warn('Failed to create Mpesa notification for admin', admin.id, notifErr.message || notifErr);
          }
        }
      } catch (adminFetchErr) {
        console.warn('Failed to fetch admins for Mpesa notification:', adminFetchErr.message || adminFetchErr);
      }

      res.json({
        success: true,
        message: 'Payment submitted successfully. Awaiting admin approval.',
        transaction_id: transactionId,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Confirm payment error:', error);
    logRouteError(req, res, error, 'Confirm payment error');
    res.status(500).json({ success: false, message: 'Failed to process payment' });
  }
});

export default router;
