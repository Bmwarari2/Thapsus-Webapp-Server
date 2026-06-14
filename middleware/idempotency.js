// middleware/idempotency.js
//
// Generic request-idempotency guard for non-idempotent write endpoints.
//
// The web client (client/src/api/client.js) tags every replayable write with
// an `Idempotency-Key` header, and its offline outbox replays writes whose
// response was lost to a timeout/dropped socket. Without a guard, a replay
// re-runs the handler and duplicates its side effects: a second order/ticket
// row, a duplicate email, or — worst — a second `completed_stops + N` bump on
// a rider run. This middleware coalesces those replays.
//
// Flow (backed by the request_idempotency table, migration 056):
//   1. No key on the request  → pass through unchanged (opt-in by header).
//   2. First time for a key    → reserve a row, capture the JSON response, and
//                                persist {status, body} once the handler ends.
//   3. Replay of a completed   → return the cached status + body verbatim;
//      key                       the handler never runs, so no duplicate work.
//   4. Replay while the original is still in flight → 409 (the outbox retries
//      later, by which point it is cached). A reservation older than the stale
//      window is taken over, so a crash mid-request can't wedge a key forever.
//
// Fails OPEN: any error talking to the idempotency table lets the request
// proceed normally — we never block a write because the guard hiccuped.

const STALE_MS = 5 * 60 * 1000; // a reservation older than this is abandoned

function extractKey(req) {
  const raw = req.get('Idempotency-Key') || req.body?.idempotency_key || '';
  return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 200) : null;
}

/**
 * Wrap res.json so the first response for a key is cached. Successful
 * responses (status < 400) are stored for replay; error responses release the
 * reservation so a corrected retry can proceed.
 */
function captureAndProceed(req, res, next, db, key) {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const status = res.statusCode || 200;
    if (status < 400) {
      db.query(
        `UPDATE request_idempotency
            SET status_code = $2, response_body = $3::jsonb, completed_at = NOW()
          WHERE idempotency_key = $1`,
        [key, status, body == null ? null : JSON.stringify(body)]
      ).catch((e) => console.warn('[idempotency] persist failed:', e.message));
    } else {
      db.query(
        `DELETE FROM request_idempotency WHERE idempotency_key = $1 AND completed_at IS NULL`,
        [key]
      ).catch(() => {});
    }
    return originalJson(body);
  };
  next();
}

export function idempotency(req, res, next) {
  const key = extractKey(req);
  if (!key || !req.db) return next();

  const db = req.db;
  const method = req.method;
  const path = (req.originalUrl || req.url || '').split('?')[0];

  (async () => {
    let reserved;
    try {
      reserved = await db.query(
        `INSERT INTO request_idempotency (idempotency_key, user_id, method, path)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [key, req.user?.id || null, method, path]
      );
    } catch (e) {
      console.warn('[idempotency] reserve failed, proceeding:', e.message);
      return next();
    }

    if (reserved.rowCount === 1) {
      return captureAndProceed(req, res, next, db, key);
    }

    // Conflict → a replay (or a concurrent duplicate). Read the stored outcome.
    let row;
    try {
      const r = await db.query(
        `SELECT status_code, response_body, completed_at, created_at
           FROM request_idempotency WHERE idempotency_key = $1`,
        [key]
      );
      row = r.rows[0];
    } catch (e) {
      console.warn('[idempotency] lookup failed, proceeding:', e.message);
      return next();
    }

    if (row && row.completed_at) {
      // Replay the original response verbatim — handler does not run again.
      res.set('Idempotent-Replay', 'true');
      return res.status(row.status_code || 200).json(row.response_body);
    }

    // Original still in flight. If the reservation is stale (crash mid-request),
    // take it over and proceed; otherwise tell the caller to back off.
    const ageMs = row?.created_at ? Date.now() - new Date(row.created_at).getTime() : Infinity;
    if (ageMs > STALE_MS) {
      try {
        await db.query(
          `UPDATE request_idempotency
              SET created_at = NOW(), user_id = $2, method = $3, path = $4
            WHERE idempotency_key = $1 AND completed_at IS NULL`,
          [key, req.user?.id || null, method, path]
        );
      } catch (_) { /* best-effort takeover */ }
      return captureAndProceed(req, res, next, db, key);
    }

    return res.status(409).json({
      success: false,
      message: 'A matching request is still being processed. Please retry shortly.',
      code: 'idempotency_in_progress',
    });
  })();
}

export default idempotency;
