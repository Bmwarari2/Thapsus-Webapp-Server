-- 0008_wa_drop_mpesa_onboarding.sql — stop gating signup on an M-Pesa number.
--
-- ⚠ DEPLOY ORDER: either way round. Older code reads 'awaiting_mpesa' and
-- would simply find nobody in it; newer code never writes it.
--
-- Signup used to ask for three things: name, delivery address, and the
-- M-Pesa number the customer would pay from. The third earned nothing —
-- payments are identified from the M-Pesa statement after the fact, so
-- holding a new customer at a question we already knew the answer to only
-- cost us people at the door. Name and address now complete a profile.
--
-- This moves anyone the old flow left mid-questionnaire:
--   * still in 'awaiting_mpesa'   → complete, because they had already
--     given the two things we now ask for
--   * has a name and an address but no code → same, whatever state they
--     are sitting in
-- Everyone else is left alone: a contact with no name still needs one.
--
-- The 'awaiting_mpesa' value stays in the CHECK constraint. Nothing will
-- write it again, and rewriting a constraint to remove a value no row
-- holds is churn that buys nothing — while keeping it means an older
-- container mid-rollout can still write it without erroring.

-- Codes come from the same sequence the app uses, so a hand-finished
-- profile is indistinguishable from one the assistant completed.
UPDATE public.wa_contacts
   SET customer_code = 'TC-' || nextval('wa_customer_code_seq'),
       updated_at    = NOW()
 WHERE customer_code IS NULL
   AND full_name IS NOT NULL
   AND delivery_address IS NOT NULL
   AND state <> 'blocked';

UPDATE public.wa_contacts
   SET state      = 'active',
       updated_at = NOW()
 WHERE state IN ('awaiting_mpesa', 'awaiting_address', 'awaiting_name')
   AND full_name IS NOT NULL
   AND delivery_address IS NOT NULL;

-- Anyone who gave a name but no address is now one question from done,
-- rather than two.
UPDATE public.wa_contacts
   SET state      = 'awaiting_address',
       updated_at = NOW()
 WHERE state = 'awaiting_mpesa'
   AND delivery_address IS NULL;
