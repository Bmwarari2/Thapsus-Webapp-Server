import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

/**
 * GET /api/payment/:orderId
 * Public endpoint (no auth required). Returns order details for payment page.
 */
router.get('/:orderId', async (req, res) => {
  try {
    const db = req.db;
    const { orderId } = req.params;

    // Get order with user info
    const orderRes = await db.query(
      `SELECT o.id, o.tracking_number, o.actual_cost, o.estimated_cost, o.status,
              u.id as user_id, u.name, u.email
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [orderId]
    );

    if (!orderRes.rows[0]) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orderRes.rows[0];
    const amountDue = order.actual_cost || order.estimated_cost;

    res.json({
      success: true,
      order: {
        id: order.id,
        tracking_number: order.tracking_number,
        amount_due: amountDue,
        user_name: order.name,
        user_email: order.email,
        status: order.status,
      },
      mpesa_info: {
        paybill: 'XXXXXX', // Hardcoded for now
      },
    });
  } catch (error) {
    console.error('Get payment order error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch order details' });
  }
});

/**
 * POST /api/payment/:orderId/confirm
 * Public endpoint. Accepts M-Pesa payment confirmation from customer.
 * Validates, extracts code, inserts transaction (pending), logs admin action, notifies admins.
 */
router.post('/:orderId/confirm', async (req, res) => {
  try {
    const db = req.db;
    const { orderId } = req.params;
    const { mpesa_message, amount, payer_name, payer_phone } = req.body;

    if (!mpesa_message || !amount || !payer_name || !payer_phone) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Get order and user
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

    // Extract M-Pesa code from message (assumes format like "XXXX123456 Confirmed")
    const mpesaCodeMatch = mpesa_message.match(/([A-Z]+\d+)/);
    const mpesaCode = mpesaCodeMatch ? mpesaCodeMatch[1] : 'UNKNOWN';

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
        [transactionId, userId, 'deposit', amount, 'KES', 'mpesa', mpesaCode, 'pending']
      );

      // Insert admin log with order_id in details JSON
      const logId = uuidv4();
      await client.query(
        `INSERT INTO admin_logs (id, action, details)
         VALUES ($1, $2, $3)`,
        [logId, 'mpesa_payment_submitted', JSON.stringify({
          order_id: orderId,
          user_id: userId,
          user_name: order.name,
          payer_name,
          payer_phone,
          amount,
          mpesa_code: mpesaCode,
          full_message: mpesa_message,
          transaction_id: transactionId,
        })]
      );

      await client.query('COMMIT');

      // Notify all admins via in-app notifications
      const adminsRes = await db.query("SELECT id FROM users WHERE role = 'admin' AND is_active = true");
      for (const admin of adminsRes.rows) {
        await db.query(
          `INSERT INTO notifications (id, user_id, type, message) VALUES ($1, $2, 'in_app', $3)`,
          [uuidv4(), admin.id, `New M-Pesa payment submitted for order ${orderId} (KES ${amount}). Awaiting verification.`]
        );
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
    res.status(500).json({ success: false, message: 'Failed to process payment' });
  }
});

export default router;
