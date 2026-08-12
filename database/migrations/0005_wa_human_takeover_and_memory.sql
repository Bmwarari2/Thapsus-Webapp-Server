-- 0005_wa_human_takeover_and_memory.sql — human takeover + AI memory.
--
-- ⚠ DEPLOY ORDER: additive only — safe to apply before or after the code
-- that reads it. Pre-0005 code ignores these columns entirely.
--
-- human_takeover_at: set when a human takes the conversation (an operator
-- replies, or the assistant hands off). While it is set the assistant
-- stays quiet so the customer isn't answered by two voices. It clears
-- automatically once the conversation has been silent for
-- wa_settings.ai_resume_after_minutes, or when an operator flips the
-- assistant back on for that chat.
--
-- ai_summary: durable memory. The prompt carries the recent transcript
-- verbatim, but older context would otherwise fall out of the window;
-- this is a rolling précis of what matters about the customer (past
-- purchases, preferences, promises made) so the assistant can reference
-- things said days ago.

ALTER TABLE public.wa_contacts ADD COLUMN IF NOT EXISTS human_takeover_at timestamp with time zone;
ALTER TABLE public.wa_contacts ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE public.wa_contacts ADD COLUMN IF NOT EXISTS ai_summary_at timestamp with time zone;

INSERT INTO public.wa_settings (key, value) VALUES
    ('ai_resume_after_minutes', '120')
ON CONFLICT (key) DO NOTHING;
