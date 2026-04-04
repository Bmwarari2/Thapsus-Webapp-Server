/**
 * Server-Sent Events (SSE) endpoint
 * GET /api/events  — authenticated, persistent connection
 *
 * The server pushes events whenever an order, ticket, notification,
 * wallet balance, or admin stat changes.  Clients never need to reload.
 *
 * Event shape:
 *   { type: 'order_update' | 'ticket_update' | 'notification' | 'wallet_update' | 'admin_stats', data: {} }
 */
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// ── In-memory client registry ─────────────────────────────────────────────
// Map<userId, Set<res>>  — one user can have multiple open tabs
const clients = new Map();

/**
 * Register a response object for a user.
 * Returns an unsubscribe function.
 */
export function addClient(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
  return () => {
    const set = clients.get(userId);
    if (set) {
      set.delete(res);
      if (set.size === 0) clients.delete(userId);
    }
  };
}

/**
 * Push an event to a specific user (all their open tabs).
 *
 * @param {string} userId
 * @param {string} type   – event name the client listens for
 * @param {object} data   – JSON payload
 */
export function pushToUser(userId, type, data) {
  const set = clients.get(userId);
  if (!set || set.size === 0) return;
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch (_) { /* client already disconnected */ }
  }
}

/**
 * Push an event to ALL connected admins.
 */
export function pushToAdmins(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, set] of clients) {
    for (const res of set) {
      // res._swiftAdminRole is stamped in the SSE handler below
      if (res._swiftAdminRole === 'admin') {
        try { res.write(payload); } catch (_) { /* ignore */ }
      }
    }
  }
}

/**
 * Push an event to EVERY connected client (e.g. global announcements).
 */
export function pushToAll(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, set] of clients) {
    for (const res of set) {
      try { res.write(payload); } catch (_) { /* ignore */ }
    }
  }
}

// ── SSE route ─────────────────────────────────────────────────────────────
router.get('/', authMiddleware, (req, res) => {
  // SSE headers
  res.set({
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',   // disable Nginx buffering
  });
  res.flushHeaders();

  // Stamp admin role so pushToAdmins can filter
  res._swiftAdminRole = req.user.role;

  // Initial "connected" ping so client knows the stream is live
  res.write(`event: connected\ndata: ${JSON.stringify({ userId: req.user.id, ts: Date.now() })}\n\n`);

  const unsubscribe = addClient(req.user.id, res);

  // Heartbeat every 25 s to prevent proxy / load-balancer timeouts
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) { clearInterval(heartbeat); }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export default router;
