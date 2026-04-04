import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/** GET /api/wallet */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;

    const walletResult = await db.query(
      'SELECT id, user_id, balance, currency, last_updated FROM wallet WHERE user_id = $1',
      [userId]
    );
    if (!walletResult.rows[0])
      return res.status(404).json({ success: false, message: 'Wallet not found' });

    const txResult = await db.query(
      `SELECT id, type, amount, currency, payment_method, status, created_at
       FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [userId]
    );

    res.json({ success: true, wallet: walletResult.rows[0], recent_transactions: txResult.rows });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch wallet' });
  }
});

/** GET /api/wallet/mpesa-info – Get Mpesa paybill details for payment */
router.get('/mpesa-info', authMiddleware, async (req, res) => {
  try {
    // Mpesa paybill details — update these placeholders with your real values
    res.json({
      success: true,
      mpesa: {
        paybill_number: 'XXXXXX',         // TODO: Replace with actual paybill number
        account_number: 'XXXXXX',          // TODO: Replace with actual account number
        business_name: 'Thapsus Cargo Ltd',
        instructions: [
          'Go to M-Pesa on your phone',
          'Select "Lipa na M-Pesa"',
          'Select "Pay Bill"',
          'Enter Business Number: XXXXXX',
          'Enter Account Number: XXXXXX',
          'Enter the amount',
          'Enter your M-Pesa PIN and confirm',
          'Copy the confirmation message and paste it below'
        ]
      }
    });
  } catch (error) {
    console.error('Mpesa info error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch Mpesa info' });
  }
});

/** POST /api/wallet/mpesa-confirm – Submit Mpesa confirmation message */
router.post('/mpesa-confirm', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const { mpesa_message, order_id, amount } = req.body;

    if (!mpesa_message || !mpesa_message.trim()) {
      return res.status(400).json({ success: false, message: 'Mpesa confirmation message is required' });
    }

    // Extract transaction code from Mpesa message (format: e.g. "ABC123XYZ Confirmed...")
    const codeMatch = mpesa_message.trim().match(/^([A-Z0-9]{8,12})\s/i);
    const mpesaCode = codeMatch ? codeMatch[1].toUpperCase() : null;

    // Check for duplicate submission
    if (mpesaCode) {
      const existing = await db.query(
        'SELECT id FROM transactions WHERE payment_reference = $1',
        [mpesaCode]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'This Mpesa transaction has already been submitted' });
      }
    }

    const transactionId = uuidv4();
    const paymentReference = mpesaCode || `MPESA-${transactionId.slice(0, 8)}`;

    await db.query(
      `INSERT INTO transactions (id, user_id, type, amount, currency, payment_method, payment_reference, status)
       VALUES ($1, $2, 'deposit', $3, 'KES', 'mpesa', $4, 'pending')`,
      [transactionId, userId, amount || 0, paymentReference]
    );

    // Store the full Mpesa message in admin_logs for admin verification
    await db.query(
      `INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1, NULL, $2, $3)`,
      [uuidv4(), 'mpesa_payment_submitted', JSON.stringify({
        user_id: userId,
        transaction_id: transactionId,
        mpesa_code: mpesaCode,
        mpesa_message: mpesa_message.trim(),
        order_id: order_id || null,
        amount: amount || 0,
        submitted_at: new Date().toISOString()
      })]
    );

    // Create in-app notification for admins
    const admins = await db.query("SELECT id FROM users WHERE role = 'admin' AND is_active = true");
    for (const admin of admins.rows) {
      await db.query(
        `INSERT INTO notifications (id, user_id, type, message) VALUES ($1, $2, 'in_app', $3)`,
        [uuidv4(), admin.id, `New Mpesa payment submitted by user. Reference: ${paymentReference}. Amount: KES ${amount || 'unspecified'}. Awaiting verification.`]
      );
    }

    res.status(201).json({
      success: true,
      message: 'Mpesa payment confirmation submitted. Our team will verify and credit your account.',
      transaction_id: transactionId,
      payment_reference: paymentReference
    });
  } catch (error) {
    console.error('Mpesa confirm error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit Mpesa confirmation' });
  }
});

/** POST /api/wallet/pay */
router.post('/pay', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const { order_id, amount } = req.body;

    if (!order_id || !amount || amount <= 0)
      return res.status(400).json({ success: false, message: 'order_id and amount are required' });

    const orderRes = await db.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [order_id, userId]);
    if (!orderRes.rows[0]) return res.status(404).json({ success: false, message: 'Order not found' });

    const walletRes = await db.query('SELECT balance FROM wallet WHERE user_id = $1', [userId]);
    if (!walletRes.rows[0]) return res.status(404).json({ success: false, message: 'Wallet not found' });

    if (parseFloat(walletRes.rows[0].balance) < amount)
      return res.status(400).json({
        success: false, message: 'Insufficient wallet balance',
        current_balance: walletRes.rows[0].balance, required_amount: amount,
        shortfall: amount - walletRes.rows[0].balance
      });

    const transactionId = uuidv4();
    await db.query('UPDATE wallet SET balance = balance - $1, last_updated = NOW() WHERE user_id = $2', [amount, userId]);
    await db.query(
      `INSERT INTO transactions (id, user_id, type, amount, currency, payment_method, status)
       VALUES ($1,$2,'payment',$3,'KES','wallet','completed')`,
      [transactionId, userId, amount]
    );

    const updatedWallet = await db.query('SELECT balance FROM wallet WHERE user_id = $1', [userId]);
    res.json({ success: true, message: 'Payment completed from wallet', transaction_id: transactionId, amount_paid: amount, order_id, new_balance: updatedWallet.rows[0].balance });
  } catch (error) {
    console.error('Pay from wallet error:', error);
    res.status(500).json({ success: false, message: 'Payment failed' });
  }
});

/** GET /api/wallet/transactions */
router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const type = req.query.type;
    const status = req.query.status;

    const params = [userId];
    let conditions = 'WHERE user_id = $1';
    if (type) { params.push(type); conditions += ` AND type = $${params.length}`; }
    if (status) { params.push(status); conditions += ` AND status = $${params.length}`; }

    const countRes = await db.query(`SELECT COUNT(*) AS count FROM transactions ${conditions}`, params);
    const total = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const txResult = await db.query(
      `SELECT * FROM transactions ${conditions} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ success: true, transactions: txResult.rows, pagination: { page, limit, total, totalPages } });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
});

export default router;
