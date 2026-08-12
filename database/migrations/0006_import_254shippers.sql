-- 0006_import_254shippers.sql
--
-- Data migration: fold the archived 254Shippers database into this one.
--
-- 254Shippers was a separate build of the same business — WhatsApp parcel
-- forwarding, Kenya, same admin account, same Lipana integration. It was
-- archived on 2026-08-12 and its production data exported row-by-row. This
-- brings the parts that still mean something across: the people, their
-- orders, the money, and the conversations behind them.
--
-- WHAT MOVES
--   customers + customer_addresses + conversations -> wa_contacts
--   wa_messages                                     -> wa_messages
--   orders + order_items + quotes                   -> wa_orders (+ events)
--   payments                                        -> payments (wa_order)
--
-- WHAT DOES NOT, AND WHY
--   webhook_events (1676), staff_alerts (35), emails, notifications,
--   audit_log, email_verifications  — operational logs of a system that no
--                                     longer runs; nothing reads them here.
--   ledger_accounts/entries/lines   — the finance module was removed in the
--                                     WhatsApp rebuild (see REBUILD.md).
--   purchases, purchase_batches     — supplier-cost records; this schema
--                                     tracks what the customer pays, not
--                                     what we paid SHEIN.
--   rate_cards, settings            — pricing here is a single markup_pct
--                                     plus a promo toggle in wa_settings,
--                                     already configured. Importing a
--                                     six-field rate card would mean
--                                     nothing to this code.
--   staff                           — one row, admin@thapsus.uk, which is
--                                     already the admin user here.
--
-- CONVENTIONS
--   * Source UUIDs become primary keys, so re-running this changes nothing.
--   * Contacts merge on phone and only ever FILL BLANKS — a value this
--     system already learned always wins over the archive.
--   * Names arrived with e-mail addresses and street lines glued on (the old
--     bot stored whatever was typed). First line becomes the name; the rest
--     is recovered into ai_summary, where the assistant will actually read it.
--   * The old flow billed last-mile inside the quote, so quote_kes is the
--     full amount paid and delivery_fee_paid_at is stamped on settled orders
--     — otherwise arrival would charge them a second time.
--   * usd_price is recovered as x_kes / fx_rate so receipts can still show
--     the breakdown the customer agreed to.
--   * sent_by resolves the operator by e-mail at apply time, so this file
--     applies to a fresh database (CI) as well as to production.
--   * Codes are minted here, not carried: TC- for contacts whose profile is
--     complete, TRK- for anything already paid for.
--
-- Idempotent and additive. Nothing is deleted, nothing is overwritten.
-- ── Contacts ────────────────────────────────────────────────
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('7b7c9fe8-45bb-4d00-932f-420784ec0158', '2348035062459', NULL, NULL, NULL, 'awaiting_name', NULL, '2026-08-01T06:04:31.429Z'::timestamptz, NOW(), '2026-08-03T09:02:44.945Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('ab67dd81-7d96-41d5-a92a-2ca22742bb8d', '254112082879', 'Emmah Gatwiri', NULL, '254112082879', 'awaiting_address', 'Imported from 254Shippers. Email: emmahgatwiri38@gmail.com', '2026-08-08T07:56:57.749Z'::timestamptz, NOW(), '2026-08-08T08:03:49.036Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('dd932e9f-77bf-4d21-b06e-c88febd5c937', '254112617405', NULL, NULL, NULL, 'awaiting_name', NULL, '2026-08-05T16:07:01.429Z'::timestamptz, NOW(), '2026-08-10T04:29:11.000Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('2b8cc7f4-087d-4a93-97f7-cb7c330eed85', '254113923074', NULL, NULL, NULL, 'awaiting_name', NULL, '2026-08-11T14:15:59.061Z'::timestamptz, NOW(), '2026-08-11T14:16:27.254Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('96ab9327-c452-4f65-b821-8a6f8e5604ab', '254700092005', NULL, NULL, NULL, 'awaiting_name', NULL, '2026-08-06T10:43:02.370Z'::timestamptz, NOW(), '2026-08-06T11:26:40.639Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('5052cea7-ab27-4e42-b0f0-1cbb596be5aa', '254700728827', NULL, NULL, NULL, 'awaiting_name', NULL, '2026-08-04T06:32:01.531Z'::timestamptz, NOW(), '2026-08-04T06:32:02.985Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('9203e757-0291-4172-9010-a911a17efe11', '254704001618', NULL, NULL, NULL, 'awaiting_name', NULL, '2026-08-11T07:32:53.918Z'::timestamptz, NOW(), '2026-08-11T07:32:55.421Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('c88911d6-7c77-4932-af99-987d32bb41c0', '254711303720', 'Brenda Njiru', 'Prosperity House, Achieng'' Aneko road, CBD, kisumu', '254711303720', 'active', 'Imported from 254Shippers. Email: brendafifi7@gmail.com', '2026-07-30T09:56:40.767Z'::timestamptz, NOW(), '2026-08-01T17:22:58.000Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('80910ef6-cad7-4098-b345-aedb0ef0761d', '254722904692', NULL, NULL, NULL, 'awaiting_name', NULL, '2026-08-06T08:21:00.074Z'::timestamptz, NOW(), '2026-08-08T09:06:46.000Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('af68f3ff-b762-455f-aa7e-cfc1936605c6', '254726626005', NULL, NULL, NULL, 'awaiting_name', NULL, '2026-08-07T20:35:14.042Z'::timestamptz, NOW(), '2026-08-08T08:34:08.000Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('01476c4f-64e1-4250-99df-3e7dd4d6c78d', '254746302525', 'Dorcas Njeri Gatamba', NULL, NULL, 'awaiting_address', 'Imported from 254Shippers. Email: njerisupremacy17@gmail.com', '2026-08-06T05:59:57.995Z'::timestamptz, NOW(), '2026-08-06T09:51:35.178Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('f5ccf8f2-b6e7-4cb2-aa33-c080e7349bf1', '254746542006', 'Leah Gitonga', '87 waiyaki way, nairobi', '254746542006', 'active', 'Imported from 254Shippers. Email: nkathagitonga2@gmail.com Also gave: 87 waiyaki way', '2026-08-06T14:54:59.947Z'::timestamptz, NOW(), '2026-08-07T08:44:49.585Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('84dbaed3-ef3b-4ff5-9a4c-c25038c12751', '254751275871', 'CHARLES NG’ANG’A KIBUGI', 'Estate not sure, Upper hill, nairobi', '254798632579', 'active', 'Imported from 254Shippers. Email: kibugicharles128@gmail.com', '2026-07-31T02:48:05.330Z'::timestamptz, NOW(), '2026-08-03T09:34:17.000Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('c14b4840-5b68-4f51-bb86-fb10cf6073ac', '254768115922', 'Patience Chepkirui', 'Crest apartment, Empire Arcade, Thindigua, kiambu', '254768115922', 'active', 'Imported from 254Shippers. Email: chepkiruipatience@gmail.com', '2026-07-30T09:12:54.796Z'::timestamptz, NOW(), '2026-08-07T18:15:08.101Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('c4cb7a60-f149-4d19-9b31-e3fb719ede43', '254792180397', 'Shakainah Nyaga', 'Recult Apartment, house number 406, Gate C, Juja Gate C area, kiambu', '254792180397', 'active', 'Imported from 254Shippers. Email: nshakainah.work@gmail.com Delivery notes: The apartment is next to one known as Springvale Apartment, landmark JKUAT university', '2026-08-09T04:48:14.149Z'::timestamptz, NOW(), '2026-08-09T04:56:04.558Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('6cccb418-78d3-464d-a324-1ed88b034912', '254793911332', 'Mutheu Kilonzo', NULL, NULL, 'awaiting_address', 'Imported from 254Shippers. Email: faithkilonzo005@gmail.com', '2026-08-11T15:25:19.098Z'::timestamptz, NOW(), '2026-08-11T15:43:03.453Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('ef69ab05-0a33-47a6-9bd0-4c004d593d7f', '254794165034', NULL, NULL, NULL, 'awaiting_name', NULL, '2026-08-06T09:11:33.149Z'::timestamptz, NOW(), '2026-08-10T14:16:31.000Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('f159a6bc-4d8b-4179-964e-171eb352e78f', '254794882104', NULL, NULL, NULL, 'awaiting_name', NULL, '2026-08-05T22:39:38.112Z'::timestamptz, NOW(), '2026-08-06T09:45:46.867Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('87c902f0-6e4e-4054-9e4d-02f54b930cf7', '447311349838', NULL, NULL, NULL, 'awaiting_name', NULL, '2026-08-08T09:57:44.917Z'::timestamptz, NOW(), '2026-08-08T10:02:30.426Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('2f2dccc1-a9e0-4a89-96f7-96281e1cf59e', '447404483757', 'Martha  Njuki', '3666, Shule road, Jericho, nairobi', '254740825215', 'active', 'Imported from 254Shippers. Email: njukimartha@gmail.com', '2026-07-31T12:35:35.371Z'::timestamptz, NOW(), '2026-07-31T14:25:12.522Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();
INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary, created_at, updated_at, last_message_at)
VALUES ('a354a24b-d367-4aaf-8250-aae9477f3eb9', '447424531483', 'Brian Mwarari', '102, Shanzu, mombasa', '254740825215', 'active', 'Imported from 254Shippers. Email: wanderibrian@gmail.com', '2026-07-31T03:24:54.410Z'::timestamptz, NOW(), '2026-08-11T15:43:04.131Z'::timestamptz)
ON CONFLICT (phone) DO UPDATE SET
  full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
  delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
  mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
  ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
  created_at       = LEAST(wa_contacts.created_at, EXCLUDED.created_at),
  updated_at       = NOW();

UPDATE wa_contacts SET state = 'active'
 WHERE state <> 'active' AND state <> 'blocked'
   AND full_name IS NOT NULL AND delivery_address IS NOT NULL AND mpesa_number IS NOT NULL;

UPDATE wa_contacts SET customer_code = 'TC-' || nextval('wa_customer_code_seq')
 WHERE customer_code IS NULL AND state = 'active';

-- ── Messages ────────────────────────────────────────────────
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8f0eb538-8e66-45c7-838b-aa4adecce90e', c.id, 'in', 'Hi', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0EwMEQxRDkwQ0MwMjcyNDE2QkQA', 'received', NULL, NULL, '2026-07-31T03:24:54.282Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '84447d5f-76c3-4636-b9a4-7c0eebb557b0', c.id, 'in', 'accept', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhgUM0I2REY5MzVFNTJCRUZGQzNDQ0UA', 'received', NULL, NULL, '2026-07-31T10:08:27.662Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '3ae4c4e6-f2d9-41ec-9b56-3c3b05915d71', c.id, 'out', 'One more thing: may we message you here about your orders, and email you receipts? You can send STOP at any time to end all messages.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSNkFDMTkzRkJFRjc0MEMwOUI1AA==', 'read', NULL, NULL, '2026-07-31T03:25:32.309Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '88d00bcc-d68d-4bfd-83a4-b888e7268ae2', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSNTlBNUM4QjE5NzVBOEVEQTIwAA==', 'read', NULL, NULL, '2026-07-31T03:24:54.640Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f7043e51-6be3-475f-920f-28399ac5f1f7', c.id, 'in', 'wanderibrian@gmail.com', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0E2OTE2MDNBMUJERDBGNDJCMEMA', 'received', NULL, NULL, '2026-07-31T03:25:32.151Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e86115b0-b025-4072-8bd3-66d85bb5d765', c.id, 'in', 'Ongata Rongai', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0E5QTE2QUVFQjAxOEJENzMwNTIA', 'received', NULL, NULL, '2026-07-31T03:26:26.476Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ab1d6624-3fe8-42e0-bb86-c3593a627d74', c.id, 'out', 'Estate or street name?', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSQjAzNzdGMUVEQkFDMkY3MDZBAA==', 'read', NULL, NULL, '2026-07-31T03:26:26.633Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'fa361a34-8217-447a-8613-6c66a6eddaf6', c.id, 'in', 'C1', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0EzODEwNDM1Mzg1QzU0NjlCNTcA', 'received', NULL, NULL, '2026-07-31T03:26:42.243Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b69e8f9c-401b-4f3f-9780-a9b63e59b490', c.id, 'out', 'Anything the rider should know? A landmark, a gate code, a time that suits you. Tap Skip if not.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSQzI2N0UzNzA1RjAwMjMwOEU2AA==', 'read', NULL, NULL, '2026-07-31T03:26:42.401Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5b4e33d6-b14d-4ba8-8f03-696284f9dcd6', c.id, 'in', 'Hey there,
For no. 1, What if I am logged in to my account already?', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUNCQUREM0ZFMEE1MDNERjAwOTE5OUYzQkNDQkVCMDkA', 'received', NULL, NULL, '2026-07-31T03:58:13.707Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '96a3f459-b811-4a51-bfd0-e7fb1ff48334', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSQzRFQkVBMDA0RTU5QjIxMzgyAA==', 'read', NULL, NULL, '2026-07-31T03:26:46.951Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5730e296-1cc5-419a-b4c7-aeb81b7caf8b', c.id, 'in', 'Signed in*', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUNBRjlFQkI4RUM0QjQ5NDgyNDc3Rjg1QkIyNEU1REMA', 'received', NULL, NULL, '2026-07-31T03:58:42.283Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8d24d669-de96-42f1-ba8e-9c3ac837e414', c.id, 'in', 'My account', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0EyODFCQkVBOUJGQjIwNzQ4MkUA', 'received', NULL, NULL, '2026-07-31T03:25:03.888Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '1e023f0c-46da-41c6-ad9a-5a51c6f51984', c.id, 'out', 'What is your email address? We send your receipts and order updates there.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSMkJFRTZDRjJDMjlCOTg2MEQyAA==', 'read', NULL, NULL, '2026-07-31T02:49:33.425Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '9efecb7d-2830-4375-8bd5-6dc4e59388dc', c.id, 'in', 'Brian Mwarari', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0FFNjc4Rjc0NTAzNzQ0RUNDMjcA', 'received', NULL, NULL, '2026-07-31T03:25:15.764Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f2483519-c277-4a0f-8606-a3762af9b176', c.id, 'out', 'Before your first order I need a few details: your name, your email, and where we should deliver. Takes about a minute.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSNTM3OTc0QTFFNTk2MjgyQzg3AA==', 'read', NULL, NULL, '2026-07-31T03:25:04.140Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '025a01c4-004f-4d78-a6b9-3eefc1f2ea85', c.id, 'out', 'What is your full name?', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSQUM1REEzQ0YxMzgzMUJFQUJEAA==', 'read', NULL, NULL, '2026-07-31T03:25:04.773Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b15b35be-0e59-4874-a26e-dcb721ef4e4a', c.id, 'in', 'kibugicharles128@gmail.com', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0FDREVBMTQ2RTlBNzY0RkZGRTMA', 'received', NULL, NULL, '2026-07-31T02:49:52.149Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c8dbaa3b-a3ab-4914-834a-b6d48ffebf02', c.id, 'out', 'Please send your full name — first and last.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSQjgyMzIwN0ZDQ0UwOEIxNDk2AA==', 'read', NULL, NULL, '2026-07-31T02:49:17.485Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ab3c3955-92d4-4744-a54f-85e27549f61f', c.id, 'in', 'CHARLES NG’ANG’A KIBUGI', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0E2NjhCQjM2OTIzQTJGQkQ3QjcA', 'received', NULL, NULL, '2026-07-31T02:49:33.276Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '03642b88-0f7c-4460-9431-13ad6a55b79a', c.id, 'out', 'What is your email address? We send your receipts and order updates there.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSRUUyMkJCRkZEQjZFRkNBMkMyAA==', 'read', NULL, NULL, '2026-07-31T03:25:15.922Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '59becf15-4559-486f-ad34-9f2e909af9de', c.id, 'out', 'One more thing: may we message you here about your orders, and email you receipts? You can send STOP at any time to end all messages.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSMzc1NDZCNjAyNTc2NkUwRTQ0AA==', 'read', NULL, NULL, '2026-07-31T02:49:52.302Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd628846a-1744-486d-964d-e32eab1ff0c8', c.id, 'in', 'Yes, go ahead', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0EyQTk0MzcxQjlENTcxQkMzMzcA', 'received', NULL, NULL, '2026-07-31T02:50:03.528Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '76eac95c-1527-4535-8be7-33970fccf636', c.id, 'in', 'Yes, go ahead', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0EyQ0U4NDM4RDlFMjcxQjlDNEQA', 'received', NULL, NULL, '2026-07-31T03:25:39.897Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2ba3bbca-21fe-4882-8ebc-bf1624050c5e', c.id, 'out', 'Which county are we delivering to?', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSNzEyNTUzQTgxMzhENjAyODlDAA==', 'read', NULL, NULL, '2026-07-31T02:50:41.361Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f135bf74-172b-4974-9008-f09faa70f8bc', c.id, 'out', 'Saved. We will send the payment request to 0798 632 579.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSNDZCNDQzN0U1M0I3RTFFMUI2AA==', 'read', NULL, NULL, '2026-07-31T02:50:40.809Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'bbe4bd70-d0e6-412d-a16a-a964343e8efb', c.id, 'in', 'Upper hill', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0EzQTI3RTY4NjkyMjY1NEFBRTEA', 'received', NULL, NULL, '2026-07-31T02:51:02.373Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '65280de0-74b7-4094-b952-39ad8d68f5b9', c.id, 'out', 'Estate or street name?', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSRDdBRDI1QkQ2NDJGN0EzRTMzAA==', 'read', NULL, NULL, '2026-07-31T02:51:02.644Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd18fd962-0702-4d18-b6f2-26c75184f58a', c.id, 'in', 'Not sure', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0EyODFGMTA0NEQyODA5QTdEQkEA', 'received', NULL, NULL, '2026-07-31T02:51:23.303Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a5fb7052-3eac-4a18-b003-c6251b101b72', c.id, 'out', 'I could not get that email out just now — that is on us, not you. Let me get a person to finish this with you.', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAERgSQTdBMzE0RDM5MkI3Njc3QzY5AA==', 'delivered', NULL, NULL, '2026-08-06T06:00:51.437Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '1eb9cd22-b575-4445-b39a-b5ad524363fa', c.id, 'out', 'I have sent a 6-digit code to wanderibrian@gmail.com. It expires in 10 minutes.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSRkM5QTk0MkUwOTFGMzRDOTZCAA==', 'read', NULL, NULL, '2026-07-31T03:25:40.732Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '4f4cfb94-1f8d-4293-bda8-5999fd831928', c.id, 'out', 'Reply with the code to confirm the address is yours.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMTg4MTQyQTU3QTRCNkMyRUQ4AA==', 'read', NULL, NULL, '2026-07-31T03:25:41.349Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '19fd7ba5-e37f-4f47-a94b-3cead490127b', c.id, 'in', '871339', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0FDNEVEM0ZDODVGMkRCMjM5NEEA', 'received', NULL, NULL, '2026-07-31T03:25:56.556Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '64a7167a-c1f2-4c06-8f03-db4eeb98e006', c.id, 'in', 'Hello how long does it take for the SHEIN products to get to Kenya', NULL, 'wamid.HBgMMjU0Nzk0MTY1MDM0FQIAEhgUM0FDQjQwRTg0NkE1RkQzNTVDNjgA', 'received', NULL, NULL, '2026-08-06T09:11:32.972Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794165034'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'aae04bc5-8989-473e-b2ca-67f8d6550331', c.id, 'out', 'Thank you — your email is confirmed.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMUQyMTA2MTVERjQ5NzY0RjY4AA==', 'read', NULL, NULL, '2026-07-31T03:25:56.810Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'bd3607c3-2514-4e26-8c22-19647d47a5f5', c.id, 'out', 'Which M-Pesa number should we use for payments? Send it as 07… — it does not have to be this WhatsApp number.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSNjZFNjJBOTFFNTBEOTdGMDY4AA==', 'read', NULL, NULL, '2026-07-31T03:25:57.436Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5de43e44-b32c-497f-aa74-10a4fc38171c', c.id, 'in', '0740825215', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0E2NjJDMkYwRDI5MTkyQjYyOTkA', 'received', NULL, NULL, '2026-07-31T03:26:07.283Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0b79ef36-b7de-4e26-ad1e-0edc7fa881d5', c.id, 'out', 'Saved. We will send the payment request to 0740 825 215.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMTQ0MEVBQ0QzNzEyOEJCRURCAA==', 'read', NULL, NULL, '2026-07-31T03:26:07.455Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c9166263-5d0d-4760-989d-c45b7c36a365', c.id, 'in', 'Hello', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0FFMkQyRDI1NUNCOEU3RkQzNzQA', 'received', NULL, NULL, '2026-07-31T02:48:05.198Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '34d7aed6-2e16-4ccb-88a7-772fb6a95470', c.id, 'in', 'How it works', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhggQUNFMEM2OEQ2REE3QTRDQUNDQjc2M0IyMjIyRjIzRkEA', 'received', NULL, NULL, '2026-07-31T09:57:24.659Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '58a72af2-37fa-47d7-bfce-832122286e8c', c.id, 'out', 'No problem — I am getting a person for you. Someone from our team will reply here shortly.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSNkY1NTNDMDhDOTdCMkQ4MUQ0AA==', 'read', NULL, NULL, '2026-07-31T09:51:35.750Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b2f62dcf-d124-4fee-a915-50d99aa51fa4', c.id, 'in', '794358', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0FGMjA4OENDREQ2M0QyMkYzN0UA', 'received', NULL, NULL, '2026-07-31T02:50:21.964Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0c47af5b-d289-4cf7-aeb0-a32dbf3d505d', c.id, 'out', 'I have sent a 6-digit code to kibugicharles128@gmail.com. It expires in 10 minutes.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSQUJCMTUyQ0YxN0E2RTkwMzE3AA==', 'read', NULL, NULL, '2026-07-31T02:50:04.496Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8e86b749-ce5d-42c4-a10e-58a936818826', c.id, 'out', 'Reply with the code to confirm the address is yours.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSMTEwQjE4MjMwMjNFRjI5RDM0AA==', 'read', NULL, NULL, '2026-07-31T02:50:05.061Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8737c0ee-46b4-4bec-a8ef-5932061cb701', c.id, 'out', 'A customer needs a person. Brian Mwarari (+447424531483) said "Talk to a person", and the bot has stopped replying — the thread is waiting in the inbox. Do not reply here — open the dashboard.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSRTQ3OEFDQjUzNUI0NUIxMjRGAA==', 'read', NULL, NULL, '2026-07-31T09:51:36.764Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '4be89aca-6b6e-491f-92b5-ad07fedb5ac0', c.id, 'out', 'Which M-Pesa number should we use for payments? 0751 275 871? Tap below to use it, or send a different number.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSRjc4RUIwMjQ1RERDQTdBRDk3AA==', 'read', NULL, NULL, '2026-07-31T02:50:23.012Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0488bc6b-352c-466d-b28a-20eb646842bd', c.id, 'out', 'Thank you — your email is confirmed.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSMDgyOEUyREQ2ODk1QTQ5OTY1AA==', 'read', NULL, NULL, '2026-07-31T02:50:22.216Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '59e32fc4-fdc2-434c-b3fa-35d35de91527', c.id, 'in', '0798632579', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0E1NUVDRTdFNzI4RTYwQzc0NDEA', 'received', NULL, NULL, '2026-07-31T02:50:40.634Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ba1926af-9710-4f1f-a96a-2e80b8938a0f', c.id, 'out', 'Which county are we delivering to?', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSNEQzRjJGRUMyMTc4MEE2ODI1AA==', 'read', NULL, NULL, '2026-07-31T03:26:08.079Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'bda13ec3-4b66-4c38-8c84-97b730d24c88', c.id, 'in', 'Nairobi', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0FCQjRBM0NDMDExNjA1RTI0Q0UA', 'received', NULL, NULL, '2026-07-31T03:26:16.004Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0eb303cd-1719-4d15-b1c7-f5038f0c9651', c.id, 'out', 'Which town or area?', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSNEIzQUZDMDY5ODYzQkU1MDE4AA==', 'read', NULL, NULL, '2026-07-31T03:26:16.161Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c7b6a182-7570-4b32-a8ee-609d090efe56', c.id, 'in', 'Muraya Road', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0FFQTdGMzAzNjBDRkE1QzFGRDYA', 'received', NULL, NULL, '2026-07-31T03:26:36.162Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a911c616-afbb-4846-8d0b-ce8112594ea8', c.id, 'out', 'Building and house or door number?', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMjlCRjgxQjhEREFBQjE4MEI5AA==', 'read', NULL, NULL, '2026-07-31T03:26:36.315Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'eea59c22-520b-4627-8938-cff855177943', c.id, 'in', 'Hi! I have a link I would like a price for.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhgUM0JFNjgxOTA5QjA5QkQ4RTlENDcA', 'received', NULL, NULL, '2026-07-30T09:12:54.739Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a7001466-72e3-419b-9b42-30fa5a4d7744', c.id, 'in', 'Skip', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0E3ODNCRjVFQ0ZGQUVFNDQwRTgA', 'received', NULL, NULL, '2026-07-31T03:26:46.170Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7b33398a-93c1-410b-a8b9-44af84ae9975', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSOTgwRTJGQkM2QTdGRkE4MzYzAA==', 'read', NULL, NULL, '2026-07-30T09:12:54.881Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '942b6e1e-6e2f-43f2-bcf7-04ba3a5823fb', c.id, 'in', 'Start a new order', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhgUM0I0MUQ3MjM3M0M1NjcwMkVFN0QA', 'received', NULL, NULL, '2026-07-30T09:22:33.251Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f82dc38b-4bae-42d3-b26a-80ea16bd0939', c.id, 'out', 'You are all set. I have saved your details, so next time you can go straight to ordering.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMkFDMkRFNEU3MDc0NEU2MkY3AA==', 'read', NULL, NULL, '2026-07-31T03:26:46.386Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0f02e333-3597-4601-8e89-cae737963aeb', c.id, 'out', 'Sorry, I did not get that.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSRTU4N0Y1OTI4RDBENTY1MkREAA==', 'read', NULL, NULL, '2026-07-30T09:22:33.405Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ede58773-db87-473b-ae03-dc7a9dd876b2', c.id, 'in', 'Nairobi', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0FDRTgwMDI1ODg5MDZFNzRCRjUA', 'received', NULL, NULL, '2026-07-31T02:50:53.043Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '45d98f0b-d6bd-4cb5-a959-58fe321e48f9', c.id, 'out', 'Hi, there might be a price difference in what price you see vs what we see on our end. We can still work with the link even when you are signed in.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSNjVCMDI1RTUzOTk3NkRDQzY3AA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-07-31T09:41:04.320Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'fc9ac1de-b24b-4e23-92c7-92ee3cf567d4', c.id, 'in', 'Thindigua', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhggQUMyM0IxMTc2RUM5MjJDMDEwQkFCNjFEQjA4MzBCMDAA', 'received', NULL, NULL, '2026-07-31T09:59:58.632Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2726a2fd-5194-4323-a060-9c28804838d9', c.id, 'in', 'https://amzn.eu/d/09IxaU0L', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhgUM0I1NDUxMUQwNENGOTE2M0I1QzcA', 'received', NULL, NULL, '2026-07-31T10:03:06.929Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '75a5dce9-b0d7-43ad-b138-93b4578af64b', c.id, 'in', 'Start a new order', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0FGMkUwNjFCNzVBOUYxNzExQUUA', 'received', NULL, NULL, '2026-07-31T03:27:02.871Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '03203319-f575-4684-9070-ce3f15d5be59', c.id, 'out', 'Send me the link to what you want. You can paste several at once, or send them one at a time.

Tap Done when you have sent everything.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSRjhFMDY0MzNBN0MxQTY2QjlFAA==', 'read', NULL, NULL, '2026-07-31T03:27:03.024Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a3efd847-5381-4bf5-bfca-e1a510a96864', c.id, 'in', 'How it works', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhgUM0IxMjVDNUE4MTMyOEZDQkM2MTAA', 'received', NULL, NULL, '2026-07-30T09:22:22.110Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ca45fe09-15b4-4b57-8e20-02bd926945fb', c.id, 'in', 'Done', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0FCMUNCOTE5RkI4RTQ1NjQ5ODMA', 'received', NULL, NULL, '2026-07-31T03:27:36.176Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '29e63379-ed9b-44f6-8016-77bf6357076e', c.id, 'out', 'Here is your order:

1. onelink.shein.com/45/5xe22jxdthrx

We will send you one all-inclusive price in KES — delivery to your door included.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMTk0QjdBNjcxNDhFQ0IyQ0MzAA==', 'read', NULL, NULL, '2026-07-31T03:27:36.330Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '24be1f0e-46fc-40b6-8668-7aa2c689ed52', c.id, 'out', 'Here is how it works:

1. You send us the link to what you want.
2. We tell you one all-inclusive price in KES — shipping to your door included.
3. You pay by M-Pesa.
4. We buy it, fly it in, and deliver it to you.

No customs paperwork for you, and no surprise charges at the end.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSNTQxNEM4ODVGMkFEMTI0MTUyAA==', 'read', NULL, NULL, '2026-07-30T09:22:22.311Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '38c462a4-eb70-4af9-be72-6d5add75963c', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSRDU5NEExOEQ1RUM0QjA2NjIyAA==', 'read', NULL, NULL, '2026-07-30T09:22:22.950Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '3b77dd63-687f-4b55-971f-66f20c2a3746', c.id, 'in', 'Hi', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0FGRTE2NTIwNjVDRTZDQTdBMTYA', 'received', NULL, NULL, '2026-07-31T03:27:48.832Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '6286676b-3b33-4171-b06c-dd9a7a88322d', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMkQ3OEI0NEMxNUU2RDFEQzcyAA==', 'read', NULL, NULL, '2026-07-31T03:27:48.989Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c4ceb342-6931-4729-9f72-d997cdb0f740', c.id, 'in', 'Change address', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0E0NjgzNjQ4QUFCRUE1QTY5MTUA', 'received', NULL, NULL, '2026-07-31T03:28:03.565Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '15dc43fe-6b36-413e-8dad-49c9ad2a5b8d', c.id, 'in', 'Shanzu', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0E4OUVCNjJERDBBNjc2QUU0QjAA', 'received', NULL, NULL, '2026-07-31T03:28:19.630Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c71cff4d-2fa5-46aa-bf7e-9c815f9d4e44', c.id, 'out', 'Estate or street name?', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSQkM4RDkwOTBFODJEQzQxRkNFAA==', 'read', NULL, NULL, '2026-07-31T03:28:19.785Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b790304f-9c42-4ea4-9dd3-a0a7fb3acc50', c.id, 'in', '102', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0E5OEFENDY0OUZCQzAwRjgzN0YA', 'received', NULL, NULL, '2026-07-31T03:28:28.377Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '32a54d86-7028-4fae-a58b-9b88417ff4e6', c.id, 'in', 'I sign out or we can work with it like that?', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUM1MzI1MTQ5NTVFNEZGNDUwN0U2ODIwOTI4REI5MjMA', 'received', NULL, NULL, '2026-07-31T09:42:09.526Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e315df18-0b8d-49c2-a829-09eb78a20136', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSMjgyN0Q3NkUwN0M1ODA4NTAyAA==', 'read', NULL, NULL, '2026-07-30T09:22:44.494Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '50e5cfa2-01cc-4892-946c-e169cc861f09', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSNjE0MkFFNjM2ODU2M0Y0QzEwAA==', 'read', NULL, NULL, '2026-07-30T09:22:33.954Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '6cca8f5a-3ba0-4fc6-a3e5-cf5aa036208d', c.id, 'in', 'Start a new order', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhgUM0JEQ0I4NzQ3NTBGM0IyQzU5NTMA', 'received', NULL, NULL, '2026-07-30T09:22:43.529Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f8143f1f-60d1-4f44-8d8f-3b089669afbf', c.id, 'in', 'https://onelink.shein.com/45/5xe22jxdthrx?shc=2_RXFCV1cXtKV', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0EwM0YxNzk4NzBDMEQ1QjA0MUIA', 'received', NULL, NULL, '2026-07-31T03:27:30.672Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '74856e39-1d82-4b1b-9630-8a9b36b6687c', c.id, 'out', 'Sorry, I did not get that.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSOUMxODZGQkRDM0IzQjZDMERCAA==', 'read', NULL, NULL, '2026-07-30T09:22:43.769Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0ab1b153-d323-4715-bf96-2ce244dd7ccf', c.id, 'in', 'Track my order', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhgUM0I2RkIxQUU1RDkwOEQwNTA5RDIA', 'received', NULL, NULL, '2026-07-30T09:23:52.063Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd2446356-f69c-4973-a46c-0b4572902252', c.id, 'out', 'Let me get a person to help — I am not following. Someone from our team will reply here shortly.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSNTRFRjA2MDU3RkMzMzAyREE2AA==', 'read', NULL, NULL, '2026-07-30T09:23:52.240Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '73bfdb38-6549-40fa-a95c-27bda3c5e528', c.id, 'in', 'My account', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhgUM0I3QUZGQUE3MDdFNUMzQzI1MTQA', 'received', NULL, NULL, '2026-07-30T09:27:10.962Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '9f903cc2-bcaf-4f6f-918a-6d06e3faf414', c.id, 'in', 'Talk to a person', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhgUM0JDRjUwOUFEQzQyNUQzRjY4QzIA', 'received', NULL, NULL, '2026-07-30T09:27:23.727Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2a06b868-4ac0-4869-b934-a63e79b539da', c.id, 'in', 'Hi there,☺️
Saw your page advertised by GK Nyambura a few days ago. So how does this free shipping work?', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUM4OUMwNjVBQkREMkI1NUYyRTNFMkMwNkQ0NUJGODYA', 'received', NULL, NULL, '2026-07-30T09:56:40.651Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '4aed6f06-043b-4bf0-b716-8970ac106a73', c.id, 'in', 'Estate not sure', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0E3MTgwQjk1MDA1RUVGNDVCRjkA', 'received', NULL, NULL, '2026-07-31T02:51:14.695Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'bacc96ed-f9d8-4b6f-a757-f356996ecd07', c.id, 'out', 'Which town or area?', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSOEJDQjc4MkYwMkZCMkEyNjYzAA==', 'read', NULL, NULL, '2026-07-31T02:50:53.196Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7641e70c-5092-40af-9494-9a91ff3c3226', c.id, 'out', 'Building and house or door number?', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSRkFBNzdDMDU0NjhCNzZFNDMyAA==', 'read', NULL, NULL, '2026-07-31T02:51:14.847Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '53b93599-79a4-4e80-99b4-362a15c221d6', c.id, 'in', 'Done', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0E3RTlBOTQ2MTEwOERCQjQ5NUUA', 'received', NULL, NULL, '2026-07-31T02:53:46.627Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '414cc120-cc9c-444c-b3b3-5ec29a2bd470', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSNDQ1Q0ZGNDUyN0Q4NkY3OTkwAA==', 'delivered', NULL, NULL, '2026-07-30T09:56:40.933Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '53f140c5-46d2-423e-baa4-5d4d77f7aadb', c.id, 'in', 'Talk to a person', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUNGRTcwMUI4Qzk2MTg2MUM0MUU1MzI2NzU0MDk5OTgA', 'received', NULL, NULL, '2026-07-30T10:06:33.843Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '207f059d-5012-4ff0-b007-1ba6b1bd1d7e', c.id, 'in', 'Njukimartha@gmail', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0E0OEY5NUNFQTZDN0U2MUI1RUIA', 'received', NULL, NULL, '2026-07-31T12:36:43.983Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '1c5ed2ce-1927-4014-9905-666ce8946a05', c.id, 'out', 'No problem — I am getting a person for you. Someone from our team will reply here shortly.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSQTBGMDJBRDkxRDU1OTVEN0NGAA==', 'delivered', NULL, NULL, '2026-07-30T10:06:34.011Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '38cf22a1-5c6c-434f-950e-d7894d857e98', c.id, 'in', 'Confirm', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0FEODFDOTRFODcxQjFERUNCMkQA', 'received', NULL, NULL, '2026-07-31T03:27:41.478Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '352c9556-ee84-4233-a709-51930ea43bba', c.id, 'out', 'That is 1 item so far. Send another link, or tap Done.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMjEzODRBQTBFNUFBOUUxQjJCAA==', 'read', NULL, NULL, '2026-07-31T03:27:30.839Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '93976aae-171e-4b81-9c74-fd1684783666', c.id, 'in', 'My account', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0E4REFCNDZFOTlEMUEwRDg2QzMA', 'received', NULL, NULL, '2026-07-31T03:27:56.556Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8c64db6f-cd55-4a7c-8d97-6094cba04b27', c.id, 'out', 'Thank you. Our team is pricing your order now and I will message you here with the total.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSNkExMENERTU3ODFFMEIwRTBGAA==', 'read', NULL, NULL, '2026-07-31T03:27:41.703Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'da8be226-21be-4ed4-8f51-2e6e47558d9c', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSNkRDQjU1MjE1Rjk0RkZGNTRBAA==', 'read', NULL, NULL, '2026-07-31T02:48:05.546Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0594bc54-aaf5-482f-8268-eaa7ed8f56b7', c.id, 'in', 'Start a new order', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0EzQTc3QkZDRUJCN0U1NzEyRDgA', 'received', NULL, NULL, '2026-07-31T02:48:48.545Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '448df284-ee8c-4e8e-b859-0e50ed162a8b', c.id, 'out', 'Before your first order I need a few details: your name, your email, and where we should deliver. Takes about a minute.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSQTBCNTM1NjdENEFCMUZDMDA5AA==', 'read', NULL, NULL, '2026-07-31T02:48:48.703Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a8a93a4a-3045-49cd-9cba-8d22c7b7e187', c.id, 'in', 'How it works', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0E3Qjg3MkY5MzkxNEY0OEUwRDUA', 'received', NULL, NULL, '2026-07-31T02:49:17.328Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '1cd487ac-9193-48ef-bb1c-9a97cc0def06', c.id, 'out', 'What is your full name?', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSMjIzREFDREEyOTY0MzA0Q0RDAA==', 'read', NULL, NULL, '2026-07-31T02:48:49.482Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd3bf8d4b-48b8-4355-ba1b-7d8788dc580d', c.id, 'out', 'Anything the rider should know? A landmark, a gate code, a time that suits you. Tap Skip if not.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSMTYzMURCRUNEQkYyN0ZDOTgwAA==', 'read', NULL, NULL, '2026-07-31T02:51:23.459Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ff1c0a05-8ba5-4d7b-b392-0f8e429bd1f0', c.id, 'in', 'Skip', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0E1QTIxQUVEMzNFMkNFMTc5NUIA', 'received', NULL, NULL, '2026-07-31T02:51:31.125Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'cae1bc68-8a55-4b7a-be38-f1996564ac05', c.id, 'in', 'Martha', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0FFNTA3QTVGM0Y1OTQ4NEVDNTkA', 'received', NULL, NULL, '2026-07-31T12:36:56.849Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2b4c9357-8e77-4f9e-8e31-333ab34e29cc', c.id, 'out', 'You are all set. I have saved your details, so next time you can go straight to ordering.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSQzI0MzI3OTkyNDQxQjlBOTIxAA==', 'read', NULL, NULL, '2026-07-31T02:51:31.343Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '071e446a-9005-4403-a61c-42eda44319ef', c.id, 'out', 'Send me the link to what you want. You can paste several at once, or send them one at a time.

Tap Done when you have sent everything.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSREY3Qzk1MUE5OTAxNjkyRUI4AA==', 'read', NULL, NULL, '2026-07-31T02:51:31.972Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '59fc130d-9d50-4d3c-81dc-3505e80c0e41', c.id, 'in', 'https://onelink.shein.com/45/5xe22jxdthrx?shc=2_RXFCV1cXtKV', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0EwNjFCQ0U0NTIzRkY5Mjg5NzEA', 'received', NULL, NULL, '2026-07-31T02:53:36.166Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '31d25047-77ce-4698-b39f-547c28152be1', c.id, 'out', 'Your details are on file. Tap below if you need to change anything.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMjA5RTQxOEFFQzdEMTczQTAwAA==', 'read', NULL, NULL, '2026-07-31T03:27:56.710Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a701c803-a808-46b9-8eab-2867852d7bff', c.id, 'out', 'That is 1 item so far. Send another link, or tap Done.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSNEYwQTFDMTA2RUNCMTY2MjRBAA==', 'read', NULL, NULL, '2026-07-31T02:53:36.322Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '36ecc2b1-9645-4c27-beb0-ddd4b5cf7b26', c.id, 'out', 'I could not find a link in that. Copy the product link from the shop and paste it here.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSNDJGQTE1NEEyMkI3MkU3OTlEAA==', 'read', NULL, NULL, '2026-07-31T02:53:46.783Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5e0a4e6b-369c-462f-ba96-b482aa0dd529', c.id, 'in', 'Confirm', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0E5ODQxNDNBMkRBNjk0RUE1NEIA', 'received', NULL, NULL, '2026-07-31T02:54:16.514Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '759cae81-3f23-47df-9c6e-a526da4ffbf0', c.id, 'out', 'Which county are we delivering to?', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMzU1RDNCOEJCRjA3NTQzODVCAA==', 'read', NULL, NULL, '2026-07-31T03:28:03.720Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c3767c4c-3bd0-4cb3-86f3-d9dedb4fcfa5', c.id, 'out', 'Thank you. Our team is pricing your order now and I will message you here with the total.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSM0MwQjU1NjBERjgzODRGQjJDAA==', 'read', NULL, NULL, '2026-07-31T02:54:16.776Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'fa92a274-6aae-40b0-a4fa-5d4553f80204', c.id, 'in', 'Mombasa', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0FBRUFBNUUyQzhBQ0RGNDJFNUMA', 'received', NULL, NULL, '2026-07-31T03:28:10.740Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '38caacd1-652a-4c88-b2ca-30b8418ae6a9', c.id, 'out', 'Which town or area?', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSM0QzQzE3MjcwNkU5NkJFMzU3AA==', 'read', NULL, NULL, '2026-07-31T03:28:10.897Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'bb606f1a-61ec-4538-b534-12aa796faa4f', c.id, 'in', 'Shanzu', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0FCMzFGNTQ1ODUzMkJDQUJEN0YA', 'received', NULL, NULL, '2026-07-31T03:28:23.686Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'fa82e047-6ae8-4a25-a308-2baf64f01034', c.id, 'out', 'Building and house or door number?', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSRkRGQ0FGRDQwNUMzMjVCREY0AA==', 'read', NULL, NULL, '2026-07-31T03:28:23.837Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '845fc6fb-dda7-4dc6-b2ef-233f50f4afff', c.id, 'out', 'Sorry, I did not get that.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSMzdCODhCOUNBRDg3NEJFODg5AA==', 'read', NULL, NULL, '2026-07-31T02:57:19.528Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '89bc8980-8c7d-4c2a-a929-abea5383957c', c.id, 'out', 'That is 1 item so far. Send another link, or tap Done.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSMEE3MjJCRTZBMzlFRjdCMTdFAA==', 'read', NULL, NULL, '2026-07-31T02:53:47.398Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b91f5450-8b77-42cd-bb2d-0102d7b43706', c.id, 'in', 'Done', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0EwMkJGQjlFQUUxNEZDNkY2RTgA', 'received', NULL, NULL, '2026-07-31T02:53:54.956Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '931a0e1e-8d41-4298-8391-df6e3ed62a42', c.id, 'out', 'Anything the rider should know? A landmark, a gate code, a time that suits you. Tap Skip if not.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMThFQkM3MEE5MDdERTU1NEY4AA==', 'read', NULL, NULL, '2026-07-31T03:28:28.532Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '087c929d-3181-4122-8137-bee2124dbac1', c.id, 'out', 'Here is your order:

1. onelink.shein.com/45/5xe22jxdthrx

We will send you one all-inclusive price in KES — delivery to your door included.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSMDM3QzE4NDRBRjU3MUIwMUQyAA==', 'read', NULL, NULL, '2026-07-31T02:53:55.112Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'bd088c55-8c74-4c35-b63d-4c5d1ab47a13', c.id, 'in', 'Okay', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0E4RTkzNDkyQzkwNUQzRjFFNjkA', 'received', NULL, NULL, '2026-07-31T02:57:19.351Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0b9894c5-7fe3-45df-8e2c-705b0c8aa59c', c.id, 'in', 'Skip', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0E3RENEMjVFNjIzNDVGMkE0RkQA', 'received', NULL, NULL, '2026-07-31T03:28:32.955Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '9c584603-04ba-4f04-95ec-964cfb1bb372', c.id, 'out', 'We can work with it.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSMDcxQTcxRDEyOUMwQTcyNTU1AA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-07-31T09:48:11.782Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e0adc32c-b0a2-482b-a3af-0aad730a396e', c.id, 'out', 'Your quote for order SH-2607-0002 is ready: KES 18183.00, all inclusive — delivery to your door included. Reply to accept and pay by M-Pesa.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSMzlCQUVBMkZFNzkzNDgyQzY0AA==', 'read', NULL, NULL, '2026-07-31T03:03:50.105Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8f8b61e1-6978-484f-89c9-3b90fe725495', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSRkVENkFDNEIwMDFBMTVCRTVDAA==', 'read', NULL, NULL, '2026-07-31T02:57:20.118Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'acfd0c9f-ddf8-44c0-965e-ea6306091dcc', c.id, 'in', 'Hi', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0ExMjFDNzVERkJBOUUzOTJENTgA', 'received', NULL, NULL, '2026-07-31T09:51:27.785Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'efd85b6f-ad8c-4a8a-8d88-6a9c4511b483', c.id, 'out', 'Hi, I apologise for the slow response. We were migrating this number to provide an automated service and your message got delayed in the process. Everything is up and working now so you shouldn’t encounter this problem again. 
To answer your question the free shipping is a service we are offering for SHEIN Kenya. 
All you need to do is send us a link to your cart. 

To make sure your SHEIN order goes smoothly, here are some tips:

1. Don’t be signed in to your Shein account so as to avoid price changes when you send us the link.
2. Check the size guide to make sure you choose the correct sizes.
3. Check the reviews so that you know what people think of the product.
4. Read the description to know exactly what you’re ordering.
5. Make sure your location is set to Kenya.
6. Follow us for more tips!', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSM0VERDNCNTFDNkY3ODU5RTUzAA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-07-31T03:16:33.272Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2800c29e-d7ef-466e-8a3b-8efe8965a500', c.id, 'in', 'Talk to a person', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0EzRDQwRTc5NUE1REE4RDRGOUMA', 'received', NULL, NULL, '2026-07-31T09:51:35.543Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '260f1c9b-4c68-4916-a342-6f510f9a5af4', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSQkE3Q0FFRTVFMjMwODJFMjE1AA==', 'read', NULL, NULL, '2026-07-31T09:51:27.941Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '154bede2-6cd3-47ae-b9f0-0e476d916be3', c.id, 'in', 'Hi! I have a link I would like a price for.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhggQUNDMUU2RDg4Nzg4NkM4MzhGMzgzQjA5NjFCNDNENzkA', 'received', NULL, NULL, '2026-07-31T09:57:12.992Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e5ade0f9-f160-498a-88eb-56340d0f4f2c', c.id, 'in', 'Patience Chepkirui', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhggQUMwOTE2NzQxNzUxODhCNkFDRDUyODEyQUJCMDU0MEEA', 'received', NULL, NULL, '2026-07-31T09:57:53.848Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '066eab1d-4666-447b-841b-fcde10984e01', c.id, 'out', 'Welcome back. What would you like to do?', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSMTE1RUM5MDE4NUMyQjhGODRDAA==', 'read', NULL, NULL, '2026-07-31T09:57:13.694Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd9deb517-5d67-45cc-a5f7-c2f8376ee31e', c.id, 'out', 'Here is how it works:

1. You send us the link to what you want.
2. We tell you one all-inclusive price in KES — shipping to your door included.
3. You pay by M-Pesa.
4. We buy it, fly it in, and deliver it to you.

No customs paperwork for you, and no surprise charges at the end.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSQUVBQkQ4OEM3MkNENUU3MkFCAA==', 'read', NULL, NULL, '2026-07-31T09:57:24.828Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2e259bf7-b7e6-4840-a364-9dd65e089fac', c.id, 'out', 'What is your email address? We send your receipts and order updates there.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSOEVCRTE1Q0Q2NEQ3NTczQkYxAA==', 'read', NULL, NULL, '2026-07-31T09:57:53.998Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '4248f291-fe0b-4c16-868e-f6a904a939ef', c.id, 'in', 'chepkiruipatience@gmail.com', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhggQUMwMjJENDBENUNCRTE5MDVCOERFRERERjlEODk1MTMA', 'received', NULL, NULL, '2026-07-31T09:58:05.750Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '3c384893-cca4-4efe-a349-26ad54ae082c', c.id, 'out', 'One more thing: may we message you here about your orders, and email you receipts? You can send STOP at any time to end all messages.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSQzBEQkM0MkM5NDA5MDFEOTI0AA==', 'read', NULL, NULL, '2026-07-31T09:58:05.917Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e30574fb-4c5f-4569-8df7-12fdbd962fbf', c.id, 'in', 'Yes, go ahead', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhggQUNDMERDQjAzNDg3MjY2MkYxNERCMjExMDY0MTEzNjkA', 'received', NULL, NULL, '2026-07-31T09:58:19.290Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b42e7eb9-754c-4e87-a185-792226fa5960', c.id, 'out', 'I have sent a 6-digit code to chepkiruipatience@gmail.com. It expires in 10 minutes.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSNzBDMEZDMDQwRTI2MUE0QkEwAA==', 'read', NULL, NULL, '2026-07-31T09:58:20.232Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd6a9b8e3-a998-4d22-b68d-188c7738b2af', c.id, 'out', 'Reply with the code to confirm the address is yours.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSRkJBNEQ3MjdCQkQ0NkQ3QTkyAA==', 'read', NULL, NULL, '2026-07-31T09:58:21.096Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '874344a0-1328-413e-8fe6-cd72f042f96b', c.id, 'in', '422689', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhggQUMwRTA2QjcxNDk0OTU5QjZCRkNFN0M1NTc5MDI2NjEA', 'received', NULL, NULL, '2026-07-31T09:58:59.209Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ba049bcc-a8d3-4a9d-8d97-416e78fab29f', c.id, 'out', 'Thank you — your email is confirmed.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSRDlDODFEMkJDMzFBODI5MTQwAA==', 'read', NULL, NULL, '2026-07-31T09:58:59.442Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '25abb18d-d8a0-41b1-a870-6da8c74516ac', c.id, 'in', 'Use this number', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhggQUMzMEVDNDBCMjY2QjEzREMzMDdCNjlGNjE5MjU1QzgA', 'received', NULL, NULL, '2026-07-31T09:59:23.958Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '749be2bb-5a32-4057-a266-aa94b319da3f', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSNjM4OUNERUU2MEJEMDZEQ0I5AA==', 'read', NULL, NULL, '2026-07-31T09:57:25.526Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f7841e8f-48e1-4273-885b-649071e65e8c', c.id, 'in', 'Start an order', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhggQUMxOTUwQjk5RTE0M0Y3NUE2OUU0RjFFNkFBMUM5NzkA', 'received', NULL, NULL, '2026-07-31T09:57:35.185Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '6f993e37-98a1-4557-a71b-82fd317cd936', c.id, 'out', 'Sorry, I did not get that.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSNzcwNUMzQzUzMDM5RTkxMTg0AA==', 'read', NULL, NULL, '2026-07-31T10:08:27.816Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e6558b7d-2e11-4834-b60f-8d10710546f2', c.id, 'out', 'That does not look like a Kenyan mobile number. Send it as 07… or 01… and I will save it.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSMzExNERFMTRFMDJFNDhCQjA4AA==', 'read', NULL, NULL, '2026-07-31T09:59:10.891Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'be951dca-45fe-4f64-a333-38c388eb9b7b', c.id, 'out', 'What is your full name?', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSQ0Q0MTRGNjE1QjBFMjQzRUE1AA==', 'read', NULL, NULL, '2026-07-31T09:57:36.093Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b94eb565-f12d-4be8-9431-255910f95dcb', c.id, 'out', 'Before your first order I need a few details: your name, your email, and where we should deliver. Takes about a minute.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSQkU0MjQyMDE0RUE0QUE0MDNGAA==', 'read', NULL, NULL, '2026-07-31T09:57:35.348Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'efa53d03-a77b-4e8d-8df2-c10844e84969', c.id, 'out', 'Which M-Pesa number should we use for payments? 0768 115 922? Tap below to use it, or send a different number.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSQTgwRjA5RTVBRkVBMDMyREJBAA==', 'read', NULL, NULL, '2026-07-31T09:59:00.326Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'bb5ba52a-c062-4b62-9ec5-125228b759d9', c.id, 'in', 'Yes', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhggQUNGMEU0OTJBRjQ5NDY1MDM0QzQyRDI4MTQwMjYzNDEA', 'received', NULL, NULL, '2026-07-31T09:59:10.732Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '457a98db-7f10-4286-8bf0-79c25fce1e38', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSM0M5MzhGQjQwNTkzMzRCQzBCAA==', 'read', NULL, NULL, '2026-07-31T10:08:28.502Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '28ed9791-eef0-4a76-967c-4dbbf8437b17', c.id, 'in', 'Back to menu', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAEhggQUNFRUUxOEMxNjlGRkQ1REIxMTFFNjY3REEzQ0QyRjkA', 'received', NULL, NULL, '2026-08-06T06:01:03.365Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'cafd44cf-0211-452b-831d-7cda324e59a4', c.id, 'out', 'Saved. We will send the payment request to 0768 115 922.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSOEFFNjUzQTFCOENBOEMyQTFCAA==', 'read', NULL, NULL, '2026-07-31T09:59:24.131Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b0a1401d-dfcc-416f-8842-adac8e7ea515', c.id, 'out', 'I have updated the quote for order SH-2607-0002. The new total is KES 16257.00, which replaces the figure I sent before. Delivery is on us for this order. Reply YES to accept and pay by M-Pesa, or say “agent” to talk to a person.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSMzcyQTI3MEQ3OUU3QkJFMkM2AA==', 'read', NULL, NULL, '2026-07-31T04:20:01.235Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'cc1c140c-a758-45bc-8a4c-673ba12b5abf', c.id, 'in', 'Hi', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0E2NzlDMjc0M0IxRUVDRjVGMDIA', 'received', NULL, NULL, '2026-07-31T12:35:35.117Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b3dffd37-f1c9-4c95-8656-092fdf8f1738', c.id, 'out', 'A reminder about order SH-2607-0004: your quote is KES 951.00, all inclusive — delivery to your door included. Tap below to pay by M-Pesa, or reply ACCEPT.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSODNCNUMzQ0FDMjBFNDJENkQ2AA==', 'read', NULL, NULL, '2026-07-31T11:54:34.660Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c58b2260-c1dc-4aa2-9aab-c3af47b6e51f', c.id, 'in', 'Ok sending the link a bit later ☺️', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUNBRTJCOTdCMzFBRjRBMDVCNDRCMTJCMENCMTZDOTMA', 'received', NULL, NULL, '2026-07-31T10:29:41.022Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '43ded48f-4a9f-473d-9c8f-6db1e48152b4', c.id, 'out', 'Which county are we delivering to?', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSMzk5MjgwMEVCMUJGODMwRUQzAA==', 'read', NULL, NULL, '2026-07-31T09:59:24.869Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '40e0d06f-d6e7-421d-85b4-9a523ab2f2c8', c.id, 'in', 'Kiambu', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhggQUMxMDZERTcxMkI1RjdCMjQ5QUU5RDNBQ0JGQTVENDgA', 'received', NULL, NULL, '2026-07-31T09:59:40.982Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e6a66d9c-1e80-4ed5-956c-a777113c0eeb', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSRUIxOTdDREUzQkVCRUNGQjBGAA==', 'read', NULL, NULL, '2026-07-31T12:35:35.696Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7f39ca06-e31f-48fd-8215-e7d3affbfdf7', c.id, 'out', 'Which town or area?', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSQTcyMDQwQzE1MzFGNDUwRjdGAA==', 'read', NULL, NULL, '2026-07-31T09:59:41.145Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8e073037-0541-4a5b-8296-c1c0223b610d', c.id, 'in', 'How it works', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0EyQTU4NDY3RUZBRUFCRjBFM0YA', 'received', NULL, NULL, '2026-07-31T12:36:02.381Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '3465a73c-1fbd-4133-842f-280ea78cd266', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSMjhEOTZBNUUwOTAyMzNFMkVGAA==', 'read', NULL, NULL, '2026-07-31T12:36:03.594Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '51c00ccd-65e7-4dd3-a3fe-3f9366e541e9', c.id, 'out', 'Here is how it works:

1. You send us the link to what you want.
2. We tell you one all-inclusive price in KES — shipping to your door included.
3. You pay by M-Pesa.
4. We buy it, fly it in, and deliver it to you.

No customs paperwork for you, and no surprise charges at the end.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSNzcyQ0FBMTI0QzdFQjdGNTY2AA==', 'read', NULL, NULL, '2026-07-31T12:36:02.732Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd40fd9f7-4925-477c-9729-71b7ace13d83', c.id, 'in', 'Martha  Njuki', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0E4ODU2RkQ1NkU0NEUxNURDREYA', 'received', NULL, NULL, '2026-07-31T12:37:08.339Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e6e8df35-0c7d-4399-b9b5-5a2611f25a40', c.id, 'in', 'Njukimartha@gmail.com', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0E3N0MyNTMwNDVEODlCQTBEQTAA', 'received', NULL, NULL, '2026-07-31T12:37:21.125Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd1674778-53c0-4c5b-b43a-3af0115c38b1', c.id, 'in', 'Yes, go ahead', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0ExQTA4OUMzOEE2RjY3OEJGQTAA', 'received', NULL, NULL, '2026-07-31T12:37:35.431Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'dbbb27d4-c333-44d8-97a4-e051358ee966', c.id, 'out', 'Reply with the code to confirm the address is yours.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSQzA4OTc1REI1NEUxQUI2QjZFAA==', 'read', NULL, NULL, '2026-07-31T12:37:37.783Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f25eff05-3d22-469f-acf0-cec3fcfcfa1b', c.id, 'out', 'Thank you — your email is confirmed.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSQTY1QzA3MUI4MEZCMDVBQkQ3AA==', 'read', NULL, NULL, '2026-07-31T12:37:55.077Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '3dba9d9c-129c-47d7-b0de-e6e472a47940', c.id, 'in', '3666', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0FGNUUwODlBNDhCQzNGNUVGOTEA', 'received', NULL, NULL, '2026-07-31T12:39:09.544Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '74a13edd-c994-4afe-a5e6-4d10f18e8f6f', c.id, 'out', 'Estate or street name?', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSNjkzN0QyRjYyNDJFMTQ4MUM3AA==', 'read', NULL, NULL, '2026-07-31T09:59:58.787Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a2761164-3b05-4506-b537-45b88e046e42', c.id, 'in', 'Empire Arcade', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhggQUNGRjM2QzE3MDE5MDE5RjAyMERBMzFENUNDRTQ1NDMA', 'received', NULL, NULL, '2026-07-31T10:00:24.679Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'fec28472-32c8-45a2-9352-0340bd178a8a', c.id, 'out', 'Hi Emma, how can I help you today?', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSMUE5QjIwRUNEQUE4QzU2N0I2AA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-08T08:03:48.452Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '32b26fcf-e312-4bd5-862b-73c3c2f0231c', c.id, 'out', 'Building and house or door number?', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSMzM0NzkxMDdCMzZCRkYwRUFDAA==', 'read', NULL, NULL, '2026-07-31T10:00:24.857Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8766ce0e-233e-457a-9df2-20f6e515d4ad', c.id, 'in', 'Crest apartment', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhggQUNDNTY2QzgxQ0Y3RTE2Q0JFMTI2QzE2QzQwREVEQ0MA', 'received', NULL, NULL, '2026-07-31T10:00:35.418Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5b01b964-8d30-4067-a60d-88d698440c89', c.id, 'out', 'Anything the rider should know? A landmark, a gate code, a time that suits you. Tap Skip if not.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSOTc4QTNFNEM3REY0QzQxMzc0AA==', 'read', NULL, NULL, '2026-07-31T10:00:35.608Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e3230e3f-ef8e-4309-9e46-e00d3069daeb', c.id, 'in', 'Skip', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhggQUNDQjc1MTg2RDEzNTFEMTQ0M0ZCOERGRDlENENBQTYA', 'received', NULL, NULL, '2026-07-31T10:00:45.632Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ab1a0724-6df8-43ab-a119-9abdd6350507', c.id, 'out', 'Send me the link to what you want. You can paste several at once, or send them one at a time.

Tap Done when you have sent everything.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSRUI3QjcyODQxOEU0MDYzRjhFAA==', 'read', NULL, NULL, '2026-07-31T10:00:46.688Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'afcda6c6-7984-4041-99a7-c6581acd7bc4', c.id, 'out', 'You are all set. I have saved your details, so next time you can go straight to ordering.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSMUQwMzQzRkEwODlFOTAxMTUzAA==', 'read', NULL, NULL, '2026-07-31T10:00:45.915Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '376376ae-554a-412d-bfaa-32ca42daa026', c.id, 'in', 'Back to menu', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhggQUM4MzcyRDIyOEI0QzFBOTQ4MjUzRDFBM0M5N0RDQjcA', 'received', NULL, NULL, '2026-07-31T10:01:04.782Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ac636ac7-88da-40b7-a59e-30e5165d7a49', c.id, 'out', 'I could not find a link in that. Copy the product link from the shop and paste it here.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSM0UxN0ZBODYxREZDRkI0MkE3AA==', 'read', NULL, NULL, '2026-07-31T10:01:04.970Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8d0e94b9-b752-472a-a0d8-a79404f03f3d', c.id, 'in', 'https://amzn.eu/d/07AY44UL', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhgUM0IzMUI2RjU3RkVCREMzMUIxQTkA', 'received', NULL, NULL, '2026-07-31T10:02:42.931Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5052fd48-43d7-4842-8668-fb20fb0cb91c', c.id, 'out', 'That is 1 item so far. Send another link, or tap Done.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSMTJDMDdFRUY5RjZFQ0ZBMzQ3AA==', 'read', NULL, NULL, '2026-07-31T10:02:43.116Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b862c1ca-062a-4b1d-b01f-7d30d01ed338', c.id, 'in', 'https://amzn.eu/d/07gDwWRm', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhgUM0IzN0E4OUVEN0I0MEI2MjExMDgA', 'received', NULL, NULL, '2026-07-31T10:03:42.859Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f6eab12d-89ce-440d-80e9-c8e76d1ad698', c.id, 'out', 'That is 3 items so far. Send another link, or tap Done.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSMDA3QkE0NkE5Q0NBOUY1QzYwAA==', 'read', NULL, NULL, '2026-07-31T10:03:43.061Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'cd5749a0-468c-4b77-ad2a-ee4884f4d645', c.id, 'in', 'https://amzn.eu/d/02Abletq', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhgUM0IzRkZFODE0NzEyRTQwQzczRkMA', 'received', NULL, NULL, '2026-07-31T10:04:53.420Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '06b2b709-fab6-4f43-9176-3472d3245bc7', c.id, 'out', 'That is 4 items so far. Send another link, or tap Done.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSMURDMDM4RDY3M0IwODhCMDUwAA==', 'read', NULL, NULL, '2026-07-31T10:04:53.598Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e2acb349-7b62-42ef-bdda-4d016f38ed9e', c.id, 'out', 'Your quote for order SH-2607-0004 is ready: KES 937.00, all inclusive — delivery to your door included. Reply to accept and pay by M-Pesa.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSRjlFNTQ1MTgxMkVBOEVFQ0IyAA==', 'read', NULL, NULL, '2026-07-31T10:06:51.286Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ba676d0b-abd0-4fd2-b5bf-46078b116efd', c.id, 'out', 'That is 2 items so far. Send another link, or tap Done.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSMzMzNTRBOTYxQkIwMUI1QjU0AA==', 'read', NULL, NULL, '2026-07-31T10:03:07.535Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8ecdc05b-c831-4288-80be-f9c0dd7a31bc', c.id, 'in', 'Okay', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0FEQTg0MjUwMzgyMjBFMEExMUQA', 'received', NULL, NULL, '2026-07-31T10:05:26.851Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '045ad8eb-e288-4f77-ac47-fd6bec4fa828', c.id, 'out', 'Thank you. Looking forward to working together. 
I’m going to reactivate the Ai that handles this conversation. It will request some information from you so that we have your details to make the process smoother.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSRDYzQjFDMTYwMkFGQkREQzE5AA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-07-31T10:35:02.580Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '67622a77-5c4b-4c7b-b721-01ffe203f32b', c.id, 'in', 'Back to menu', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0EyNTcyREM5MjM2MjkxQkYwRjUA', 'received', NULL, NULL, '2026-07-31T12:36:21.459Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '71482415-94f0-4c91-8e8d-3b7ac8d2975d', c.id, 'in', 'Start a new order', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0E2QTUzQ0U5OEVBNURFRDQ2NjkA', 'received', NULL, NULL, '2026-07-31T12:36:29.742Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '270b3b4f-e219-48a4-8f0f-8c24aeecd56c', c.id, 'in', 'fron Australia to kenya', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAEhggQUNEM0Y4RUQ1OTlBNzQwNUNFNkYxRjMwNDhDMjJERkEA', 'received', NULL, NULL, '2026-08-08T08:16:44.850Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '49761e7b-557b-47bf-bba9-c35d30e92110', c.id, 'out', 'What is your full name?', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSRTRERjlFNzIzRDYwODNFMjFBAA==', 'read', NULL, NULL, '2026-07-31T12:36:30.466Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b75dca91-3904-4a9e-b138-2b8fe90609fc', c.id, 'out', 'Please send your full name — first and last.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSQkQ2OUQ0Q0M3NkFCMTc1QkMzAA==', 'read', NULL, NULL, '2026-07-31T12:36:57.022Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e0dc9316-ab34-455d-9ad2-8963be7ade13', c.id, 'out', 'Please send your full name — first and last.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSNkIzRDk4MTk1OEEzNTc1MjkzAA==', 'read', NULL, NULL, '2026-07-31T12:36:44.304Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c4a3ffc6-a572-4a00-be5e-e6f9f31c09d0', c.id, 'out', 'One more thing: may we message you here about your orders, and email you receipts? You can send STOP at any time to end all messages.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSRjc5RENDM0Y5MTA1RjEyNjc1AA==', 'read', NULL, NULL, '2026-07-31T12:37:21.299Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '400a8552-1fed-4a70-af36-fba68696b0cb', c.id, 'out', 'What is your email address? We send your receipts and order updates there.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSNTMxRkM1OUNGQUM1Q0Q5NDIwAA==', 'read', NULL, NULL, '2026-07-31T12:37:08.516Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '6596947d-98d5-460c-ab85-6a2ccb95738d', c.id, 'in', '563994', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0FFNkQxMkFBOTFDNUNDRjAyNzkA', 'received', NULL, NULL, '2026-07-31T12:37:54.821Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '366664bb-e79d-4650-8da7-201c627de085', c.id, 'out', 'Which M-Pesa number should we use for payments? Send it as 07… — it does not have to be this WhatsApp number.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSRDk3OUZCMkNDMjcxMzdFMjREAA==', 'read', NULL, NULL, '2026-07-31T12:37:55.913Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'eb96035b-7ae2-4a3c-bd01-11883fd6243a', c.id, 'in', '0740825215', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0FBQzhFMUVGRDYwQjZERkNENjgA', 'received', NULL, NULL, '2026-07-31T12:38:19.723Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a22526f5-2bc9-49b3-8c85-119b80f30951', c.id, 'in', 'Skip', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0E2NDAwODNGREI3NkExMzI2NTIA', 'received', NULL, NULL, '2026-07-31T12:39:19.012Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '1aec3b01-c97e-4330-aa0a-6c26295e7700', c.id, 'out', 'Send me the link to what you want. You can paste several at once, or send them one at a time.

Tap Done when you have sent everything.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSMDA3NENERDQ0MzlGRDM0QjJCAA==', 'read', NULL, NULL, '2026-07-31T12:39:20.099Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '9e4663a7-ae64-482d-95f5-224a6ee03661', c.id, 'in', 'Done', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhgUM0IyM0UyRjIwQ0JENDk1QzlFRTkA', 'received', NULL, NULL, '2026-07-31T10:04:58.088Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b0c95478-896f-49dc-93e3-6b55e7006946', c.id, 'out', 'Here is your order:

1. amzn.eu/d/07AY44UL
2. amzn.eu/d/09IxaU0L
3. amzn.eu/d/07gDwWRm
4. amzn.eu/d/02Abletq

We will send you one all-inclusive price in KES — delivery to your door included.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSQTMwRTRDMUJGMEFDMjVBN0Y5AA==', 'read', NULL, NULL, '2026-07-31T10:04:58.249Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ee3fb979-9c6d-4010-808d-13d00ac1e429', c.id, 'in', 'Confirm', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhgUM0IzQTczMkM4NjE2MzI1RjI0RDkA', 'received', NULL, NULL, '2026-07-31T10:05:07.362Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '26442d31-dc01-4fc5-87f5-b2b15cc61014', c.id, 'out', 'I have updated the quote for order SH-2607-0004. The new total is KES 951.00, which replaces the figure I sent before. Reply YES to accept and pay by M-Pesa, or say “agent” to talk to a person.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSNTk3MEJEQzU3MEMxMzk5Qjc4AA==', 'read', NULL, NULL, '2026-07-31T10:42:15.856Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b4efb195-77f2-4fc1-a068-a8c8a204d2b2', c.id, 'out', 'Thank you. Our team is pricing your order now and I will message you here with the total.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSODcwQTNBOTQ1QUYyREU2M0Y0AA==', 'read', NULL, NULL, '2026-07-31T10:05:07.745Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '00e94b6c-eaa6-43b0-b94c-15b48739eee9', c.id, 'in', 'YES', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhgUM0I3RTdCRkM2QzQ2QkI2Qzc5NDcA', 'received', NULL, NULL, '2026-07-31T10:42:37.342Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7613d9c0-dc26-44b7-ada0-381806c04e55', c.id, 'out', 'New order SH-2607-0004 from Patience Chepkirui (+254768115922), 4 items. It needs pricing before a quote can go out. Do not reply here — open the dashboard.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMTQ4ODYxMDIyMjc4OTVCMkJFAA==', 'read', NULL, NULL, '2026-07-31T10:05:08.512Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5ffefe00-be87-4bc0-ad3c-2d89a029716d', c.id, 'out', 'Sending an M-Pesa request for KES 951.00 to 0768 115 922. Enter your M-Pesa PIN on your phone to pay. I will confirm here as soon as it goes through.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSNzE0NTkzNEE3NzIxMTIyNTlEAA==', 'read', NULL, NULL, '2026-07-31T10:42:37.967Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '98997b7a-f869-44ea-8e27-0c1ba87353fa', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSMUIxREU2OTIyREQ2QzZCNTMwAA==', 'read', NULL, NULL, '2026-07-31T12:36:21.685Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e3f26341-4475-44a2-b57c-024b23ebf7db', c.id, 'out', 'Before your first order I need a few details: your name, your email, and where we should deliver. Takes about a minute.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSOEU0M0IyRUQ2REM2MkM5MEYwAA==', 'read', NULL, NULL, '2026-07-31T12:36:29.918Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '1b61900f-2b2d-4677-9482-696975c58c27', c.id, 'out', 'I have sent a 6-digit code to njukimartha@gmail.com. It expires in 10 minutes.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSMzVFNTVCQzlDQ0Q5NkY2RkQzAA==', 'read', NULL, NULL, '2026-07-31T12:37:36.929Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '988d5c32-0f57-4dd6-9675-818390918dcc', c.id, 'out', 'Saved. We will send the payment request to 0740 825 215.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSMTRGQUVEODQyNzUyMjNCQzZEAA==', 'read', NULL, NULL, '2026-07-31T12:38:19.933Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '01c48b23-5fc8-4139-ba4e-76dd29edb738', c.id, 'in', 'Nairobi', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0E4NTZCNkM4MzM1Rjc4RTRCMUIA', 'received', NULL, NULL, '2026-07-31T12:38:30.975Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'faf6833f-b300-446a-9aa2-a8644223342a', c.id, 'in', 'Jericho', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0FCODY4OEZEMzE3OUM1QzJEOTEA', 'received', NULL, NULL, '2026-07-31T12:38:46.294Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c9e0ac3f-043e-477f-9862-7d1c2caa28e7', c.id, 'in', 'Shule road', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0EzN0Q3RUE2MTE3NEFGNTU2RkUA', 'received', NULL, NULL, '2026-07-31T12:38:59.022Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7718b835-a0d5-438e-a4de-7c48cbe137ab', c.id, 'out', 'Which county are we delivering to?', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSNjgyOEMwREE3NUFFOEEzNTIwAA==', 'read', NULL, NULL, '2026-07-31T12:38:20.746Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '905fd4b9-f46b-4140-ad29-8035f313bc71', c.id, 'out', 'You are all set. I have saved your details, so next time you can go straight to ordering.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSNzYzRUEwQzdCQUExREE2ODQ3AA==', 'read', NULL, NULL, '2026-07-31T12:39:19.244Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7d69984b-b572-4c9f-8312-9afc443cf5e6', c.id, 'out', 'Which town or area?', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSMzY0QTk1M0UzQkIxNjQwQjk3AA==', 'read', NULL, NULL, '2026-07-31T12:38:31.157Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '39a0d5ce-5f89-40d9-85e6-a44cc17c39ab', c.id, 'in', 'My account', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0E5MEE5MkRFNDQ1Rjg3MDMyQTUA', 'received', NULL, NULL, '2026-07-31T12:40:21.640Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '33dcaf2a-8607-4356-9332-b97ade1d563e', c.id, 'out', 'Estate or street name?', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSMjREM0Y0NENDRTRBQzdERTU3AA==', 'read', NULL, NULL, '2026-07-31T12:38:46.465Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '65c5bd2d-c129-4ca3-8b3d-39e90359205a', c.id, 'out', 'Thanks — one of our team has this and will reply here shortly. No need to send it again.', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAERgSOUNFRjA0NjVFMzc5NzQzRjZCAA==', 'delivered', NULL, NULL, '2026-08-06T06:01:03.695Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0f80bfb4-4be7-4729-9e07-4e2ecf9fc2c5', c.id, 'out', 'Building and house or door number?', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSRkExQzBGMjlDMEE0NDQyMDNBAA==', 'read', NULL, NULL, '2026-07-31T12:38:59.193Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '35536dee-72a4-4cb4-bded-80656e5d07aa', c.id, 'out', 'Anything the rider should know? A landmark, a gate code, a time that suits you. Tap Skip if not.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSQkI3RjIzOTBFMjgyODg5RDRDAA==', 'read', NULL, NULL, '2026-07-31T12:39:09.717Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '20de2b17-ef26-4fe3-a352-1cc981da8534', c.id, 'out', 'Sending an M-Pesa request for KES 951.00 to 0768 115 922. Enter your M-Pesa PIN on your phone to pay. I will confirm here as soon as it goes through.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSQTc2QzU2RTI5M0Q4MDdDQjdEAA==', 'read', NULL, NULL, '2026-07-31T13:15:27.493Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5571df86-ee76-4b86-8e5f-92007b332dca', c.id, 'out', 'Here is how it works:

1. You send us the link to what you want.
2. We tell you one all-inclusive price in KES — shipping to your door included.
3. You pay by M-Pesa.
4. We buy it, fly it in, and deliver it to you.

No customs paperwork for you, and no surprise charges at the end.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSRTJCQjRCMzMyQ0UzQjNCRDI1AA==', 'delivered', NULL, NULL, '2026-08-06T08:21:45.720Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'dc70f10d-aeba-4457-b1c6-3290fc82bdd8', c.id, 'out', 'I could not find a link in that. Copy the product link from the shop and paste it here.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSMDBDRkZCRUQzM0U4NzRGRkJDAA==', 'read', NULL, NULL, '2026-07-31T12:40:21.824Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '99e83d4a-f199-4e53-91a2-19497e4419c6', c.id, 'in', 'Accept and pay', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhgUM0IwRkYzNkRGNjYyQTdFNUJEQTMA', 'received', NULL, NULL, '2026-07-31T13:15:26.652Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5b8236ae-edc1-4ec7-b3f1-b86b0a39c3c0', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSMUZGRjE1NzQ1NEEwQjdGRDREAA==', 'delivered', NULL, NULL, '2026-08-06T08:21:46.406Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ace5bbe9-7da3-4b4a-bb30-ee4120e749d1', c.id, 'in', 'Back to menu', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUNBQTY3MDg0MUNBREEwNjY3MkUwNjU0RjM4MkZCRkMA', 'received', NULL, NULL, '2026-08-06T08:23:22.352Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'bb5f4781-313d-47a4-aacf-9780847385ef', c.id, 'in', 'Track my order', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0FBQkE1NjJCRTcxMzY4RjU4RjgA', 'received', NULL, NULL, '2026-07-31T12:39:51.851Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a44a983f-17af-42f1-9511-6af636b31f29', c.id, 'out', 'I could not find a link in that. Copy the product link from the shop and paste it here.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSRjExRUE3OUQ5OTg2NjE1MkZBAA==', 'read', NULL, NULL, '2026-07-31T12:39:52.024Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f59f7f15-c1ef-470f-96bc-903fb335eca5', c.id, 'in', 'Talk to a person', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0E2MzI1OUQwQjIxRTIxNTRCREMA', 'received', NULL, NULL, '2026-07-31T12:40:35.040Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '51a75ee6-9f13-4fd5-82c4-9f7ce925774c', c.id, 'out', 'I could not find a link in that. Copy the product link from the shop and paste it here.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSNzFGREFBMkIzQzM5MEIyQzUzAA==', 'read', NULL, NULL, '2026-07-31T12:40:35.211Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '6c607685-ea13-4e3f-82e3-b77337c127f1', c.id, 'out', 'I could not find a link in that. Copy the product link from the shop and paste it here.', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAERgSNEZFQkY1NDQ1MTNBQjgyNDc3AA==', 'read', NULL, NULL, '2026-07-31T14:25:11.544Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ea59855d-a456-4b12-8729-4f72b8128c6f', c.id, 'out', 'A reminder about order SH-2607-0004: your quote is KES 951.00, all inclusive — delivery to your door included. Tap below to pay by M-Pesa, or reply ACCEPT.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSMUMyQjFCNDIzNzM4QkIxQzU3AA==', 'read', NULL, NULL, '2026-07-31T12:48:55.253Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7e6fdea9-3df6-42d4-bdb1-bbef7083eb9a', c.id, 'in', 'Talk to a person', NULL, 'wamid.HBgMNDQ3NDA0NDgzNzU3FQIAEhgUM0E3OTJBM0M0MUNGMUU4QTRBRTkA', 'received', NULL, NULL, '2026-07-31T14:25:11.037Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447404483757'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0d328ba4-aea8-44d3-aa36-0b988b0db3fe', c.id, 'in', 'https://onelink.shein.com/45/5xglxfq5z4uq?shc=2_RXCR2ArRnFk', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUMwNjk4NEVDMEVENTM2RTEzNTdFMUFDQzYyM0I2QzIA', 'received', NULL, NULL, '2026-07-31T19:40:17.971Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '17fbaf29-fed6-43a5-b2d5-fb0bafff23d8', c.id, 'out', 'Got it — I have saved that item.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSNTVDNENCOTg5OUZGMDU3NTIyAA==', 'delivered', NULL, NULL, '2026-07-31T19:40:18.503Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '1b7ce6ea-1aa3-4921-836d-204053be77fa', c.id, 'out', 'Before your first order I need a few details: your name, your email, and where we should deliver. Takes about a minute.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSQTUwMzBGMTBCODc5MjdGRTQzAA==', 'delivered', NULL, NULL, '2026-07-31T19:40:20.126Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '59dc782e-a92f-495a-955b-8a6d5492e594', c.id, 'out', 'What is your full name?', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSNDRCMzY5RDFGRTJDQTAxNDJFAA==', 'delivered', NULL, NULL, '2026-07-31T19:40:20.805Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '90b655ba-326a-428b-852e-d61e8df838e8', c.id, 'in', 'Brenda Njiru', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUNCNDdGREE4MUU2RkE1MDc2NjBDNDNGNEE4MjU4NzQA', 'received', NULL, NULL, '2026-07-31T19:41:06.292Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '29e48124-f0ae-4612-9c56-5fc8998b30a9', c.id, 'out', 'What is your email address? We send your receipts and order updates there.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSMjc4REUwREVCNkJCN0IxODVCAA==', 'delivered', NULL, NULL, '2026-07-31T19:41:06.454Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '465030a7-aa01-43f7-a06c-c1cca09ab4d9', c.id, 'in', 'brendafifi7@gmail.com', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUMwOTdGRTBFNTlCRkVENTUyRUUyQjE4MDg4NzRDQzQA', 'received', NULL, NULL, '2026-07-31T19:41:16.943Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '01b4d257-72b5-4aaf-9cc2-18ab284bc6a1', c.id, 'out', 'One more thing: may we message you here about your orders, and email you receipts? You can send STOP at any time to end all messages.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSNDc3N0M1Q0E1RjE5MEE4NzBEAA==', 'delivered', NULL, NULL, '2026-07-31T19:41:17.230Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'bfeec88d-931e-4d68-af12-ae7c386c51e0', c.id, 'in', 'Yes, go ahead', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUNGNTFGMzhFNUFENEVDQ0NEODJEQUNDQjA4MjQ0QzEA', 'received', NULL, NULL, '2026-07-31T19:41:25.473Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '14912044-757d-4e25-be2d-d126d231fe33', c.id, 'out', 'I have sent a 6-digit code to brendafifi7@gmail.com. It expires in 10 minutes.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSREUyMzUyMzJBN0IwNTg1MkEwAA==', 'delivered', NULL, NULL, '2026-07-31T19:41:26.930Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ca946a0a-df04-40bc-9d77-89a94821731e', c.id, 'out', 'Reply with the code to confirm the address is yours.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSNTFFRDYxMzYwNURERUMwQkFCAA==', 'delivered', NULL, NULL, '2026-07-31T19:41:27.722Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a0b7c72d-3f5f-4be0-a20d-288337df8b9a', c.id, 'in', '128356', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUNFMkE4MkUzQkMxNjhCN0Q3NkEzRDYyNUUxNTc3RDEA', 'received', NULL, NULL, '2026-07-31T19:42:10.850Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '189d58a4-002e-48ae-9eb1-cf0b6337b516', c.id, 'out', 'Thank you — your email is confirmed.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSNzNFN0EzOEY4MzM2RDJGMjU2AA==', 'delivered', NULL, NULL, '2026-07-31T19:42:11.137Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '45af2b84-306b-4815-82df-27c58835f32b', c.id, 'out', 'Which M-Pesa number should we use for payments? 0711 303 720? Tap below to use it, or send a different number.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSNDg1ODQ4MDdEMDc2NTc1NUZEAA==', 'delivered', NULL, NULL, '2026-07-31T19:42:11.791Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'eb421b1e-6157-4526-8ca5-f480f84820d9', c.id, 'in', 'Use this number', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUM3REU3Mzc4NjRBOUQyMjU2MzgyNUM0NDUyQjRFREMA', 'received', NULL, NULL, '2026-07-31T19:42:19.379Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '65a7ec0a-80c9-451b-a756-cb24e87c2441', c.id, 'out', 'Saved. We will send the payment request to 0711 303 720.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSMDcyMDYzNTI3QjBCNjNGMzhFAA==', 'delivered', NULL, NULL, '2026-07-31T19:42:19.564Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '6d382add-5984-438a-b28b-bf0d3f7277ac', c.id, 'out', 'Which county are we delivering to?', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSRTU1RDkxMUUzNTU3QTY2Mjc3AA==', 'delivered', NULL, NULL, '2026-07-31T19:42:20.515Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '570970c2-d64e-451c-b52d-a429d83ea720', c.id, 'in', 'Kisumu', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUNGMDU3MEI4MjkwNUJBNTczREQ2ODExOTFFNTNERjIA', 'received', NULL, NULL, '2026-07-31T19:42:35.171Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '569d0cee-2d9c-41b5-94b0-849afa1dd88e', c.id, 'out', 'Which town or area?', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSNDc2NzFCNEVGMzZBODdBQ0NCAA==', 'delivered', NULL, NULL, '2026-07-31T19:42:35.336Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '23fef7d1-585e-42f9-982d-8b9379b25040', c.id, 'in', 'CBD', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUM2RjlBMkRGNEU4MThBNzVEMTE2QkQ2NzlEOUQxMjAA', 'received', NULL, NULL, '2026-07-31T19:42:46.572Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b5d45074-52a4-49be-83fe-4b4963c0a82c', c.id, 'out', 'Estate or street name?', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSM0NERkM3RkREODA2ODBGOEFEAA==', 'delivered', NULL, NULL, '2026-07-31T19:42:46.736Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'fb7ffc7a-15c6-4969-85f4-0b94bc6d9cef', c.id, 'in', 'Achieng'' Aneko road', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUNCRDBDNUY3N0ZCN0I5NUM2OTBGMjNFQzE1NzY4MjIA', 'received', NULL, NULL, '2026-07-31T19:44:02.250Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'cf5070c0-7939-4896-878d-7e46692cede1', c.id, 'out', 'Building and house or door number?', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSODY0QUJGQjA3OTQ0RjBFNDVEAA==', 'delivered', NULL, NULL, '2026-07-31T19:44:02.413Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '1ce58343-4329-4e69-a279-ca526dcdc7b8', c.id, 'in', 'Prosperity House', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUMxMzIxNDY1RkEyMzUwRDI5MDI1MDUwNTFCMjA5NjIA', 'received', NULL, NULL, '2026-07-31T19:44:19.129Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '09a2a780-493d-43fe-8b71-4decbc8ecd82', c.id, 'in', 'Okay', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0FCQUVENzZERkFDRTY5RDRBMUQA', 'received', NULL, NULL, '2026-08-01T06:17:33.531Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'fa7be1d5-a0a3-45f3-ac49-739b1906d358', c.id, 'out', 'I’ll place your order in a few minutes and you’ll be getting updates on your order from this number. Thank you for doing business with us, we really appreciate you.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSMUUxNzNCRkM3OUMyQTgzN0Y3AA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-01T06:15:38.853Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2074898c-fbe3-41af-b8ac-97a6d1818d9c', c.id, 'out', 'Anything the rider should know? A landmark, a gate code, a time that suits you. Tap Skip if not.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSOTBEMDIyQzRBM0QwQTQ4NjdGAA==', 'delivered', NULL, NULL, '2026-07-31T19:44:19.285Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '436f28c1-a9c0-42ca-bb6b-3eafcb1a5058', c.id, 'in', '1.24kg', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAEhggQUNGNUQ3QTA0NzcyQ0M5NjNENTZBNzc1RjE1RkRENEMA', 'received', NULL, NULL, '2026-08-08T08:17:26.550Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7f672489-1e1d-4ce2-8c44-4fb096e17fcc', c.id, 'in', 'Are you still doing free shipping?', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUM2QUJFOURCQjMwOEI5QzRFMzFBMzk4N0I1OTU2MjgA', 'received', NULL, NULL, '2026-08-06T08:22:10.758Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0390b9e7-6214-4934-9231-00b276a4c574', c.id, 'out', 'Sorry, I did not get that.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSN0ZBREUyQTgzMjAxNjcwQTFBAA==', 'delivered', NULL, NULL, '2026-08-06T08:22:10.971Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '6a44c977-95c2-48ee-8f9d-07613d72bd19', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSM0Q5RTRFMjZDODc3N0NCOTdCAA==', 'delivered', NULL, NULL, '2026-08-06T08:22:11.568Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '3ec49744-075a-44cb-9a01-14f619cea280', c.id, 'in', 'Start a new order', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUMxNDlGQzlDQzg0OEZDRkQ2RkE5QjRDQzFFMTQ2RjYA', 'received', NULL, NULL, '2026-08-06T08:22:19.031Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '41a4e714-b782-4bff-be8f-0947a850e711', c.id, 'out', 'What is your full name?', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSOEY1MUJCNkQwRDQ5OUQwRkEzAA==', 'delivered', NULL, NULL, '2026-08-06T08:22:19.769Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd1bf73b3-8df1-414f-bbf0-ceb70d6d6a64', c.id, 'out', 'Before your first order I need a few details: your name, your email, and where we should deliver. Takes about a minute.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSREI2OTYxQjhERUM0OEU2ODdEAA==', 'delivered', NULL, NULL, '2026-08-06T08:22:19.198Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'bfef9632-7678-4980-bfb2-cb4a8fbad3f2', c.id, 'in', 'Elma Cherotich', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUM2Nzk5RDhGMEExRjI3MUMwRERBQ0UxQ0E4NkUyMzgA', 'received', NULL, NULL, '2026-08-06T08:22:30.433Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7773fa15-ef62-46dd-8cd1-c63ea0204b17', c.id, 'out', 'What is your email address? We send your receipts and order updates there.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSNjRBNjA3OTdBMDM0QzZDNUE1AA==', 'delivered', NULL, NULL, '2026-08-06T08:22:30.623Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f1fc61d3-450f-460b-8ccf-bc0c1d932797', c.id, 'in', 'Is this a bot?', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUMzMTkwRkQ0QzhBNDMxMjEyQ0Q1MEQ0QzgyMzYxQTUA', 'received', NULL, NULL, '2026-08-06T08:22:46.791Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7e37811c-9699-4ceb-9815-33a2a7a2e42b', c.id, 'out', 'That does not look like an email address. Please check and send it again.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSMjYzMDQyMjM4NUI0NDIwNkQzAA==', 'delivered', NULL, NULL, '2026-08-06T08:22:46.957Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '734fb3cb-e196-4f38-a313-b68c8fd98b50', c.id, 'in', 'Talk to a person', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUNGQjlBMTYzMDBERTI0QUIxRDI4QjY0QTlDRkE5QTkA', 'received', NULL, NULL, '2026-08-06T08:23:28.207Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2a54ef46-c83e-4e60-a8a5-f6e08b556c8c', c.id, 'out', 'No problem — I am getting a person for you. Someone from our team will reply here shortly.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSRTQwN0RFOTcwOThEQTkxRDIyAA==', 'delivered', NULL, NULL, '2026-08-06T08:23:28.374Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '4b079707-4d2a-49a5-ac42-bbb6e7e1794d', c.id, 'in', 'Okay', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUM0RDI1MUQ5MzRERTA1OENGNDJGRUJBRTlFNUEwMkQA', 'received', NULL, NULL, '2026-08-06T08:23:35.719Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'fb9b3bff-0aaf-4592-918d-6df27cb8c3d3', c.id, 'in', 'Skip', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUM1N0NFOTkxNTI3NDhCOUM1RDk1OTlCMUUyNkE0MkUA', 'received', NULL, NULL, '2026-07-31T19:45:55.731Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '9cfeeb9b-7d51-4517-8964-19dabc8c30c6', c.id, 'in', 'Hey sasa', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUMyQTQwN0M0MkRDMzM5QTI4NjQ2M0VEMkRCMTE3M0UA', 'received', NULL, NULL, '2026-08-06T08:20:59.861Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '72c3ae13-fcdb-4c7c-8503-2071ea5494ac', c.id, 'in', '068034', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAEhgUM0E4RjYwMjkyMUYxNEREMUM4QTMA', 'received', NULL, NULL, '2026-08-08T07:59:35.553Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '15f1130c-4962-480a-96cf-b6c87b3aa03f', c.id, 'out', 'That is 1 item so far. Send another link, or tap Done.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSNTZFNjI3ODdEMjYyMTQwMTkwAA==', 'delivered', NULL, NULL, '2026-07-31T19:45:56.665Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a2c4ef84-c7c7-4e84-a033-cde85074f87f', c.id, 'out', 'You are all set. I have saved your details, so next time you can go straight to ordering.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSRUM2Q0IwQUUyRTg1REEwNDBFAA==', 'delivered', NULL, NULL, '2026-07-31T19:45:55.951Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '1fe4bdeb-c7ba-48de-89a5-0deed46303b5', c.id, 'in', 'Done', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUNERDAwNjNFQzUxQUM0NDkzOTFBRTdCRTA5MTQwRDkA', 'received', NULL, NULL, '2026-07-31T19:46:23.220Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '4e2b26c5-4e93-4396-b640-4c23ead58cb9', c.id, 'out', 'Here is your order:

1. onelink.shein.com/45/5xglxfq5z4uq

We will send you one all-inclusive price in KES — delivery to your door included.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSRDMwRTE1N0EyQTMyQTY5N0Q4AA==', 'delivered', NULL, NULL, '2026-07-31T19:46:23.379Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '196aa5eb-eba4-45f0-8e74-056107e710c8', c.id, 'in', 'Confirm', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUNEM0E2RTI5OTU0RTM4OTU0OTFBMjExNDIxRTQ2RDYA', 'received', NULL, NULL, '2026-07-31T19:47:32.496Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '285440f1-5f24-4d96-bd38-90384707aaf7', c.id, 'out', 'Thank you. Our team is pricing your order now and I will message you here with the total.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSQTlDMzIxRUY4QzMxMDAwODFBAA==', 'delivered', NULL, NULL, '2026-07-31T19:47:32.776Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'fc81f16b-1410-4ae7-8aa9-e8014730013b', c.id, 'out', 'Your quote for order SH-2607-0005 is ready: KES 6486.00, all inclusive — delivery to your door included. Tap below to pay by M-Pesa, or reply ACCEPT.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSOTJCMzYyQkE3RTdGODA3ODdDAA==', 'delivered', NULL, NULL, '2026-07-31T21:02:15.406Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5b489f0a-ae0e-4346-9f2e-81dfb19ea831', c.id, 'out', 'New order SH-2607-0005 from Brenda Njiru (+254711303720), 1 item. It needs pricing before a quote can go out. Do not reply here — open the dashboard.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSRDg4Q0E2RkIzNjE1QzJGREVEAA==', 'read', NULL, NULL, '2026-07-31T19:47:33.577Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'da0b1ffb-2b26-4242-aa0f-aabb912e5279', c.id, 'in', 'Okay', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0FEQUZFRjQxRDM4RTkzMzFFODIA', 'received', NULL, NULL, '2026-07-31T21:05:03.849Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '113fb54f-be0b-4164-b21c-8a48c909e157', c.id, 'in', 'Good morning Sir', NULL, 'wamid.HBgNMjM0ODAzNTA2MjQ1ORUCABIYIEFDMDc4MTMyNzVGMjIwQkZFQ0QxMzExMTM4MjIzRDU2AA==', 'received', NULL, NULL, '2026-08-01T06:04:31.197Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '2348035062459'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '189c957f-6c6d-4860-8924-c46444a3afdf', c.id, 'out', 'Once your order arrives in Nairobi, we’ll inform you and send it to your address.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSN0EyRUM1NzJBMDUwNkIwRjk3AA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-01T06:19:01.149Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5852e91f-37a4-424d-a76b-ab751c1ef637', c.id, 'out', '[quote_ready] CHARLES NG’ANG’A KIBUGI · SH-2607-0002 · 16257.00', 'quote_ready', NULL, 'failed', '{"code": "EXTERNAL_SERVICE", "name": "ExternalServiceError", "details": {"metaCode": 132001, "fbtraceId": "Ah0WIlLvZ5PP-TIKEXkscQl", "httpStatus": 404, "deliveryUncertain": false}, "message": "(#132001) Template name does not exist in the translation (template name (quote_ready) does not exist in en) [code 132001]", "retryable": false, "statusCode": 502}', NULL, '2026-08-01T06:23:36.963Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '84c43592-72ed-421a-bdd9-e011458fca07', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgNMjM0ODAzNTA2MjQ1ORUCABEYEjQ1QzQzNTdBMjRDNDNFRjZCNQA=', 'read', NULL, NULL, '2026-08-01T06:04:31.728Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '2348035062459'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '96c2e540-c4f9-49af-a394-8b1b9e45e808', c.id, 'in', 'Accept and pay', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUMwNjExRjBCMTQ2ODcxRjNDODhFMzcyRTAwOUQzQTkA', 'received', NULL, NULL, '2026-08-01T06:09:40.390Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '6fae4e41-1c84-4bb0-b833-c625978b29bc', c.id, 'in', 'Are these automated messages?', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAEhgUM0E0MzJEQUEyQjQ4QTUxM0NFMzUA', 'received', NULL, NULL, '2026-08-06T10:44:54.758Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'cf7b3a97-55f1-42fe-964c-c9f7e2c03d47', c.id, 'out', 'Sending an M-Pesa request for KES 6486.00 to 0711 303 720. Enter your M-Pesa PIN on your phone to pay. I will confirm here as soon as it goes through.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSNUQwRTEzOUEzOEMyN0M1RDMyAA==', 'delivered', NULL, NULL, '2026-08-01T06:09:40.926Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e991e7b9-3e9e-4944-a192-04af56f78fe0', c.id, 'out', 'Thank you — we have received KES 6486.00 for order SH-2607-0005. We are buying your items now and will keep you posted here.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSMzA2REE5MDI0MTJCQTNENTI3AA==', 'delivered', NULL, NULL, '2026-08-01T06:10:04.786Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '4d1eb740-e938-4f44-a25d-c7e5d9676f3e', c.id, 'in', 'Alright', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUNDRjgyQ0VEQUVDMEU4RDU5RTJCNEI3M0I4RTA1QUIA', 'received', NULL, NULL, '2026-08-01T06:10:47.283Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '76093ae5-688b-41a5-a614-b839276d7618', c.id, 'out', 'Sorry, I did not get that.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSN0U3QkVGOUYwNzBCMzJDNTExAA==', 'delivered', NULL, NULL, '2026-08-01T06:10:47.492Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '3c862171-7cf3-4f0c-9720-c536fc16f59c', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSMUFBRTRCNDFFQjEyQkRGNEUyAA==', 'delivered', NULL, NULL, '2026-08-01T06:10:48.195Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2f0c0a43-7bb4-4e32-a037-3ea8ca627412', c.id, 'in', 'Talk to a person', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUNERENBMTZCNUY5MjY2MEIyMkYxRDY2QkI5Q0YyQTMA', 'received', NULL, NULL, '2026-08-01T06:10:57.591Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '9566e268-c0c0-4347-b916-7fbc6fb9d676', c.id, 'out', 'No problem — I am getting a person for you. Someone from our team will reply here shortly.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSNzk3MTNDRUJEOTA4MjY0NUY2AA==', 'delivered', NULL, NULL, '2026-08-01T06:10:57.784Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ba6bbf4c-4c11-4c76-b135-c2841dd6571d', c.id, 'in', 'Okay', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAEhgUM0ExQkMwM0Y2OUY1OEE3MENGMzcA', 'received', NULL, NULL, '2026-08-03T09:31:54.001Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '02f1426f-7c1c-4623-b316-f01e0d8ea303', c.id, 'out', 'Hi, we have received your payment and will place your order shortly.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSNTRBNEVBMkE2NTE1NThFODFEAA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-01T06:12:11.425Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '365b63e2-feb6-474c-94d3-d9b2b43f9bf9', c.id, 'out', 'How can I help?', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSNDRCNTRCMTBGNTA0MkQ2OUFFAA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-01T06:12:43.632Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f96ee25d-8daf-479d-a833-2a401fd085fb', c.id, 'in', 'What''s the process from now onwards? ☺️', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUM1OUZBODQ5QjVFNURCMDA1NDhBQ0YwQUZFNUE0REQA', 'received', NULL, NULL, '2026-08-01T06:13:41.328Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '1d1e0483-c5d3-4d1a-a820-78e101e79026', c.id, 'out', 'A customer needs a person. Brenda Njiru (+254711303720) said "Talk to a person", and the bot has stopped replying — the thread is waiting in the inbox. Do not reply here — open the dashboard.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSRjY1NDlBM0EzN0IyRUU4MTFFAA==', 'read', NULL, NULL, '2026-08-01T06:10:58.509Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '6aaaa07b-fb65-40f6-8324-92b7564a1e6b', c.id, 'in', 'That''s okay. I''ll be waiting☺️', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUNFQkU5OTMzMUVDMjFDNzBCNUMxMDhDMjk4RjE2MzIA', 'received', NULL, NULL, '2026-08-01T06:29:53.081Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7ea7d71e-ebdd-4dab-b1b4-4817466b47d5', c.id, 'in', 'Start an order', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUM3OUU1REQ5QzZCRjc2REE3RjMzMzM1Q0JBNzkxM0YA', 'received', NULL, NULL, '2026-08-06T08:23:19.285Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '03509b7f-a60e-4316-a826-ec2cc4effce7', c.id, 'out', 'Awesome', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSOUQ5RTMyRTk5MEUyMDE2QjFCAA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-01T06:30:32.931Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e6f6c6d2-6c73-45cc-a111-26d5c4bf4b57', c.id, 'out', 'Brenda Njiru (+254711303720) has been waiting 10 minutes for a reply and just said "That''s okay. I''ll be waiting☺️". Nobody has the dashboard open. Do not reply here — open the dashboard.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSNjhGN0VBMjgzRjcyOUVFOTk3AA==', 'read', NULL, NULL, '2026-08-01T06:29:53.403Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e1c4cb80-4917-43af-8866-a540c7103d33', c.id, 'out', '[quote_ready] CHARLES NG’ANG’A KIBUGI · SH-2607-0002 · 16257.00', 'quote_ready', NULL, 'failed', '{"code": "EXTERNAL_SERVICE", "name": "ExternalServiceError", "details": {"metaCode": 132001, "fbtraceId": "AsBR0AwjgVpq-VGZ7a03bEn", "httpStatus": 404, "deliveryUncertain": false}, "message": "(#132001) Template name does not exist in the translation (template name (quote_ready) does not exist in en) [code 132001]", "retryable": false, "statusCode": 502}', NULL, '2026-08-01T07:07:15.330Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f11f82fb-701e-4d9e-895a-af6f5fef33d2', c.id, 'in', 'Hey', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0E2RjU2QjY5MUNGQzdGRENDNzcA', 'received', NULL, NULL, '2026-08-01T16:53:31.332Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f478574d-6c9e-44a1-baf0-0a41323b8b2e', c.id, 'out', 'That does not look like an email address. Please check and send it again.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSRTBDNERCMTI0RDg0RkFDMDJBAA==', 'delivered', NULL, NULL, '2026-08-06T08:23:19.577Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '624acb37-af3e-48d0-972d-ba9b6a8b81c7', c.id, 'out', 'Your quote for order SH-2608-0001 is ready: KES 15,275, all inclusive — delivery to your door included. Tap below to pay by M-Pesa, or reply ACCEPT.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSRDgwRUNCQzg3QkQ0MzNFQjBCAA==', 'read', NULL, NULL, '2026-08-01T16:57:14.236Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '09cf1f8d-63e1-43fd-8cdd-a7dbfb3de1e3', c.id, 'in', 'Track my order', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0E0NkVDNkVFMjk4MTgzODU4QzgA', 'received', NULL, NULL, '2026-08-03T09:32:30.570Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '629aefed-e072-4ce2-a6eb-158ccfe1f4be', c.id, 'out', 'Sorry, I did not get that.', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAERgSQjVEOTAwNzNDRjhBRTQyMzE0AA==', 'read', NULL, NULL, '2026-08-05T16:25:53.072Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '06677e70-aa70-4036-bdc5-7fffeab2389c', c.id, 'out', 'I’m not in the best position for this. I will reach out later', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAERgSNkJEM0I4QTIyOEM3MzRENTg4AA==', 'read', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-05T16:23:57.950Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c53c7bb3-7b2a-4de0-ab91-d3832364e450', c.id, 'out', 'Hi, your order was placed and we are waiting for delivery from SHEIN.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSRkM5NzVFMDc4MjQ4OEM2MEQzAA==', 'read', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-03T09:33:45.475Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '05c2164b-eaae-4694-8562-772383e6bac5', c.id, 'in', 'Tracking', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0FBQUNGNjBBN0JBQkMxREEzM0UA', 'received', NULL, NULL, '2026-08-03T09:34:18.761Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd7e30579-dbd5-4ea3-8cc8-b32ce493b137', c.id, 'out', 'Brian Mwarari (+447424531483) is waiting for a reply and just said "Okay". Nobody has the dashboard open. Do not reply here — open the dashboard.', NULL, 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSODkyRUU5ODRCRDI3MjMzNUJBAA==', 'read', NULL, NULL, '2026-08-03T09:31:54.217Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f9dfb180-1fc6-4d75-8f58-59ff81be60fb', c.id, 'in', 'Huh ok', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAEhgUM0E4Q0NBNzk1RjY1OTMyMjg3NUEA', 'received', NULL, NULL, '2026-08-05T16:25:52.901Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7305c3fc-9624-47ab-8abc-09698740b9e3', c.id, 'out', 'Welcome back. What would you like to do?', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSODMyRTcyMjA2QkI1OUQ0NjZCAA==', 'read', NULL, NULL, '2026-08-01T16:53:31.733Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0e1fa966-38b1-4eba-be45-7bc6c9e2d094', c.id, 'in', 'Start a new order', NULL, 'wamid.HBgNMjM0ODAzNTA2MjQ1ORUCABIYIEFDNzE0M0E3MjUyODk1QUMwMEVGRUIzNEI0M0FDRkQzAA==', 'received', NULL, NULL, '2026-08-03T09:02:43.085Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '2348035062459'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'efac12bd-3d13-436e-8715-1b3854bb1bbd', c.id, 'in', 'yes its a macbook', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAEhggQUNBREI0Q0U5QUI2RTYxQTFBMjMxQjJBNDlBRTMyMDcA', 'received', NULL, NULL, '2026-08-08T08:24:23.053Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '34f0781c-645b-4803-bfa9-d9f273cf299b', c.id, 'out', 'Does the package contain any batteries or hazardous materials?', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAERgSOTA4MjFEMTEzRjk4MUUwRjM3AA==', 'read', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-08T08:19:59.643Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a59d1c21-51a3-41ed-b765-66e132bac95e', c.id, 'out', 'Welcome back. What would you like to do?', NULL, 'wamid.HBgNMjM0ODAzNTA2MjQ1ORUCABEYEjIyRDc2RDM1MjFENEI2NjEzRAA=', 'read', NULL, NULL, '2026-08-03T09:02:43.699Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '2348035062459'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8bdfcc5f-8e80-4886-82f2-76959fae6ada', c.id, 'out', 'Hi, we have bought your items and they have moved to the next step of the process. We will keep you updated. Thank you so much for trusting us with your order.', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAERgSRUU2Q0EyRDI5RTYzNDFBMjUwAA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-01T17:07:34.322Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '581c983d-2d8a-46ea-bbb1-4f8cd27b6500', c.id, 'out', 'Hi, we have bought your items and they have moved to the next step of the process. We will keep you updated. Thank you so much for trusting us with your order.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSMUI3RTlFNzhCRDI0QjY2RTY0AA==', 'read', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-01T17:07:05.347Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '07739c20-4263-4ef3-a896-2fbaeac08c8f', c.id, 'out', 'Thank you — we have received KES 15,275 for order SH-2608-0001. We are buying your items now and will keep you posted here.', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAERgSNTUxNEZCQTMyNTUxMjQxNkVDAA==', 'read', NULL, NULL, '2026-08-01T16:58:49.048Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'cec1a296-972d-41c3-824f-aae24cf5a881', c.id, 'in', 'Thank you for the update!', NULL, 'wamid.HBgMMjU0NzExMzAzNzIwFQIAEhggQUM3QzgzNkNCOUZFRTI4MTI3ODVEODRDRDlCM0VFOTQA', 'received', NULL, NULL, '2026-08-01T17:22:59.926Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '16bf362a-460d-4519-a522-ba916cc8780c', c.id, 'in', 'Hello', NULL, 'wamid.HBgMMjU0NzUxMjc1ODcxFQIAEhgUM0FEQUY1QTk3QUFCQzE2REQ3RkMA', 'received', NULL, NULL, '2026-08-03T09:31:17.350Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '1dd7b2bf-4cdd-4643-a498-4abbc950b26e', c.id, 'in', 'Hi', NULL, 'wamid.HBgMMjU0NzAwNzI4ODI3FQIAEhgUM0E4M0MwODdCNjU5QjAwMEU0QUIA', 'received', NULL, NULL, '2026-08-04T06:32:01.306Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700728827'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2a128695-841f-450a-b693-3e9a9ea4b950', c.id, 'out', '[staff_alert] Still waiting for a reply — CHARLES NG’ANG’A KIBUGI (+254751275871) · CHARLES NG’ANG’A KIBUGI (+254751275871) has been waiting over 40h for a reply and just said "Hello". Nobody has the dashboard open. Do not reply here — open the dashboard.', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSRjBEOTUwMDYwNzc4REIyRDkzAA==', 'read', NULL, NULL, '2026-08-03T09:31:17.930Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a31ce9d5-964f-4338-bfb7-4ec062da0782', c.id, 'out', 'Do we know each other?', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAERgSRjAyNzg2MEEzRTM1QzEwNUJGAA==', 'read', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-05T16:20:42.905Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0739804b-4e2d-45ee-802a-1d389ca20fe6', c.id, 'in', 'Yes
I just need an answer 
Why did you ghost me
What did i do🌝', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAEhgUM0E5NEY5MTA5MEM1RUI1NDUwRkQA', 'received', NULL, NULL, '2026-08-05T16:22:02.123Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '686ed3d3-67a3-47a1-8c4b-e2cf4bdb3d27', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMMjU0NzAwNzI4ODI3FQIAERgSOTk1RDBFQzZDQkFCMDUxNjExAA==', 'delivered', NULL, NULL, '2026-08-04T06:32:01.854Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700728827'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'bfa1a74b-bb3b-4c94-ad81-fdd068de4248', c.id, 'in', 'Hi', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAEhgUM0E3MDRFOTcyM0U5N0JBQTY3MDAA', 'received', NULL, NULL, '2026-08-05T16:07:01.118Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '06f2f358-fd16-4202-a4f5-82dd50a418c3', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAERgSQTc3MDc5RDU0N0ZCMDM4QUREAA==', 'read', NULL, NULL, '2026-08-05T16:07:01.769Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '316bb910-a46e-4c56-94d3-b9d73029bd59', c.id, 'in', 'Talk to a person', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAEhgUM0FCQjYzQTgzQzlGN0ZDOTJCMUYA', 'received', NULL, NULL, '2026-08-05T16:08:27.043Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '52642f81-ad59-46dc-944e-904c17c8d312', c.id, 'out', 'No problem — I am getting a person for you. Someone from our team will reply here shortly.', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAERgSOUY4QjhCN0MyRjFGQzcwNDM0AA==', 'read', NULL, NULL, '2026-08-05T16:08:27.230Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a94d6cb8-4078-45b4-ac22-4d3ab0b0694b', c.id, 'in', 'Ok', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAEhgUM0FCRDM4RTkxMjQ1NkU1RjRGRTMA', 'received', NULL, NULL, '2026-08-05T16:09:09.089Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'bcb0756b-643f-4317-a193-15f59d00ac40', c.id, 'out', '[staff_alert] A customer needs a person · A customer needs a person. Just a Girl 🎀 (+254112617405) said "Talk to a person", and the bot has stopped replying — the thread is waiting in the inbox', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSQzZFODExODMyNEQxQjJCNjBBAA==', 'read', NULL, NULL, '2026-08-05T16:08:27.976Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'fd98e01a-0f59-41d0-8b28-da815840b77f', c.id, 'out', 'Thanks — one of our team has this and will reply here shortly. No need to send it again.', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAERgSQUU4NzZCMzcwQTAzQTA5RERCAA==', 'read', NULL, NULL, '2026-08-05T16:09:09.256Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2710e09c-f923-4808-b905-9dfe7cef057b', c.id, 'out', 'Yes it is.', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAERgSQkI1NTkzMUNCODMyOTVDMkI3AA==', 'read', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-05T16:09:58.917Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'abd67b2b-4c23-4a04-9d02-825b8df3e8c4', c.id, 'out', 'Hi, My name is Brian. How can I help you?', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAERgSQzFGMUVDQjUwOERDQUI1QTJFAA==', 'read', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-05T16:09:21.435Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e158c6e5-6c63-490a-87af-84cc7b55801c', c.id, 'in', 'Is this brian?', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAEhgUM0E2Q0E4M0NCQjI5OUJGNUYxMEQA', 'received', NULL, NULL, '2026-08-05T16:09:39.014Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ab83ddb5-4544-4684-b230-b1a4973a3774', c.id, 'in', 'Sorry just wanted to hear from you 
Bye', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAEhgUM0E2Rjk1QzAzN0Q2QkIzNjE4QTEA', 'received', NULL, NULL, '2026-08-05T16:10:22.851Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd1deb2e3-f1e1-4ba7-bd48-808fb8ad198e', c.id, 'out', 'Okay. Let me know if there’s anything else I can help you with.', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAERgSQ0U0RkNGNjJFNzI0RUZDMzlBAA==', 'read', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-05T16:12:02.479Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'dac8b7b0-4d2d-475b-9697-79a3472d27f4', c.id, 'in', 'Yes your private number maybe 😏', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAEhgUM0E1QkIxOEY3MjIyMTUzREEyREQA', 'received', NULL, NULL, '2026-08-05T16:17:54.505Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '3f117d59-f3c1-44f4-a443-f395f8af934a', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSQ0ZEQkQxQzAxMDFFNDFCRDFGAA==', 'delivered', NULL, NULL, '2026-08-06T08:21:00.403Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8ca1bbd0-1ce3-4298-ad06-89512241d348', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMMjU0Nzk0ODgyMTA0FQIAERgSNzNERTZBMUM0Mzc5RDAwMzU1AA==', 'delivered', NULL, NULL, '2026-08-05T22:39:38.412Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794882104'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a20b2432-1459-403e-a59a-510100137c3c', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAERgSMkVFMDE5NzVBMEQ4QjYwN0EzAA==', 'read', NULL, NULL, '2026-08-05T16:25:53.686Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f635966b-146a-4388-807e-f33895047e91', c.id, 'out', '[staff_alert] Still waiting for a reply · Just a Girl 🎀 (+254112617405) has been waiting 5 minutes for a reply and just said "Yes your private number maybe 😏". Nobody has the dashboard open', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSNUJBNjRFREU0NjZCODVFNUNCAA==', 'read', NULL, NULL, '2026-08-05T16:17:54.730Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0a022bc5-e514-4fbf-9e68-6d621706300b', c.id, 'in', 'Hiiii', NULL, 'wamid.HBgMMjU0Nzk0ODgyMTA0FQIAEhggQUNDNUNDMzE1NEYxM0FEOEFEOTkwNDUzMDYzNkYxRDIA', 'received', NULL, NULL, '2026-08-05T22:39:37.895Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794882104'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5575befe-f0d3-4baa-ab98-7a3b19471310', c.id, 'in', 'I''m Elma .I was inquiring on how does one order things with you from Shein.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUMzNTFGNkZBMjI2ODVFNjFFMjYzNzkwMUYyNDA5MzkA', 'received', NULL, NULL, '2026-08-06T08:21:35.492Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '18e51d9d-80eb-4d6a-8042-b4849a28f7e0', c.id, 'in', 'About your free SheIn shipping offer', NULL, 'wamid.HBgMMjU0Nzk0ODgyMTA0FQIAEhggQUM1RTJGM0ZGQjE4MzI3MzcyOEQzMzU4Mzg2RUIyNzgA', 'received', NULL, NULL, '2026-08-05T22:39:51.825Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794882104'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c857d57a-38ce-4dec-93fc-f492fe24b832', c.id, 'in', 'Gate C', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTVEMUEyQjFBNzFCNUJGNzEzQUZFOTMwNEEzNTgyMEEA', 'received', NULL, NULL, '2026-08-09T04:54:13.214Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2892387e-ef43-46a2-b11f-ce7047076c33', c.id, 'out', 'Sorry, I did not get that.', NULL, 'wamid.HBgMMjU0Nzk0ODgyMTA0FQIAERgSQzQ4NDVFQTc4RDQ4OEFFRDhDAA==', 'delivered', NULL, NULL, '2026-08-05T22:39:52.006Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794882104'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '675d3e58-a7b2-4ab8-a38a-6423269ecc20', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0Nzk0ODgyMTA0FQIAERgSRTA3MzlDNDE4RThBNTQ3QTc2AA==', 'delivered', NULL, NULL, '2026-08-05T22:39:52.721Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794882104'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '23c30c29-5e27-4ed2-bbb8-ddc4790601c3', c.id, 'in', 'How do I go about it?', NULL, 'wamid.HBgMMjU0Nzk0ODgyMTA0FQIAEhggQUNFMUZFNzIzQTYzMTVFODBFOERCNENGOEFEMUMxQjEA', 'received', NULL, NULL, '2026-08-05T22:40:23.479Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794882104'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'eb305f04-81c2-49e9-b1ee-d4f9ea64ec66', c.id, 'out', 'Sorry, I did not get that.', NULL, 'wamid.HBgMMjU0Nzk0ODgyMTA0FQIAERgSQzc0ODIxMjdCQ0I3QzQxNzk4AA==', 'delivered', NULL, NULL, '2026-08-05T22:40:23.645Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794882104'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '45e706db-14e2-42ec-b36f-4c9a3b40c7d4', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0Nzk0ODgyMTA0FQIAERgSQkIyNThDQjdDNjAxNUIwNkZGAA==', 'delivered', NULL, NULL, '2026-08-05T22:40:25.453Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794882104'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b8c09729-c313-41a7-b951-ca390bb47c14', c.id, 'in', 'How it works', NULL, 'wamid.HBgMMjU0Nzk0ODgyMTA0FQIAEhggQUMyQ0Q5RDRCQjVGMkE5MTcwMDNDQzQ1QjI2OEE4MjUA', 'received', NULL, NULL, '2026-08-05T22:40:37.731Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794882104'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'fc399bd6-7baf-49dd-bf0c-5388efce799a', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSNzc5NjA2RDdFMDhCNjgyMUZEAA==', 'delivered', NULL, NULL, '2026-08-06T08:21:36.314Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'fa56a3a1-a141-40b4-a55e-ba9ef08a3c7b', c.id, 'out', 'Here is how it works:

1. You send us the link to what you want.
2. We tell you one all-inclusive price in KES — shipping to your door included.
3. You pay by M-Pesa.
4. We buy it, fly it in, and deliver it to you.

No customs paperwork for you, and no surprise charges at the end.', NULL, 'wamid.HBgMMjU0Nzk0ODgyMTA0FQIAERgSNEE1Njc0NTRERjZCODlBNkI2AA==', 'delivered', NULL, NULL, '2026-08-05T22:40:37.896Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794882104'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '24a4623a-eaef-4d66-938b-c1777b50b90d', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0Nzk0ODgyMTA0FQIAERgSOTUxNTcwQTVBMzdBOEJDQjAzAA==', 'delivered', NULL, NULL, '2026-08-05T22:40:38.490Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794882104'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ecddac1d-7da5-46c8-b906-fc3090543ba1', c.id, 'in', 'Start an order', NULL, 'wamid.HBgMMjU0Nzk0ODgyMTA0FQIAEhggQUM2NDczN0M0NDE4MEQ4NUI4RUI3Q0M0MjJCOTE4MkIA', 'received', NULL, NULL, '2026-08-05T22:40:54.850Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794882104'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7b71611b-9d25-4ca0-bafe-ee980fc1ba0e', c.id, 'out', 'Shipping from Australia is generally more expensive than other places, due to it’s distance and isolation from the rest of the world. It might cost from KES 8,000 to have it delivered, but I would need to reach out to our partners to get you an exact quote.', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAERgSNzg3OTBBODk2NTQxNTc5NzJCAA==', 'read', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-08T08:24:30.188Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '299010bd-12ec-4d0b-9bb5-6aed52d6f167', c.id, 'out', 'Before your first order I need a few details: your name, your email, and where we should deliver. Takes about a minute.', NULL, 'wamid.HBgMMjU0Nzk0ODgyMTA0FQIAERgSMkY2OUZFNTEyQzA4OEFERkRGAA==', 'delivered', NULL, NULL, '2026-08-05T22:40:55.172Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794882104'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'cdcdc3c6-194e-4afe-ade1-e4b0b9567605', c.id, 'out', 'What is your full name?', NULL, 'wamid.HBgMMjU0Nzk0ODgyMTA0FQIAERgSOTAxMUEwM0NFMjQwRjY3RDU3AA==', 'delivered', NULL, NULL, '2026-08-05T22:40:55.732Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794882104'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8c900a1e-54e7-4472-b8e1-b8160ab4beaf', c.id, 'in', 'Can you explain how one goes about the shipping and how much they pay you', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAEhggQUM2QkM3Mzc1ODI4ODU4NDZEQjE5QUIxRjA5NzU5NjkA', 'received', NULL, NULL, '2026-08-06T05:59:57.740Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c7ae32f0-5a50-42f3-a3a1-e2a8c5814aa0', c.id, 'out', 'Building and house or door number?', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSMjY2NzEyNDZEQjRDM0I1QTZFAA==', 'read', NULL, NULL, '2026-08-09T04:54:13.374Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '96c07575-c653-496a-b5f5-2ec7c4fc6680', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAERgSNzRCQUQwOEM1QkVEMUY4MTUxAA==', 'delivered', NULL, NULL, '2026-08-06T05:59:58.316Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c7905e3e-dcd1-4271-a693-aad982adf852', c.id, 'in', 'How it works', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAEhggQUM3NUZDQURFMEYwOTQ5QjJGQzA2RUI0RjM3OTBCQjIA', 'received', NULL, NULL, '2026-08-06T06:00:08.700Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5178100b-6d8a-40a2-b697-ea4ff27ee393', c.id, 'out', 'Sorry, I did not get that.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSNkZBNjJDRkNGRTMyQUMxNTkxAA==', 'delivered', NULL, NULL, '2026-08-06T08:21:35.692Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd58cc7b8-f9b8-44e0-8f20-a9e974b4afab', c.id, 'in', 'How it works', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUNGQjMwN0E4ODExNkM4NTg2OTVEQ0MxRkJFNDlCOUEA', 'received', NULL, NULL, '2026-08-06T08:21:45.548Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '298381e7-f7df-49d0-a8ed-2b99504d3267', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAERgSNjE5Qjc0RTAwMDM2QUUyMEU4AA==', 'delivered', NULL, NULL, '2026-08-06T06:00:09.513Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '3f80d6b0-f55f-402f-966a-1168be8028ce', c.id, 'out', 'Here is how it works:

1. You send us the link to what you want.
2. We tell you one all-inclusive price in KES — shipping to your door included.
3. You pay by M-Pesa.
4. We buy it, fly it in, and deliver it to you.

No customs paperwork for you, and no surprise charges at the end.', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAERgSOTEyOEY1OENCM0JDQzFCNTY5AA==', 'delivered', NULL, NULL, '2026-08-06T06:00:08.903Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8aea8520-470f-4183-8313-aab4c6b8a1df', c.id, 'in', 'Start an order', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAEhggQUMxMUVCQUYxNDVEMUYzMzE4MzE0RTM2RTI1OUFEOUMA', 'received', NULL, NULL, '2026-08-06T06:00:18.073Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '9223db35-b31d-4349-aab5-c8993852d409', c.id, 'out', 'Before your first order I need a few details: your name, your email, and where we should deliver. Takes about a minute.', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAERgSQkYxNDlBNTUxN0NGMTgxNkZFAA==', 'delivered', NULL, NULL, '2026-08-06T06:00:18.243Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b2c5ddcf-d4e7-43d2-a7c6-844f0632e2ab', c.id, 'out', 'What is your full name?', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAERgSNEY4NUQ1OTE2NTkwMzJGMjBFAA==', 'delivered', NULL, NULL, '2026-08-06T06:00:18.820Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '10fe756d-fb85-483d-8ddd-ed74366f9815', c.id, 'in', 'Dorcas Njeri Gatamba 
njerisupremacy17@gmail.com', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAEhggQUM3NTRBRDAzMzQ0RkYxNDU2RjU2MEFFRkE0OUVCNDgA', 'received', NULL, NULL, '2026-08-06T06:00:35.421Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd4728795-9ad6-4131-9732-067bd5009d7f', c.id, 'out', 'What is your email address? We send your receipts and order updates there.', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAERgSQkQ0MTAzMThDMzNBOTc5QzhEAA==', 'delivered', NULL, NULL, '2026-08-06T06:00:35.591Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c0d5c5c3-b00e-422d-a59b-eed394b88f95', c.id, 'in', 'njerisupremacy17@gmail.com', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAEhggQUM2RjIzNTgyMjNCQzg2MzVCMTBDMUEwMkFDN0I1RDIA', 'received', NULL, NULL, '2026-08-06T06:00:43.146Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '653aef4f-4e79-4916-8909-1ff6c36c805a', c.id, 'out', 'One more thing: may we message you here about your orders, and email you receipts? You can send STOP at any time to end all messages.', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAERgSN0UwNzNGMzI5QjA3NjhGQjFEAA==', 'delivered', NULL, NULL, '2026-08-06T06:00:43.320Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '32549b09-9d70-40d3-9fa1-21b2b91498d3', c.id, 'in', 'Yes, go ahead', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAEhggQUNGRjk2QzRENzUxOUNCMzA1NjY0QTQwMERGQ0ZEQTcA', 'received', NULL, NULL, '2026-08-06T06:00:50.697Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c82626ef-98b3-480a-86b9-ac99d3b15f33', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSNzA0OUU4MUZCMjkzMDJCQ0IyAA==', 'delivered', NULL, NULL, '2026-08-06T08:23:22.521Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '022daf8e-3fb2-41d9-a1f3-ad1a24258a69', c.id, 'in', 'okay confirm the price then I''ll get back to you when i am ready', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAEhggQUMxMEYwREY2MjM3M0NCQzgxOEU5NzM5REU3M0E4MjkA', 'received', NULL, NULL, '2026-08-08T08:25:10.148Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '31293ae2-4c5f-418e-83ea-0815e208084f', c.id, 'out', 'Thanks — one of our team has this and will reply here shortly. No need to send it again.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSMDRDQzRGQUMzNzhDNDNFNzU1AA==', 'delivered', NULL, NULL, '2026-08-06T08:23:35.886Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '12b2a582-5779-4acb-aad0-0483c6a3c1be', c.id, 'in', 'Okay', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUM4QTVEODE3RkUxNTNFQkU2MjQ2RUQ3QkI1OTZERkMA', 'received', NULL, NULL, '2026-08-06T08:26:18.775Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'cf51415e-9f84-41ba-bfae-82f05b535cc1', c.id, 'in', 'Talk to a person', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUM0QTlGOUJCQTIyNDBBQzdEOTA2NERBMTZENDI4RTQA', 'received', NULL, NULL, '2026-08-06T09:01:41.940Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '59412855-6ffe-42c9-bbbf-b8a84fbc94d9', c.id, 'out', 'Okay. That will have to be on Monday as it is 6pm in Australia and the offices don’t open on Sunday.', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAERgSRkYyMEQwQkM5RDdFMjQyQzJCAA==', 'read', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-08T08:28:50.601Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '43e66f68-61ac-425f-a98e-5e39ca6dc0ea', c.id, 'out', '[staff_alert] Still waiting for a reply · 🍒🥰 (+254722904692) has been waiting 38 minutes for a reply and just said "Talk to a person". Nobody has the dashboard open', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSOTVCNjYwNzcwRjE4QjJGRkEwAA==', 'read', NULL, NULL, '2026-08-06T09:01:42.688Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '3c39e308-2591-4a8b-81f4-badd522206fc', c.id, 'out', '[staff_alert] Still waiting for a reply · 🍒🥰 (+254722904692) is waiting for a reply and just said "Okay". Nobody has the dashboard open', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSRTZGMjc3NUZCODA0RTYyRjkyAA==', 'read', NULL, NULL, '2026-08-06T08:23:36.556Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f31f8df3-4797-4ff7-b3d3-b000f16bd8f9', c.id, 'out', '[staff_alert] A customer needs a person · A customer needs a person. 🍒🥰 (+254722904692) said "Talk to a person", and the bot has stopped replying — the thread is waiting in the inbox', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSNDBGMDRDNzQzRTExMTk4QTJGAA==', 'read', NULL, NULL, '2026-08-06T08:23:29.082Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'cb0d4f15-e69c-477f-81a4-68496532fdd2', c.id, 'out', '[staff_alert] Still waiting for a reply · ralph (+254726626005) has been waiting 43 minutes for a reply and just said "fron Australia to kenya". Nobody has the dashboard open', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSNUUyM0RERDUyRDVGRjg1ODEyAA==', 'read', NULL, NULL, '2026-08-08T08:16:45.175Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f38550a2-aa16-4398-9f04-3a80fe6e921b', c.id, 'in', 'okay', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAEhggQUNGMzJEQ0RCOUEyN0JBMTNGMzFDNTI5Njg1NUZCOTIA', 'received', NULL, NULL, '2026-08-08T08:34:09.149Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '9f14ad24-5f1c-4b97-8ded-76f1d83aab5b', c.id, 'in', 'Recult Apartment, house number 406', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTUxREE2MERGNzhEMUI4OThERjRBOUNCN0REMUIwMjIA', 'received', NULL, NULL, '2026-08-09T04:54:38.372Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8795c89b-006f-440f-aed6-059a8b2bdf64', c.id, 'out', 'No problem — I am getting a person for you. Someone from our team will reply here shortly.', NULL, 'wamid.HBgMMjU0Nzk0MTY1MDM0FQIAERgSQTkzRjJBRUY5NEY5QkUzNzA3AA==', 'read', NULL, NULL, '2026-08-06T09:12:09.762Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794165034'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c0be7c94-d96f-4d29-9db1-2beafc1d01a5', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMMjU0Nzk0MTY1MDM0FQIAERgSRjlDRkIzODAyRjBGNDEyODM2AA==', 'read', NULL, NULL, '2026-08-06T09:11:33.442Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794165034'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '608cca40-42bd-4d6e-84b6-23bb3a012a51', c.id, 'in', 'Talk to a person', NULL, 'wamid.HBgMMjU0Nzk0MTY1MDM0FQIAEhgUM0ExRTQ4NzUyMTlCNjVBRkZCMzgA', 'received', NULL, NULL, '2026-08-06T09:12:09.572Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794165034'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '232992bd-fef3-4187-9f35-f66474e33edb', c.id, 'out', '[staff_alert] A customer needs a person · A customer needs a person. Kings (+254794165034) said "Talk to a person", and the bot has stopped replying — the thread is waiting in the inbox', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSQUI5NDhDNzU3ODExNUQzQzFFAA==', 'read', NULL, NULL, '2026-08-06T09:12:10.350Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c4099297-1a5b-498c-898d-5e0710baa066', c.id, 'in', 'Hey. Saw your advert on Nyambuzi’s page. I want to get some things from Shein.', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAEhgUM0FGODAwREMxMjU4REVDQjI0RDUA', 'received', NULL, NULL, '2026-08-06T10:43:02.229Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8b58d915-da90-41fa-93bf-bf5ef540345c', c.id, 'out', 'Hi, apologies for the late response. For the free SHEIN deliveries, we only charge you for what’s in your cart.', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAERgSNDk5MjEyOUQyQTUyMkFEQzk0AA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-06T09:44:33.385Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b6484b01-d8fb-4a4d-b5a0-4afd2ff322cb', c.id, 'out', 'Hi, apologies for the delayed response. 
Yes the free shipping is still available.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSQTE5MzdCQzNCM0IyNkYwQThGAA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-06T09:42:59.883Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8cb2dc21-4012-4974-82c4-9f0ac36f498e', c.id, 'out', '[staff_alert] A customer needs a person · A customer needs a person. Dorcas Njeri Gatamba njerisupremacy17@gmail.com (+254746302525) said "Yes, go ahead", and the bot has stopped replying — the thread is waiting in the inbox', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMURCRkRENUI0OTJGRjBCOEZCAA==', 'read', NULL, NULL, '2026-08-06T06:00:52.111Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '9dd3fa80-6d23-4f41-8f36-268fb9143c96', c.id, 'out', '[staff_alert] Still waiting for a reply · Dorcas Njeri Gatamba njerisupremacy17@gmail.com (+254746302525) is waiting for a reply and just said "Back to menu". Nobody has the dashboard open', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMEY3MERCQTJGRUU3Qjg1NDlFAA==', 'read', NULL, NULL, '2026-08-06T06:01:04.386Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '84a5037e-738e-445f-a8c6-957fb054e080', c.id, 'in', 'It''s fine', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUM2MzU1MDk1QkFDQjZFNjA2MUY1NzI3QzQ2QkFBRkUA', 'received', NULL, NULL, '2026-08-06T09:48:38.212Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '583feb1b-2e61-4cc0-85a8-6eebbdcaf921', c.id, 'in', 'Ooh okay .The offer ends by 15th right?I will tell you what I need by then.I just wanted to confirm how it works first', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAEhggQUM3OENCOTAzRjQ1ODJCQ0MxNTFCMjREQjFGRDVBRDIA', 'received', NULL, NULL, '2026-08-06T09:49:40.718Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c9493cc0-1130-4867-a582-5b51f8b0c3dd', c.id, 'out', '[staff_alert] Still waiting for a reply · 🍒🥰 (+254722904692) has been waiting 5 minutes for a reply and just said "It''s fine". Nobody has the dashboard open', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSQTM5Rjc2NkRBRkJGRTY5MDAxAA==', 'read', NULL, NULL, '2026-08-06T09:48:38.551Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '35978a8e-eecf-4db8-883a-f125336619ac', c.id, 'out', 'Hi, SHEIN takes about 2 weeks to be delivered.', NULL, 'wamid.HBgMMjU0Nzk0MTY1MDM0FQIAERgSQzIyMkJERDA4Q0Q4N0M4RTc1AA==', 'read', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-06T09:41:36.592Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794165034'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f623faf0-6b19-4097-a86f-853521e52ce4', c.id, 'in', 'Let me send my Shein cart then you tell me the price .', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUM0NEZDRTgyOTkwMzYzMTNCMkQxMkUxMURBQkQzQTUA', 'received', NULL, NULL, '2026-08-06T09:48:54.313Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '71798f3a-17b4-415b-9496-567f896a1cfd', c.id, 'in', 'Good afternoon.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUNGNDU1NjcxMTc0NzRBOTRGMjczQjMyM0I2NDg1MUMA', 'received', NULL, NULL, '2026-08-08T09:02:09.003Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c9d9fc9c-2037-4ef3-95f0-e140ebe46bad', c.id, 'out', 'The two items in your cart come to a total of 16 USD. Which is about KES 2090.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSNEM1QUE4NTNFNjE5OThBMDA1AA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-06T10:13:00.457Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '11b76362-ac7f-42c1-8f6a-57c2c139a842', c.id, 'out', 'Okay', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSMUU5Qzg5MEYyMUU2RUJDMTBEAA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-06T09:49:35.653Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '3321274b-3e57-482a-9ad8-84201cf3b6c0', c.id, 'in', 'I found some great items at SHEIN!
These items in my shopping cart are great. I highly recommend them to everyone!
https://onelink.shein.com/46/5y12soo3t4p0?shc=2_RSVks3IaGKt', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUM5ODE2OUEwQzVCOUQ2RTc3RTcxNzZCMEE2MjY5MUEA', 'received', NULL, NULL, '2026-08-06T10:05:58.085Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2ba9cb04-45d4-44f4-9afb-b0bbc74d8306', c.id, 'out', 'One moment', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSNzM4Mjk1MkRFMENCMEJENzhEAA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-06T10:06:33.522Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '978260af-56c7-405d-900c-51968047f880', c.id, 'in', 'Okay', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUNGMkYxNjQxNURFNTczM0NENEI4RUM1QTM0ODEyMEMA', 'received', NULL, NULL, '2026-08-06T10:07:15.020Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '46a064d2-752b-4a6d-b156-84a8a7e95e88', c.id, 'out', 'Thanks — one of our team has this and will reply here shortly. No need to send it again.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSNkVBOUVDNjA5ODY3OEEwRDEwAA==', 'delivered', NULL, NULL, '2026-08-08T09:02:09.589Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'dee7ace3-072c-46a3-9645-70a2c66c132a', c.id, 'out', '[staff_alert] Still waiting for a reply · 🍒🥰 (+254722904692) is waiting for a reply and just said "Good afternoon.". Nobody has the dashboard open', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMzMyMEI2NzYxQTRCOTk1Mzg1AA==', 'read', NULL, NULL, '2026-08-08T09:02:10.570Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7cc60cd8-8cd7-41e7-a196-f0a08de52779', c.id, 'out', 'Please let me know if you want to go ahead and I will provide a payment link.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSODQzNEE0RTA5QTVCOUVGMDU2AA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-06T10:13:21.972Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7391cc4a-06a0-4c3f-98b4-b1ab5e1fdf23', c.id, 'out', '[staff_alert] Still waiting for a reply · 🍒🥰 (+254722904692) has been waiting 16 minutes for a reply and just said "I found some great items at SHEIN! These items in my shopping cart are great. I highly recommend them to everyone! http…". Nobody has the dashboard open', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSRTZBQTc5MDNBN0Q3M0MxNjhGAA==', 'read', NULL, NULL, '2026-08-06T10:05:58.369Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ce42bebd-01af-4006-a133-eaaf07893b56', c.id, 'out', 'Anything the rider should know? A landmark, a gate code, a time that suits you. Tap Skip if not.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSODgwMDI0RjlBQkQ4RTY5Rjk2AA==', 'read', NULL, NULL, '2026-08-09T04:54:38.536Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7c0f1036-552e-42c7-9274-9911579e1e31', c.id, 'out', 'It’s okay. You can send it when you are ready.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSRjg1MjY4RTcyMTNFM0FCRUYxAA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-08T09:04:37.304Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c0910e0e-1780-478a-a1ef-ab94ff1386d9', c.id, 'out', '[staff_alert] A customer needs a person · A customer needs a person. Just a Girl 🎀 (+254112617405) said "Talk to a person", and the bot has stopped replying — the thread is waiting in the inbox', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSOUJCNDhGNUEzQzgxOUVGMzhGAA==', 'read', NULL, NULL, '2026-08-09T19:20:00.121Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0885f399-e698-4fd4-8287-5955643d11fb', c.id, 'in', 'Heyy', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAEhgUM0E5QzFGNTJCRjQzMTQ5RDREMjcA', 'received', NULL, NULL, '2026-08-09T19:21:47.783Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '523be36f-c092-4eb6-abb2-9f2b0dd8f45c', c.id, 'in', 'Sorry I forgot', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUM5MUZGMkVERUFERkIxM0FBMzU4QjhCMUJENzI4MDYA', 'received', NULL, NULL, '2026-08-08T09:02:11.958Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8edc87a7-bd29-42d9-9985-98f8e42e8965', c.id, 'in', 'Black Patent Thong Strap Square Open Toe Stiletto Mules Slip On Minimalist Women Summer Slide Sandals
I discovered amazing products on SHEIN.com, come check them out!
https://onelink.shein.com/46/5y88gqny12cp?shc=2_RSvkBQHTWH6', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUNCRUQzQzI2NTQ0RjU4Q0Q0MDM5ODgxQTU1NkUwN0MA', 'received', NULL, NULL, '2026-08-08T09:06:46.188Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a18eb367-f5f2-4916-914b-e7e6c9f2fd31', c.id, 'out', 'Yes it ends on the 15th.
To make sure your SHEIN order goes smoothly, here are some tips:

1.  Don’t be signed in to your Shein account so as to avoid price changes when you send us the link.
2.  Check the size guide to make sure you choose the correct sizes.
3.  Check the reviews so that you know what people think of the product.
4.  Read the description to know exactly what you’re ordering.
5.  Make sure your location is set to Kenya.
6.  Follow us for more tips!

Thank you for choosing us.', NULL, 'wamid.HBgMMjU0NzQ2MzAyNTI1FQIAERgSRDY1MUJGRUFENzhDM0M5RENGAA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-06T09:51:34.559Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746302525'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '317d2b85-c6f4-4500-856a-ab9a81ea85c9', c.id, 'in', 'Okay a minute then I pay', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUM0QjhDMkUyMzI3QjIzQTZFMEE5REY0MzA0NUY3M0MA', 'received', NULL, NULL, '2026-08-06T10:16:33.997Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '04c53374-47a9-4697-a374-f730617a2b05', c.id, 'in', 'That one', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUMxRTNFMUI0OTc1RDg0NjY3QjZENThGRTNGQzBFQ0MA', 'received', NULL, NULL, '2026-08-08T09:06:48.362Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2a831854-1d10-4607-bd7e-a5bd66a8e1a6', c.id, 'in', 'The apartment is next to one known as Springvale Apartment, landmark JKUAT university', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTUzMzlDQUE2N0ZDNUMyNUU4QTY1QTVFREZEM0QwRkMA', 'received', NULL, NULL, '2026-08-09T04:56:03.084Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ac1f8ad8-7fb3-4f28-96e1-8a7613e73d4f', c.id, 'out', 'https://lipana.dev/pay/shein-deliveries-66e0-1

Please use the link when you are ready to pay. It will prompt your number.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSNzBEN0NGM0RGRDAyRkM4Q0M2AA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-06T10:21:00.538Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7a0a0b47-8ab2-4339-a02f-d5480153f827', c.id, 'out', 'You are all set. I have saved your details, so next time you can go straight to ordering.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSN0RBOUVDODZDQUY2MURFMTlEAA==', 'read', NULL, NULL, '2026-08-09T04:56:03.307Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b0c7736d-4b64-4a5f-9150-b86252c9cf55', c.id, 'out', 'Send me the link to what you want. You can paste several at once, or send them one at a time.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSREU3OTI1NUU1MjVCNTY2Q0EyAA==', 'read', NULL, NULL, '2026-08-09T04:56:04.098Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'fcf6902c-9cb7-40e4-a51e-94f369119983', c.id, 'out', 'Thanks — one of our team has this and will reply here shortly. No need to send it again.', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAERgSMTBBM0I5RDJDNjMyNkY5NjI5AA==', 'read', NULL, NULL, '2026-08-09T19:21:47.950Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '24b5e3f6-60fd-4d62-b4d3-d36162a3b981', c.id, 'in', 'Ignoring me right ok', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAEhgUM0FBMzI1OEYzMzM1MDc2NkEyQzkA', 'received', NULL, NULL, '2026-08-09T19:27:06.047Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '94bc42b3-423f-47df-9734-16a57dc65b8e', c.id, 'out', 'Welcome back. What would you like to do?', NULL, 'wamid.HBgMMjU0Nzk0MTY1MDM0FQIAERgSNkIwODFBRTY4ODRFNkFCNDU0AA==', 'read', NULL, NULL, '2026-08-10T12:51:06.238Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794165034'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd9f9ada8-0a7f-4232-b486-d2f5a9968e11', c.id, 'out', 'Got it — I have saved that item.', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAERgSNTM5ODE0OTI0RDQ4OTA2OUZCAA==', 'read', NULL, NULL, '2026-08-06T10:43:54.533Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd1058bc0-280d-42c7-ac7d-d717fb7e23c0', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAERgSODc2NzFCNUVFNEVDQ0Y5MjFDAA==', 'read', NULL, NULL, '2026-08-06T10:43:02.670Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '4e7071d2-607d-498e-8def-24408b67a680', c.id, 'in', 'https://onelink.shein.com/46/5y1697ibqhxr?shc=2_RSVCund04wL', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAEhgUM0FENUI0Njk1NDQyQTM4MDZFNzcA', 'received', NULL, NULL, '2026-08-06T10:43:54.304Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5538b5c7-a7e7-4ea0-80dd-3b2d804f0096', c.id, 'out', 'Hi, please set your SHEIN location to Kenya as we are having trouble with the link.', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAERgSOThGNERFMEMxNDM3MjMwRjA1AA==', 'read', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-06T10:45:15.566Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd1bf64f8-1ae0-40e8-b7ad-991b530137c5', c.id, 'out', 'What is your full name?', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAERgSMkE2MEU4NzU5QUM5QUY2OTlBAA==', 'read', NULL, NULL, '2026-08-06T10:43:55.619Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ac3bee67-376e-4566-aac3-c974e0fcd522', c.id, 'out', 'Before your first order I need a few details: your name, your email, and where we should deliver. Takes about a minute.', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAERgSN0M1MTYyNzEyQTE2OTg4NUUzAA==', 'read', NULL, NULL, '2026-08-06T10:43:55.096Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'cbef7555-d502-4588-b4a3-a01f79f5767a', c.id, 'in', 'Hey, I need to know if that link works fine, before I continue adding items.', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAEhgUM0FENDgwN0JBN0I5OTVFNjAwRjIA', 'received', NULL, NULL, '2026-08-06T10:44:34.718Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0c6f206b-870b-4e7f-8704-c34a95bf9ffe', c.id, 'out', 'What is your email address? We send your receipts and order updates there.', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAERgSNzMwMDM1OEQzM0YyMjhBMDFFAA==', 'read', NULL, NULL, '2026-08-06T10:44:35.072Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '957d2925-2444-4b93-8ef1-678ab0c6a7fb', c.id, 'in', 'Okay let me do that. I''ll send a refined cart>', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAEhgWM0VCMDdBNTg4Rjg3ODQwRTk3N0NBQwA=', 'received', NULL, NULL, '2026-08-06T11:08:36.153Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '1323e8f1-ce53-41c9-9ae9-8bdf6b36e4d2', c.id, 'out', 'Let me see if I can sort the link. Please allow me a few minutes.', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAERgSNzJEMUI0NUU3NDE5NkE0ODY0AA==', 'read', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-06T10:47:28.858Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '42898b67-1099-46b9-bfe7-c5effdfb39e8', c.id, 'out', 'Yes, those messages were automated. You are now speaking to a live agent.', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAERgSN0VBNDNGMTgxMjk5NTFGRjZGAA==', 'read', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-06T10:45:59.225Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a6580c84-7ca2-4ab7-8ac3-bf0bc5aa7fd4', c.id, 'in', 'How do I do that? I am only seeing US, tried entering Kenya but it returned no response', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAEhgUM0E1QzJBQjhCRTA5M0E1M0UxQzMA', 'received', NULL, NULL, '2026-08-06T10:46:42.971Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b9036214-9ee3-4f15-aab0-c21eb70f0bbc', c.id, 'in', 'Sawasawa', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAEhgUM0E3QkIxQ0RBMDk0MkE3MzI0RTIA', 'received', NULL, NULL, '2026-08-06T10:47:40.130Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c775007d-3729-429d-bac7-0fbe849d9ba4', c.id, 'out', 'Hi, I’m unable to find one item in your cart as it is only available in the US store. 

Item: Soleia Women Floral Print

The other three items in your cart come to a total of $25.08

To be able to change the location of your SHEIN cart, please log out of your account, on the cart section at the top, you will be able to see the country and change it to Kenya.', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAERgSQUZFMzhDQzAyMkM3MTVCQzZGAA==', 'read', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-06T11:03:35.970Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'fa0adcc9-f0a9-48da-b0a4-5748c3797074', c.id, 'out', 'Okay.', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAERgSNEYxMzMxNzlBM0Y2NTg4Rjc5AA==', 'read', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-06T11:12:11.057Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e7bbc91e-024a-42dc-ac38-74dfc4513f37', c.id, 'in', 'None', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0E3QThFRTkyM0RGMkJBNkMzQkEA', 'received', NULL, NULL, '2026-08-06T15:01:23.207Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'fc767a3c-ecb5-4a85-9d02-8c0f8ecbb5f9', c.id, 'in', 'Maybe send me a link to the Shein website you guys use. I can’t change location on my end.', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAEhgUM0E2REQ1NTkyMTMxQzQ1NkVERDAA', 'received', NULL, NULL, '2026-08-06T11:25:32.350Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '44c4bf9e-3054-4cbb-896f-cb7e386eade4', c.id, 'out', 'Thanks — one of our team has this and will reply here shortly. No need to send it again.', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAERgSQjVGNjJFODUyQ0E2NDZFMkY5AA==', 'read', NULL, NULL, '2026-08-06T10:44:54.970Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '716fbf5e-1b4f-41c0-9ab8-6ed09e59c1da', c.id, 'in', NULL, NULL, 'wamid.HBgMNDQ3MzExMzQ5ODM4FQIAEhgSMzFGRjhGODc0NDc3OTBDMDQ0AA==', 'received', NULL, NULL, '2026-08-08T09:57:44.790Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447311349838'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0d7b67d2-2cd0-44ff-9391-fcdcbf178067', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMNDQ3MzExMzQ5ODM4FQIAERgSNDAxNkM2MzU4Q0JBNzA4RDY0AA==', 'failed', '[{"code": 131026, "href": "https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/", "title": "Message undeliverable", "message": "Message undeliverable", "error_data": {"details": "Message Undeliverable."}}]', NULL, '2026-08-08T09:57:45.169Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447311349838'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '518a73b6-635e-4686-afa1-4327e6ac2cd9', c.id, 'in', NULL, NULL, 'wamid.HBgMNDQ3MzExMzQ5ODM4FQIAEhgSQjU5MUQ4NTIzNkEyQURGODQxAA==', 'received', NULL, NULL, '2026-08-08T10:02:29.170Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447311349838'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd2150de5-c0c2-4372-98b4-ab22b59cf7fb', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMNDQ3MzExMzQ5ODM4FQIAERgSRjkyM0E2OUI1QjhBNjQ5QzA3AA==', 'failed', '[{"code": 131026, "href": "https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/", "title": "Message undeliverable", "message": "Message undeliverable", "error_data": {"details": "Message Undeliverable."}}]', NULL, '2026-08-08T10:02:29.912Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447311349838'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'dabdd6bc-714a-48f2-9214-124251766655', c.id, 'out', 'Sorry, I did not get that.', NULL, 'wamid.HBgMNDQ3MzExMzQ5ODM4FQIAERgSNjk0MjJFN0JGMjE2MThEOUYwAA==', 'delivered', NULL, NULL, '2026-08-08T10:02:29.340Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447311349838'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'dddaa360-2d2c-4cfe-9bcb-213bb5674a0d', c.id, 'in', 'Heyy i know you seeing somehow but i hate to say i miss your calls😤', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAEhgUM0ExREJERDc1MUJBMkYxM0E0ODcA', 'received', NULL, NULL, '2026-08-09T19:19:36.455Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '3fafd448-cd2e-4da4-821a-2c20549503c9', c.id, 'out', 'Hey. So this number is not like a WhatsApp normal number. I don’t get notified outside work hours that there’s someone here.', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAERgSQzE5NDRCNzBBMDVENkExODFEAA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-09T23:29:35.886Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7e87c3f8-b008-448a-b196-17e06e625b38', c.id, 'in', 'Talk to a person', NULL, 'wamid.HBgMMjU0Nzk0MTY1MDM0FQIAEhgUM0FFODUzRDE0N0JCRkMwNUZGRUUA', 'received', NULL, NULL, '2026-08-10T12:51:24.035Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794165034'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '1b326ec2-6a69-4b1c-8252-344ab54548c9', c.id, 'out', 'No problem — I am getting a person for you. Someone from our team will reply here shortly.', NULL, 'wamid.HBgMMjU0Nzk0MTY1MDM0FQIAERgSNkNFODVBMUU4MzVENDdDQTlGAA==', 'read', NULL, NULL, '2026-08-10T12:51:24.221Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794165034'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'facbd5de-0fc4-4a48-8aa4-bb597316a308', c.id, 'out', '[staff_alert] A customer needs a person · A customer needs a person. Kings (+254794165034) said "Talk to a person", and the bot has stopped replying — the thread is waiting in the inbox', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSRTA2QzRDRkMyNDNDMzdERDA3AA==', 'read', NULL, NULL, '2026-08-10T12:51:24.727Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2b46f04a-a90d-4c9a-b47f-f2bf00705514', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSQjkyNERERDQzNUU0MERDOTIyAA==', 'delivered', NULL, NULL, '2026-08-06T14:55:00.277Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ca8a3c00-5e5f-4469-b955-35f8e581835b', c.id, 'in', 'How it works', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0E5NjI2QzJBNkZDMDI0RDUzRDUA', 'received', NULL, NULL, '2026-08-06T14:56:24.318Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b7da6c1b-e211-4575-96ea-0934141239d5', c.id, 'out', 'Hi, let me send you a message from our UK Business number.', NULL, 'wamid.HBgMMjU0NzAwMDkyMDA1FQIAERgSNThEQkU5Rjg4NzIyRjAxMTg1AA==', 'read', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-06T11:26:40.147Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254700092005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8667f17b-e8a1-49ac-b480-bc23fcc8982e', c.id, 'out', '[staff_alert] Still waiting for a reply · Kay (+254700092005) has been waiting 13 minutes for a reply and just said "Maybe send me a link to the Shein website you guys use. I can’t change location on my end.". Nobody has the dashboard open', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSOENDMDUwRUY0RkU2NjhFNjU5AA==', 'read', NULL, NULL, '2026-08-06T11:25:32.713Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5d9e7d55-c384-4e0f-8270-21c469cd1bf0', c.id, 'out', 'Hi, I apologise for the delayed response. We are offering free shipping for SHEIN. All you need to do is send us a link to your cart.', NULL, 'wamid.HBgMMjU0Nzk0ODgyMTA0FQIAERgSNjcwRUYxMUMwQjc5MkFCN0UzAA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-06T09:45:46.020Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794882104'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'acd73ff1-65ad-46e9-836e-887efcbe651a', c.id, 'in', 'Hi
Would like to ship 2 items 
How do I go about it', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0FENTRGMzRFOUQ5RDk0NTBEOEEA', 'received', NULL, NULL, '2026-08-06T14:54:59.732Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c2293d96-5cff-4e9c-bd15-495828b9228b', c.id, 'out', 'Here is how it works:

1. You send us the link to what you want.
2. We tell you one all-inclusive price in KES — shipping to your door included.
3. You pay by M-Pesa.
4. We buy it, fly it in, and deliver it to you.

No customs paperwork for you, and no surprise charges at the end.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSQzYzODQ5QzUxMEY0QTZGNDI0AA==', 'delivered', NULL, NULL, '2026-08-06T14:56:24.517Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '750d8c73-dcc4-4ef1-a55c-11c4b5203f1a', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSODQ0Mjc4NUM1RTE2QkQ1NUIzAA==', 'delivered', NULL, NULL, '2026-08-06T14:56:25.188Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b8e99831-3c28-4aa3-94fc-41cc48436b94', c.id, 'in', 'Start an order', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0EwNjU1NDVDMkI1NzUzMTQ5NjQA', 'received', NULL, NULL, '2026-08-06T14:56:57.445Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '9775d41b-5b63-4f5c-8d25-c047b52103cb', c.id, 'out', 'Before your first order I need a few details: your name, your email, and where we should deliver. Takes about a minute.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSQUI4MkFGOTJCNDc3RDU5RDYyAA==', 'delivered', NULL, NULL, '2026-08-06T14:56:57.623Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f542c379-326f-4d13-9f0f-622bd398b200', c.id, 'out', 'What is your full name?', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSNDM1NkRGRjQwMUU1NzZDQTc0AA==', 'delivered', NULL, NULL, '2026-08-06T14:56:58.240Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8cdf3693-5df5-44bb-9b0e-1a74ab7f9234', c.id, 'in', 'Leah Gitonga
nkathagitonga2@gmail.com
87 waiyaki way', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0EwM0U4OTc1RjlFMzUwRjM3NzQA', 'received', NULL, NULL, '2026-08-06T14:57:49.716Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '137866bd-7071-4aca-91b3-98ee8005793c', c.id, 'out', 'What is your email address? We send your receipts and order updates there.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSRkFDRUNGOURFMUU1NDcwNTg5AA==', 'delivered', NULL, NULL, '2026-08-06T14:57:49.930Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '458e6b4b-f248-4a4b-9f2f-9c70c4cd0b62', c.id, 'in', 'nkathagitonga2@gmail.com', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0E0QzMwN0IyQjg0M0M0MjdCQzkA', 'received', NULL, NULL, '2026-08-06T14:58:08.287Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '51e5b2cd-e03b-46b4-a80a-9161c289f7c3', c.id, 'in', 'heloo', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAEhgUM0JDMjIyNUE1NEI0MERFRjNFNEYA', 'received', NULL, NULL, '2026-08-07T18:15:05.669Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '179ad51e-ed80-4816-b094-4ad550ca4bb2', c.id, 'in', 'Hi, 
Got the number from Patience, I want to place an order for an armband, what are the next best steps?', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTU4OERFRENCODk3NjQxNTNDOEZEMzJDRjA5OTZCRjkA', 'received', NULL, NULL, '2026-08-09T04:48:13.968Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ae8869cc-3319-4f99-8394-c340c5501825', c.id, 'out', 'One more thing: may we message you here about your orders, and email you receipts? You can send STOP at any time to end all messages.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSM0M0NDVFOENGOTVDOTM4NEY1AA==', 'delivered', NULL, NULL, '2026-08-06T14:58:08.464Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c3460887-8fef-4337-a7ac-ea0acd35d213', c.id, 'in', 'Yes, go ahead', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0EwQjA0MDcxNjdGNzFEQ0UwQjkA', 'received', NULL, NULL, '2026-08-06T14:58:17.194Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0888b684-0fdb-4a5a-8583-d984c2ec7de0', c.id, 'out', 'I have sent a 6-digit code to nkathagitonga2@gmail.com. It expires in 10 minutes.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSREIwQTVDODlCMTVBMTRBRDAzAA==', 'delivered', NULL, NULL, '2026-08-06T14:58:18.583Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7f7f8d33-9c24-4f58-b4ce-15c9c3b37125', c.id, 'out', 'Reply with the code to confirm the address is yours.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSQzQ0NkEyMURFQjZBODRBMUY1AA==', 'delivered', NULL, NULL, '2026-08-06T14:58:19.325Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b0e71b7b-a081-41c3-adee-470edd5c438c', c.id, 'in', '338243', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0FCNjMzNTA2RjI0RjNCMkZBNUIA', 'received', NULL, NULL, '2026-08-06T14:58:38.519Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '89f39bbf-2f1d-4b48-969e-e3d0d412b3d2', c.id, 'in', 'Heyy good morning', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAEhgUM0FFMkQ5QTkxMDFGNTlGNzFCODEA', 'received', NULL, NULL, '2026-08-10T04:29:12.014Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '27287575-eee5-42c5-aa4f-1e10e8a6d76b', c.id, 'out', 'Thank you — your email is confirmed.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSMkFCQTgxMTgwMDQxNzg0QTE3AA==', 'delivered', NULL, NULL, '2026-08-06T14:58:38.777Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '149daffc-bb70-44f7-ba5f-1ebc96217f53', c.id, 'out', 'Which M-Pesa number should we use for payments? 0746 542 006? Tap below to use it, or send a different number.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSQUEyQzkzMzcwN0Y5REZFMThEAA==', 'delivered', NULL, NULL, '2026-08-06T14:58:39.398Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '6b68e864-e877-46be-b6c9-21eca7df092f', c.id, 'out', '[staff_alert] Still waiting for a reply · Just a Girl 🎀 (+254112617405) has been waiting over 4h for a reply and just said "Heyy good morning". Nobody has the dashboard open', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSREZFQjk2MDExNUQ4Nzk0REVEAA==', 'read', NULL, NULL, '2026-08-10T04:29:12.588Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5846420f-c9e1-4118-90c7-3d6c454a2885', c.id, 'in', '???', NULL, 'wamid.HBgMMjU0Nzk0MTY1MDM0FQIAEhgUM0E2MzQ1MDhENTA0QzQ4QUEwODEA', 'received', NULL, NULL, '2026-08-10T12:59:36.707Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794165034'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '38040d21-8d23-47a4-821b-3f9c1d85a321', c.id, 'out', 'Thanks — one of our team has this and will reply here shortly. No need to send it again.', NULL, 'wamid.HBgMMjU0Nzk0MTY1MDM0FQIAERgSMEIwNDNERThFNTY3NTMwMTlCAA==', 'read', NULL, NULL, '2026-08-10T12:59:36.898Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794165034'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '867c3508-e257-4465-a898-f24a44bfaebf', c.id, 'in', 'How long?', NULL, 'wamid.HBgMMjU0Nzk0MTY1MDM0FQIAEhgUM0FBOTE1NjM4QkJFRTdFRkNCNzYA', 'received', NULL, NULL, '2026-08-10T12:59:56.712Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794165034'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '544f0962-6863-4e4e-a758-2874df9cc596', c.id, 'in', '??', NULL, 'wamid.HBgMMjU0Nzk0MTY1MDM0FQIAEhgUM0EzOUU4MEM4NTVFRUY3OTUzMjkA', 'received', NULL, NULL, '2026-08-10T13:10:16.030Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794165034'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8645b543-3b14-43fd-8945-6147495ab1e0', c.id, 'out', '[staff_alert] Still waiting for a reply · Kings (+254794165034) is waiting for a reply and just said "???". Nobody has the dashboard open', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSOTVFNkJDM0I4QzU5NkM3ODhCAA==', 'read', NULL, NULL, '2026-08-10T12:59:37.582Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '806b332b-ccc0-4c77-9e7d-33633d15b863', c.id, 'in', 'Use this number', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0ExOUU4NkIyRjlGNDZFNENEODUA', 'received', NULL, NULL, '2026-08-06T14:58:47.775Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f362a25c-0fc5-4496-b9b4-00cbd71f853e', c.id, 'in', 'Hello I placed an order last week and I’m still waiting for the tracking details', NULL, 'wamid.HBgMMjU0Nzk0MTY1MDM0FQIAEhgUM0FDNzhEMDE2RThFOURCM0I5MEUA', 'received', NULL, NULL, '2026-08-10T12:51:05.618Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794165034'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '98ae5798-4546-4dfd-8af2-584075be0f42', c.id, 'out', 'Saved. We will send the payment request to 0746 542 006.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSQkVDODcxMEIzMjYyNkY1NzY4AA==', 'delivered', NULL, NULL, '2026-08-06T14:58:47.973Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a503fa0e-bfed-40a2-9dea-78d1d23c701d', c.id, 'out', 'Which county are we delivering to?', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSMDhCNjc3ODA1MTMzQUE4ODBFAA==', 'delivered', NULL, NULL, '2026-08-06T14:58:48.637Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '9a451147-8f14-486d-aa2e-fd6416068350', c.id, 'in', 'Nairobi', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0E1N0Q1MTVDNzc0OUFBNjBFMjIA', 'received', NULL, NULL, '2026-08-06T14:58:59.088Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '200d4a3f-4244-4459-9d97-d398444d8903', c.id, 'out', 'Which town or area?', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSM0I4MEMyRjU3NzRCNEEyNzYwAA==', 'delivered', NULL, NULL, '2026-08-06T14:58:59.265Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '43db85ca-b674-4b92-b55e-2c7511723e62', c.id, 'in', 'Back to menu', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0E5QjVBNkQ0MzgyODZCNDMyQzEA', 'received', NULL, NULL, '2026-08-06T14:59:05.372Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '71a0900e-61fe-4bdb-bd67-fbf68b3cfde1', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSMkEwRENEMEQwQUY4RjYzRjBDAA==', 'delivered', NULL, NULL, '2026-08-06T14:59:05.551Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'aadda391-af66-4287-856a-0132c4a5b382', c.id, 'in', 'Nairobi', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0EwMkU3MzQyNzZFODVEOThDQzcA', 'received', NULL, NULL, '2026-08-06T14:59:15.749Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '55843252-8eb4-4014-a1fe-4d468db3600e', c.id, 'out', 'Sorry, I did not get that.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSMERDNEFBN0RGNzU5RjE2NzM5AA==', 'delivered', NULL, NULL, '2026-08-06T14:59:15.921Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '9d5d06c6-7197-4e1e-a2f7-dd2178b76274', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSNDdCMjU4RjI2MzBFNDYwQjg1AA==', 'delivered', NULL, NULL, '2026-08-06T14:59:16.572Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a0a2a1fe-0633-465d-a7c2-82bb0212dc6f', c.id, 'out', 'Thank you — your email is confirmed.', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSNjQ1ODFFQTRBRThFMTQ0MDVCAA==', 'read', NULL, NULL, '2026-08-08T07:59:35.788Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0edc48aa-1587-479e-8c33-3b73f0156683', c.id, 'in', 'Use this number', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAEhgUM0FCQUQzQUJDQjk3NDYwRjZCNUQA', 'received', NULL, NULL, '2026-08-08T07:59:57.601Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'dae7e346-8a2a-469a-8f4e-a63d9a68bd3b', c.id, 'in', 'Start a new order', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0FDMDE2OUE4OTkxMjhCNjY4MUUA', 'received', NULL, NULL, '2026-08-06T14:59:33.457Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '973b4d82-59dd-4542-8ea1-2a062e4c0101', c.id, 'in', '..', NULL, 'wamid.HBgMMjU0Nzk0MTY1MDM0FQIAEhgUM0FFNjlFNThGNDM1OTEzRUZGQ0QA', 'received', NULL, NULL, '2026-08-10T14:16:33.892Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254794165034'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'fecd7fa3-a82a-4ff6-99bc-3192261a585a', c.id, 'out', 'One more thing: may we message you here about your orders, and email you receipts? You can send STOP at any time to end all messages.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSNTJBRTEwNzJCOTAzQkRGNzg2AA==', 'delivered', NULL, NULL, '2026-08-06T14:59:33.631Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '958c9f04-e173-4751-8821-a3e1fa882761', c.id, 'in', 'Yes, go ahead', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0FGQTFCMDkxRUQzOEM1QTA5QkQA', 'received', NULL, NULL, '2026-08-06T14:59:41.228Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2053565d-5d23-4d84-b941-ff93e25e5bd5', c.id, 'out', 'I have sent a 6-digit code to nkathagitonga2@gmail.com. It expires in 10 minutes.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSMzc0MzdDMDYwRkI4MDg2N0FCAA==', 'delivered', NULL, NULL, '2026-08-06T14:59:41.987Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '94e83d70-fbff-4c51-a6b5-5f0abf455414', c.id, 'out', 'Reply with the code to confirm the address is yours.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSOThENUUxMUUxMkY5QzFGREYwAA==', 'delivered', NULL, NULL, '2026-08-06T14:59:42.658Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '47fac127-a3dc-4032-8a8b-b8efc34fa87c', c.id, 'in', '270294', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0FGMTY2NDZGNzVGQzIyMEREREEA', 'received', NULL, NULL, '2026-08-06T14:59:58.031Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5b75cbbd-98c1-499e-bdb0-3a3e62834045', c.id, 'out', 'Thank you — your email is confirmed.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSQTU0OEUzNTBCM0YwODE3QTE1AA==', 'delivered', NULL, NULL, '2026-08-06T14:59:58.248Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '153fc08a-f5b3-427d-b099-c328f65ee2ac', c.id, 'out', 'Which M-Pesa number should we use for payments? 0746 542 006? Tap below to use it, or send a different number.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSRjMwMUVDMDk2NDI4NkY2RjZEAA==', 'delivered', NULL, NULL, '2026-08-06T14:59:59.048Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b370cc15-c268-465c-afd0-373c0e1f6f94', c.id, 'in', 'Use this number', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0EyRTg3MUQzRTI0OURDOUZEMDcA', 'received', NULL, NULL, '2026-08-06T15:00:30.087Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c9d0451b-dd06-41c8-91db-6c7439119055', c.id, 'out', 'Saved. We will send the payment request to 0746 542 006.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSM0FDNjVDQ0VERjBDNDZCQjNDAA==', 'delivered', NULL, NULL, '2026-08-06T15:00:30.271Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd1d5c171-247f-4ed9-b4b1-014e63f5a015', c.id, 'in', 'Nairobi', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0E5OURENkU5MDUwMDczQUU1QjIA', 'received', NULL, NULL, '2026-08-06T15:00:38.997Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '48e4e21d-d4f1-4f40-acc9-74f0f22e9ad5', c.id, 'out', 'Which town or area?', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSQzREODI0QjhDNTFBNUVCNkUwAA==', 'delivered', NULL, NULL, '2026-08-06T15:00:39.177Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '19267250-56c1-41cb-86c4-628cb5d586a3', c.id, 'in', '87 waiyaki way', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0FFRjQwQkRFMDE5MkI1QjY0NzYA', 'received', NULL, NULL, '2026-08-06T15:00:55.080Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '174f4f2c-4dc9-40bf-8d01-bcf6d83d19f7', c.id, 'out', 'Estate or street name?', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSQjc0QjBDMkFDMjgzMTVCOTU4AA==', 'delivered', NULL, NULL, '2026-08-06T15:00:55.263Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '588cd00b-8a40-489f-91b7-1c536b2edb21', c.id, 'in', '87 waiyaki way', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0FDQjIyM0QzQTZBNTkwREJEQzIA', 'received', NULL, NULL, '2026-08-06T15:01:09.809Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd56db04c-c147-4e60-a162-6b8622c1561a', c.id, 'out', 'Which county are we delivering to?', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSMjY5QzlFMDRERjBBOTBDNjc5AA==', 'delivered', NULL, NULL, '2026-08-06T15:00:30.943Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '474a2fe6-856e-4674-b839-c586f2dec0b8', c.id, 'out', 'Building and house or door number?', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSNUZDOUUxM0M4Mzg5NDBFQ0M5AA==', 'delivered', NULL, NULL, '2026-08-06T15:01:09.987Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a1563349-eadf-4c05-99a3-b7ac30f1fcd6', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSNzc0Qzg4MTlCQjQ2Mjc2MjE4AA==', 'read', NULL, NULL, '2026-08-09T04:48:14.409Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '01728578-6f37-4b4e-a729-41044d79302b', c.id, 'in', 'Start a new order', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTVCMjVDNkU4MzNDNUJFRkI1QTJDQzRDNDQ2MUIwODQA', 'received', NULL, NULL, '2026-08-09T04:49:21.181Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0dc1ea38-1f82-43f0-a138-1faa041b77b4', c.id, 'out', 'Before your first order I need a few details: your name, your email, and where we should deliver. Takes about a minute.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSRjc1REZGNENDQUIxODc1NjI5AA==', 'read', NULL, NULL, '2026-08-09T04:49:21.354Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'fe0a5d14-d3f1-4a2c-860f-2e86f032cf32', c.id, 'out', 'What is your full name?', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSQUNGMjVGRkIyN0ZFRjNGMTE0AA==', 'read', NULL, NULL, '2026-08-09T04:49:21.817Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '425e85ed-4212-4c08-807d-50d1a0cf8614', c.id, 'in', 'Shakainah Nyaga', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTU2Q0NCOTQ5NkIxOUZFQzMyNzIyRjNFNDk3MEZDRjEA', 'received', NULL, NULL, '2026-08-09T04:49:39.835Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '98b8f169-c112-4d0a-bd12-fee0734000bd', c.id, 'out', 'What is your email address? We send your receipts and order updates there.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSMTE3NTAxQTI5NjJCMDREMTY2AA==', 'read', NULL, NULL, '2026-08-09T04:49:40.144Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b27ee782-9e51-4963-8c26-afe2cbcc3431', c.id, 'in', 'Nshakainah.work@gmail.com', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTUzQTNEMkM2RjczRTU3NzAzMDAwREM1MDAzMUIxQkUA', 'received', NULL, NULL, '2026-08-09T04:49:55.430Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '4c50401e-3cc6-4edb-a56d-d5da819b72bd', c.id, 'out', 'One more thing: may we message you here about your orders, and email you receipts? You can send STOP at any time to end all messages.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSMjYxMzAxQTUzRTBEQThGRjE2AA==', 'read', NULL, NULL, '2026-08-09T04:49:55.591Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0de22823-5775-444b-9f9f-d06b1041a2e0', c.id, 'in', 'Yes, go ahead', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTVGNzRFRUEzNDQ0NDc3NUExMzI2RjI2RTYxRTI0NEIA', 'received', NULL, NULL, '2026-08-09T04:50:13.039Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '68b09744-25d5-43a9-be03-083bf5312104', c.id, 'out', 'I have sent a 6-digit code to nshakainah.work@gmail.com. It expires in 10 minutes.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSMjBEMzQ5NUExMzA0MjUwNENDAA==', 'read', NULL, NULL, '2026-08-09T04:50:14.116Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '847261e9-29a3-4b46-8e2e-fce1c3b4f2d0', c.id, 'out', 'Reply with the code to confirm the address is yours.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSOEY2REQ1MTIyM0Y1OEFFNjFCAA==', 'read', NULL, NULL, '2026-08-09T04:50:14.589Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5af7ca00-e361-4c3f-b2a9-0ffba3662556', c.id, 'in', 'Hi Wanderi
How are you doing?', NULL, 'wamid.HBgMMjU0NzA0MDAxNjE4FQIAEhgWM0VCMDlEQzVDOUI4MUU5MEYzNDgxMgA=', 'received', NULL, NULL, '2026-08-11T07:32:53.640Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254704001618'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5430d38e-33c8-4cfa-9b7d-30305ea74d3b', c.id, 'out', 'Good Morning, 
Could you please let me know from which country would you like to ship your item from and how many kgs does it weigh?', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAERgSNkE0MTlBOTBGODhEMDc0MjRFAA==', 'read', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-08T07:33:18.687Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2594eff0-4307-4888-b8ac-378bba8bb19f', c.id, 'out', 'Anything the rider should know? A landmark, a gate code, a time that suits you. Tap Skip if not.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSMUIwMkI1QzNCRDAxNDlBQ0E3AA==', 'delivered', NULL, NULL, '2026-08-06T15:01:23.389Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'dc7e9ef1-dde3-4ec4-854c-5c9e4ab9f842', c.id, 'in', 'Skip', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0E5RTlDMjgxQjJFNThBRTc4RkMA', 'received', NULL, NULL, '2026-08-06T15:01:41.987Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '4c73d135-5d59-4b1d-9456-3e864ef9bb67', c.id, 'in', '216936', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTU0OTc0Q0Q2Mzc1QzJDQzBFNDNDQTEyQkJFRTlEMjMA', 'received', NULL, NULL, '2026-08-09T04:50:58.384Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '85f2518c-75a6-4734-9db8-ef9f135d66ac', c.id, 'out', 'Send me the link to what you want. You can paste several at once, or send them one at a time.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSMTM3OTREN0ZDOTYyQzBFODRBAA==', 'delivered', NULL, NULL, '2026-08-06T15:01:42.817Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '4bfbf94f-5e60-4991-bee3-f45e84dba9c5', c.id, 'out', 'You are all set. I have saved your details, so next time you can go straight to ordering.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSNjc3OEI2MDg1QzBENkQzNzI3AA==', 'delivered', NULL, NULL, '2026-08-06T15:01:42.233Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'eb95d35f-5798-452e-ad78-6b0e772fde91', c.id, 'in', 'Back to menu', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0ExRURFQkY5N0NDNkNENzc0QkQA', 'received', NULL, NULL, '2026-08-06T15:02:01.421Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '147a8d36-eae5-4d5c-bbe6-fecfa50b0c07', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSNDk5MTlBNTREOEMxNjQ5MzBFAA==', 'delivered', NULL, NULL, '2026-08-06T15:02:01.601Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '50464187-61af-473e-ada5-1536ae750384', c.id, 'in', 'Start a new order', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0FBMzkwRjE3NzY2NTgzQkNCNDEA', 'received', NULL, NULL, '2026-08-06T15:02:12.619Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c5f5ed18-374a-4a89-bef1-4828716a2624', c.id, 'out', 'Send me the link to what you want. You can paste several at once, or send them one at a time.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSNzM0RThBQjhFOUY1RkQ4NTVDAA==', 'delivered', NULL, NULL, '2026-08-06T15:02:12.831Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '84862db6-7b0a-4a76-9671-d8f25353107e', c.id, 'in', 'I found some great items at SHEIN!
These items in my shopping cart are great. I highly recommend them to everyone!
https://onelink.shein.com/46/5y1u2ggqhezv?shc=2_RSl56m2ZIVy', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0E4MjhBNTY3RjEwM0EyRTczNUYA', 'received', NULL, NULL, '2026-08-06T15:04:36.902Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7d638d56-8d63-46fb-8516-96e5139d6c7e', c.id, 'out', 'That is 1 item so far. Send another link, or tap Done.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSNkZFRjI2ODMyN0JBMkJCQTExAA==', 'delivered', NULL, NULL, '2026-08-06T15:04:37.118Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '210d0ce0-985d-4358-a966-732ddb6bf32e', c.id, 'in', 'Done', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0E4N0MyOTAzNkZENUFFRDVFOEYA', 'received', NULL, NULL, '2026-08-06T15:04:44.820Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7d07644f-9308-484e-b96b-2c51e739d84c', c.id, 'out', 'Here is your order:

1. onelink.shein.com/46/5y1u2ggqhezv

We will send you one all-inclusive price in KES — delivery to your door included.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSNzJDNTlFQ0VFNDhGODEwMDY4AA==', 'delivered', NULL, NULL, '2026-08-06T15:04:44.995Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '010cbd4b-3140-40ce-9ff5-5ed5ec9364cf', c.id, 'out', 'Your quote for order SH-2608-0002 is ready: KES 3,362, all inclusive — delivery to your door included. Tap below to pay by M-Pesa, or reply ACCEPT.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSREVEQzVCQTVDMTVDOTFCREUwAA==', 'delivered', NULL, NULL, '2026-08-06T15:08:58.619Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5c5ab17b-192e-47ea-8314-914a5aa09952', c.id, 'out', '[staff_alert] New order confirmed · New order SH-2608-0002 from Leah Gitonga nkathagitonga2@gmail.com 87 waiyaki way (+254746542006), 1 item. It needs pricing before a quote can go out', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSRDMxRDBDRTBCQThBNDU4QzcxAA==', 'read', NULL, NULL, '2026-08-06T15:05:15.498Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ee9e713c-3c73-473a-a2a7-4832d6dbf85b', c.id, 'out', 'Thank you — your email is confirmed.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSNDBCNERENURBODgzM0Q2Rjk2AA==', 'read', NULL, NULL, '2026-08-09T04:50:58.612Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2b60f415-923b-4324-a9a0-45ca6924c930', c.id, 'out', 'Which M-Pesa number should we use for payments? 0792 180 397? Tap below to use it, or send a different number.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSNkVCM0Q1MUY5RDQ5NDNENDYyAA==', 'read', NULL, NULL, '2026-08-09T04:50:59.161Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5a2fabe4-32fc-48b0-9526-d9a0babbac91', c.id, 'in', 'Use this number', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTVGQ0NFRjA0NzMzNUI0NUQwRkEzRTU1MDdBRTU2ODQA', 'received', NULL, NULL, '2026-08-09T04:51:10.674Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '49794ec6-f018-4007-b9ba-2d4ad7e8071b', c.id, 'out', 'Saved. We will send the payment request to 0792 180 397.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSNjM0QjUzQjE2RTkxODQ3NDg5AA==', 'read', NULL, NULL, '2026-08-09T04:51:10.852Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '87f8a57f-8c1a-4ca5-b670-da7391d7e97e', c.id, 'out', 'Which county are we delivering to?', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSQUVEMEQwODI2N0I2NEZFMTgzAA==', 'read', NULL, NULL, '2026-08-09T04:51:11.335Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd5d6e7a1-0ebe-4bf0-a653-279518ed30d7', c.id, 'in', 'Kiambu', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTU3MDZGN0M4QjM4OEI2MjIzQzM3NjVEOTBGRDU0QUYA', 'received', NULL, NULL, '2026-08-09T04:51:26.786Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '40efb037-59f1-47ae-9975-35df4055cc46', c.id, 'out', 'Which town or area?', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSNjM3MEU3RjMyNDUwODQ4NzY5AA==', 'read', NULL, NULL, '2026-08-09T04:51:26.942Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '1c3e79ab-d580-4755-bec8-5a1a75eab5cf', c.id, 'in', 'Back to menu', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTU4QjFCRUI5NzFFQzc5ODc1MjlGRTc2OURFRUNFMDMA', 'received', NULL, NULL, '2026-08-09T04:51:31.380Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '04d6cf1e-734f-44b8-8cc7-e986a7d4ec64', c.id, 'in', 'Confirm', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0FBRDE1MDU2NjUxRTc0NTcwQTQA', 'received', NULL, NULL, '2026-08-06T15:05:14.526Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c2cda686-7cba-45b0-9cc9-c3dde8f90c83', c.id, 'out', 'Thank you. Our team is pricing your order now and I will message you here with the total.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSRTFGMDMwNkE2QTk4NDcxNDhFAA==', 'delivered', NULL, NULL, '2026-08-06T15:05:14.823Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '634a8915-0115-4868-8f33-a73e1953990a', c.id, 'in', 'https://onelink.shein.com/46/5y49d4wwyy4b?shc=2_RSuVnMo5Rbg', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0FGOTk5QjNDRTk0RjFFRTlBQ0IA', 'received', NULL, NULL, '2026-08-07T07:00:25.703Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '525a849d-2c95-4867-95ec-09ad16bce10f', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSMzg4RkE5QkJCQjYzNkRDRDRGAA==', 'read', NULL, NULL, '2026-08-09T04:51:31.536Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'be6ba032-6749-44b8-8bbb-0481dd455379', c.id, 'out', 'Got it — I can order that for you.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSQkI3MjcxNDZDRDRFMzgzQjIxAA==', 'delivered', NULL, NULL, '2026-08-07T07:00:26.347Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0f28d168-1fb8-41e8-8cfa-0480799ab223', c.id, 'out', 'That is 1 item so far. Send another link, or tap Done.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSRERFOURDRjE5NkI3N0E1RTk4AA==', 'delivered', NULL, NULL, '2026-08-07T07:00:27.570Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a73846b5-7531-45b0-84b9-4779b9434cd0', c.id, 'in', 'Done', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0E4MjdEREJGNjEzQUUzOEFERkIA', 'received', NULL, NULL, '2026-08-07T07:00:34.880Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '15617a40-e1ea-424f-9426-daaebb6aa75c', c.id, 'out', 'Estate or street name?', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSNzBDN0NEMzJBOTAyQjBFQTg5AA==', 'read', NULL, NULL, '2026-08-09T04:53:57.004Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'fb593212-6bae-443b-a124-40fddabcb69a', c.id, 'out', 'Here is your order:

1. onelink.shein.com/46/5y49d4wwyy4b

We will send you one all-inclusive price in KES — delivery to your door included.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSNjM2RjQxMTMwREI1OEIzRkM0AA==', 'delivered', NULL, NULL, '2026-08-07T07:00:35.063Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '45aa258c-85c2-4ee0-b8bd-62bc76fd70b7', c.id, 'out', 'Welcome back. What would you like to do?', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAERgSMzE3QzdFMkNDNDg2ODMzQjZBAA==', 'read', NULL, NULL, '2026-08-09T19:19:37.067Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7d56a707-dacb-42d7-b35e-6ad662ab03e7', c.id, 'in', 'Talk to a person', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAEhgUM0E1RDFDNDg3NjYyQTZDRkRCNzkA', 'received', NULL, NULL, '2026-08-09T19:19:59.299Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ec5fb951-2490-4be1-900e-17bd83710eb2', c.id, 'out', 'No problem — I am getting a person for you. Someone from our team will reply here shortly.', NULL, 'wamid.HBgMMjU0MTEyNjE3NDA1FQIAERgSRDQ3MjY2NkU3N0RERTI1MzU0AA==', 'read', NULL, NULL, '2026-08-09T19:19:59.472Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112617405'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b5c9e629-dc2a-49c0-a52d-4f454a5839f8', c.id, 'in', 'Confirm', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAEhgUM0E2N0I0NjkyRjRFQ0FCODg4MEMA', 'received', NULL, NULL, '2026-08-07T07:00:41.750Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '3071247b-60f2-4b97-a163-3059b2fe19e6', c.id, 'in', 'Sorry, Juja Gate C area', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTU2RDYyRTExMkIwOTMwRTA0NEQwMkQ4QzYwNEMxRDgA', 'received', NULL, NULL, '2026-08-09T04:52:08.286Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'cd732852-d667-46ad-9ee7-af28ec5c1294', c.id, 'out', 'Thank you. Our team is pricing your order now and I will message you here with the total.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSQTIyMTk5NkU5NjBBRkVFMkNDAA==', 'delivered', NULL, NULL, '2026-08-07T07:00:42.064Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b49c8fe6-2063-4ab6-a1f1-5ef38525ca5e', c.id, 'out', 'Your quote for order SH-2608-0003 is ready: KES 1,910, all inclusive — delivery to your door included. Tap below to pay by M-Pesa, or reply ACCEPT.', NULL, 'wamid.HBgMMjU0NzQ2NTQyMDA2FQIAERgSMjU1MUZDMkZDNENDOUQxNjY4AA==', 'delivered', NULL, NULL, '2026-08-07T08:44:48.374Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '3d410e7b-41f2-4055-b0a7-882c4070806e', c.id, 'in', 'Okay .Let me send other items then you tell me the price .', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAEhggQUNCMzU5QzE2NzE4M0I2NTUwODkyQ0MyMjYxRkEyOTgA', 'received', NULL, NULL, '2026-08-07T10:17:55.514Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '4300bb4a-c4ea-41c2-afd5-89318c802fca', c.id, 'out', 'Good Morning. Just following up to see if you are still interested in the SHEIN items. Please let me know if I can help in any way.', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSOTk4MTlDNUZEQjYwRkU1MUY5AA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-07T08:48:58.077Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'db16769e-c219-49af-82a9-88e853fe6981', c.id, 'out', '[staff_alert] New order confirmed · New order SH-2608-0003 from Leah Gitonga nkathagitonga2@gmail.com 87 waiyaki way (+254746542006), 1 item. It needs pricing before a quote can go out', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSQUY1RkJDRDU4NjkwRUFDQjcwAA==', 'read', NULL, NULL, '2026-08-07T07:00:42.833Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '8a444423-5982-4ac7-8a08-ff10f790f2b6', c.id, 'out', 'Sorry, I did not get that.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSQjVGOEY4M0EzREYzODgwRURGAA==', 'read', NULL, NULL, '2026-08-09T04:52:08.447Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '2a90faea-647b-4736-9807-35f1811de2dd', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSOTg0Rjk1RTgzMjk5MDU2NjM2AA==', 'read', NULL, NULL, '2026-08-09T04:52:08.947Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a96082c1-44b0-4c20-8f80-89f258d3e615', c.id, 'in', 'Hello', NULL, 'wamid.HBgMMjU0MTEzOTIzMDc0FQIAEhggQUNGQkI2NEI3NDlBMDU4RUNENUI5MDQzRTc0OUEzODMA', 'received', NULL, NULL, '2026-08-11T14:15:58.842Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254113923074'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '86a26632-4ccb-4782-aae2-8cbc4cfa6619', c.id, 'out', 'Okay', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSMDM5MDYyOTMyOEFENTI2MDQ4AA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-07T10:22:58.014Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a5e76283-16a1-4144-a9f1-12c4112e7e3f', c.id, 'out', '[staff_alert] Still waiting for a reply · 🍒🥰 (+254722904692) has been waiting over 1h for a reply and just said "Okay .Let me send other items then you tell me the price .". Nobody has the dashboard open', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMEY3N0ZBMkVCNjZGQkY1NzU0AA==', 'read', NULL, NULL, '2026-08-07T10:17:56.225Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a96b2da4-8a9b-426f-9755-7868a6fb17f1', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAERgSRURDOUZFMDVEMzlCMjI5ODE5AA==', 'read', NULL, NULL, '2026-08-07T20:35:14.364Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '01154d35-c519-4216-bdcc-db961d85b42b', c.id, 'out', 'Welcome back. What would you like to do?', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSOUZBQzk0NERBMTYwRjRCNDUxAA==', 'read', NULL, NULL, '2026-08-07T18:15:06.302Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0623f69a-8a69-416c-b3bd-02d26a0130db', c.id, 'out', '[staff_alert] Payment not completed · Patience Chepkirui (+254768115922) did not answer the M-Pesa prompt for order SH-2607-0004 (KES 951). They have been told nothing was taken and the quote still stands, so a nudge may be all it needs', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSRUJDNzFERTAxM0Q0OTMxNjY3AA==', 'read', NULL, NULL, '2026-08-07T18:15:08.205Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'bebc0d96-c3b6-4b89-91fb-4162fabe5389', c.id, 'out', 'That M-Pesa payment for order SH-2607-0004 did not go through, so nothing has been taken from your account. Your quote of KES 951 is still valid — reply YES and I will send the request again, or say “agent” if you would like a person to help.', NULL, 'wamid.HBgMMjU0NzY4MTE1OTIyFQIAERgSMkMwOURDQUJBMzlFNjkwQ0U0AA==', 'read', NULL, NULL, '2026-08-07T18:15:07.425Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'bd24d1d7-bb30-4125-bf1b-456111b17a6b', c.id, 'in', 'hello', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAEhggQUMwM0E1NjIyMTA5OUVBNDNFRUU1MjYyRUEwRTE4NUMA', 'received', NULL, NULL, '2026-08-07T20:35:13.813Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '1d31f23c-0862-4d9f-a9d0-cb84e6baa62a', c.id, 'in', 'How it works', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAEhggQUNEMzZERTU2Qjg1MTVGN0RFMEI4OTU3RkVFNjZERjYA', 'received', NULL, NULL, '2026-08-07T20:40:06.963Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a0369080-a882-4be9-92d0-eb0d2a06b073', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAERgSNTI0MjFCOURCRDlBMEM1M0U2AA==', 'read', NULL, NULL, '2026-08-07T20:40:08.148Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd4f6d409-a9ef-4e9e-90f7-56cab6dbd14a', c.id, 'out', 'Here is how it works:

1. You send us the link to what you want.
2. We tell you one all-inclusive price in KES — shipping to your door included.
3. You pay by M-Pesa.
4. We buy it, fly it in, and deliver it to you.

No customs paperwork for you, and no surprise charges at the end.', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAERgSQjc4Q0Q4M0Y5MTFBNUVBMkM4AA==', 'read', NULL, NULL, '2026-08-07T20:40:07.178Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '3512cc52-9847-4a0b-8606-6cfdc7473c82', c.id, 'in', 'i have a package already. I just want it shipped', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAEhggQUNFMDE0NzFGN0E0OTQ4RTc1MENCMDI1NDBBMEVBMkIA', 'received', NULL, NULL, '2026-08-07T20:41:05.703Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '95bfc3e1-bf89-490b-b4d1-d900e42f57c6', c.id, 'out', 'Sorry, I did not get that.', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAERgSQzU3NkNENzMxMThBMUE4QzlFAA==', 'read', NULL, NULL, '2026-08-07T20:41:05.886Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '1b3f739f-caa2-4f1c-9172-c8c4f1721837', c.id, 'out', 'Good Morning. Hope you are well. I’m following to see if you were able to get your cart?', NULL, 'wamid.HBgMMjU0NzIyOTA0NjkyFQIAERgSMkQzM0QxOEY0MDdGREFEOTc2AA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-08T07:38:04.642Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254722904692'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'cbc60968-2740-4cf0-9bac-a32e25fb15d3', c.id, 'in', 'Good morning', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAEhgUM0E3MkI3NzZCN0NFQUE4MTM3RjcA', 'received', NULL, NULL, '2026-08-08T07:56:57.606Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f72aaa23-74d0-408b-87c7-477c661c62c3', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAERgSMzFBNDk2MTRCOEU3OTM3NUJEAA==', 'read', NULL, NULL, '2026-08-07T20:41:06.449Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'dae6ed85-468e-4913-b596-5d91e403f0a8', c.id, 'in', 'Talk to a person', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAEhggQUM2Q0JCMTYzQkRCRjgyMzlGNzg5N0FFQkM4QjcxMkUA', 'received', NULL, NULL, '2026-08-07T20:41:31.275Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0d988857-fe6e-4e45-9f0d-59f4fd7efea3', c.id, 'in', 'Start a new order', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTUyM0NGQjVEOUNBMDNFNTdEQkNBQUIwNDM1QkY1REYA', 'received', NULL, NULL, '2026-08-09T04:52:24.056Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f894afc3-c4c8-4332-9a13-0eb6119d8c10', c.id, 'out', 'No problem — I am getting a person for you. Someone from our team will reply here shortly.', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAERgSRTgwREQ4NjBFODgyM0E2RTk4AA==', 'read', NULL, NULL, '2026-08-07T20:41:31.613Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '4e3a3d6a-a848-468b-84d7-27168aed8895', c.id, 'in', 'i have a package already. I just want it shipped', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAEhggQUMyQTM4QTdCODZCNEU1MDJBNEM3Qjc3MDY5QUFEQjEA', 'received', NULL, NULL, '2026-08-07T20:41:37.100Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '65540ae9-042f-4b0c-9629-04e9a9ddb17f', c.id, 'out', 'One more thing: may we message you here about your orders, and email you receipts? You can send STOP at any time to end all messages.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSNUQzMjJFMEFBRDg1RDU4QjBFAA==', 'read', NULL, NULL, '2026-08-09T04:52:24.214Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7200c35a-45e7-430e-b60f-3da1585f7625', c.id, 'out', '[staff_alert] A customer needs a person · A customer needs a person. ralph (+254726626005) said "Talk to a person", and the bot has stopped replying — the thread is waiting in the inbox', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSQ0M1M0IzNUQyNDUyOUEwMTUyAA==', 'read', NULL, NULL, '2026-08-07T20:41:32.381Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'db4d6ada-a499-4b62-bebd-778d78b3019a', c.id, 'in', 'Yes, go ahead', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTU5NjRFNzU0NzE5Nzk4MEVENkVDMURCRDRDRTExMjkA', 'received', NULL, NULL, '2026-08-09T04:52:31.574Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '08c106b6-e6a6-4ac7-8ab6-8db76f0fc6e2', c.id, 'out', 'Thanks — one of our team has this and will reply here shortly. No need to send it again.', NULL, 'wamid.HBgMMjU0NzI2NjI2MDA1FQIAERgSNUM3RTZDRTE2OTQ5MzAwRjA0AA==', 'read', NULL, NULL, '2026-08-07T20:41:37.273Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254726626005'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '54f314de-7e0a-4cc7-b9dc-0f6266dac1d5', c.id, 'out', '[staff_alert] Still waiting for a reply · ralph (+254726626005) is waiting for a reply and just said "i have a package already. I just want it shipped". Nobody has the dashboard open', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMjFGRDEyQzJBNzhDRjZBMERBAA==', 'read', NULL, NULL, '2026-08-07T20:41:37.932Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f650e13a-24b0-47f7-b73f-32b19d7101f1', c.id, 'out', 'I have sent a 6-digit code to nshakainah.work@gmail.com. It expires in 10 minutes.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSNjczNjU5MjVBM0REMUVBRTVBAA==', 'read', NULL, NULL, '2026-08-09T04:52:32.276Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c3e3a335-3cf4-4c43-996e-f43e4ad1b3fd', c.id, 'out', 'Reply with the code to confirm the address is yours.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSNUZFOUU2MTE0OUFFRTZFNjQ3AA==', 'read', NULL, NULL, '2026-08-09T04:52:32.784Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '25ae8f9f-33e8-46ec-b7d1-98724d5abf62', c.id, 'in', '009266', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTU4QkVFNzQyOUE0MDEyRUJFOTdERUFGQTU4M0Q5N0EA', 'received', NULL, NULL, '2026-08-09T04:53:28.859Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'bd41ade7-11b1-4a21-a72f-60085866e7ee', c.id, 'in', 'Hey, inquiring on SHEIN shipment', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAEhgUM0EwOTJBODA1NTM1RDY4QkJCMkQA', 'received', NULL, NULL, '2026-08-11T15:25:18.886Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '276e5090-4907-477a-845b-5abedec7127f', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSNEEwRkMzMjEzOEE5RjUzREQzAA==', 'read', NULL, NULL, '2026-08-08T07:56:58.047Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ee9f1aa5-185d-4bcc-8c46-c03e8251eeb1', c.id, 'in', 'How it works', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAEhgUM0FERjZDMkVGNDk1Q0M1MTkxM0QA', 'received', NULL, NULL, '2026-08-08T07:57:44.539Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '30fa3e5d-5c5a-4f4a-b043-46d721b3c168', c.id, 'out', 'Here is how it works:

1. You send us the link to what you want.
2. We tell you one all-inclusive price in KES — shipping to your door included.
3. You pay by M-Pesa.
4. We buy it, fly it in, and deliver it to you.

No customs paperwork for you, and no surprise charges at the end.', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSOUZCQTUxQkRBQTRFMTM3QUE0AA==', 'read', NULL, NULL, '2026-08-08T07:57:44.751Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '39a3788a-a218-4392-8ef0-12ae93d054be', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSOTNFNUIyN0RDNzU3REVFN0I3AA==', 'read', NULL, NULL, '2026-08-08T07:57:45.352Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ce771a5f-70a7-4209-a926-09f92ebfb665', c.id, 'in', 'Start an order', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAEhgUM0EzRUI0MkUxMTY5OUY1QzZDNDcA', 'received', NULL, NULL, '2026-08-08T07:57:59.333Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '6fa92727-ccdc-43c1-895c-604045f09463', c.id, 'out', 'Before your first order I need a few details: your name, your email, and where we should deliver. Takes about a minute.', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSQTY3OERGNzE1M0FEMzRGMUQxAA==', 'read', NULL, NULL, '2026-08-08T07:57:59.668Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '40fe5180-b652-4e33-b709-c1721a5f3ce8', c.id, 'out', 'What is your full name?', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSMDVFREIzMzIxQjBDN0U0NTkwAA==', 'read', NULL, NULL, '2026-08-08T07:58:00.239Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '50f251be-8c59-45ed-aa1a-57cd45dd9a08', c.id, 'in', 'Emmah Gatwiri', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAEhgUM0FBRjcwRTZBOTI4MTVGQ0E1QUUA', 'received', NULL, NULL, '2026-08-08T07:58:33.032Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7b91951e-4ed4-42f9-ae2d-dbb09d5df900', c.id, 'out', 'What is your email address? We send your receipts and order updates there.', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSNENDOERDM0NENkFDOTVDRDMxAA==', 'read', NULL, NULL, '2026-08-08T07:58:33.199Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '3a10ae87-9732-4a10-bc8d-f9339abf6de1', c.id, 'in', 'emmahgatwiri38@gmail.com', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAEhgUM0FDNjI4QzhBNzRDMkYxM0ZCNjgA', 'received', NULL, NULL, '2026-08-08T07:58:53.327Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c9c9f546-3e91-485f-a0b0-3448b8a61bba', c.id, 'out', 'One more thing: may we message you here about your orders, and email you receipts? You can send STOP at any time to end all messages.', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSOEUwMUU4RUYzNUNGQkQ2MzQxAA==', 'read', NULL, NULL, '2026-08-08T07:58:53.488Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '27d47230-5449-4123-91e4-77d4884d5216', c.id, 'in', 'Yes, go ahead', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAEhgUM0E4MjY5QTM5RjE3RTU1MjRDODUA', 'received', NULL, NULL, '2026-08-08T07:59:04.620Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '240ff699-dd00-4626-b3eb-55b28c3b943a', c.id, 'out', 'I have sent a 6-digit code to emmahgatwiri38@gmail.com. It expires in 10 minutes.', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSOUIxQ0M0OTk0NjlERTU4QThEAA==', 'read', NULL, NULL, '2026-08-08T07:59:05.705Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0883650f-1c5d-491d-8a0c-4991b67e0db9', c.id, 'out', 'Reply with the code to confirm the address is yours.', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSNEM2NUVCNTU0RjQ5OUNBNjQzAA==', 'read', NULL, NULL, '2026-08-08T07:59:06.289Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5c67a0d5-1a11-4c1f-b968-391159e5f64b', c.id, 'out', 'Which M-Pesa number should we use for payments? 0112 082 879? Tap below to use it, or send a different number.', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSRDRDMURBQkZDMDVCQTZDMEJCAA==', 'read', NULL, NULL, '2026-08-08T07:59:36.390Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '05319e2a-3154-45c6-b788-9b05c134b7c2', c.id, 'in', 'Talk to a person', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAEhgUM0EyNzE3Q0RGRURFRTRENjE4NEMA', 'received', NULL, NULL, '2026-08-08T08:00:28.483Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '3a867333-3497-47f2-bf16-aeb9da522122', c.id, 'out', 'No problem — I am getting a person for you. Someone from our team will reply here shortly.', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSMDcxOTlGNzFGRDE2QkM2RjUwAA==', 'read', NULL, NULL, '2026-08-08T08:00:28.648Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a8d17e05-6b57-43ec-9349-31c3145da514', c.id, 'out', 'Thank you — your email is confirmed.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSQjhFOUY3RTQyNjU1Q0Q0N0UwAA==', 'read', NULL, NULL, '2026-08-09T04:53:29.059Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '9f3cb043-b1e8-416a-a7dc-776fb1891996', c.id, 'out', 'Which M-Pesa number should we use for payments? 0792 180 397? Tap below to use it, or send a different number.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSOEVBODQ3NEM2QzEzNzYzNDQ1AA==', 'read', NULL, NULL, '2026-08-09T04:53:29.640Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '5c4443dd-b0ca-407b-b9ed-34ac346246c2', c.id, 'in', 'Use this number', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTU1MDQ4Q0VGNjU3QUQwODg0RkE3NTdGQjYzNERGQTEA', 'received', NULL, NULL, '2026-08-09T04:53:33.968Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'cebf3675-97ae-4b12-ade2-97e79e6de085', c.id, 'out', 'Saved. We will send the payment request to 0792 180 397.', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSQjIwREE3OUMyNEFDNjZCREQwAA==', 'read', NULL, NULL, '2026-08-09T04:53:34.135Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'aa2eeedf-1605-4396-a3b2-d5377a96065f', c.id, 'out', 'Which county are we delivering to?', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSNDY4MDlEOTlEOTk3MDEzMDJBAA==', 'read', NULL, NULL, '2026-08-09T04:53:34.616Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '4433fb2f-2e42-4a18-859b-89803db4b1b1', c.id, 'in', 'Kiambu', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTVCNjkyOUIxMkY2RDI3RkVBRDlFMUVFMDVGMUQwRjIA', 'received', NULL, NULL, '2026-08-09T04:53:40.763Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '90f66cf2-e88d-4fe4-af2b-b07c0c71e8f0', c.id, 'out', 'Which town or area?', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAERgSQjdGQjg0Njg1MzQwQUVFRkM3AA==', 'read', NULL, NULL, '2026-08-09T04:53:40.940Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '89d90f8a-89c2-403e-9709-719b50e06ddc', c.id, 'in', 'faithkilonzo005@gmail.com', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAEhgUM0EzNDMxODBEN0UzQjI1QjQwMEYA', 'received', NULL, NULL, '2026-08-11T15:28:02.467Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '839e7e37-7028-4e77-a712-853ac48239c9', c.id, 'out', 'One more thing: may we message you here about your orders, and email you receipts? You can send STOP at any time to end all messages.', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAERgSNjVENDQ3MDlENzg4RkIzOTUyAA==', 'delivered', NULL, NULL, '2026-08-11T15:28:02.638Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '1fe72853-7aa6-45d9-98f9-e781fb5417e1', c.id, 'in', 'Yes', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAEhgUM0FBMTUwQ0FFMDRGNEFDMTc2ODYA', 'received', NULL, NULL, '2026-08-11T15:28:32.860Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '87e59bca-83ba-466a-a3b7-9799fdbe082b', c.id, 'out', 'I have sent a 6-digit code to faithkilonzo005@gmail.com. It expires in 10 minutes.', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAERgSQjNEQjhBNTJGMDRFQzRBRUFBAA==', 'delivered', NULL, NULL, '2026-08-11T15:28:33.801Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd8ab9081-9a91-462b-a030-1f6860e9c05c', c.id, 'out', '[staff_alert] A customer needs a person · A customer needs a person. Emmah Gatwiri (+254112082879) said "Talk to a person", and the bot has stopped replying — the thread is waiting in the inbox', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMzUyRkFFMkUwOTMyMDlBNkIyAA==', 'read', NULL, NULL, '2026-08-08T08:00:29.380Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'acba9206-de93-42a8-9eb8-518bf2061c49', c.id, 'out', 'Saved. We will send the payment request to 0112 082 879.', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSRkQ1QzUyRjYyM0M2RjU3RDhDAA==', 'read', NULL, NULL, '2026-08-08T07:59:57.787Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c08b62c8-6af3-4edf-ae52-93f896dd5ea3', c.id, 'out', 'Which county are we delivering to?', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSQzk2QkM4ODAwQ0M5NDQyRTU5AA==', 'read', NULL, NULL, '2026-08-08T07:59:58.373Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b7105aa3-769a-4c45-9a70-af0b8196b0b4', c.id, 'in', 'Back to menu', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAEhgUM0E5QkE5QUJBRjU3NjQzOEFDQ0UA', 'received', NULL, NULL, '2026-08-08T08:00:00.589Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '42f0964c-fa9e-45be-bbbe-70abb870802a', c.id, 'in', 'Juja Gate C area', NULL, 'wamid.HBgMMjU0NzkyMTgwMzk3FQIAEhggQTUzQURCNDE2MTQ5QzM0QjEyREIwREJENTg3MzVERTYA', 'received', NULL, NULL, '2026-08-09T04:53:56.812Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254792180397'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '268ea119-cbd3-4ec9-95c0-0a0f61d231a0', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSRUJBRjExMjQ0RTcxNzJFNzc4AA==', 'read', NULL, NULL, '2026-08-08T08:00:00.758Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'c92df92a-47c1-4481-b4f2-a93a63a78e7e', c.id, 'in', 'Nairobi', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAEhgUM0FDQkNCQUQ2NjEwNzYxNTZCNzMA', 'received', NULL, NULL, '2026-08-08T08:00:08.126Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '83570711-241d-4498-9f72-628506f43b7e', c.id, 'out', 'Sorry, I did not get that.', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSNEI1RTc5OTQ3ODEyM0VCNjA2AA==', 'read', NULL, NULL, '2026-08-08T08:00:08.289Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7527e8cb-20fb-44a8-93ab-91117793e848', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSRjNBQTdBNzM4OUNBNDgzRDJBAA==', 'read', NULL, NULL, '2026-08-08T08:00:08.895Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7bfe0c65-b9af-4dc4-8bcc-244241f50cf2', c.id, 'in', 'Start a new order', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAEhgUM0FDNkFCRTEyQjlEMDVEODA4NzUA', 'received', NULL, NULL, '2026-08-08T08:00:18.435Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ecd53dc3-65df-4e2b-b6ab-9123b56e4773', c.id, 'out', 'One more thing: may we message you here about your orders, and email you receipts? You can send STOP at any time to end all messages.', NULL, 'wamid.HBgMMjU0MTEyMDgyODc5FQIAERgSRUM3QjZENUVGMDlDODEyOUIwAA==', 'read', NULL, NULL, '2026-08-08T08:00:18.606Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254112082879'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd41c3fb6-86c9-48a2-9c76-d7a0342fd309', c.id, 'out', 'Reply with the code to confirm the address is yours.', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAERgSNTVDQTRBNjIxRTEwNjFGMTBDAA==', 'delivered', NULL, NULL, '2026-08-11T15:28:34.479Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '383e1c0d-e127-4049-acd9-8775c826a087', c.id, 'out', '[staff_alert] Still waiting for a reply · Kings (+254794165034) has been waiting 10 minutes for a reply and just said "??". Nobody has the dashboard open', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSRTU5NjU2REZCQUEwMTc2MUJDAA==', 'read', NULL, NULL, '2026-08-10T13:10:16.275Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '957738b0-3e3b-48de-b6bd-6125cac045dd', c.id, 'out', '[staff_alert] Still waiting for a reply · Kings (+254794165034) has been waiting over 1h for a reply and just said "..". Nobody has the dashboard open', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSMkQ2RDk2NDJGQUE1ODIzMTVCAA==', 'read', NULL, NULL, '2026-08-10T14:16:34.543Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'bac850eb-7d42-4e03-9078-d1f1137fbe16', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMMjU0NzA0MDAxNjE4FQIAERgSNDc0QjY1MjBEMjVBQ0IxMzJGAA==', 'read', NULL, NULL, '2026-08-11T07:32:54.281Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254704001618'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '432bdbc6-e465-40ff-a325-2a25c8489052', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMMjU0MTEzOTIzMDc0FQIAERgSNDE1NDgwOUQxNkE5NUM1NEVCAA==', 'read', NULL, NULL, '2026-08-11T14:15:59.390Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254113923074'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '6d1c4400-ae75-467e-95f1-1c46622e2da2', c.id, 'in', 'How it works', NULL, 'wamid.HBgMMjU0MTEzOTIzMDc0FQIAEhggQUM0Mzk1QUYyRUIzQkY3NkZDMEUxRUFCQzQ1QTdDODAA', 'received', NULL, NULL, '2026-08-11T14:16:25.633Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254113923074'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '4239bacf-b1df-4bfe-9f5b-04af9fee2f0b', c.id, 'out', 'Here is how it works:

1. You send us the link to what you want.
2. We tell you one all-inclusive price in KES — shipping to your door included.
3. You pay by M-Pesa.
4. We buy it, fly it in, and deliver it to you.

No customs paperwork for you, and no surprise charges at the end.', NULL, 'wamid.HBgMMjU0MTEzOTIzMDc0FQIAERgSNjg0MTA1RjNBNUIyNjUzNEE2AA==', 'read', NULL, NULL, '2026-08-11T14:16:25.845Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254113923074'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e9c1331c-cacd-4cff-819c-fb6ef71bd611', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0MTEzOTIzMDc0FQIAERgSRjVEOEUxMzVENDRFREJCM0UwAA==', 'read', NULL, NULL, '2026-08-11T14:16:26.580Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254113923074'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'dbf2bcbb-7662-44f8-92c0-e716e73e20b0', c.id, 'out', 'Karibu 254Shippers 👋 We buy what you want from overseas shops and deliver it to your door in Kenya. Tap below to see what we can do.', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAERgSMjcwMTM0MjdCNzMzRTM1RUYyAA==', 'delivered', NULL, NULL, '2026-08-11T15:25:19.418Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '96b2185a-c6b7-411d-8345-6b9af0869116', c.id, 'in', 'How it works', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAEhgUM0FGM0ZFNDQ2MzVDNkJBQ0VDQ0YA', 'received', NULL, NULL, '2026-08-11T15:25:49.264Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0c9bbc74-3d7c-47d0-90b7-00eb782cb2e0', c.id, 'out', 'Here is how it works:

1. You send us the link to what you want.
2. We tell you one all-inclusive price in KES — shipping to your door included.
3. You pay by M-Pesa.
4. We buy it, fly it in, and deliver it to you.

No customs paperwork for you, and no surprise charges at the end.', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAERgSMkMyNTZGRkQ2MkNBMzE5Q0NEAA==', 'delivered', NULL, NULL, '2026-08-11T15:25:49.456Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '6252495f-bfb4-4d1a-bcb3-7d04453eab5e', c.id, 'out', 'What would you like to do?', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAERgSMEVBMjg3NkE3QTYwRTA1M0IxAA==', 'delivered', NULL, NULL, '2026-08-11T15:25:50.165Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'b26e579e-25c6-4671-82c3-8633bfae65c1', c.id, 'in', 'I found some great items at SHEIN!
These items in my shopping cart are great. I highly recommend them to everyone!
https://onelink.shein.com/47/5yk53jpj28w0?shc=2_RS4ZaxoWbLL', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAEhgUM0E3MjcxMzhCQzg1OTYwNzI5NUQA', 'received', NULL, NULL, '2026-08-11T15:26:19.122Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'eb8cd65a-2935-43e2-8d76-d400f031fe87', c.id, 'out', 'Got it — I have saved that item.', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAERgSMjcyNkE0M0RDRDk2QTQxNzdEAA==', 'delivered', NULL, NULL, '2026-08-11T15:26:19.452Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a108be85-3ae1-46b2-a50a-cf4094383d7b', c.id, 'out', 'Before your first order I need a few details: your name, your email, and where we should deliver. Takes about a minute.', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAERgSM0IxMzBFN0I0RDFERkY0MEZCAA==', 'delivered', NULL, NULL, '2026-08-11T15:26:20.179Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '1d3c28ef-6acc-4fba-98b2-b9c67a15ff1f', c.id, 'out', 'What is your full name?', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAERgSRTE4RkQyOTAzRjNDNkYwRDMxAA==', 'delivered', NULL, NULL, '2026-08-11T15:26:20.817Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'de074811-eda2-400c-9b0e-d8c65a7518ec', c.id, 'in', 'Mutheu Kilonzo
faithkilonzo005@gmail.com', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAEhgUM0E1RDY3MzgzNDNGMzUyOTMyRTUA', 'received', NULL, NULL, '2026-08-11T15:27:36.579Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '3e47d2ef-4729-4b80-827c-445252128446', c.id, 'out', 'What is your email address? We send your receipts and order updates there.', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAERgSODEwRjk3M0Y5NEU3NTZBNUI5AA==', 'delivered', NULL, NULL, '2026-08-11T15:27:36.749Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '181a91a0-3b25-4b0b-badf-27b2a73f8ace', c.id, 'in', 'I haven’t found the code', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAEhgUM0FDQTc3M0I0RDdEREY2RjFBQjAA', 'received', NULL, NULL, '2026-08-11T15:31:33.274Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '08234a25-d723-4fbc-a863-83b2350f0bd3', c.id, 'out', 'The code is 6 digits. Please send just the numbers.', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAERgSQjAxQ0NEODA4RTRCRTczRDFCAA==', 'delivered', NULL, NULL, '2026-08-11T15:31:33.464Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'a6a3c885-ebb7-42c7-b9cf-7988eb8b550d', c.id, 'in', 'No code sent', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAEhgUM0EzMEM2NUI5MzFFMTA0MkYzNjIA', 'received', NULL, NULL, '2026-08-11T15:33:37.200Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '7e516666-dc96-4f53-abae-1675a8a338e8', c.id, 'out', 'The code is 6 digits. Please send just the numbers.', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAERgSMzM2N0YxQzgzRDI2QjhEQTBGAA==', 'delivered', NULL, NULL, '2026-08-11T15:33:37.380Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '980fda8a-d9fb-4846-9bb0-493b98df389e', c.id, 'in', 'Nkt', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAEhgUM0EwQjM0REFFNEJCQTExQ0E4OTAA', 'received', NULL, NULL, '2026-08-11T15:33:44.265Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '066eb479-0098-4aa1-a5f2-94f7837a862b', c.id, 'out', 'Let me get a person to help — I am not following. Someone from our team will reply here shortly.', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAERgSMEI1Rjc2REIwMjgyOTQ3MUUzAA==', 'delivered', NULL, NULL, '2026-08-11T15:33:44.432Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'e77ea6e8-3c2e-4771-a088-2a4711110bf7', c.id, 'out', '[staff_alert] A customer needs a person · A customer needs a person. Mutheu Kilonzo faithkilonzo005@gmail.com (+254793911332) said "Nkt", and the bot has stopped replying — the thread is waiting in the inbox', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSRDY3Qzk4NUU4NjU4RDRGNERCAA==', 'read', NULL, NULL, '2026-08-11T15:33:45.138Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'f6ebcc16-16ab-4cd9-8799-10cfe65ad9bf', c.id, 'out', 'I’m currently looking at the link you sent. Give me a moment', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAERgSNjkxRDBGODE3ODIxQkJBMTlGAA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-11T15:37:14.594Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'ac851360-223d-4b67-b64a-fefc90c0bf29', c.id, 'out', 'Hi, my name is Brian. Apologies if you’ve not received an email. Please ignore that step I will sort it out for you.', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAERgSNEQ2RTJDOEI4ODE1RUI3NjA1AA==', 'delivered', NULL, (SELECT u.id FROM users u WHERE u.email = 'admin@thapsus.uk' LIMIT 1), '2026-08-11T15:35:31.362Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'deb703f3-bf11-4b70-8ce3-d1db1900c2a3', c.id, 'in', 'Okay', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAEhgUM0FERjAwQjFEQTA2MzhFQjk3NDYA', 'received', NULL, NULL, '2026-08-11T15:36:45.085Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '0503ebb5-1d62-4d22-bafa-4ff43b584e8e', c.id, 'out', 'Thanks — one of our team has this and will reply here shortly. No need to send it again.', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAERgSOTIzN0ZFNDEwQkRGM0M5MTcyAA==', 'delivered', NULL, NULL, '2026-08-11T15:36:45.254Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '78ac0f3e-dfb1-48c0-917a-53a4f75c8f79', c.id, 'out', 'Thanks — one of our team has this and will reply here shortly. No need to send it again.', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAERgSMDAwNDdERjRCMTI0QkYwNDVCAA==', 'delivered', NULL, NULL, '2026-08-11T15:43:02.834Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT 'd39fe58d-b687-4cd7-a997-981db87ee43f', c.id, 'in', 'Okay', NULL, 'wamid.HBgMMjU0NzkzOTExMzMyFQIAEhgUM0EzQzA0MzEwMjU2QjdCNURENkIA', 'received', NULL, NULL, '2026-08-11T15:43:02.622Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254793911332'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_messages (id, contact_id, direction, body, template_key, provider_message_id, status, error, sent_by, created_at)
SELECT '85f05638-74ea-4bdc-a349-1dbfab9e2bde', c.id, 'out', '[staff_alert] Still waiting for a reply · Mutheu Kilonzo faithkilonzo005@gmail.com (+254793911332) is waiting for a reply and just said "Okay". Nobody has the dashboard open', 'staff_alert', 'wamid.HBgMNDQ3NDI0NTMxNDgzFQIAERgSM0NDNDU2RENGNUQzQjVCQ0IyAA==', 'read', NULL, NULL, '2026-08-11T15:43:03.562Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;

-- ── Orders ──────────────────────────────────────────────────
INSERT INTO wa_orders (id, contact_id, product_links, product_note, usd_price, fx_rate, markup_pct, quote_kes,
       status, delivery_fee_kes, delivery_fee_waived, delivery_fee_paid_at,
       quoted_at, confirmed_at, paid_at, purchased_at, created_at, updated_at)
SELECT 'd4c684a9-85bb-4f5d-8b62-23b855669d31', c.id, '["https://amzn.eu/d/07AY44UL", "https://amzn.eu/d/09IxaU0L", "https://amzn.eu/d/07gDwWRm", "https://amzn.eu/d/02Abletq"]'::jsonb, 'SH-2607-0004 · shein (imported from 254Shippers)', 4.1, 133.076, 10.0, 951,
       'confirmed', 350, false, NULL,
       '2026-07-31T10:42:15.595Z'::timestamptz, NULL, NULL, NULL, '2026-07-31T10:05:07.434Z'::timestamptz, '2026-07-31T10:42:37.440Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_orders (id, contact_id, product_links, product_note, usd_price, fx_rate, markup_pct, quote_kes,
       status, delivery_fee_kes, delivery_fee_waived, delivery_fee_paid_at,
       quoted_at, confirmed_at, paid_at, purchased_at, created_at, updated_at)
SELECT 'b52987d1-ee04-4670-bb93-405e29fa79e9', c.id, '["https://onelink.shein.com/45/5xe22jxdthrx?shc=2_RXFCV1cXtKV"]'::jsonb, 'SH-2607-0002 · shein (imported from 254Shippers)', 122.0, 133.2511, 0.0, 16257,
       'cancelled', NULL, true, NULL,
       '2026-07-31T04:20:01.081Z'::timestamptz, NULL, NULL, NULL, '2026-07-31T02:54:16.580Z'::timestamptz, '2026-08-01T16:53:00.665Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_orders (id, contact_id, product_links, product_note, usd_price, fx_rate, markup_pct, quote_kes,
       status, delivery_fee_kes, delivery_fee_waived, delivery_fee_paid_at,
       quoted_at, confirmed_at, paid_at, purchased_at, created_at, updated_at)
SELECT 'b75f45c1-148a-4d9f-98e9-d3e847a43563', c.id, '["https://onelink.shein.com/45/5xglxfq5z4uq?shc=2_RXCR2ArRnFk"]'::jsonb, 'SH-2607-0005 · shein (imported from 254Shippers)', 44.17, 133.2511, 0.0, 6486,
       'purchased', 600, false, '2026-08-01T06:10:04.478Z'::timestamptz,
       '2026-07-31T21:02:15.178Z'::timestamptz, NULL, '2026-08-01T06:10:04.478Z'::timestamptz, '2026-08-01T17:03:26.531Z'::timestamptz, '2026-07-31T19:47:32.571Z'::timestamptz, '2026-08-01T17:03:26.531Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_orders (id, contact_id, product_links, product_note, usd_price, fx_rate, markup_pct, quote_kes,
       status, delivery_fee_kes, delivery_fee_waived, delivery_fee_paid_at,
       quoted_at, confirmed_at, paid_at, purchased_at, created_at, updated_at)
SELECT 'fc3b6f8a-0ba2-4be6-a4f0-fb09626e9d27', c.id, '["https://onelink.shein.com/45/5xj0iqn19ukx?shc=2_RXrCCHG7IfN"]'::jsonb, 'SH-2608-0001 · shein (imported from 254Shippers)', 115.01, 132.8185, 0.0, 15275,
       'purchased', NULL, true, NULL,
       '2026-08-01T16:57:14.042Z'::timestamptz, NULL, '2026-08-01T16:58:48.768Z'::timestamptz, '2026-08-01T17:03:26.531Z'::timestamptz, '2026-08-01T16:55:10.403Z'::timestamptz, '2026-08-01T17:03:26.531Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_orders (id, contact_id, product_links, product_note, usd_price, fx_rate, markup_pct, quote_kes,
       status, delivery_fee_kes, delivery_fee_waived, delivery_fee_paid_at,
       quoted_at, confirmed_at, paid_at, purchased_at, created_at, updated_at)
SELECT '6a2621aa-617b-4430-8bb8-939f33666cb6', c.id, '["https://onelink.shein.com/45/5xe22jxdthrx?shc=2_RXFCV1cXtKV"]'::jsonb, 'SH-2607-0003 · shein (imported from 254Shippers)', NULL, NULL, NULL, NULL,
       'cancelled', NULL, false, NULL,
       NULL, NULL, NULL, NULL, '2026-07-31T03:27:41.544Z'::timestamptz, '2026-08-02T16:54:38.507Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '447424531483'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_orders (id, contact_id, product_links, product_note, usd_price, fx_rate, markup_pct, quote_kes,
       status, delivery_fee_kes, delivery_fee_waived, delivery_fee_paid_at,
       quoted_at, confirmed_at, paid_at, purchased_at, created_at, updated_at)
SELECT 'ae63ef64-6028-4ca5-963a-39e06b367d04', c.id, '["https://onelink.shein.com/46/5y1u2ggqhezv?shc=2_RSl56m2ZIVy"]'::jsonb, 'SH-2608-0002 · shein (imported from 254Shippers)', 25.23, 133.2408, 0.0, 3362,
       'cancelled', NULL, true, NULL,
       '2026-08-06T15:08:58.388Z'::timestamptz, NULL, NULL, NULL, '2026-08-06T15:05:14.608Z'::timestamptz, '2026-08-07T08:43:14.389Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_orders (id, contact_id, product_links, product_note, usd_price, fx_rate, markup_pct, quote_kes,
       status, delivery_fee_kes, delivery_fee_waived, delivery_fee_paid_at,
       quoted_at, confirmed_at, paid_at, purchased_at, created_at, updated_at)
SELECT '419f0804-523c-45fc-b3fa-e1d4cce60956', c.id, '["https://onelink.shein.com/46/5y49d4wwyy4b?shc=2_RSuVnMo5Rbg"]'::jsonb, 'SH-2608-0003 · shein (imported from 254Shippers)', 14.33, 133.2408, 0.0, 1910,
       'quoted', NULL, true, NULL,
       '2026-08-07T08:44:48.127Z'::timestamptz, NULL, NULL, NULL, '2026-08-07T07:00:41.841Z'::timestamptz, '2026-08-07T08:44:48.127Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254746542006'
ON CONFLICT (id) DO NOTHING;

-- A tracking code is the customer's handle on a parcel; anything that has
-- been paid for must have one.
UPDATE wa_orders SET tracking_code = 'TRK-' || nextval('wa_tracking_code_seq')
 WHERE tracking_code IS NULL AND status IN ('paid','purchased','in_kenya','delivery_fee_pending','dispatched','delivered');

-- ── Order audit trail ───────────────────────────────────────
INSERT INTO wa_order_events (id, order_id, from_status, to_status, note, created_at)
VALUES ('evt-import-d4c684a9-85bb-4f5d-8b62-23b855669d31', 'd4c684a9-85bb-4f5d-8b62-23b855669d31', NULL, 'confirmed', 'Imported from 254Shippers (SH-2607-0004, was ''awaiting_payment'')', '2026-07-31T10:42:37.440Z'::timestamptz)
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_order_events (id, order_id, from_status, to_status, note, created_at)
VALUES ('evt-import-b52987d1-ee04-4670-bb93-405e29fa79e9', 'b52987d1-ee04-4670-bb93-405e29fa79e9', NULL, 'cancelled', 'Imported from 254Shippers (SH-2607-0002, was ''cancelled'')', '2026-08-01T16:53:00.665Z'::timestamptz)
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_order_events (id, order_id, from_status, to_status, note, created_at)
VALUES ('evt-import-b75f45c1-148a-4d9f-98e9-d3e847a43563', 'b75f45c1-148a-4d9f-98e9-d3e847a43563', NULL, 'purchased', 'Imported from 254Shippers (SH-2607-0005, was ''purchased'')', '2026-08-01T17:03:26.531Z'::timestamptz)
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_order_events (id, order_id, from_status, to_status, note, created_at)
VALUES ('evt-import-fc3b6f8a-0ba2-4be6-a4f0-fb09626e9d27', 'fc3b6f8a-0ba2-4be6-a4f0-fb09626e9d27', NULL, 'purchased', 'Imported from 254Shippers (SH-2608-0001, was ''purchased'')', '2026-08-01T17:03:26.531Z'::timestamptz)
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_order_events (id, order_id, from_status, to_status, note, created_at)
VALUES ('evt-import-6a2621aa-617b-4430-8bb8-939f33666cb6', '6a2621aa-617b-4430-8bb8-939f33666cb6', NULL, 'cancelled', 'Imported from 254Shippers (SH-2607-0003, was ''cancelled'')', '2026-08-02T16:54:38.507Z'::timestamptz)
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_order_events (id, order_id, from_status, to_status, note, created_at)
VALUES ('evt-import-ae63ef64-6028-4ca5-963a-39e06b367d04', 'ae63ef64-6028-4ca5-963a-39e06b367d04', NULL, 'cancelled', 'Imported from 254Shippers (SH-2608-0002, was ''cancelled'')', '2026-08-07T08:43:14.389Z'::timestamptz)
ON CONFLICT (id) DO NOTHING;
INSERT INTO wa_order_events (id, order_id, from_status, to_status, note, created_at)
VALUES ('evt-import-419f0804-523c-45fc-b3fa-e1d4cce60956', '419f0804-523c-45fc-b3fa-e1d4cce60956', NULL, 'quoted', 'Imported from 254Shippers (SH-2608-0003, was ''quoted'')', '2026-08-07T08:44:48.127Z'::timestamptz)
ON CONFLICT (id) DO NOTHING;

-- ── Payments ────────────────────────────────────────────────
INSERT INTO payments (id, user_id, wa_contact_id, target_kind, target_id,
       amount_gross_kes, amount_credit_kes, amount_due_kes, currency, method, status,
       mpesa_provider, mpesa_reference, mpesa_phone_used, paid_at, created_at)
SELECT 'PAY-254S-f3cccffc-4e3', NULL, c.id, 'wa_order', 'd4c684a9-85bb-4f5d-8b62-23b855669d31',
       951.0, 0, 951.0, 'KES', 'mpesa', 'failed',
       'lipana', 'TXN1785494557850EVRRHD', '254768115922', NULL, '2026-07-31T10:42:37.440Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO payments (id, user_id, wa_contact_id, target_kind, target_id,
       amount_gross_kes, amount_credit_kes, amount_due_kes, currency, method, status,
       mpesa_provider, mpesa_reference, mpesa_phone_used, paid_at, created_at)
SELECT 'PAY-254S-70ae7cef-82e', NULL, c.id, 'wa_order', 'd4c684a9-85bb-4f5d-8b62-23b855669d31',
       951.0, 0, 951.0, 'KES', 'mpesa', 'failed',
       'lipana', 'TXN1785503727344K4PJIM', '254768115922', NULL, '2026-07-31T13:15:26.907Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254768115922'
ON CONFLICT (id) DO NOTHING;
INSERT INTO payments (id, user_id, wa_contact_id, target_kind, target_id,
       amount_gross_kes, amount_credit_kes, amount_due_kes, currency, method, status,
       mpesa_provider, mpesa_reference, mpesa_phone_used, paid_at, created_at)
SELECT 'PAY-254S-64c4b96a-f11', NULL, c.id, 'wa_order', 'b75f45c1-148a-4d9f-98e9-d3e847a43563',
       6486.0, 0, 6486.0, 'KES', 'mpesa', 'paid',
       'lipana', 'TXN1785564580810Q3Z8L2', '254711303720', '2026-08-01T06:10:04.478Z'::timestamptz, '2026-08-01T06:09:40.498Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254711303720'
ON CONFLICT (id) DO NOTHING;
INSERT INTO payments (id, user_id, wa_contact_id, target_kind, target_id,
       amount_gross_kes, amount_credit_kes, amount_due_kes, currency, method, status,
       mpesa_provider, mpesa_reference, mpesa_phone_used, paid_at, created_at)
SELECT 'PAY-254S-6678158c-235', NULL, c.id, 'wa_order', 'fc3b6f8a-0ba2-4be6-a4f0-fb09626e9d27',
       15275.0, 0, 15275.0, 'KES', 'mpesa', 'paid',
       'manual', 'AZ1', '254798632579', '2026-08-01T16:58:48.768Z'::timestamptz, '2026-08-01T16:58:48.768Z'::timestamptz
  FROM wa_contacts c WHERE c.phone = '254751275871'
ON CONFLICT (id) DO NOTHING;

-- Conversation heads, from whatever now sits in the transcript.
UPDATE wa_contacts c SET
  last_message_at      = m.at,
  last_message_preview = left(m.body, 120)
  FROM (SELECT DISTINCT ON (contact_id) contact_id, created_at AS at, body
          FROM wa_messages ORDER BY contact_id, created_at DESC) m
 WHERE m.contact_id = c.id
   AND (c.last_message_at IS NULL OR c.last_message_at < m.at);

