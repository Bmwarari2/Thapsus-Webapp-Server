import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/** GET /api/referral */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;

    const userRes = await db.query('SELECT referral_code, wallet_balance FROM users WHERE id = $1', [userId]);
    if (!userRes.rows[0]) return res.status(404).json({ success: false, message: 'User not found' });

    const stats = await db.query(
      `SELECT
        COUNT(*) AS total_referrals,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_referrals,
        SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END) AS pending_referrals,
        SUM(CASE WHEN status = 'completed' THEN reward_amount ELSE 0 END) AS total_earned
       FROM referrals WHERE referrer_id = $1`,
      [userId]
    );

    const referredUsers = await db.query(
      `SELECT r.id, r.referee_id, r.status, r.reward_amount,
              r.created_at AS referred_at, r.completed_at,
              u.name AS referee_name, u.email AS referee_email, u.created_at AS referee_joined_at,
              COUNT(o.id) AS orders_count
       FROM referrals r
       LEFT JOIN users  u ON r.referee_id = u.id
       LEFT JOIN orders o ON r.referee_id = o.user_id
       WHERE r.referrer_id = $1
       GROUP BY r.id, u.name, u.email, u.created_at
       ORDER BY r.created_at DESC`,
      [userId]
    );

    const s = stats.rows[0];
    res.json({
      success: true,
      referral: {
        referral_code: userRes.rows[0].referral_code,
        current_balance: userRes.rows[0].wallet_balance,
        statistics: {
          total_referrals:     parseInt(s.total_referrals) || 0,
          completed_referrals: parseInt(s.completed_referrals) || 0,
          pending_referrals:   parseInt(s.pending_referrals) || 0,
          total_earned:        parseFloat(s.total_earned) || 0
        }
      },
      referred_users: referredUsers.rows.map(ru => ({
        id: ru.id, referee_id: ru.referee_id,
        referee_name: ru.referee_name || 'Unknown', referee_email: ru.referee_email || '',
        referred_at: ru.referred_at, referee_joined_at: ru.referee_joined_at,
        signed_up: true, first_order_placed: parseInt(ru.orders_count) > 0,
        orders_count: parseInt(ru.orders_count) || 0,
        reward_status: ru.status, reward_amount: ru.reward_amount, completed_at: ru.completed_at || null
      }))
    });
  } catch (error) {
    console.error('Get referral error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch referral information' });
  }
});

/** GET /api/referral/history */
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 10;

    const countRes = await db.query('SELECT COUNT(*) AS count FROM referrals WHERE referrer_id = $1', [userId]);
    const total = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    const referrals = await db.query(
      `SELECT r.id, r.referee_id, r.status, r.reward_amount,
              r.created_at AS referred_at, r.completed_at,
              u.name AS referee_name, u.email AS referee_email, u.created_at AS referee_joined_at,
              COUNT(o.id) AS orders_count
       FROM referrals r
       LEFT JOIN users  u ON r.referee_id = u.id
       LEFT JOIN orders o ON r.referee_id = o.user_id
       WHERE r.referrer_id = $1
       GROUP BY r.id, u.name, u.email, u.created_at
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json({
      success: true,
      referrals: referrals.rows.map(r => ({
        id: r.id, referee_id: r.referee_id,
        referee_name: r.referee_name || 'Unknown', referee_email: r.referee_email || '',
        referred_at: r.referred_at, referee_joined_at: r.referee_joined_at,
        signed_up: true, first_order_placed: parseInt(r.orders_count) > 0,
        orders_count: parseInt(r.orders_count) || 0,
        reward_status: r.status, reward_amount: r.reward_amount, completed_at: r.completed_at || null
      })),
      pagination: { page, limit, total, totalPages }
    });
  } catch (error) {
    console.error('Get referral history error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch referral history' });
  }
});

/** POST /api/referral/validate */
router.post('/validate', async (req, res) => {
  try {
    const db = req.db;
    const { referral_code } = req.body;
    if (!referral_code) return res.status(400).json({ success: false, valid: false, message: 'Code required' });

    const result = await db.query(
      'SELECT id, name FROM users WHERE referral_code = $1',
      [referral_code.trim().toUpperCase()]
    );
    if (!result.rows[0]) return res.json({ success: true, valid: false, message: 'Referral code not found' });
    res.json({ success: true, valid: true, referrer_name: result.rows[0].name });
  } catch (error) {
    console.error('Validate referral error:', error);
    res.status(500).json({ success: false, valid: false, message: 'Validation failed' });
  }
});

export default router;
