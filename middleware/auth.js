import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  // Fail fast if the JWT secret is not configured. This mirrors the stricter
  // checks in the auth routes and avoids accidentally using a weak default.
  throw new Error('FATAL: JWT_SECRET env var is not set');
}

/**
 * SHA-256 the bearer token so the revocation list never stores the raw value.
 * Returns a Buffer (BYTEA-friendly) for direct comparison via pg's parameter
 * binding. Exported for the logout route which inserts the same hash.
 */
export function tokenSha256(token) {
  return crypto.createHash('sha256').update(token).digest();
}

/**
 * One round-trip for three checks (avoids two separate queries):
 *
 *   1. The bearer token has been explicitly revoked (logout, password
 *      change). The lookup is by SHA-256 of the raw token, so the
 *      revoked_tokens table never stores plaintext.
 *
 *   2. The JWT was issued before the user's last password change.
 *      This is what makes /reset-password actually invalidate every
 *      outstanding token for the affected user — the reset flow can't
 *      revoke directly because it isn't authenticated, but it bumps
 *      `users.password_changed_at` and we reject any JWT whose `iat`
 *      predates that timestamp.
 *
 *   3. The user has been deactivated by an admin (is_active = false).
 *      The JWT payload's role is fixed at sign-in, so we have to ask
 *      the DB. Without this an admin could "disable" a user but their
 *      sessions would keep working until the JWT exp.
 *
 * Returns one of:
 *   { ok: true }                                — caller should continue
 *   { ok: false, status, message }              — caller should res.status().json() and stop
 *
 * Fails closed: if the query itself errors (other than the boot-window
 * "table doesn't exist yet" case) we return a 503 rather than silently
 * letting the request through.
 *
 * 42P01 = undefined_table, 42703 = undefined_column — both surface
 * only on the boot window between code landing and migrations 004/037
 * running, so we treat them as "checks not configured yet".
 */
async function checkAuthStatus(db, token, decoded) {
  try {
    const { rows } = await db.query(
      `SELECT
         u.is_active,
         u.can_manage_finances,
         EXTRACT(EPOCH FROM u.password_changed_at)::int AS pwd_changed_epoch,
         EXISTS(SELECT 1 FROM revoked_tokens WHERE token_sha256 = $1) AS revoked
       FROM users u
       WHERE u.id = $2`,
      [tokenSha256(token), decoded.id]
    );
    if (rows.length === 0) {
      return { ok: false, status: 401, message: 'User no longer exists' };
    }
    const { is_active, can_manage_finances, pwd_changed_epoch, revoked } = rows[0];
    if (revoked) {
      return { ok: false, status: 401, message: 'Token has been revoked' };
    }
    if (!is_active) {
      return { ok: false, status: 401, message: 'Account is disabled' };
    }
    // 5-second grace for clock skew between JWT iat and the password
    // update's NOW() write to the DB.
    if (decoded.iat && pwd_changed_epoch && decoded.iat + 5 < pwd_changed_epoch) {
      return { ok: false, status: 401, message: 'Token has been revoked' };
    }
    // Surface the live finance flag so a grant/revoke takes effect on the next
    // request rather than at next login (the JWT copy is only a UI hint).
    return { ok: true, canManageFinances: can_manage_finances === true };
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') {
      // Boot-window race — migration not yet applied. Soft-fail to keep
      // the deploy moving; subsequent requests after migration completes
      // will get the full check.
      return { ok: true };
    }
    console.error('[auth] auth-status check failed:', err.message);
    return { ok: false, status: 503, message: 'Auth check temporarily unavailable' };
  }
}

export async function authMiddleware(req, res, next) {
  // Support token via Authorization header OR ?token= query param (for EventSource)
  let token = null;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  let decoded;
  try {
    // Pin the algorithm to HS256 (jsonwebtoken's default with a string
    // secret). Without an explicit allowlist, the verifier accepts any
    // algorithm the token's header specifies — including `none`, which
    // some older versions of `jsonwebtoken` could honour, and asymmetric
    // algorithms whose public keys could be passed as the symmetric
    // secret in algorithm-confusion attacks.
    decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  const status = await checkAuthStatus(req.db, token, decoded);
  if (!status.ok) {
    return res.status(status.status).json({ success: false, message: status.message });
  }

  req.user = decoded;
  // Prefer the live DB value; fall back to the JWT copy during the boot window
  // when checkAuthStatus soft-fails (column not yet migrated).
  req.user.can_manage_finances = status.canManageFinances !== undefined
    ? status.canManageFinances
    : decoded.can_manage_finances === true;
  req.authToken = token;
  next();
}

export function isAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
}

/**
 * requireRole(...roles) — gate a route to one or more roles.
 *
 * Usage:
 *   router.get('/x', authMiddleware, requireRole('operator','admin'), handler)
 *
 * Admins are granted access regardless of which role is requested, mirroring
 * the permission matrix in the Webapp Spec §2.
 */
export function requireRole(...allowed) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (role === 'admin' || allowed.includes(role)) return next();
    return res.status(403).json({
      success: false,
      message: `Access denied. Required role: ${allowed.join(' | ')}`,
    });
  };
}

export const isOperator = requireRole('operator');
export const isAgent    = requireRole('clearing_agent');
export const isRider    = requireRole('rider');

/**
 * requireFinanceAccess — gate the finance dashboard to a "selected admin".
 *
 * Unlike requireRole, role='admin' alone is NOT sufficient: access is granted
 * per-admin via users.can_manage_finances (set by a super-admin). authMiddleware
 * stamps the live flag onto req.user from the DB, so a revoke takes effect on
 * the next request. Must run after authMiddleware.
 */
export function requireFinanceAccess(req, res, next) {
  if (req.user?.can_manage_finances === true) return next();
  return res.status(403).json({
    success: false,
    message: 'Finance access required. Ask an administrator to enable finance management for your account.',
  });
}

export async function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  // optionalAuth callers expect either a populated req.user or no auth
  // at all — refuse the request if a bearer token is present but invalid
  // (revoked, predates a password change, or user disabled) rather than
  // silently degrading to anonymous access.
  const status = await checkAuthStatus(req.db, token, decoded);
  if (!status.ok) {
    return res.status(status.status).json({ success: false, message: status.message });
  }

  req.user = decoded;
  req.authToken = token;
  next();
}
