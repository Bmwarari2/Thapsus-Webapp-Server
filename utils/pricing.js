// utils/pricing.js
//
// Six-knob pricing model:
//
//   1. base_shipping_per_kg  (£/kg, multiplied by chargeable_kg)
//   2. base_handling_fee     (flat £)
//   3. card_processing_pct   (% of FULL subtotal incl. customs)
//   4. dim_divisor           (volumetric divisor)
//   5. electronics_fees      (per-item-type flat £, in electronics_fees table)
//   6. customs_tiers + hs_code_tiers
//
// The four numeric knobs live in `pricing_settings` (key/value). Customs is
// resolved per item via `parcel_items.hs_code` → `hs_code_tiers` (longest-prefix
// match) → `customs_tiers`. Items that don't match a prefix fall back to the
// 'general' tier.
//
// All four lookups (settings, electronics, customs_tiers, hs_code_tiers) are
// cached for 60 s through `getOrCompute`; admin PUTs invalidate the matching
// `pricing:*` keys so edits land within the cache TTL but ideally instantly.
//
// Back-compat: callers that pass `weight_kg` + `dimensions` and (optionally)
// a single `hs_tier` or `electronics_item` continue to work — the legacy
// single-tier path is preserved. New callers pass `items[]` with per-item
// hs_code, qty, declared_value and get a per-item customs breakdown.

import { getOrCompute } from './cache.js';

/* ─── Fallback defaults ──────────────────────────────────────────────────────
 * Used when the DB is unavailable (boot before migrations, test harness, etc.)
 * They mirror the post-051 seeded values, so calculator behaviour is identical
 * whether the settings rows exist or not.
 */
export const DEFAULT_SETTINGS = {
  base_shipping_per_kg: 8.0,
  base_handling_fee:    3.0,
  card_processing_pct:  0.0,
  dim_divisor:          5000,
};

/**
 * Per-item electronics fees. Persisted in `electronics_fees`; this object
 * is the fallback when the table is empty or unreachable. The minimum
 * chargeable weight for electronics is always 1 kg.
 */
export const ELECTRONICS_HANDLING = {
  phone:      { label: 'Phone',                  fee_gbp: 75, min_weight_kg: 1 },
  laptop:     { label: 'Laptop / Accessories',   fee_gbp: 65, min_weight_kg: 1 },
  tv_monitor: { label: 'TV / Screen / Monitor',  fee_gbp: 65, min_weight_kg: 1 },
};

/**
 * Legacy per-market rates, kept so the old `/pricing/rates` endpoint
 * continues to serve a sensible response after migration 051. The new
 * model uses a single `base_shipping_per_kg` from pricing_settings; the
 * per-market rates are a soft-deprecated shape.
 */
export const DEFAULT_RATES_GBP = {
  UK:    8,
  China: 6,
};

/**
 * HS-tier defaults. After migration 051 these live in `customs_tiers`;
 * this object is only consulted when the DB lookup fails. Numbers match
 * the seed in 051_pricing_settings.sql so behaviour is identical.
 */
export const HS_TIERS = {
  general:           { label: 'General goods (default)',        duty_rate: 0.25, note: 'Default 25% duty band — most clothing, footwear, toys, household goods.' },
  electronics:       { label: 'Consumer electronics',           duty_rate: 0.00, note: 'Phones, laptops, screens — duty-free at 0% but 16% VAT still applies.' },
  clothing_textiles: { label: 'Clothing & textiles',            duty_rate: 0.25, note: 'Apparel, footwear, fabric — 25% duty band.' },
  food_processed:    { label: 'Processed food / supplements',   duty_rate: 0.35, note: 'Sensitive list — 35% duty band.' },
  raw_materials:     { label: 'Raw materials / inputs',         duty_rate: 0.00, note: 'Industrial inputs and raw materials — 0% duty.' },
  books_media:       { label: 'Books / printed media',          duty_rate: 0.00, note: 'Books, journals — 0% duty AND zero-rated for VAT.', vat_zero_rated: true },
  zero_rated:        { label: 'Zero-rated (medical / exempt)',  duty_rate: 0.00, note: 'Medical supplies and other gazetted exemptions — 0% duty, 0% VAT.', vat_zero_rated: true },
};

