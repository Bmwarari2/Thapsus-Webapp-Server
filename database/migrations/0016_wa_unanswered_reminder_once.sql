-- 0016_wa_unanswered_reminder_once.sql — one reminder per unanswered
-- conversation, silenceable.
--
-- ⚠ DEPLOY ORDER: purely additive — migrate → deploy.
--
-- The unanswered-conversation staff reminder used to re-page every hour
-- for as long as a conversation sat unanswered, which staff found more
-- annoying than useful. It now fires ONCE per unanswered stretch, 15
-- minutes after the customer's message. This stamp records the stretch
-- that has already been alerted (or silenced): the reminder is eligible
-- only while it is NULL or older than the latest inbound message, so a
-- fresh customer message after a reply naturally re-arms it.
--
-- Setting the stamp by hand is also the "silence" action — the inbox's
-- "No reply needed" button writes NOW() here for conversations that
-- genuinely need no answer (a "thank you", an emoji, a screenshot).
ALTER TABLE public.wa_contacts
    ADD COLUMN IF NOT EXISTS unanswered_alerted_at timestamp with time zone;
