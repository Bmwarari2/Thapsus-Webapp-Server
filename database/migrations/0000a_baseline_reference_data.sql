-- 0000a_baseline_reference_data.sql — reference/config rows for a fresh DB.
--
-- Captured verbatim from the LIVE database (2026-07-02) alongside the
-- 0000_baseline.sql schema snapshot. These are the lookup tables the app
-- reads at request time — pricing knobs, customs tiers, HS-code map,
-- electronics fees, fee catalogue, rate cards, FX rates, prohibited items,
-- the retailer picker, and the finance chart of accounts. Without them a
-- fresh database boots but pricing/finance/buy-for-me requests fail.
--
-- Idempotent: every INSERT is ON CONFLICT DO NOTHING, so re-running (or
-- running against a DB that already has newer values) changes nothing.
-- jsonb_populate_recordset maps JSON keys to columns by name, so this file
-- is insensitive to column order.

INSERT INTO public.customs_tiers
SELECT * FROM jsonb_populate_recordset(NULL::public.customs_tiers, $json$[
{"tier_key":"general","label":"General goods (default)","duty_pct":0.25,"vat_pct":0.16,"idf_pct":0.035,"rdl_pct":0.02,"notes":"Default 25% duty band — most clothing, footwear, toys, household goods.","is_active":true,"updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"},
{"tier_key":"electronics","label":"Consumer electronics","duty_pct":0,"vat_pct":0.16,"idf_pct":0.035,"rdl_pct":0.02,"notes":"Phones, laptops, screens — duty-free at 0% but 16% VAT still applies.","is_active":true,"updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"},
{"tier_key":"clothing_textiles","label":"Clothing & textiles","duty_pct":0.25,"vat_pct":0.16,"idf_pct":0.035,"rdl_pct":0.02,"notes":"Apparel, footwear, fabric — 25% duty band.","is_active":true,"updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"},
{"tier_key":"food_processed","label":"Processed food / supplements","duty_pct":0.35,"vat_pct":0.16,"idf_pct":0.035,"rdl_pct":0.02,"notes":"Sensitive list — 35% duty band.","is_active":true,"updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"},
{"tier_key":"raw_materials","label":"Raw materials / inputs","duty_pct":0,"vat_pct":0.16,"idf_pct":0.035,"rdl_pct":0.02,"notes":"Industrial inputs and raw materials — 0% duty.","is_active":true,"updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"},
{"tier_key":"books_media","label":"Books / printed media","duty_pct":0,"vat_pct":0,"idf_pct":0.035,"rdl_pct":0.02,"notes":"Books, journals — 0% duty AND zero-rated for VAT.","is_active":true,"updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"},
{"tier_key":"zero_rated","label":"Zero-rated (medical / exempt)","duty_pct":0,"vat_pct":0,"idf_pct":0.035,"rdl_pct":0.02,"notes":"Medical supplies and other gazetted exemptions — 0% duty, 0% VAT.","is_active":true,"updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"}
]$json$::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO public.electronics_fees
SELECT * FROM jsonb_populate_recordset(NULL::public.electronics_fees, $json$[
{"id":"2a2944e8-4829-4044-aa1e-2468039e7591","item_key":"phone","fee_gbp":75,"updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00","label":"Phone","min_weight_kg":1,"is_active":true},
{"id":"487cb3e2-48ae-4c07-a0b1-28893fcd8a31","item_key":"laptop","fee_gbp":65,"updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00","label":"Laptop / Accessories","min_weight_kg":1,"is_active":true},
{"id":"8f67c867-75c4-4993-b350-b97b2030d349","item_key":"tv_monitor","fee_gbp":65,"updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00","label":"TV / Screen / Monitor","min_weight_kg":1,"is_active":true}
]$json$::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO public.exchange_rates
SELECT * FROM jsonb_populate_recordset(NULL::public.exchange_rates, $json$[
{"id":1,"currency_pair":"GBP_KES","rate":171.36,"updated_by":null,"updated_at":"2026-07-02T04:16:25.674581+00:00"},
{"id":2,"currency_pair":"USD_KES","rate":129.309,"updated_by":null,"updated_at":"2026-07-02T04:16:25.674581+00:00"},
{"id":3,"currency_pair":"EUR_KES","rate":147.445,"updated_by":null,"updated_at":"2026-07-02T04:16:25.674581+00:00"},
{"id":4,"currency_pair":"CNY_KES","rate":19.0417,"updated_by":null,"updated_at":"2026-07-02T04:16:25.674581+00:00"}
]$json$::jsonb) ON CONFLICT DO NOTHING;
SELECT setval('public.exchange_rates_id_seq', (SELECT COALESCE(MAX(id), 1) FROM public.exchange_rates));

INSERT INTO public.fees
SELECT * FROM jsonb_populate_recordset(NULL::public.fees, $json$[
{"id":"fee-uk-handling","code":"uk_handling","label":"UK warehouse handling per parcel","currency":"GBP","amount":2.5,"is_percentage":false,"effective_from":"2026-06-12T11:16:55.423178+00:00","effective_to":null,"is_active":true,"notes":"Framework v2 §9 cost stack","created_at":"2026-06-12T11:16:55.423178+00:00"},
{"id":"fee-trunking","code":"trunking","label":"Stockport → Tudor trunking","currency":"GBP","amount":75,"is_percentage":false,"effective_from":"2026-06-12T11:16:55.423178+00:00","effective_to":null,"is_active":true,"notes":"Framework v2 §6 trunking budget","created_at":"2026-06-12T11:16:55.423178+00:00"},
{"id":"fee-tudor-handling","code":"tudor_handling","label":"Tudor Freight handling","currency":"GBP","amount":50,"is_percentage":false,"effective_from":"2026-06-12T11:16:55.423178+00:00","effective_to":null,"is_active":true,"notes":"Framework v2 §7 Tudor handling","created_at":"2026-06-12T11:16:55.423178+00:00"},
{"id":"fee-admin-pct","code":"admin_pct","label":"Duty pass-through admin fee","currency":"GBP","amount":5,"is_percentage":true,"effective_from":"2026-06-12T11:16:55.423178+00:00","effective_to":null,"is_active":true,"notes":"Spec §4.5 — 5% on duty pass-through","created_at":"2026-06-12T11:16:55.423178+00:00"},
{"id":"fee-ins-plus","code":"insurance_plus","label":"Insurance Plus (≤£500)","currency":"GBP","amount":8,"is_percentage":false,"effective_from":"2026-06-12T11:16:55.423178+00:00","effective_to":null,"is_active":true,"notes":"Spec §4.9 declared-value insurance","created_at":"2026-06-12T11:16:55.423178+00:00"},
{"id":"fee-ins-premier","code":"insurance_premier","label":"Insurance Premier (≤£2 000)","currency":"GBP","amount":3.5,"is_percentage":true,"effective_from":"2026-06-12T11:16:55.423178+00:00","effective_to":null,"is_active":true,"notes":"Spec §4.9 — 3.5% of declared value","created_at":"2026-06-12T11:16:55.423178+00:00"}
]$json$::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO public.pricing_settings
SELECT * FROM jsonb_populate_recordset(NULL::public.pricing_settings, $json$[
{"key":"base_handling_fee","value":3,"currency":"GBP","is_percent":false,"label":"Base handling fee (flat £)","notes":"Single flat handling fee per order. Replaces max(£3, 0.5 × kg).","updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"},
{"key":"card_processing_pct","value":0,"currency":null,"is_percent":true,"label":"Card processing surcharge (%)","notes":"Multiplied by the FULL subtotal (shipping + handling + special + customs_est). Stored as a fraction, e.g. 0.03 for 3%.","updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"},
{"key":"dim_divisor","value":5000,"currency":null,"is_percent":false,"label":"Volumetric divisor","notes":"Used to compute vol_kg = (L × W × H) / divisor. 5000 = courier convention; 6000 = IATA.","updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"},
{"key":"base_shipping_per_kg","value":9,"currency":"GBP","is_percent":false,"label":"Base shipping (£ per kg)","notes":"Applied to the chargeable weight = max(actual_kg, vol_kg). Replaces the per-market rates in shipping_rates.","updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"}
]$json$::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO public.pricing_tiers
SELECT * FROM jsonb_populate_recordset(NULL::public.pricing_tiers, $json$[
{"id":"pt-uk-air-001","channel":"UK_air","min_kg":0,"max_kg":5,"gbp_per_kg":14,"effective_from":"2026-06-12T11:16:55.423178+00:00","effective_to":null,"is_active":true,"notes":"Tudor Freight rate card seed","created_at":"2026-06-12T11:16:55.423178+00:00"},
{"id":"pt-uk-air-002","channel":"UK_air","min_kg":5,"max_kg":10,"gbp_per_kg":12,"effective_from":"2026-06-12T11:16:55.423178+00:00","effective_to":null,"is_active":true,"notes":"Tudor Freight rate card seed","created_at":"2026-06-12T11:16:55.423178+00:00"},
{"id":"pt-uk-air-003","channel":"UK_air","min_kg":10,"max_kg":25,"gbp_per_kg":10,"effective_from":"2026-06-12T11:16:55.423178+00:00","effective_to":null,"is_active":true,"notes":"Tudor Freight rate card seed","created_at":"2026-06-12T11:16:55.423178+00:00"},
{"id":"pt-uk-air-004","channel":"UK_air","min_kg":25,"max_kg":100,"gbp_per_kg":9,"effective_from":"2026-06-12T11:16:55.423178+00:00","effective_to":null,"is_active":true,"notes":"Tudor Freight rate card seed","created_at":"2026-06-12T11:16:55.423178+00:00"},
{"id":"pt-uk-sea-001","channel":"UK_sea","min_kg":0,"max_kg":100,"gbp_per_kg":6,"effective_from":"2026-06-12T11:24:00.331229+00:00","effective_to":null,"is_active":true,"notes":"UK sea rate placeholder","created_at":"2026-06-12T11:24:00.331229+00:00"}
]$json$::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO public.hs_code_tiers
SELECT * FROM jsonb_populate_recordset(NULL::public.hs_code_tiers, $json$[
{"hs_prefix":"8517","tier_key":"electronics","notes":"Phones, smartphones, networking gear (HS Chapter 85.17)","updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"},
{"hs_prefix":"8471","tier_key":"electronics","notes":"Automatic data-processing machines (laptops, desktops)","updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"},
{"hs_prefix":"8528","tier_key":"electronics","notes":"Monitors, projectors, television receivers","updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"},
{"hs_prefix":"6109","tier_key":"clothing_textiles","notes":"T-shirts, singlets, vests (HS 61.09)","updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"},
{"hs_prefix":"6203","tier_key":"clothing_textiles","notes":"Men's suits, trousers (HS 62.03)","updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"},
{"hs_prefix":"6204","tier_key":"clothing_textiles","notes":"Women's suits, dresses (HS 62.04)","updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"},
{"hs_prefix":"6403","tier_key":"clothing_textiles","notes":"Footwear with leather uppers (HS 64.03)","updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"},
{"hs_prefix":"4901","tier_key":"books_media","notes":"Printed books, brochures (HS 49.01)","updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"},
{"hs_prefix":"3004","tier_key":"zero_rated","notes":"Medicaments packaged for retail sale (HS 30.04)","updated_by":null,"updated_at":"2026-06-12T15:54:38.324038+00:00"}
]$json$::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO public.prohibited_items
SELECT * FROM jsonb_populate_recordset(NULL::public.prohibited_items, $json$[
{"id":"pi-001","term":"lithium battery","severity":"restricted","jurisdiction":"KE","language":"en","reason":"Class 9 dangerous goods — must be declared and packaged per IATA DGR","last_reviewed_at":"2026-06-12T11:16:55.423178+00:00","created_at":"2026-06-12T11:16:55.423178+00:00"},
{"id":"pi-002","term":"firearm","severity":"prohibited","jurisdiction":"KE","language":"en","reason":"Firearms and parts thereof are prohibited in air consolidations","last_reviewed_at":"2026-06-12T11:16:55.423178+00:00","created_at":"2026-06-12T11:16:55.423178+00:00"},
{"id":"pi-003","term":"narcotic","severity":"prohibited","jurisdiction":"KE","language":"en","reason":"Narcotic drugs are prohibited under POCAMLA and KRA rules","last_reviewed_at":"2026-06-12T11:16:55.423178+00:00","created_at":"2026-06-12T11:16:55.423178+00:00"},
{"id":"pi-004","term":"perfume","severity":"restricted","jurisdiction":"KE","language":"en","reason":"Alcohol-based perfumes are Class 3 flammable liquid — limited quantities only","last_reviewed_at":"2026-06-12T11:16:55.423178+00:00","created_at":"2026-06-12T11:16:55.423178+00:00"},
{"id":"pi-001-sw","term":"betri ya lithium","severity":"restricted","jurisdiction":"KE","language":"sw","reason":"Bidhaa hatari ya darasa la 9 — lazima itangazwe na ifungashwe kwa IATA DGR","last_reviewed_at":"2026-06-12T11:16:55.423178+00:00","created_at":"2026-06-12T11:16:55.423178+00:00"},
{"id":"pi-002-sw","term":"silaha","severity":"prohibited","jurisdiction":"KE","language":"sw","reason":"Silaha na sehemu zake zimekatazwa kwenye usafirishaji wa anga","last_reviewed_at":"2026-06-12T11:16:55.423178+00:00","created_at":"2026-06-12T11:16:55.423178+00:00"}
]$json$::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO public.retailers
SELECT * FROM jsonb_populate_recordset(NULL::public.retailers, $json$[
{"id":"amazon_uk","name":"Amazon UK","country":"UK","base_url":"https://www.amazon.co.uk","logo_url":null,"is_active":true,"sort_order":10,"created_at":"2026-06-12T11:31:49.881438+00:00","updated_at":"2026-06-12T11:31:49.881438+00:00"},
{"id":"ebay_uk","name":"eBay UK","country":"UK","base_url":"https://www.ebay.co.uk","logo_url":null,"is_active":true,"sort_order":20,"created_at":"2026-06-12T11:31:49.881438+00:00","updated_at":"2026-06-12T11:31:49.881438+00:00"},
{"id":"asos","name":"ASOS","country":"UK","base_url":"https://www.asos.com","logo_url":null,"is_active":true,"sort_order":30,"created_at":"2026-06-12T11:31:49.881438+00:00","updated_at":"2026-06-12T11:31:49.881438+00:00"},
{"id":"jd_sports","name":"JD Sports","country":"UK","base_url":"https://www.jdsports.co.uk","logo_url":null,"is_active":true,"sort_order":40,"created_at":"2026-06-12T11:31:49.881438+00:00","updated_at":"2026-06-12T11:31:49.881438+00:00"},
{"id":"next","name":"Next","country":"UK","base_url":"https://www.next.co.uk","logo_url":null,"is_active":true,"sort_order":50,"created_at":"2026-06-12T11:31:49.881438+00:00","updated_at":"2026-06-12T11:31:49.881438+00:00"},
{"id":"marks_spencer","name":"Marks & Spencer","country":"UK","base_url":"https://www.marksandspencer.com","logo_url":null,"is_active":true,"sort_order":60,"created_at":"2026-06-12T11:31:49.881438+00:00","updated_at":"2026-06-12T11:31:49.881438+00:00"},
{"id":"john_lewis","name":"John Lewis","country":"UK","base_url":"https://www.johnlewis.com","logo_url":null,"is_active":true,"sort_order":70,"created_at":"2026-06-12T11:31:49.881438+00:00","updated_at":"2026-06-12T11:31:49.881438+00:00"},
{"id":"boohoo","name":"Boohoo","country":"UK","base_url":"https://www.boohoo.com","logo_url":null,"is_active":true,"sort_order":80,"created_at":"2026-06-12T11:31:49.881438+00:00","updated_at":"2026-06-12T11:31:49.881438+00:00"},
{"id":"currys","name":"Currys","country":"UK","base_url":"https://www.currys.co.uk","logo_url":null,"is_active":true,"sort_order":90,"created_at":"2026-06-12T11:31:49.881438+00:00","updated_at":"2026-06-12T11:31:49.881438+00:00"},
{"id":"argos","name":"Argos","country":"UK","base_url":"https://www.argos.co.uk","logo_url":null,"is_active":true,"sort_order":100,"created_at":"2026-06-12T11:31:49.881438+00:00","updated_at":"2026-06-12T11:31:49.881438+00:00"},
{"id":"selfridges","name":"Selfridges","country":"UK","base_url":"https://www.selfridges.com","logo_url":null,"is_active":true,"sort_order":110,"created_at":"2026-06-12T11:31:49.881438+00:00","updated_at":"2026-06-12T11:31:49.881438+00:00"}
]$json$::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO public.finance_categories
SELECT * FROM jsonb_populate_recordset(NULL::public.finance_categories, $json$[
{"id":"CAT-INC-SHIPPING","name":"Shipping revenue","kind":"income","is_tax_deductible":false,"default_tax_code":null,"sort_order":10,"is_active":true},
{"id":"CAT-INC-BFM","name":"Buy-for-me commission","kind":"income","is_tax_deductible":false,"default_tax_code":null,"sort_order":20,"is_active":true},
{"id":"CAT-INC-INVOICE","name":"Customer invoices","kind":"income","is_tax_deductible":false,"default_tax_code":null,"sort_order":30,"is_active":true},
{"id":"CAT-INC-OTHER","name":"Other income","kind":"income","is_tax_deductible":false,"default_tax_code":null,"sort_order":90,"is_active":true},
{"id":"CAT-EXP-SUPPLIER","name":"Supplier cost","kind":"expense","is_tax_deductible":true,"default_tax_code":null,"sort_order":110,"is_active":true},
{"id":"CAT-EXP-AGENT","name":"Clearing agent fees","kind":"expense","is_tax_deductible":true,"default_tax_code":null,"sort_order":120,"is_active":true},
{"id":"CAT-EXP-CUSTOMS","name":"Customs & duties","kind":"expense","is_tax_deductible":true,"default_tax_code":null,"sort_order":130,"is_active":true},
{"id":"CAT-EXP-FREIGHT","name":"Freight & transport","kind":"expense","is_tax_deductible":true,"default_tax_code":null,"sort_order":140,"is_active":true},
{"id":"CAT-EXP-SALARY","name":"Salaries & wages","kind":"expense","is_tax_deductible":true,"default_tax_code":null,"sort_order":150,"is_active":true},
{"id":"CAT-EXP-RENT","name":"Rent & utilities","kind":"expense","is_tax_deductible":true,"default_tax_code":null,"sort_order":160,"is_active":true},
{"id":"CAT-EXP-SOFTWARE","name":"Software & SaaS","kind":"expense","is_tax_deductible":true,"default_tax_code":null,"sort_order":170,"is_active":true},
{"id":"CAT-EXP-FEES","name":"Bank & processing fees","kind":"expense","is_tax_deductible":true,"default_tax_code":null,"sort_order":180,"is_active":true},
{"id":"CAT-EXP-MARKET","name":"Marketing & advertising","kind":"expense","is_tax_deductible":true,"default_tax_code":null,"sort_order":190,"is_active":true},
{"id":"CAT-EXP-OTHER","name":"Other expenses","kind":"expense","is_tax_deductible":true,"default_tax_code":null,"sort_order":900,"is_active":true}
]$json$::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO public.finance_tax_codes
SELECT * FROM jsonb_populate_recordset(NULL::public.finance_tax_codes, $json$[
{"id":"TAX-UK-VAT-STD","jurisdiction":"UK","name":"UK VAT — Standard (20%)","kind":"vat","rate_pct":20,"is_active":true},
{"id":"TAX-UK-VAT-RED","jurisdiction":"UK","name":"UK VAT — Reduced (5%)","kind":"vat","rate_pct":5,"is_active":true},
{"id":"TAX-UK-VAT-ZERO","jurisdiction":"UK","name":"UK VAT — Zero-rated (0%)","kind":"vat","rate_pct":0,"is_active":true},
{"id":"TAX-UK-VAT-EXMPT","jurisdiction":"UK","name":"UK VAT — Exempt","kind":"vat","rate_pct":0,"is_active":true},
{"id":"TAX-UK-CT","jurisdiction":"UK","name":"UK Corporation Tax","kind":"income_tax","rate_pct":25,"is_active":true},
{"id":"TAX-KE-VAT-STD","jurisdiction":"KE","name":"KE VAT — Standard (16%)","kind":"vat","rate_pct":16,"is_active":true},
{"id":"TAX-KE-VAT-ZERO","jurisdiction":"KE","name":"KE VAT — Zero-rated (0%)","kind":"vat","rate_pct":0,"is_active":true},
{"id":"TAX-KE-VAT-EXMPT","jurisdiction":"KE","name":"KE VAT — Exempt","kind":"vat","rate_pct":0,"is_active":true},
{"id":"TAX-KE-IT","jurisdiction":"KE","name":"KE Income Tax","kind":"income_tax","rate_pct":30,"is_active":true},
{"id":"TAX-KE-WHT","jurisdiction":"KE","name":"KE Withholding Tax (5%)","kind":"withholding","rate_pct":5,"is_active":true}
]$json$::jsonb) ON CONFLICT DO NOTHING;

INSERT INTO public.finance_accounts
SELECT * FROM jsonb_populate_recordset(NULL::public.finance_accounts, $json$[
{"id":"ACC-STRIPE-GBP","name":"Stripe (GBP)","type":"stripe","currency":"GBP","opening_balance_minor":0,"is_active":true,"created_at":"2026-06-29T11:34:18.480676+00:00"},
{"id":"ACC-MPESA-KES","name":"M-Pesa (KES)","type":"mpesa","currency":"KES","opening_balance_minor":0,"is_active":true,"created_at":"2026-06-29T11:34:18.480676+00:00"},
{"id":"ACC-BANK-GBP","name":"UK Bank (GBP)","type":"bank","currency":"GBP","opening_balance_minor":0,"is_active":true,"created_at":"2026-06-29T11:34:18.480676+00:00"},
{"id":"ACC-BANK-KES","name":"Kenya Bank (KES)","type":"bank","currency":"KES","opening_balance_minor":0,"is_active":true,"created_at":"2026-06-29T11:34:18.480676+00:00"},
{"id":"ACC-CASH-KES","name":"Petty cash (KES)","type":"cash","currency":"KES","opening_balance_minor":0,"is_active":true,"created_at":"2026-06-29T11:34:18.480676+00:00"}
]$json$::jsonb) ON CONFLICT DO NOTHING;
