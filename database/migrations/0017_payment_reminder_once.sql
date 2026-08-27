-- 0017_payment_reminder_once.sql — the payment-review reminder follows
-- the same rule as the conversation reminder: one page, 15 minutes in,
-- silenceable.
--
-- ⚠ DEPLOY ORDER: purely additive — migrate → deploy.
--
-- "Payment still waiting for review" used to re-page every hour for as
-- long as a row sat in awaiting_review. It now fires ONCE, 15 minutes
-- after the payment opens. This stamp records that the page went out (or
-- was silenced from the payments queue's mute button); the sweep only
-- picks rows where it is NULL, and claims it before paging.
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS review_alerted_at timestamp with time zone;
