import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, tokenSha256 } from '../middleware/auth.js';
import { logRouteError } from '../utils/errorLogger.js';
import { mintSupabaseToken } from '../utils/supabaseJwt.js';

function resetTokenSha256(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest();
}

function safeMintSupabaseToken(user, where) {
  try {
    return mintSupabaseToken(user);
  } catch (e) {
    console.error(`[${where}] supabase token mint failed:`, e.message);
    return null;
  }
}

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET env var is not set');
}
const JWT_EXPIRY = process.env.JWT_EXPIRY || '30d';

function generateWarehouseId() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let id = 'TC-';
  for (let i = 0; i < 4; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'TC';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, password, phone, referral_code } = req.body;
    const rawEmail = req.body.email;
    const db = req.db;

    if (!name || !rawEmail || !password || !phone) {
      return res.status(400).json({ success: false, message: 'Missing required fields: name, email, password, phone' });
    }

    // Normalise the email before any DB hit so User@x and user@x land in
    // the same row.  Audit T13 — email is the unique identity key, but
    // two prod accounts diverged because one signup typed the address
    // with a capital first letter.
    const email = String(rawEmail).trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return res.status(400).json({ success: false, message: 'Name must be between 2 and 100 characters' });
    }

    const phoneRegex = /^\+?[\d\s\-()]{7,20}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ success: false, message: 'Invalid phone number format' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
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
        // referral_code in the referrals table must be unique per row.
        // Multiple referees can use the same referrer code, so we append
        // the referee's ID suffix to keep each entry distinct.
        const referralEntryCode = `${referral_code.trim().toUpperCase()}-${userId.slice(0, 8).toUpperCase()}`;
        await client.query(
          `INSERT INTO referrals (id,referrer_id,referee_id,referral_code,status,reward_amount)
           VALUES ($1,$2,$3,$4,'pending',50)`,
          [uuidv4(), referredBy, userId, referralEntryCode]
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

    const supabase = safeMintSupabaseToken(
      { id: userId, email, role: 'customer' },
      'auth/register'
    );

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      supabase_token: supabase?.token || null,
      supabase_token_expires_at: supabase?.expiresAt || null,
      user: { id: userId, email, name, phone, warehouse_id: warehouseId, referral_code: newReferralCode, role: 'customer' }
    });
  } catch (error) {
    console.error('Registration error:', error);
    logRouteError(req, res, error, 'Registration error');
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    const rawEmail = req.body.email;
    const db = req.db;
    if (!rawEmail || !password) return res.status(400).json({ success: false, message: 'Email and password required' });

    // Same normalisation as /register so the lookup matches even when
    // the keyboard auto-capitalises the first letter (audit T13).
    const email = String(rawEmail).trim().toLowerCase();

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

    const supabase = safeMintSupabaseToken(
      { id: user.id, email: user.email, role: user.role },
      'auth/login'
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      supabase_token: supabase?.token || null,
      supabase_token_expires_at: supabase?.expiresAt || null,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, warehouse_id: user.warehouse_id, referral_code: user.referral_code, language_pref: user.language_pref, wallet_balance: user.wallet_balance }
    });
  } catch (error) {
    console.error('Login error:', error);
    logRouteError(req, res, error, 'Login error');
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT id,email,name,phone,role,warehouse_id,language_pref,referral_code,
              wallet_balance,delivery_address,country_of_residence,created_at,updated_at
         FROM users WHERE id=$1`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    logRouteError(req, res, error, 'Get profile error');
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
});

// PUT /api/auth/profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, phone, language_pref, delivery_address } = req.body;
    const userId = req.user.id;
    // Empty-string is a deliberate clear (e.g. user wants to wipe their
    // delivery address); only treat undefined as "field not supplied".
    const hasName            = typeof name !== 'undefined';
    const hasPhone           = typeof phone !== 'undefined';
    const hasLanguage        = typeof language_pref !== 'undefined';
    const hasDeliveryAddress = typeof delivery_address !== 'undefined';
    if (!hasName && !hasPhone && !hasLanguage && !hasDeliveryAddress) {
      return res.status(400).json({ success: false, message: 'Provide at least one field to update' });
    }

    const setClauses = [];
    const params = [];
    let idx = 1;
    if (hasName)            { setClauses.push(`name=$${idx++}`);             params.push(name || null); }
    if (hasPhone)           { setClauses.push(`phone=$${idx++}`);            params.push(phone || null); }
    if (hasLanguage)        { setClauses.push(`language_pref=$${idx++}`);    params.push(language_pref); }
    if (hasDeliveryAddress) { setClauses.push(`delivery_address=$${idx++}`); params.push(delivery_address || null); }
    setClauses.push(`updated_at=NOW()`);
    params.push(userId);

    await req.db.query(`UPDATE users SET ${setClauses.join(',')} WHERE id=$${idx}`, params);

    const { rows } = await req.db.query(
      `SELECT id,email,name,phone,role,warehouse_id,language_pref,wallet_balance,delivery_address
         FROM users WHERE id=$1`, [userId]
    );
    res.json({ success: true, message: 'Profile updated successfully', user: rows[0] });
  } catch (error) {
    console.error('Profile update error:', error);
    logRouteError(req, res, error, 'Profile update error');
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
    logRouteError(req, res, error, 'Password change error');
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

    // Find valid, unused token that hasn't expired.  Lookup is by
    // SHA-256 hash so a database dump never lets an attacker mint a
    // password change.  The legacy `token = $2` clause is kept during
    // the grace period so emails issued before migration 010 still
    // resolve; once the plaintext column is dropped the OR branch
    // can go too.
    const tokenHash = resetTokenSha256(token);
    const tokenRes = await db.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE (token_sha256 = $1 OR token = $2)
         AND used = false
         AND expires_at > NOW()`,
      [tokenHash, token]
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
    logRouteError(req, res, error, 'Reset password error');
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
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = resetTokenSha256(token);
    const tokenId = uuidv4();
    const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour

    // Invalidate any existing tokens
    await db.query('UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false', [user.id]);

    await db.query(
      'INSERT INTO password_reset_tokens (id, user_id, token, token_sha256, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [tokenId, user.id, token, tokenHash, expiresAt]
    );

    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.thapsus.uk';
    const { sendPasswordResetEmail } = await import('../utils/email.js');
    sendPasswordResetEmail(user.email, user.name, `${frontendUrl}/reset-password?token=${token}`).catch(console.error);

    res.json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    logRouteError(req, res, error, 'Forgot password error');
    res.status(500).json({ success: false, message: 'Failed to process request' });
  }
});

