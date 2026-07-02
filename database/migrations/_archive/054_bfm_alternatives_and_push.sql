-- 054_bfm_alternatives_and_push.sql
-- Two additions, both additive + idempotent:
--   1. Buy-for-me "alternative product" negotiation: when an item is
--      unavailable an operator can offer an alternative the customer can
--      accept / decline / counter. Needs two columns + a new status value.
--   2. Web Push subscriptions table for PWA notifications (VAPID).

-- ── 1. Buy-for-me alternative offer ─────────────────────────────────────────
ALTER TABLE public.buy_for_me_orders
  ADD COLUMN IF NOT EXISTS alternative_url  TEXT,
  ADD COLUMN IF NOT EXISTS alternative_note TEXT;

-- Extend the status CHECK to allow 'alternative_offered'. Drop whatever the
-- existing status constraint is named, then recreate the full set.
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'public.buy_for_me_orders'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.buy_for_me_orders DROP CONSTRAINT %I', cname);
  END IF;
END$$;

ALTER TABLE public.buy_for_me_orders
  ADD CONSTRAINT buy_for_me_orders_status_check
  CHECK (status IN (
    'pending_quote','quoted','paid','purchased','received',
    'shipped','cancelled','rejected','alternative_offered'
  ));

-- ── 2. Web Push subscriptions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);
