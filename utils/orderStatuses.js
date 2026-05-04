// utils/orderStatuses.js
//
// Single source of truth for the `orders.status` and `packages.status`
// allowlists. Lives next to the live DB CHECK constraints:
//
//   • orders_status_check     — 8 values (text)
//   • packages_status_check   — 16 values (text, post migration 002)
//
// Three routes (orders.js, admin.js, tracking.js) used to inline the
// same arrays. P2.2 (rescreen enum drift) shipped a fix for one of
// them; this consolidation closes the door so a future enum change
// touches one file rather than four.
//
// IMPORTANT: keep these in lock-step with the live CHECKs. Querying
// pg_constraint at boot would be the rigorous fix, but adds a startup
// dependency and a test-environment failure mode for not much gain
// over an explicit assertion at deploy time.

/**
 * `orders.status` allowlist — matches `orders_status_check` on live.
 *
 * `pending` is the entry state (post-checkout, before warehouse intake).
 * `cancelled` is admin-set; everything else flips through the lifecycle.
 *
 * @type {readonly string[]}
 */
export const ORDER_STATUSES = Object.freeze([
  'pending',
  'received_at_warehouse',
  'consolidating',
  'in_transit',
  'customs',
  'out_for_delivery',
  'delivered',
  'cancelled',
]);

/**
 * `packages.status` allowlist — matches `packages_status_check` on live
 * (rewritten by migration 002). `pre_registered` is the entry state
 * (no `pending` here — see audit P2.2 for the cascade that drove the
 * v2 enum migration).
 *
 * @type {readonly string[]}
 */
export const PACKAGE_STATUSES = Object.freeze([
  'pre_registered',
  'received_at_warehouse',
  'photographed',
  'weighed',
  'screened',
  'manifested',
  'in_transit',
  'jkia_arrived',
  'awaiting_duty_payment',
  'released',
  'out_for_delivery',
  'delivered',
  'held',
  'held_at_nairobi_hub',
  'abandoned',
  'lost',
]);

/** True iff `s` is a valid `orders.status`. Cheap O(n) on a frozen N=8 array. */
export function isValidOrderStatus(s) {
  return typeof s === 'string' && ORDER_STATUSES.includes(s);
}

/** True iff `s` is a valid `packages.status`. */
export function isValidPackageStatus(s) {
  return typeof s === 'string' && PACKAGE_STATUSES.includes(s);
}
