// idempotencyKey.js — mint a unique key for a write that might be replayed.
//
// The axios client tags every replayable write (client/src/api/client.js) with
// an Idempotency-Key so the server can coalesce a retry — whether it comes from
// the offline outbox replaying a lost-response write, or a user double-submit.
//
// Prefers crypto.randomUUID; falls back for older / sandboxed environments
// (some in-app webviews, private windows) where it may be unavailable.
export function newIdempotencyKey() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch (_) { /* fall through */ }
  return `idk_${Date.now()}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

export default newIdempotencyKey
