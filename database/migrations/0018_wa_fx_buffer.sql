-- 0018_wa_fx_buffer.sql — price quotes at a rate we can transact at.
--
-- ⚠ DEPLOY ORDER: purely additive — migrate → deploy.
--
-- exchange_rates.USD_KES is the frankfurter.dev MID-market rate, and
-- every quote was priced straight off it. The business banks in GBP in
-- the UK and pays suppliers from there, so each order is a real round
-- trip — KES in, GBP out — costing 3–4 KES on the USD/KES cross. All 18
-- quotes to date also ran at markup_pct = 0 (the SHEIN promotion and
-- the weight-priced UK/Dubai lanes), so nothing anywhere absorbed it.
--
-- wa_settings.fx_buffer_pct (default 2.5) now lifts the mid rate to the
-- rate a quote is actually priced at. It is deliberately NOT markup_pct:
-- the margin is promoted and waived, this is cost recovery.
--
-- fx_buffer_pct on the order is the audit snapshot — wa_orders.fx_rate
-- stores the BUFFERED rate (what the customer was quoted and what the
-- receipt prints), and this column says how much of it was cushion.
-- NULL means the order was quoted before the buffer existed.
ALTER TABLE public.wa_orders
    ADD COLUMN IF NOT EXISTS fx_buffer_pct numeric(6,3);

INSERT INTO public.wa_settings (key, value) VALUES ('fx_buffer_pct', '2.5')
ON CONFLICT (key) DO NOTHING;
