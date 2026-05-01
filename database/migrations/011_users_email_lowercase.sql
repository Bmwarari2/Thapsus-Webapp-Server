-- ============================================================
-- Migration 011 — lowercase existing user emails (T13)
--
-- routes/auth.js POST /register and POST /login now lowercase+trim
-- the submitted email before hitting the DB.  Existing rows that
-- were inserted before this change may carry mixed-case addresses,
-- which would prevent the new lookup from finding them.
--
-- This migration normalises every existing row.  Idempotent —
-- re-running is a no-op once all addresses are already lowercase.
--
-- Conflict handling: if two rows differ only by case (User@x vs
-- user@x) the lowercase write would violate the email UNIQUE
-- constraint.  In that situation we leave the row alone and emit
-- a NOTICE so an operator can merge the duplicates by hand —
-- silently dropping one would lose history.
-- ============================================================

BEGIN;

DO $$
DECLARE
  conflict_count int;
BEGIN
  SELECT COUNT(*)
    INTO conflict_count
    FROM (
      SELECT lower(email) AS lower_email
        FROM public.users
       GROUP BY 1
      HAVING COUNT(*) > 1
    ) dup;

  IF conflict_count > 0 THEN
    RAISE NOTICE 'Skipping % case-collision email row(s); merge by hand before re-running.', conflict_count;
  END IF;
END $$;

UPDATE public.users
   SET email = lower(email)
 WHERE email <> lower(email)
   AND NOT EXISTS (
     SELECT 1 FROM public.users u2
      WHERE u2.id <> public.users.id
        AND u2.email = lower(public.users.email)
   );

COMMIT;
