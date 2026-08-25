-- 0013_users_phone_optional.sql — a staff login does not need a phone.
--
-- ⚠ DEPLOY ORDER: apply BEFORE the code. The create-user endpoint stops
-- sending a phone, so the column must already accept NULL.
--
-- Adding an admin failed outright: the Team screen collects a name,
-- email, password and role, while the endpoint behind it required a
-- phone and ignored the password. Every attempt returned "Name, email,
-- and phone are required" for a field the form never had.
--
-- The column dates from a customer-only signup, where a phone was how a
-- parcel reached somebody. Staff sign in by email and are never
-- delivered to. Rather than write '' and have it read later as a real
-- number, the constraint goes.
--
-- Dropping NOT NULL permits more and forbids nothing: existing rows are
-- untouched, and every caller still supplying a phone is unaffected.

ALTER TABLE public.users ALTER COLUMN phone DROP NOT NULL;
