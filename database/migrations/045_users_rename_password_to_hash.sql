-- ============================================================
-- Migration 045 — rename users.password → users.password_hash.
--
-- The column has stored bcrypt hashes since day one (routes/auth.js:
-- bcrypt.hash(plaintext, …) → INSERT INTO users (… password …)),
-- but the name implied plaintext. This is hygiene, not a leak —
-- the data was always hashed — but the misleading name was a real
-- code-review trap.
--
-- Coordinates with code changes in the same PR:
--   routes/auth.js × 7 sites, routes/admin.js × 1, server.js × 1,
--   tests/db-test.js × 4. After this migration runs at boot, the
--   server starts serving with the new column name; no in-flight
--   request can land between the migration and the listen() call
--   because initializeDatabase() finishes before app.listen().
--
-- Pre-conditions:
--   - migration 044 has already dropped the unused `password_hash`
--     column. RENAME would otherwise collide with the existing
--     (empty) column. Live envs ran 044 already; fresh envs (after
--     0000_baseline_schema) never created password_hash, so the
--     rename succeeds either way.
-- ============================================================

ALTER TABLE public.users
  RENAME COLUMN password TO password_hash;
