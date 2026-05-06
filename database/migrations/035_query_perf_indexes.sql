-- 035_query_perf_indexes.sql
--
-- Audit P5 (DB query scalability): customer-dashboard and operator
-- listings were doing index-scan-then-in-memory-sort, plus the
-- consolidation roster and support-ticket thread queries had no
-- supporting index at all. Adds composite + partial indexes to
-- match the actual WHERE/ORDER BY patterns the routes use.
--
-- All indexes are additive and use IF NOT EXISTS so re-runs are
-- no-ops. None of the existing single-column indexes are dropped
-- — composites have a leading-column subset match, so PG can still
-- pick whichever plan is cheaper per query. Cleaning up redundant
-- single-column indexes can be a follow-up once we've measured.
--
-- Why no CONCURRENTLY: the migration runner wraps each file in an
-- implicit transaction via pool.query(), and CONCURRENTLY can't run
-- inside a transaction. Live tables here are small enough (~3k orders,
-- ~10k packages, ~tens of k notifications) that the AccessExclusive
-- lock during a regular CREATE INDEX is sub-second on Railway. The
-- existing convention across the 60+ indexes in this codebase is
-- plain CREATE INDEX IF NOT EXISTS — keeping it consistent.

BEGIN;

-- ── Customer dashboard listings ─────────────────────────────────────
-- Pattern: SELECT … FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT N
-- Without the composite, PG runs idx_orders_user_id then sorts in
-- memory. With it, the scan emits rows already in created_at-desc
-- order — sort is skipped and LIMIT short-circuits.
CREATE INDEX IF NOT EXISTS idx_orders_user_created
    ON orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_packages_user_created
    ON packages (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON notifications (user_id, created_at DESC);

-- ── Consolidation rosters ───────────────────────────────────────────
-- Pattern: SELECT … FROM orders/packages WHERE consolidation_id = $1
-- Most rows have NULL consolidation_id (not yet on a manifest), so
-- a partial index is a meaningful size win — only consolidated rows
-- live in this index.
CREATE INDEX IF NOT EXISTS idx_orders_consolidation
    ON orders (consolidation_id)
    WHERE consolidation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_packages_consolidation
    ON packages (consolidation_id)
    WHERE consolidation_id IS NOT NULL;

-- ── Support ticket thread view ──────────────────────────────────────
-- Pattern: SELECT … FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC
-- Composite covers both the filter and the sort, same shape as the
-- customer-dashboard composites above.
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created
    ON ticket_messages (ticket_id, created_at);

COMMIT;
