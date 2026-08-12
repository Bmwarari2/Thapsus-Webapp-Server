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

/**
 * bcrypt cost factor used for every password hash. OWASP currently
 * recommends 10 minimum (2025 guidance); bumping this only affects
 * NEW hashes — existing hashes carry their own cost in the stored
 * string, so login compareSync still validates them correctly. If
 * we ever raise this above 10, schedule a background re-hash on
 * next-successful-login per user to migrate gradually.
 */
const BCRYPT_COST = 10;

/**
 * Pre-computed bcrypt hash of a random throwaway value. Used by the
 * login handler to spend a real bcrypt-compare cycle even when the
 * email lookup returns no rows — without this, the absence of an
 * account is observable as a ~80ms latency difference, which lets
 * an attacker enumerate registered emails. Generated once at module
 * load so we don't pay the cost on every request.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('login-timing-equalizer', BCRYPT_COST);

/**
 * Minimum length policy applied uniformly across register, change,
 * and reset. Was previously inconsistent (8 / 6 / 6) which let a user
 * register with 8 chars and then weaken to 6 via change-password.
 */
const PASSWORD_MIN_LENGTH = 8;

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
// Audit W6.1 — default token lifetime cut from 30d to 7d. The shorter
// window shrinks the blast radius of a stolen token; the silent-refresh
// flow on GET /auth/me (see below) preserves a sliding session for
// active users so they don't notice.
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

// If the JWT presented to /auth/me has an `iat` older than this many
// seconds, the response includes a freshly-signed `refreshed_token`
// alongside the user payload. Clients that recognise the field swap
// it into storage; clients that don't are unaffected (and will simply
// re-login when the original token expires).
const REFRESH_AFTER_SECONDS = Number.parseInt(
  process.env.JWT_REFRESH_AFTER_SECONDS || String(24 * 60 * 60),
  10
);

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

// Country-of-residence allowlist used by /register and /profile.
// Mirrors the iOS sign-in form's picker: KE/UG/TZ/RW for the East
// Africa hub, GB/US for the source corridors, OTHER for anything else.
const ALLOWED_COUNTRIES = new Set(['KE','UG','TZ','RW','GB','US','OTHER']);


