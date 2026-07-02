-- 062_lastmile_id_defaults.sql
--
-- 2026-07 functionality audit: last_mile_runs.id and pod_events.id are TEXT,
-- NOT NULL, with NO default on the live database. The route code previously
-- relied on a gen_random_uuid() default that never existed, so run creation
-- and POD capture 500'd with not-null violations. The routes now mint the id
-- themselves (routes/lastMile.js); these defaults are belt-and-braces so any
-- other writer (SQL console fixes, future scripts, not-yet-redeployed app
-- instances) can insert without supplying an id.

ALTER TABLE public.last_mile_runs ALTER COLUMN id SET DEFAULT (gen_random_uuid())::text;
ALTER TABLE public.pod_events    ALTER COLUMN id SET DEFAULT (gen_random_uuid())::text;
