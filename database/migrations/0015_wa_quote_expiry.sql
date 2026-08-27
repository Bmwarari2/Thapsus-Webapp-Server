-- 0015_wa_quote_expiry.sql — quotes get a real expiry.
--
-- ⚠ DEPLOY ORDER: purely additive — migrate → deploy.
--
-- The approved payment-prompt template has always promised "The quote
-- expires {{4}}, after which the price may change" — but nothing stored
-- an expiry, nothing supplied the variable (customers read "expires
-- soon"), and a month-old quote was payable at a month-old FX rate.
-- Quoting now stamps quote_expires_at (wa_settings.quote_validity_days,
-- default 7); the confirm branch declines to auto-confirm an expired
-- quote, and the sweeper flags expired quotes to staff.
ALTER TABLE public.wa_orders
    ADD COLUMN IF NOT EXISTS quote_expires_at timestamp with time zone;

INSERT INTO public.wa_settings (key, value) VALUES ('quote_validity_days', '7')
ON CONFLICT (key) DO NOTHING;