const KE_VAT_RATE = 0.16;
const IDF_RATE    = 0.035;
const RDL_RATE    = 0.02;

/* ─── Cache keys + TTL ───────────────────────────────────────────────────── */

const CACHE_TTL_MS         = 60 * 1000;
const SETTINGS_CACHE_KEY   = 'pricing:settings';
const ELECTRONICS_CACHE_KEY= 'pricing:electronics_fees';
const TIERS_CACHE_KEY      = 'pricing:customs_tiers';
const HSMAP_CACHE_KEY      = 'pricing:hs_code_tiers';
// Legacy key — still served from the same module so callers that depend on it
// (older /rates handler) keep working.
const SHIPPING_RATES_CACHE_KEY = 'pricing:shipping_rates_gbp';

export const PRICING_CACHE_KEYS = {
  settings:    SETTINGS_CACHE_KEY,
  electronics: ELECTRONICS_CACHE_KEY,
  tiers:       TIERS_CACHE_KEY,
  hsMap:       HSMAP_CACHE_KEY,
  rates:       SHIPPING_RATES_CACHE_KEY,
};

/* ─── DB-backed lookup helpers ───────────────────────────────────────────── */

/**
 * Read the four numeric pricing knobs from pricing_settings. Missing rows
 * fall back to DEFAULT_SETTINGS — never throws, never returns partial state
 * (callers can rely on every key being present).
 */
export async function getPricingSettings(db) {
  return getOrCompute(SETTINGS_CACHE_KEY, CACHE_TTL_MS, async () => {
    const settings = { ...DEFAULT_SETTINGS };
    try {
      const res = await db.query(
        'SELECT key, value FROM pricing_settings WHERE key = ANY($1::text[])',
        [Object.keys(DEFAULT_SETTINGS)]
      );
      for (const row of res.rows) {
        const v = parseFloat(row.value);
        if (Number.isFinite(v)) settings[row.key] = v;
      }
    } catch {
      // Table may not exist yet (pre-051 environments) — fall back to defaults.
    }
    return settings;
  });
}

/**
 * Read the active customs tiers as an object keyed by tier_key. Falls back
 * to the HS_TIERS constant when the table is empty or missing.
 */
export async function getCustomsTiers(db) {
  return getOrCompute(TIERS_CACHE_KEY, CACHE_TTL_MS, async () => {
    try {
      const res = await db.query(
        `SELECT tier_key, label, duty_pct, vat_pct, idf_pct, rdl_pct, notes
           FROM customs_tiers
          WHERE is_active = TRUE`
      );
      if (!res.rows.length) return fallbackTiers();
      const out = {};
      for (const r of res.rows) {
        out[r.tier_key] = {
          label:           r.label,
          duty_rate:       parseFloat(r.duty_pct),
          vat_rate:        parseFloat(r.vat_pct),
          idf_rate:        parseFloat(r.idf_pct),
          rdl_rate:        parseFloat(r.rdl_pct),
          vat_zero_rated:  parseFloat(r.vat_pct) === 0,
          note:            r.notes || null,
        };
      }
      return out;
    } catch {
      return fallbackTiers();
    }
  });
}

function fallbackTiers() {
  const out = {};
  for (const [key, cfg] of Object.entries(HS_TIERS)) {
    out[key] = {
      label:           cfg.label,
      duty_rate:       cfg.duty_rate,
      vat_rate:        cfg.vat_zero_rated ? 0 : KE_VAT_RATE,
      idf_rate:        IDF_RATE,
      rdl_rate:        RDL_RATE,
      vat_zero_rated:  !!cfg.vat_zero_rated,
      note:            cfg.note || null,
    };
  }
  return out;
}

/**
 * Read the HS-code prefix → tier map. Returned as an array of
 * `{ hs_prefix, tier_key }` sorted by prefix length DESC so longest-prefix
 * match is a linear scan from the front.
 */
export async function getHsCodeTiers(db) {
  return getOrCompute(HSMAP_CACHE_KEY, CACHE_TTL_MS, async () => {
    try {
      const res = await db.query(
        'SELECT hs_prefix, tier_key FROM hs_code_tiers ORDER BY LENGTH(hs_prefix) DESC, hs_prefix ASC'
      );
      return res.rows.map((r) => ({ hs_prefix: r.hs_prefix, tier_key: r.tier_key }));
    } catch {
      return [];
    }
  });
}

