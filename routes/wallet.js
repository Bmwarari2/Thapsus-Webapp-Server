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

/** POST /api/wallet/deposit */
router.post('/deposit', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const { amount, payment_method, payment_details } = req.body;

    if (!amount || amount <= 0)
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    if (!payment_method)
      return res.status(400).json({ success: false, message: 'Payment method is required' });
    if (!['mpesa', 'stripe', 'paypal'].includes(payment_method))
      return res.status(400).json({ success: false, message: 'Invalid payment method. Must be mpesa, stripe, or paypal' });

    const transactionId = uuidv4();
    const paymentReference = `${payment_method.toUpperCase()}-${transactionId.slice(0, 8)}`;

    await db.query(
      `INSERT INTO transactions (id, user_id, type, amount, currency, payment_method, payment_reference, status)
       VALUES ($1,$2,'deposit',$3,'KES',$4,$5,'pending')`,
      [transactionId, userId, amount, payment_method, paymentReference]
    );

    let processingResult = { success: false, message: 'Payment processing placeholder', requiresAction: false };
    if (payment_method === 'mpesa') {
      processingResult = { success: true, message: 'M-Pesa STK push initiated', requiresAction: true,
        details: { method: 'MPESA_STK_PUSH', phone: payment_details?.phone || '', amount, instruction: 'Check your phone for M-Pesa prompt' } };
    } else if (payment_method === 'stripe') {
      processingResult = { success: true, message: 'Stripe payment processing', requiresAction: true,
        details: { method: 'STRIPE_CHECKOUT', sessionId: `cs_test_${transactionId.slice(0, 12)}`, redirectUrl: '/stripe-checkout', instruction: 'You will be redirected to Stripe checkout' } };
    } else if (payment_method === 'paypal') {
      processingResult = { success: true, message: 'PayPal payment processing', requiresAction: true,
        details: { method: 'PAYPAL_REDIRECT', redirectUrl: '/paypal-checkout', instruction: 'You will be redirected to PayPal' } };
    }

    res.status(202).json({ success: true, message: 'Deposit initiated', transaction_id: transactionId, processing: processingResult });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ success: false, message: 'Deposit failed' });
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