/**
 * POST /api/auth/supabase-token
 * Exchanges a valid sc_token (Bearer) for a fresh Supabase JWT.
 * Called by mobile clients before the previous Supabase JWT expires.
 */
router.post('/supabase-token', authMiddleware, async (req, res) => {
  try {
    const { id, email, role } = req.user;
    const supabase = mintSupabaseToken({ id, email, role });
    return res.json({
      success: true,
      supabase_token: supabase.token,
      supabase_token_expires_at: supabase.expiresAt
    });
  } catch (e) {
    console.error('[auth/supabase-token]', e);
    return res.status(500).json({ success: false, message: 'Could not mint supabase token' });
  }
});

/**
 * POST /api/auth/logout
 * Revokes the bearer token used to authenticate this request. Subsequent
 * requests using the same token return 401 even though the JWT's `exp`
 * claim has not elapsed. The token's SHA-256 hash is stored alongside the
 * decoded `exp` so a daily cleanup job can vacuum old entries:
 *
 *   DELETE FROM revoked_tokens WHERE expires_at < NOW();
 *
 * This is the iOS-side counterpart to AuthRepository.signOut, which was
 * previously local-only — clearing keychain values does not invalidate
 * tokens that were captured by an attacker before signOut. Per audit
 * §2.5 / S-3.
 */
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const { id, exp } = req.user;
    if (!req.authToken || !exp) {
      return res.status(400).json({ success: false, message: 'Token context missing' });
    }
    await req.db.query(
      `INSERT INTO revoked_tokens (token_sha256, user_id, expires_at)
       VALUES ($1, $2, to_timestamp($3))
       ON CONFLICT (token_sha256) DO NOTHING`,
      [tokenSha256(req.authToken), id, exp]
    );
    return res.json({ success: true });
  } catch (e) {
    console.error('[auth/logout]', e);
    logRouteError(req, res, e, 'Logout');
    return res.status(500).json({ success: false, message: 'Logout failed' });
  }
});

export default router;
