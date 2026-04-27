import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  // Fail fast if the JWT secret is not configured. This mirrors the stricter
  // checks in the auth routes and avoids accidentally using a weak default.
  throw new Error('FATAL: JWT_SECRET env var is not set');
}

export function authMiddleware(req, res, next) {
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

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
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

export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}