/**
 * Read electronics fees as an object keyed by item_key. Falls back to the
 * `ELECTRONICS_HANDLING` constant when the table is empty/missing.
 */
export async function getElectronicsFees(db) {
  return getOrCompute(ELECTRONICS_CACHE_KEY, CACHE_TTL_MS, async () => {
    try {
      const res = await db.query(
        `SELECT item_key, label, fee_gbp, min_weight_kg
           FROM electronics_fees
          WHERE COALESCE(is_active, TRUE) = TRUE`
      );
      if (!res.rows.length) return { ...ELECTRONICS_HANDLING };
      const out = {};
      for (const r of res.rows) {
        out[r.item_key] = {
          label:         r.label || (ELECTRONICS_HANDLING[r.item_key]?.label ?? r.item_key),
          fee_gbp:       parseFloat(r.fee_gbp),
          min_weight_kg: parseFloat(r.min_weight_kg ?? 0),
        };
      }
      return out;
    } catch {
      return { ...ELECTRONICS_HANDLING };
    }
  });
}

/**
 * Resolve an HS code to a customs tier_key using longest-prefix match.
 * Returns `'general'` as a hard fallback so we never have an item without
 * a tier; the breakdown reports the actual prefix used so admin can fix
 * unmapped codes after the fact.
 */
export function resolveHsTier(hs_code, hsMap) {
  if (!hs_code || typeof hs_code !== 'string') return { tier_key: 'general', matched_prefix: null };
  const normalised = hs_code.replace(/[^0-9A-Za-z]/g, '');
  for (const { hs_prefix, tier_key } of hsMap) {
    if (normalised.startsWith(hs_prefix)) {
      return { tier_key, matched_prefix: hs_prefix };
    }
  }
  return { tier_key: 'general', matched_prefix: null };
}

/* ─── Customs estimate (per-item + legacy single-tier paths) ─────────────── */

/**
 * Compute KRA-style customs on a CIF base for one item / one tier.
 * Pure function — does not touch the DB.
 */
function customsOnCif(cif, tier) {
  const c = Math.max(0, Number(cif) || 0);
  if (c === 0) {
    return {
      total: 0,
      breakdown: { duty: 0, vat: 0, idf: 0, rdl: 0 },
      rates: {
        duty: tier.duty_rate,
        vat:  tier.vat_rate,
        idf:  tier.idf_rate,
        rdl:  tier.rdl_rate,
      },
    };
  }
  const duty = c * tier.duty_rate;
  const idf  = c * tier.idf_rate;
  const rdl  = c * tier.rdl_rate;
  const vatBase = c + duty + idf + rdl;
  const vat = tier.vat_zero_rated ? 0 : vatBase * tier.vat_rate;
  return {
    total: duty + vat + idf + rdl,
    breakdown: { duty, vat, idf, rdl },
    rates: {
      duty: tier.duty_rate,
      vat:  tier.vat_rate,
      idf:  tier.idf_rate,
      rdl:  tier.rdl_rate,
    },
  };
}

/**
 * Per-item customs estimate. Each item gets its own CIF (own declared_value +
 * proportional share of freight + proportional share of insurance) and a tier
 * resolved from its HS code via the hs_code_tiers map.
 *
 * Returns { total, items[], summary } so the iOS / web breakdown can render
 * either the rolled-up number or the per-item lines.
 *
 *   items[]  →  [{ hs_code, qty?, declared_value, weight_kg? }]
 *   freight  →  total shipping cost (will be apportioned by declared_value)
 *   insurance→  total insurance cost (will be apportioned by declared_value)
 */
