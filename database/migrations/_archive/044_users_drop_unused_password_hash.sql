-- ============================================================
-- Migration 044 — drop unused public.users.password_hash column
-- (audit F-3, corrected from initial audit memo).
--
-- The 2026-05-09 audit initially flagged `password` as legacy and
-- `password_hash` as canonical; live data showed the inverse:
--
--     SELECT count(password) AS legacy_password_set,
--            count(password_hash) AS password_hash_set
--     FROM users;
--     -- legacy_password_set: 8, password_hash_set: 0
--
-- The column literally named `password` stores bcrypt hashes
-- (routes/auth.js line 146 → 171: bcrypt.hash(password, …) then
-- INSERT INTO users (… password …) VALUES (… passwordHash …)).
-- `password_hash` was created at some point but never wired into
-- any route, migration, or utility. Zero rows have a value; zero
-- code references read or write it. Dropping is safe.
--
-- The remaining hygiene problem — column name `password` implies
-- plaintext but actually stores a bcrypt hash — is tracked as a
-- separate follow-up (rename `password` → `password_hash` in a
-- coordinated PR with routes/auth.js and routes/admin.js).
-- ============================================================

ALTER TABLE public.users
  DROP COLUMN IF EXISTS password_hash;
