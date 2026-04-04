import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../database/init.js';

/**
 * Log an error to the error_logs table.
 * Non-blocking — never throws, so it won't interrupt request handling.
 *
 * @param {object} opts
 * @param {string} opts.level        - 'error' | 'warn' | 'fatal'
 * @param {string} opts.source       - e.g. 'api', 'database', 'email', 'middleware', 'unhandled'
 * @param {string} opts.message      - short description of what happened
 * @param {string} [opts.stack]      - stack trace string
 * @param {string} [opts.method]     - HTTP method (GET, POST, etc.)
 * @param {string} [opts.path]       - request path (e.g. /api/admin/users)
 * @param {number} [opts.statusCode] - HTTP status code returned
 * @param {string} [opts.userId]     - user ID if authenticated
 * @param {object} [opts.meta]       - any extra context (stringified to JSON)
 */
export async function logError({
  level = 'error',
  source = 'api',
  message,
  stack = null,
  method = null,
  path = null,
  statusCode = null,
  userId = null,
  meta = null,
}) {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO error_logs (id, level, source, message, stack, method, path, status_code, user_id, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        uuidv4(),
        level,
        source,
        message?.substring(0, 2000) || 'Unknown error',
        stack?.substring(0, 5000) || null,
        method || null,
        path || null,
        statusCode || null,
        userId || null,
        meta ? JSON.stringify(meta) : null,
      ]
    );
  } catch (e) {
    // Fallback: if we can't even log to the DB, print to console
    console.error('[errorLogger] Failed to persist error log:', e.message);
  }
}

/**
 * Express middleware that captures errors from route handlers.
 * Place AFTER all routes but BEFORE the final 404 handler.
 */
export function errorLoggingMiddleware(err, req, res, next) {
  const statusCode = err.status || err.statusCode || 500;

  logError({
    level: statusCode >= 500 ? 'error' : 'warn',
    source: 'api',
    message: err.message || 'Internal server error',
    stack: err.stack,
    method: req.method,
    path: req.originalUrl || req.path,
    statusCode,
    userId: req.user?.id || null,
    meta: {
      body: req.body && Object.keys(req.body).length ? '[present]' : null,
      query: req.query && Object.keys(req.query).length ? req.query : null,
      ip: req.ip,
    },
  });

  // Don't swallow — pass to the next error handler
  next(err);
}

/**
 * Wrap a route's catch block to also log the error.
 * Usage:  catch (error) { logRouteError(req, res, error, 'Some context'); }
 */
export function logRouteError(req, res, error, context = '') {
  const msg = context ? `${context}: ${error.message}` : error.message;
  logError({
    level: 'error',
    source: 'api',
    message: msg,
    stack: error.stack,
    method: req.method,
    path: req.originalUrl || req.path,
    statusCode: 500,
    userId: req.user?.id || null,
  });
}
