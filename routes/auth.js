import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this_in_production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

function generateWarehouseId() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let id = 'SC-';
  for (let i = 0; i < 4; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'SC';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, referral_code } = req.body;
    const db = req.db;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ success: false, message: 'Missing required fields: name, email, password, phone' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const userId = uuidv4();
    const warehouseId = generateWarehouseId();

    // Ensure unique referral code
    let newReferralCode = generateReferralCode();
    while ((await db.query('SELECT id FROM users WHERE referral_code = $1', [newReferralCode])).rows.length > 0) {
      newReferralCode = generateReferralCode();
    }

    let referredBy = null;
    if (referral_code) {
      const ref = await db.query('SELECT id FROM users WHERE referral_code = $1', [referral_code.trim().toUpperCase()]);
      if (ref.rows.length > 0 && ref.rows[0].id !== userId) referredBy = ref.rows[0].id;
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users (id,email,password,name,phone,role,warehouse_id,language_pref,referral_code,referred_by,wallet_balance,is_active)
         VALUES ($1,$2,$3,$4,$5,'customer',$6,'en',$7,$8,0,true)`,
        [userId, email, passwordHash, name, phone, warehouseId, newReferralCode, referredBy]
      );
      await client.query(
        `INSERT INTO wallet (id,user_id,balance,currency) VALUES ($1,$2,0,'KES')`,
        [uuidv4(), userId]
      );
      if (referredBy) {
        await client.query(
          `INSERT INTO referrals (id,referrer_id,referee_id,referral_code,status,reward_amount)
           VALUES ($1,$2,$3,$4,'pending',50)`,
          [uuidv4(), referredBy, userId, referral_code.trim().toUpperCase()]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const token = jwt.sign(
      { id: userId, email, name, role: 'customer', warehouse_id: warehouseId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: { id: userId, email, name, phone, warehouse_id: warehouseId, referral_code: newReferralCode, role: 'customer' }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = req.db;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });

    const { rows } = await db.query(
      `SELECT id,email,password,name,role,warehouse_id,language_pref,wallet_balance,referral_code
       FROM users WHERE email=$1 AND is_active=true`,
      [email]
    );
    if (rows.length === 0) return res.status(401).json({ success: false, message: 'Invalid email or password' });

    const user = rows[0];
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role, warehouse_id: user.warehouse_id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.json({
      success: true, message: 'Login successful', token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, warehouse_id: user.warehouse_id, referral_code: user.referral_code, language_pref: user.language_pref, wallet_balance: user.wallet_balance }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT id,email,name,phone,role,warehouse_id,language_pref,referral_code,wallet_balance,created_at,updated_at
       FROM users WHERE id=$1`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
});

// PUT /api/auth/profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, phone, language_pref } = req.body;
    const userId = req.user.id;
    if (!name && !phone && !language_pref) {
      return res.status(400).json({ success: false, message: 'Provide at least one field to update' });
    }

    const setClauses = [];
    const params = [];
    let idx = 1;
    if (name)          { setClauses.push(`name=$${idx++}`);          params.push(name); }
    if (phone)         { setClauses.push(`phone=$${idx++}`);         params.push(phone); }
    if (language_pref) { setClauses.push(`language_pref=$${idx++}`); params.push(language_pref); }
    setClauses.push(`updated_at=NOW()`);
    params.push(userId);

    await req.db.query(`UPDATE users SET ${setClauses.join(',')} WHERE id=$${idx}`, params);

    const { rows } = await req.db.query(
      `SELECT id,email,name,phone,role,warehouse_id,language_pref,wallet_balance FROM users WHERE id=$1`, [userId]
    );
    res.json({ success: true, message: 'Profile updated successfully', user: rows[0] });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// PUT /api/auth/password
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.user.id;
    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, message: 'Current and new password required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const { rows } = await req.db.query('SELECT password FROM users WHERE id=$1', [userId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    if (!bcrypt.compareSync(current_password, rows[0].password)) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    await req.db.query(
      'UPDATE users SET password=$1, updated_at=NOW() WHERE id=$2',
      [bcrypt.hashSync(new_password, 10), userId]
    );
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, new_password } = req.body;
    const db = req.db;

    if (!token || !new_password) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    // Find valid, unused token that hasn't expired
    const tokenRes = await db.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token = $1 AND used = false AND expires_at > NOW()`,
      [token]
    );
    if (tokenRes.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset link. Please request a new one.' });
    }

    const { id: tokenId, user_id: userId } = tokenRes.rows[0];
    const passwordHash = bcrypt.hashSync(new_password, 10);

    await db.query('BEGIN');
    try {
      // Update user's password
      await db.query(
        'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
        [passwordHash, userId]
      );
      // Mark token as used
      await db.query(
        'UPDATE password_reset_tokens SET used = true WHERE id = $1',
        [tokenId]
      );
      // Invalidate any other pending tokens for this user
      await db.query(
        'UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false',
        [userId]
      );
      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }

    res.json({ success: true, message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const db = req.db;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const userRes = await db.query('SELECT id, name, email FROM users WHERE email = $1 AND is_active = true', [email.toLowerCase().trim()]);

    // Always return success to prevent email enumeration
    if (userRes.rows.length === 0) {
      return res.json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
    }

    const user = userRes.rows[0];
    const { randomBytes } = await import('crypto');
    const token = randomBytes(32).toString('hex');
    const tokenId = uuidv4();
    const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour

    // Invalidate any existing tokens
    await db.query('UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false', [user.id]);

    await db.query(
      'INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)',
      [tokenId, user.id, token, expiresAt]
    );

    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://swiftcargo.up.railway.app';
    const { sendPasswordResetEmail } = await import('../utils/email.js');
    sendPasswordResetEmail(user.email, user.name, `${frontendUrl}/reset-password?token=${token}`).catch(console.error);

    res.json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Failed to process request' });
  }
});

export default router;
