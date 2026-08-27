/**
 * Server-Sent Events (SSE) endpoint
 * GET /api/events  — authenticated, persistent connection
 *
 * The server pushes events whenever an order, ticket, notification,
 * credit balance, or admin stat changes.  Clients never need to reload.
 *
 * Event shape:
 *   { type: 'order_update' | 'ticket_update' | 'notification' | 'credit_update' | 'admin_stats', data: {} }
 *
 * Replay: every event carries an `id:` from a process-wide counter, and
 * the last few hundred are kept in a ring buffer. A client that
 * reconnects passes `?last_event_id=<n>` and receives everything it
 * missed (filtered to what it was allowed to see). Without this,
 * anything pushed during a reconnect gap — laptop sleep, a deploy, a
 * dropped connection — was gone permanently, and the boards went stale
 * with full confidence. When the gap is larger than the buffer (or the
 * server restarted, which resets the counter), a `replay_gap` event
 * tells the client to refetch instead.
 */
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// ── In-memory client registry ─────────────────────────────────────────────
// Map<userId, Set<res>>  — one user can have multiple open tabs
const clients = new Map();

// ── Replay ring buffer ────────────────────────────────────────────────────
// audience: 'all' | 'staff' | 'admins' | 'user:<id>'
const RING_MAX = 500;
let nextEventId = 1;
const ring = [];

function remember(type, data, audience) {
  const id = nextEventId++;
  ring.push({ id, type, data, audience });
  if (ring.length > RING_MAX) ring.shift();
  return id;
}

function audienceAllows(audience, res) {
  const role = res._swiftAdminRole;
  if (audience === 'all') return true;
  if (audience === 'staff') return role === 'admin' || role === 'operator';
  if (audience === 'admins') return role === 'admin';
  if (audience.startsWith('user:')) return audience === `user:${res._swiftUserId}`;
  return false;
}

function frame(id, type, data) {
  return `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

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
  const id = remember(type, data, `user:${userId}`);
  const set = clients.get(userId);
  if (!set || set.size === 0) return;
  const payload = frame(id, type, data);
  for (const res of set) {
    try { res.write(payload); } catch (_) { /* client already disconnected */ }
  }
}

/**
 * Push an event to ALL connected admins.
 */
export function pushToAdmins(type, data) {
  const payload = frame(remember(type, data, 'admins'), type, data);
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
 * Push an event to ALL connected staff (operators + admins). The WhatsApp
 * inbox / pipeline dashboards subscribe to these.
 */
export function pushToStaff(type, data) {
  const payload = frame(remember(type, data, 'staff'), type, data);
  for (const [, set] of clients) {
    for (const res of set) {
      if (res._swiftAdminRole === 'admin' || res._swiftAdminRole === 'operator') {
        try { res.write(payload); } catch (_) { /* ignore */ }
      }
    }
  }
}

/**
 * Push an event to EVERY connected client (e.g. global announcements).
 */
export function pushToAll(type, data) {
  const payload = frame(remember(type, data, 'all'), type, data);
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

  // Stamp identity so the push helpers and replay can filter
  res._swiftAdminRole = req.user.role;
  res._swiftUserId = req.user.id;

  // Log the connection so we can track client counts and spot leaks in prod.
  // Count all sockets for this user (including this new one) after registration.
  const userId   = req.user.id;
  const userRole = req.user.role;

  // Initial "connected" ping so client knows the stream is live
  res.write(`event: connected\ndata: ${JSON.stringify({ userId, ts: Date.now() })}\n\n`);

  // Replay what this client missed while it was away. The client sends
  // the last event id it processed; anything newer that it was allowed
  // to see is re-sent in order. A gap it can't be given (buffer rolled
  // over, or a restart reset the counter so its id is from a previous
  // life) gets `replay_gap` — the client refetches its data instead.
  const lastSeen = Number.parseInt(String(req.query.last_event_id ?? ''), 10);
  if (Number.isFinite(lastSeen) && lastSeen >= 0) {
    const oldestBuffered = ring.length > 0 ? ring[0].id : nextEventId;
    if (lastSeen >= nextEventId || (lastSeen > 0 && lastSeen < oldestBuffered - 1)) {
      res.write(`event: replay_gap\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    } else {
      for (const ev of ring) {
        if (ev.id > lastSeen && audienceAllows(ev.audience, res)) {
          try { res.write(frame(ev.id, ev.type, ev.data)); } catch (_) { break; }
        }
      }
    }
  }

  const unsubscribe = addClient(userId, res);

  const totalClients = [...clients.values()].reduce((sum, s) => sum + s.size, 0);
  console.info(`[SSE] connect   user=${userId} role=${userRole} total_connections=${totalClients}`);

  // Heartbeat every 25 s to prevent proxy / load-balancer timeouts
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) { clearInterval(heartbeat); }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    const remaining = [...clients.values()].reduce((sum, s) => sum + s.size, 0);
    console.info(`[SSE] disconnect user=${userId} role=${userRole} total_connections=${remaining}`);
  });
});

export default router;
