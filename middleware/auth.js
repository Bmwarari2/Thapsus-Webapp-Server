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
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  // Reject tokens that have been explicitly logged out, even though their `exp`
  // hasn't elapsed. Fail closed if the DB query itself fails — better to bounce
  // the user than to silently honour a token we can't verify the revocation
  // status of. The revoked_tokens table is created by migration 004.
  try {
    const { rowCount } = await req.db.query(
      `SELECT 1 FROM revoked_tokens WHERE token_sha256 = $1 LIMIT 1`,
      [tokenSha256(token)]
    );
    if (rowCount > 0) {
      return res.status(401).json({ success: false, message: 'Token has been revoked' });
    }
  } catch (err) {
    // 42P01 = undefined_table — surfaces only on the boot window between code
    // landing and migration 004 running. Treat missing-table as "no revocations
    // configured yet" so we don't lock everyone out during deploy.
    if (err.code !== '42P01') {
      console.error('[auth] revocation check failed:', err.message);
      return res.status(503).json({ success: false, message: 'Auth check temporarily unavailable' });
    }
  }

  req.user = decoded;
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

export async function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  // Same revocation check as authMiddleware. optionalAuth callers expect
  // either a populated req.user or no auth at all — refuse the request if a
  // bearer token is present but revoked (rather than silently degrading to
  // anonymous access, which would surface stale data with no auth context).
  try {
    const { rowCount } = await req.db.query(
      `SELECT 1 FROM revoked_tokens WHERE token_sha256 = $1 LIMIT 1`,
      [tokenSha256(token)]
    );
    if (rowCount > 0) {
      return res.status(401).json({ success: false, message: 'Token has been revoked' });
    }
  } catch (err) {
    if (err.code !== '42P01') {
      console.error('[optionalAuth] revocation check failed:', err.message);
      return res.status(503).json({ success: false, message: 'Auth check temporarily unavailable' });
    }
  }

  req.user = decoded;
  req.authToken = token;
  next();
}
