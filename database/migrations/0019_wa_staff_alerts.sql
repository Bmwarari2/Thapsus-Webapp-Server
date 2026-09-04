-- 0019_wa_staff_alerts.sql
--
-- Deploy order: apply before or with the code — utils/waStaffAlert.js
-- writes to this table on every page, and swallows the failure if it is
-- missing, so an out-of-order deploy loses the audit trail and nothing
-- else.
--
-- Staff alerts were the only outbound message this system sent without
-- recording. notifyStaff() called sendTemplate() and kept nothing, so
-- when sent.dm reported the send FAILED minutes later the webhook had no
-- row to attach it to: alertStaffOfFailedSend() looked the provider id up
-- in wa_messages, missed, and returned. The "Customer did not receive a
-- message" page — written precisely so a failed send is not just a grey
-- word under a bubble nobody reads — could never fire for an alert.
--
-- Between 30 August and 4 September 2026 every staff alert to
-- +447424531483 failed delivery. Diane Mworia's two handoffs and the
-- sweeper pages behind them reached nobody, and the only trace anywhere
-- was one line per failure in the container log:
--   [wa-webhook] delivery failed for 3e420462-...: no reason given
--
-- One row per phone per page, so "which numbers are actually receiving
-- alerts?" is a query rather than a guess.

CREATE TABLE IF NOT EXISTS wa_staff_alerts (
  id                  text PRIMARY KEY,
  phone               text NOT NULL,
  title               text NOT NULL,
  detail              text,
  dedupe_key          text,
  template            text,
  -- NULL when the send call itself threw: there is no provider id to
  -- match a later status webhook against, and `error` holds the reason.
  -- UNIQUE rather than a partial index so ON CONFLICT can infer it;
  -- Postgres treats NULLs as distinct, so the failed sends coexist.
  provider_message_id text UNIQUE,
  -- sent → delivered/read, or failed. Mirrors wa_messages.status.
  status              text NOT NULL DEFAULT 'sent',
  error               text,
  created_at          timestamptz NOT NULL DEFAULT NOW()
);

-- The status webhook arrives with nothing but the provider id; the
-- UNIQUE above indexes it.

-- "Has this number received anything lately, and did it land?" — the
-- boot check and the /ops/settings health readout both ask per phone.
CREATE INDEX IF NOT EXISTS wa_staff_alerts_phone_created_idx
  ON wa_staff_alerts (phone, created_at DESC);