// Customer self-registration is retired — customers onboard on WhatsApp
// (wa_contacts, Customer Codes) and never hold webapp accounts. Operator
// accounts are created by an admin via POST /api/admin/users.
router.post('/register', (_req, res) => res.status(410).json({
  success: false,
  message: 'Sign-up has moved to WhatsApp. Message our WhatsApp line to get started.',
}));

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
      `SELECT id,email,password_hash,name,role,warehouse_id,language_pref,referral_code,
              email_verified_at,can_manage_finances
       FROM users WHERE email=$1 AND is_active=true`,
      [email]
    );
    // Always run a bcrypt-compare regardless of whether the user
    // exists, so the response time doesn't betray account existence.
    // Without this, a "no such email" path returns in ~1ms while a
    // wrong-password path returns in ~80ms — a side channel for email
    // enumeration. The dummy hash is computed once at module load.
    const user = rows[0];
    const hashToCompare = user ? user.password_hash : DUMMY_PASSWORD_HASH;
    const passwordMatched = await bcrypt.compare(password, hashToCompare);
    if (!user || !passwordMatched) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Email verification gate (migration 004). Unverified accounts can't
    // sign in; the response carries `code: 'email_unverified'` so the
    // client can swap the generic error banner for a "resend verification
    // email" affordance. Pre-existing accounts were backfilled to verified
    // by the migration, so this branch only fires for post-launch sign-ups.
    if (user.email_verified_at === null) {
      return res.status(403).json({
        success: false,
        code: 'email_unverified',
        message: 'Please activate your account from the link we emailed you, then sign in again.'
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role, warehouse_id: user.warehouse_id, can_manage_finances: user.can_manage_finances === true },
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
      user: { id: user.id, email: user.email, name: user.name, role: user.role, warehouse_id: user.warehouse_id, referral_code: user.referral_code, language_pref: user.language_pref, can_manage_finances: user.can_manage_finances === true }
    });
  } catch (error) {
    console.error('Login error:', error);
    logRouteError(req, res, error, 'Login error');
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// GET /api/auth/me
//
// Audit W6.1 — silent refresh: if the bearer token's `iat` is older than
// REFRESH_AFTER_SECONDS, mint a fresh JWT with the same claims and a
// new iat, then return it as `refreshed_token` alongside the user.
// Clients that recognise the field swap it into local storage; clients
// that don't are unaffected. This gives active users a sliding 7-day
// session without keeping the token lifetime at 30d for everyone.
//
// The old token is NOT revoked — it stays valid until its natural
// `exp` so requests already in flight from a different tab don't 401.
// Standard sliding-session pattern.
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT id,email,name,phone,role,warehouse_id,language_pref,referral_code,
              delivery_address,country_of_residence,can_manage_finances,created_at,updated_at
         FROM users WHERE id=$1`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const user = rows[0];

    const nowSec = Math.floor(Date.now() / 1000);
    const iat    = req.user?.iat || 0;
    const aged   = iat > 0 && (nowSec - iat) >= REFRESH_AFTER_SECONDS;

    let refreshedToken = null;
    if (aged) {
      refreshedToken = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          warehouse_id: user.warehouse_id,
          can_manage_finances: user.can_manage_finances === true,
        },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: JWT_EXPIRY }
      );
    }

    res.json({
      success: true,
      user,
      ...(refreshedToken ? { refreshed_token: refreshedToken } : {}),
    });
  } catch (error) {
    console.error('Get profile error:', error);
    logRouteError(req, res, error, 'Get profile error');
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
});

// PUT /api/auth/profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, phone, language_pref, delivery_address, country_of_residence } = req.body;
    const userId = req.user.id;
    // Empty-string is a deliberate clear (e.g. user wants to wipe their
    // delivery address); only treat undefined as "field not supplied".
    const hasName            = typeof name !== 'undefined';
    const hasPhone           = typeof phone !== 'undefined';
    const hasLanguage        = typeof language_pref !== 'undefined';
    const hasDeliveryAddress = typeof delivery_address !== 'undefined';
    const hasCountry         = typeof country_of_residence !== 'undefined';
    if (!hasName && !hasPhone && !hasLanguage && !hasDeliveryAddress && !hasCountry) {
      return res.status(400).json({ success: false, message: 'Provide at least one field to update' });
    }

    let normalisedCountry = null;
    if (hasCountry) {
      // Allow explicit clear: empty string → NULL.  Otherwise gate against
      // the same allowlist /register uses so we never write an arbitrary
      // 100-char string to the column.
      if (country_of_residence === null || country_of_residence === '') {
        normalisedCountry = null;
      } else if (typeof country_of_residence === 'string') {
        normalisedCountry = country_of_residence.trim().toUpperCase();
        if (!ALLOWED_COUNTRIES.has(normalisedCountry)) {
          return res.status(400).json({ success: false, message: 'Invalid country_of_residence' });
        }
      } else {
        return res.status(400).json({ success: false, message: 'Invalid country_of_residence' });
      }
    }

    const setClauses = [];
    const params = [];
    let idx = 1;
    if (hasName)            { setClauses.push(`name=$${idx++}`);             params.push(name || null); }
    if (hasPhone)           { setClauses.push(`phone=$${idx++}`);            params.push(phone || null); }
    if (hasLanguage)        { setClauses.push(`language_pref=$${idx++}`);    params.push(language_pref); }
    if (hasDeliveryAddress) { setClauses.push(`delivery_address=$${idx++}`); params.push(delivery_address || null); }
    if (hasCountry)         { setClauses.push(`country_of_residence=$${idx++}`); params.push(normalisedCountry); }
    setClauses.push(`updated_at=NOW()`);
    params.push(userId);

    await req.db.query(`UPDATE users SET ${setClauses.join(',')} WHERE id=$${idx}`, params);

    const { rows } = await req.db.query(
      `SELECT id,email,name,phone,role,warehouse_id,language_pref,delivery_address,country_of_residence,can_manage_finances
         FROM users WHERE id=$1`, [userId]
    );
    const fresh = rows[0];

    // Re-mint the JWT so the `name` and `warehouse_id` claims (which several
    // routes read from req.user instead of hitting the DB) reflect the new
    // values immediately.  Audit T21 — without this the operator dispatch
    // header kept showing the old name until the user signed out and back in.
    const token = jwt.sign(
      {
        id: fresh.id,
        email: fresh.email,
        name: fresh.name,
        role: fresh.role,
        warehouse_id: fresh.warehouse_id,
        can_manage_finances: fresh.can_manage_finances === true,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.json({ success: true, message: 'Profile updated successfully', user: fresh, token });
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
    if (new_password.length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `New password must be at least ${PASSWORD_MIN_LENGTH} characters`
      });
    }

    const { rows } = await req.db.query('SELECT password_hash FROM users WHERE id=$1', [userId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    if (!(await bcrypt.compare(current_password, rows[0].password_hash))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    await req.db.query(
      'UPDATE users SET password_hash=$1, password_changed_at=NOW(), updated_at=NOW() WHERE id=$2',
      [await bcrypt.hash(new_password, BCRYPT_COST), userId]
    );

    // Bumping password_changed_at above already invalidates every
    // previously-issued JWT for this user (authMiddleware rejects any
    // JWT whose iat predates it). We still also revoke the CURRENT
    // bearer as a belt-and-braces measure: the iat-vs-password check
    // has a 5-second clock-skew grace, so without an explicit
    // revocation a token issued in the same second as the password
    // update could squeak through. The password update above is the
    // source of truth, so a failure here logs but doesn't roll back.
    if (req.authToken && req.user.exp) {
      try {
        await req.db.query(
          `INSERT INTO revoked_tokens (token_sha256, user_id, expires_at)
           VALUES ($1, $2, to_timestamp($3))
           ON CONFLICT (token_sha256) DO NOTHING`,
          [tokenSha256(req.authToken), userId, req.user.exp]
        );
      } catch (revokeErr) {
        console.error('[auth/password] revoke-on-change failed:', revokeErr.message);
      }
    }

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    logRouteError(req, res, error, 'Password change error');
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
});

// GET /api/auth/reset-context?token=…
//
// Returns the email tied to a valid, unused, unexpired password-set/reset
// token. The set-password form uses it to (a) show which account is being
// activated and (b) render a username field so password managers (Apple
// Passwords, 1Password, …) can associate + save the new credential. The token
// already grants full password control, so surfacing its email is not a new
// leak; an invalid/expired token simply returns email: null.
router.get('/reset-context', async (req, res) => {
  try {
    const token = req.query.token;
    if (!token || typeof token !== 'string') return res.json({ success: true, email: null });
    const tokenHash = resetTokenSha256(token);
    const { rows } = await req.db.query(
      `SELECT u.email
         FROM password_reset_tokens t
         JOIN users u ON u.id = t.user_id
        WHERE t.token_sha256 = $1 AND t.used = false AND t.expires_at > NOW()
        LIMIT 1`,
      [tokenHash]
    );
    return res.json({ success: true, email: rows[0]?.email || null });
  } catch (error) {
    console.error('Reset context error:', error?.message);
    return res.json({ success: true, email: null });
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
    if (new_password.length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
      });
    }

    // Find valid, unused token that hasn't expired. Lookup is by SHA-256
    // hash so a database dump never lets an attacker mint a password
    // change. The plaintext column (and its legacy OR-branch) was dropped
    // by migration 0001 after the grace period ended.
    const tokenHash = resetTokenSha256(token);
    const tokenRes = await db.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_sha256 = $1
         AND used = false
         AND expires_at > NOW()`,
      [tokenHash]
    );
    if (tokenRes.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset link. Please request a new one.' });
    }

    const { id: tokenId, user_id: userId } = tokenRes.rows[0];
    const passwordHash = await bcrypt.hash(new_password, BCRYPT_COST);

    await db.query('BEGIN');
    try {
      // Update user's password and bump password_changed_at so every
      // outstanding JWT for this user gets rejected by authMiddleware
      // on its next request — the typical reason for resetting a
      // password is suspected compromise, so the previously-issued
      // tokens MUST stop working.
      //
      // Also stamp email_verified_at if it was never set: this token
      // reached the user by email, so consuming it proves mailbox
      // control — the same trust basis as /verify-email. Without this,
      // admin-created accounts (POST /admin/users/create) complete
      // their emailed password-setup link and then hit the login 403
      // email_unverified wall with no verification email ever sent.
      await db.query(
        `UPDATE users
            SET password_hash = $1,
                password_changed_at = NOW(),
                email_verified_at = COALESCE(email_verified_at, NOW()),
                updated_at = NOW()
          WHERE id = $2`,
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
      'INSERT INTO password_reset_tokens (id, user_id, token_sha256, expires_at) VALUES ($1, $2, $3, $4)',
      [tokenId, user.id, tokenHash, expiresAt]
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

// Email verification is retired with customer self-registration (WhatsApp
// onboarding replaced it). 410 keeps stale clients out of a dead loop.
router.post('/verify-email', (_req, res) => res.status(410).json({
  success: false,
  message: 'Email verification is no longer used. Message our WhatsApp line to get started.',
}));
router.post('/resend-verification', (_req, res) => res.status(410).json({
  success: false,
  message: 'Email verification is no longer used. Message our WhatsApp line to get started.',
}));

/**
 * POST /api/auth/supabase-token
 * Exchanges a valid sc_token (Bearer) for a fresh Supabase JWT.
 * Called by mobile clients before the previous Supabase JWT expires.
 */
router.post('/supabase-token', authMiddleware, async (req, res) => {
  try {
    // Unconfigured is an environment state, not a server fault — return
    // 503 so clients can distinguish "realtime disabled here" from a bug.
    if (!process.env.SUPABASE_JWT_SECRET) {
      return res.status(503).json({ success: false, message: 'Supabase realtime tokens are not configured on this deployment' });
    }
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