export function calculateCustomsForItems(items, customsTiers, hsMap, freight = 0, insurance = 0) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const totalDeclared = list.reduce(
    (s, it) => s + Math.max(0, Number(it.declared_value) || 0) * Math.max(1, Number(it.qty) || 1),
    0
  );

  // If no items have a declared value, customs is zero (we have nothing to
  // base CIF on). This mirrors the single-tier legacy path's zero-on-zero
  // behaviour and avoids dividing by 0 in the apportionment below.
  if (list.length === 0 || totalDeclared <= 0) {
    return {
      total: 0,
      items: list.map((it) => ({
        hs_code: it.hs_code || null,
        tier_key: 'general',
        matched_prefix: null,
        cif_gbp: 0,
        total: 0,
        breakdown: { duty: 0, vat: 0, idf: 0, rdl: 0 },
      })),
      summary: { duty: 0, vat: 0, idf: 0, rdl: 0 },
    };
  }

  const perItem = [];
  let runTotal = 0;
  const sumBreak = { duty: 0, vat: 0, idf: 0, rdl: 0 };

  for (const it of list) {
    const qty = Math.max(1, Number(it.qty) || 1);
    const decl = Math.max(0, Number(it.declared_value) || 0) * qty;
    const share = decl / totalDeclared; // safe — totalDeclared > 0 here

    const itemFreight   = freight   * share;
    const itemInsurance = insurance * share;
    const cif = decl + itemFreight + itemInsurance;

    const { tier_key, matched_prefix } = resolveHsTier(it.hs_code, hsMap);
    const tier = customsTiers[tier_key] || customsTiers.general || fallbackTiers().general;
    const c = customsOnCif(cif, tier);

    runTotal += c.total;
    sumBreak.duty += c.breakdown.duty;
    sumBreak.vat  += c.breakdown.vat;
    sumBreak.idf  += c.breakdown.idf;
    sumBreak.rdl  += c.breakdown.rdl;

    perItem.push({
      hs_code:        it.hs_code || null,
      tier_key,
      tier_label:     tier.label,
      matched_prefix,
      qty,
      declared_value: parseFloat(decl.toFixed(2)),
      cif_gbp:        parseFloat(cif.toFixed(2)),
      total:          parseFloat(c.total.toFixed(2)),
      breakdown: {
        duty: parseFloat(c.breakdown.duty.toFixed(2)),
        vat:  parseFloat(c.breakdown.vat .toFixed(2)),
        idf:  parseFloat(c.breakdown.idf .toFixed(2)),
        rdl:  parseFloat(c.breakdown.rdl .toFixed(2)),
      },
      rates: c.rates,
    });
  }

  return {
    total: parseFloat(runTotal.toFixed(2)),
    items: perItem,
    summary: {
      duty: parseFloat(sumBreak.duty.toFixed(2)),
      vat:  parseFloat(sumBreak.vat .toFixed(2)),
      idf:  parseFloat(sumBreak.idf .toFixed(2)),
      rdl:  parseFloat(sumBreak.rdl .toFixed(2)),
    },
  };
}

/**
 * Legacy single-tier customs estimate. Preserved for callers that haven't
 * been migrated to per-item HS codes yet (notably the order-detail recompute
 * in routes/orders.js and the /pricing/calculate endpoint when no items
 * array is supplied).
 *
 * Signature matches the pre-051 version exactly, including the (cif_gbp,
 * hs_tier) call shape.
 */
export function calculateCustomsEstimate(cif_gbp, hs_tier = 'general', tiers = null) {
  const customsTiers = tiers || fallbackTiers();
  const tier = customsTiers[hs_tier] || customsTiers.general;
  const c = customsOnCif(cif_gbp, tier);
  return {
    total: parseFloat(c.total.toFixed(2)),
    tier_key: hs_tier,
    tier_label: tier.label,
    breakdown: {
      duty: parseFloat(c.breakdown.duty.toFixed(2)),
      vat:  parseFloat(c.breakdown.vat .toFixed(2)),
      idf:  parseFloat(c.breakdown.idf .toFixed(2)),
      rdl:  parseFloat(c.breakdown.rdl .toFixed(2)),
    },
    rates: c.rates,
    note:  tier.note,
  };
}

/* ─── The main quote function ────────────────────────────────────────────── */

