-- 0020_wa_staff_alert_rescue.sql
--
-- Deploy order: apply before or with the code — utils/waStaffAlert.js
-- writes batch_id on every page and utils/waSweeper.js reads both
-- columns to find pages that reached nobody. Both writes are wrapped in
-- try/catch, so an out-of-order deploy loses the rescue, not the page.
--
-- 0019 made a failed page visible. It did not make one reach anybody.
--
-- Between 5 and 6 September 2026 seven pages failed delivery and the
-- entire response was one console line and one error_logs row each:
--
--   * 5 Sep 17:58–21:02 — five consecutive pages to +447424531483 failed,
--     among them the "Product link received — quote needed" for
--     +254790325255's SHEIN cart at 21:02. Nobody learned that a customer
--     was waiting. The quote went out at 15:22 the next day, 18 hours
--     later, after she wrote "No you're not getting my question, I'm
--     still waiting on the quote so that I pay".
--   * 6 Sep 15:30 and 21:59 — both pages to +447346813917 failed. That
--     number was added to staff_alert_numbers at 15:26 that afternoon and
--     has never once received a page. The boot check would have said so;
--     it runs at boot, and the last deploy was the day before.
--
-- Two columns, two questions the alerting channel could not answer about
-- itself:
--
--   batch_id   — one id per notifyStaff() call, so "did this page reach
--                ANY of the configured numbers?" is a query. Per-phone
--                rows alone cannot answer it, and that is the only
--                question that decides whether a page is lost.
--   rescued_at — the durable claim for the fallback, written BEFORE the
--                fallback is sent, so a crash rescues zero times rather
--                than emailing the same page twice. Same discipline as
--                payments.review_alerted_at and the wa_order_events
--                notes: claim, then page.

ALTER TABLE wa_staff_alerts ADD COLUMN IF NOT EXISTS batch_id text;
ALTER TABLE wa_staff_alerts ADD COLUMN IF NOT EXISTS rescued_at timestamptz;

-- "Did any row of this page land?" — the sweeper asks it per batch.
CREATE INDEX IF NOT EXISTS wa_staff_alerts_batch_idx
  ON wa_staff_alerts (batch_id);

-- "Which pages are lost and not yet rescued?" — a partial index, because
-- the sweep only ever looks at failures.
CREATE INDEX IF NOT EXISTS wa_staff_alerts_unrescued_idx
  ON wa_staff_alerts (created_at DESC)
  WHERE status = 'failed' AND rescued_at IS NULL;
