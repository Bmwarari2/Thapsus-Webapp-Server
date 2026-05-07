// utils/cache.js
//
// In-process TTL cache for shared, slowly-changing lookup data.
// Targets are things that every user-facing page touches but that
// rarely change — retailer catalog, shipping rates, exchange rates.
// User-specific data (orders, packages, notifications, payments)
// must NOT be cached here; those need to stay realtime.
//
// Single-process. If we ever scale Express horizontally each worker
// gets its own copy of the cache, which means up to `ttlMs` of
// cross-worker drift on shared data — fine for slowly-changing
// catalogue/rates, NOT fine for anything user-facing. The API surface
// is intentionally minimal so the swap to Redis (when we need it) is
// one file.
//
// No max-entries bound: callers are expected to use a small fixed
// set of keys (we cache 3 things today). If that ever grows, add an
// LRU bound here before we have to debug a memory leak in prod.

const store = new Map();

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cacheSet(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Drop a single key, all keys with a given prefix, or the whole
 * cache. Called from admin write paths when the underlying source-
 * of-truth changes (e.g. PUT /api/admin/exchange-rates invalidates
 * the `exchange:` prefix).
 */
export function cacheInvalidate(prefix) {
  if (prefix === undefined || prefix === null) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key === prefix || key.startsWith(prefix)) store.delete(key);
  }
}

/**
 * `getOrCompute(key, ttlMs, async () => …)` — cache-or-fetch helper.
 * The compute function is called at most once per `ttlMs` window; if
 * it throws, the error propagates and nothing is cached (next caller
 * retries). Race-condition note: under concurrent cache-misses two
 * compute() calls may happen — we deliberately don't dedupe in-flight
 * requests. The cost of the extra DB query is far smaller than the
 * complexity of an in-flight registry, and the cache is read-mostly
 * so misses are rare in steady state.
 */
export async function getOrCompute(key, ttlMs, compute) {
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;
  const value = await compute();
  cacheSet(key, value, ttlMs);
  return value;
}