/**
 * Calculate shipping cost with full breakdown.
 *
 * Inputs are split into:
 *   • Parcel: weight_kg, dimensions (L/W/H in cm), market, shipping_speed
 *   • Items:  optional items[] — when supplied, customs is per-item
 *   • Money:  declared_value, insurance flag, electronics_item (legacy)
 *   • Settings (injected by caller after a DB lookup):
 *       settings  — { base_shipping_per_kg, base_handling_fee,
 *                     card_processing_pct, dim_divisor }
 *       customsTiers, hsMap, electronicsFees (all maps, see DB helpers)
 *
 * Returns a `breakdown.dimensional_weight` block that ALWAYS includes
 * `actual_kg`, `vol_kg`, `chargeable_kg`, `dim_divisor` so the customer can
 * see why a light-but-bulky parcel is being billed as heavier.
 */
export function calculateShippingCost(options) {
  const {
    weight_kg        = 0,
    dimensions       = {},
    market           = 'UK',
    shipping_speed   = 'economy',
    insurance        = false,
    declared_value   = 0,
    electronics_item = null,
    hs_tier          = null,
    items            = null,
    rates_gbp        = null,       // soft-deprecated: per-market override
    settings         = null,       // when null, DEFAULT_SETTINGS used
    customsTiers     = null,       // when null, HS_TIERS constant used
    hsMap            = null,       // when null, no prefix matching
    electronicsFees  = null,       // when null, ELECTRONICS_HANDLING used
  } = options;

  const cfg          = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const tiers        = customsTiers || fallbackTiers();
  const hsMapArr     = Array.isArray(hsMap) ? hsMap : [];
  const electronics  = electronicsFees || ELECTRONICS_HANDLING;

  // ── 1. Chargeable weight (volumetric = floor)
  const electronicsCfg = electronics_item ? electronics[electronics_item] : null;
  const actualKg = Math.max(0, Number(weight_kg) || 0);
  const effectiveActualKg = electronicsCfg
    ? Math.max(actualKg, Number(electronicsCfg.min_weight_kg) || 0)
    : actualKg;

  const dims = dimensions || {};
  const hasDims = !!(dims.length && dims.width && dims.height);
  const volKg = hasDims
    ? (Number(dims.length) * Number(dims.width) * Number(dims.height)) / cfg.dim_divisor
    : 0;
  const chargeableKg = Math.max(effectiveActualKg, volKg);

  // ── 2. Shipping
  //
  // The new model has a single base_shipping_per_kg from pricing_settings.
  // The legacy `rates_gbp` per-market override is honoured so older clients
  // (older /calculate calls) keep working; if it's supplied we use it,
  // otherwise we use the global setting.
  let baseRateGbp = cfg.base_shipping_per_kg;
  if (rates_gbp && typeof rates_gbp === 'object' && rates_gbp[market] != null) {
    baseRateGbp = Number(rates_gbp[market]) || baseRateGbp;
  }
  // Express multiplier and insurance % remain hardcoded — explicitly out of
  // scope for this pricing-model round (flagged in the implementation plan).
  const speedMultiplier = shipping_speed === 'express' ? 1.5 : 1.0;
  const shippingCost = chargeableKg * baseRateGbp * speedMultiplier;

  // ── 3. Handling: single flat fee from settings
  const handlingFee = cfg.base_handling_fee;

  // ── 4. Special (electronics) handling
  const electronicsHandlingGbp = electronicsCfg ? Number(electronicsCfg.fee_gbp) || 0 : 0;

  // ── 5. Insurance (out of scope this round — still 3% of declared value)
  let insuranceCost = 0;
  if (insurance && declared_value > 0) {
    insuranceCost = Number(declared_value) * 0.03;
  }

  // ── 6. Customs
  //
  // Two paths:
  //   A. items[] supplied → per-item HS-code lookup → summed customs
  //   B. legacy single hs_tier path → one CIF / one tier
  //
  // Auto-pick the tier when the caller didn't supply one for path B:
  // electronics → electronics tier, otherwise 'general'.
  let customs;
  let customsItemsBreakdown = null;
  if (Array.isArray(items) && items.length > 0) {
    const c = calculateCustomsForItems(items, tiers, hsMapArr, shippingCost, insuranceCost);
    customs = {
      total: c.total,
      tier_key: 'multi',
      tier_label: 'Per-item HS lookup',
      breakdown: c.summary,
      rates: null,
      note: `${c.items.length} item(s) — each priced against its own HS-code tier.`,
    };
    customsItemsBreakdown = c.items;
  } else {
    const resolvedTier = hs_tier || (electronicsCfg ? 'electronics' : 'general');
    const cif = (Number(declared_value) || 0) + insuranceCost + shippingCost;
    customs = calculateCustomsEstimate(cif, resolvedTier, tiers);
  }

  // ── 7. Card processing fee — applied to the FULL subtotal incl. customs
  const subtotal = shippingCost + electronicsHandlingGbp + handlingFee + insuranceCost + customs.total;
  const cardFee  = subtotal * cfg.card_processing_pct;

  const total = subtotal + cardFee;

  return {
    total: parseFloat(total.toFixed(2)),
    currency: 'GBP',
    shipping_speed,
    market,
    hs_tier: customs.tier_key,
    settings: {
      base_shipping_per_kg: cfg.base_shipping_per_kg,
      base_handling_fee:    cfg.base_handling_fee,
      card_processing_pct:  cfg.card_processing_pct,
      dim_divisor:          cfg.dim_divisor,
    },
    breakdown: {
      base_shipping: {
        amount: parseFloat(shippingCost.toFixed(2)),
        rate_gbp_per_kg: baseRateGbp,
        description: `Base shipping (${chargeableKg.toFixed(2)} kg @ £${baseRateGbp.toFixed(2)}/kg ${shipping_speed})`,
      },
      dimensional_weight: {
        actual_kg:           parseFloat(actualKg.toFixed(4)),
        vol_kg:              parseFloat(volKg.toFixed(4)),
        chargeable_kg:       parseFloat(chargeableKg.toFixed(4)),
        dim_divisor:         cfg.dim_divisor,
        calculation:         hasDims
          ? `(${dims.length}x${dims.width}x${dims.height})/${cfg.dim_divisor}`
          : 'no dimensions provided — chargeable falls back to actual_kg',
        dimensions_provided: hasDims,
      },
      electronics_handling: {
        item: electronics_item || null,
        label: electronicsCfg ? electronicsCfg.label : null,
        fee_gbp: electronicsHandlingGbp,
        amount: parseFloat(electronicsHandlingGbp.toFixed(2)),
        included: !!electronicsCfg,
        description: electronicsCfg
          ? `£${electronicsHandlingGbp} handling fee for ${electronicsCfg.label} (min ${electronicsCfg.min_weight_kg} kg applies)`
          : null,
      },
      handling_fee: {
        amount: parseFloat(handlingFee.toFixed(2)),
        description: `Base handling fee (£${handlingFee.toFixed(2)} flat per order)`,
      },
      insurance: {
        amount: parseFloat(insuranceCost.toFixed(2)),
        rate: '3% of declared value',
        declared_value,
        included: insurance,
      },
      customs_estimate: {
        amount: customs.total,
        currency: 'GBP',
        tier_key: customs.tier_key,
        tier_label: customs.tier_label,
        components: customs.breakdown,
        rates: customs.rates,
        note: customs.note,
        items: customsItemsBreakdown,
      },
      card_fee: {
        amount: parseFloat(cardFee.toFixed(2)),
        rate: cfg.card_processing_pct,
        description: `Card processing surcharge (${(cfg.card_processing_pct * 100).toFixed(2)}% of subtotal incl. customs)`,
      },
      subtotal: parseFloat(subtotal.toFixed(2)),
    },
    notes: {
      delivery_time: shipping_speed === 'express' ? '5-7 business days' : '10-14 business days',
      warehouse: '31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB',
      disclaimer: 'Customs are estimated per HS-code tier. Final duty is set by KRA at clearing.',
    },
  };
}

/**
 * Load every DB-backed pricing input in parallel. The caller (routes/pricing.js
 * `/calculate`, routes/orders.js POST, the order-detail recompute) injects
 * the result into `calculateShippingCost`. Always returns a populated object —
 * any individual lookup that fails falls back to its in-code default.
 */
export async function loadPricingContext(db) {
  const [settings, customsTiers, hsMap, electronicsFees] = await Promise.all([
    getPricingSettings(db),
    getCustomsTiers(db),
    getHsCodeTiers(db),
    getElectronicsFees(db),
  ]);
  return { settings, customsTiers, hsMap, electronicsFees };
}
