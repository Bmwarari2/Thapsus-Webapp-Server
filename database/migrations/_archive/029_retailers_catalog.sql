-- Migration 029 — retailers catalog for the Buy-for-me create form (PR 4)
--
-- Pre-PR-4 the customer typed a free-text URL for every BFM request, which
-- meant lots of typos, malformed URLs, and inconsistent retailer names on
-- the operator queue. The catalog gives them a curated picker (with an
-- "Other" fallback that still allows free-text URL entry) and gives the
-- operator a stable retailer label per row.
--
-- Idempotent — every CREATE/INSERT guarded by IF NOT EXISTS / ON CONFLICT.

BEGIN;

CREATE TABLE IF NOT EXISTS public.retailers (
    id           text PRIMARY KEY,
    name         text NOT NULL,
    country      text NOT NULL CHECK (country IN ('UK','USA','China','Other')),
    base_url     text NOT NULL,
    logo_url     text,
    is_active    boolean NOT NULL DEFAULT true,
    sort_order   integer NOT NULL DEFAULT 100,
    created_at   timestamptz NOT NULL DEFAULT NOW(),
    updated_at   timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retailers_active_sorted
    ON public.retailers (is_active, sort_order, name);

-- Read-only catalog → public read OK; writes restricted to staff via API.
ALTER TABLE public.retailers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retailers FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "retailers public read" ON public.retailers;
CREATE POLICY "retailers public read" ON public.retailers
    FOR SELECT TO authenticated, anon
    USING (is_active = true);

DROP POLICY IF EXISTS "retailers admin write" ON public.retailers;
CREATE POLICY "retailers admin write" ON public.retailers
    FOR ALL TO authenticated
    USING (public.is_thapsus_admin())
    WITH CHECK (public.is_thapsus_admin());

-- Seed the most common UK retailers first (primary market), then the
-- handful of US + China retailers we already see in BFM requests.
INSERT INTO public.retailers (id, name, country, base_url, sort_order) VALUES
    ('amazon_uk',    'Amazon UK',      'UK',    'https://www.amazon.co.uk',  10),
    ('ebay_uk',      'eBay UK',        'UK',    'https://www.ebay.co.uk',    20),
    ('asos',         'ASOS',           'UK',    'https://www.asos.com',      30),
    ('jd_sports',    'JD Sports',      'UK',    'https://www.jdsports.co.uk',40),
    ('next',         'Next',           'UK',    'https://www.next.co.uk',    50),
    ('marks_spencer','Marks & Spencer','UK',    'https://www.marksandspencer.com', 60),
    ('john_lewis',   'John Lewis',     'UK',    'https://www.johnlewis.com', 70),
    ('boohoo',       'Boohoo',         'UK',    'https://www.boohoo.com',    80),
    ('currys',       'Currys',         'UK',    'https://www.currys.co.uk',  90),
    ('argos',        'Argos',          'UK',    'https://www.argos.co.uk',  100),
    ('selfridges',   'Selfridges',     'UK',    'https://www.selfridges.com',110),
    ('amazon_us',    'Amazon US',      'USA',   'https://www.amazon.com',   200),
    ('ebay_us',      'eBay US',        'USA',   'https://www.ebay.com',     210),
    ('walmart',      'Walmart',        'USA',   'https://www.walmart.com',  220),
    ('taobao',       'Taobao',         'China', 'https://www.taobao.com',   300),
    ('aliexpress',   'AliExpress',     'China', 'https://www.aliexpress.com',310),
    ('tmall',        'Tmall',          'China', 'https://www.tmall.com',    320)
ON CONFLICT (id) DO NOTHING;

-- Realtime not needed — the catalog only changes on admin edits.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.retailers) THEN
        RAISE EXCEPTION 'Migration 029 verification failed — retailers table empty';
    END IF;
END $$;

COMMIT;
