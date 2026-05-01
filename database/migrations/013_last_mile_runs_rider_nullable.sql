-- ============================================================
-- Migration 013 — last_mile_runs.rider_id nullable (D8)
--
-- Audit T7 says "planned-but-unassigned runs must not affect
-- customer-visible tracking" — but the production schema declared
-- rider_id NOT NULL, so an operator who wanted to plan a run before
-- a rider was on shift had nowhere to put the row. Every dispatch
-- creation effectively required a rider assignment up front,
-- contradicting the audit's own design.
--
-- This migration drops the NOT NULL so a run can sit in 'planned'
-- without a rider until PATCH /runs/:id assigns one. Idempotent.
-- ============================================================

BEGIN;

ALTER TABLE public.last_mile_runs
  ALTER COLUMN rider_id DROP NOT NULL;

COMMIT;
