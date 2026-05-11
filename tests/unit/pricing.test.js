// tests/unit/pricing.test.js
//
// Covers the six-knob pricing model in utils/pricing.js. The shared core
// is pure — chargeable-weight floor, customs-on-CIF, per-item HS resolution,
// card fee on full subtotal — and all of it can be tested without a DB by
// passing `settings`, `customsTiers`, `hsMap`, `electronicsFees` explicitly.
//
// These tests double as the cross-repo parity oracle: thapsus-v1.1 must
// produce the same numbers for the same inputs (see the parity test in the
// shared module's commonTest).

import { describe, it, expect } from 'vitest';
import {
  calculateShippingCost,
  calculateCustomsForItems,
  calculateCustomsEstimate,
  resolveHsTier,
  DEFAULT_SETTINGS,
  HS_TIERS,
} from '../../utils/pricing.js';

// Build a `customsTiers` object in the DB-row shape that calculateShippingCost
// expects (duty_rate, vat_rate, idf_rate, rdl_rate, vat_zero_rated).
function tiersFromConstant() {
  const KE_VAT = 0.16, IDF = 0.035, RDL = 0.02;
  const out = {};
  for (const [key, cfg] of Object.entries(HS_TIERS)) {
    out[key] = {
      label:          cfg.label,
      duty_rate:      cfg.duty_rate,
      vat_rate:       cfg.vat_zero_rated ? 0 : KE_VAT,
      idf_rate:       IDF,
      rdl_rate:       RDL,
      vat_zero_rated: !!cfg.vat_zero_rated,
      note:           cfg.note,
    };
  }
  return out;
}

const TIERS = tiersFromConstant();

// Starter HS map matching the 051 migration seeds. resolveHsTier is
// longest-prefix-match, so the array should already be sorted descending.
const HS_MAP = [
  { hs_prefix: '8517', tier_key: 'electronics' },
  { hs_prefix: '8471', tier_key: 'electronics' },
  { hs_prefix: '8528', tier_key: 'electronics' },
  { hs_prefix: '6109', tier_key: 'clothing_textiles' },
  { hs_prefix: '4901', tier_key: 'books_media' },
];

describe('volumetric weight', () => {
  // The brief's canonical test: 60×40×50 box at actual=2kg, divisor=5000.
  // vol_kg = (60*40*50)/5000 = 24; chargeable = max(2, 24) = 24.
  it('60×40×50 cm, actual=2kg, divisor=5000 → chargeable=24', () => {
    const r = calculateShippingCost({
      weight_kg: 2,
      dimensions: { length: 60, width: 40, height: 50 },
      market: 'UK',
      settings: { ...DEFAULT_SETTINGS, dim_divisor: 5000 },
      customsTiers: TIERS,
    });
    expect(r.breakdown.dimensional_weight.actual_kg).toBe(2);
    expect(r.breakdown.dimensional_weight.vol_kg).toBe(24);
    expect(r.breakdown.dimensional_weight.chargeable_kg).toBe(24);
    expect(r.breakdown.dimensional_weight.dim_divisor).toBe(5000);
  });

  // Same parcel at actual=30kg: chargeable = max(30, 24) = 30. Volumetric
  // is the floor, not the ceiling — heavy-but-small parcels are billed by
  // actual weight.
  it('60×40×50 cm, actual=30kg → chargeable=30 (actual > vol)', () => {
    const r = calculateShippingCost({
      weight_kg: 30,
      dimensions: { length: 60, width: 40, height: 50 },
      market: 'UK',
      settings: { ...DEFAULT_SETTINGS, dim_divisor: 5000 },
      customsTiers: TIERS,
    });
    expect(r.breakdown.dimensional_weight.chargeable_kg).toBe(30);
  });

  // The divisor reconciliation test: same parcel, IATA 6000 vs courier 5000.
  // Bigger divisor → smaller vol_kg → smaller chargeable.
  it('changing dim_divisor 5000 → 6000 lowers chargeable for bulky parcel', () => {
    const dims = { length: 60, width: 40, height: 50 };
    const r5000 = calculateShippingCost({
      weight_kg: 2, dimensions: dims, market: 'UK',
      settings: { ...DEFAULT_SETTINGS, dim_divisor: 5000 },
      customsTiers: TIERS,
    });
    const r6000 = calculateShippingCost({
      weight_kg: 2, dimensions: dims, market: 'UK',
      settings: { ...DEFAULT_SETTINGS, dim_divisor: 6000 },
      customsTiers: TIERS,
    });
    expect(r5000.breakdown.dimensional_weight.vol_kg).toBeCloseTo(24, 4);
    expect(r6000.breakdown.dimensional_weight.vol_kg).toBeCloseTo(20, 4);
    expect(r6000.breakdown.dimensional_weight.chargeable_kg)
      .toBeLessThan(r5000.breakdown.dimensional_weight.chargeable_kg);
  });

  // When dimensions are missing chargeable must fall back to actual_kg and
  // the breakdown must flag it explicitly so the customer sees why.
  it('missing dimensions → chargeable = actual_kg, flagged in breakdown', () => {
    const r = calculateShippingCost({
      weight_kg: 5, dimensions: null, market: 'UK',
      settings: DEFAULT_SETTINGS, customsTiers: TIERS,
    });
    expect(r.breakdown.dimensional_weight.actual_kg).toBe(5);
    expect(r.breakdown.dimensional_weight.vol_kg).toBe(0);
    expect(r.breakdown.dimensional_weight.chargeable_kg).toBe(5);
    expect(r.breakdown.dimensional_weight.dimensions_provided).toBe(false);
  });
});

describe('HS-code resolution', () => {
  it('resolves 8517... to electronics tier', () => {
    const { tier_key, matched_prefix } = resolveHsTier('851712', HS_MAP);
    expect(tier_key).toBe('electronics');
    expect(matched_prefix).toBe('8517');
  });

  it('unmapped code falls back to general', () => {
    const { tier_key, matched_prefix } = resolveHsTier('9999.99', HS_MAP);
    expect(tier_key).toBe('general');
    expect(matched_prefix).toBeNull();
  });

  it('strips punctuation before matching (8517.12 → 8517)', () => {
    expect(resolveHsTier('8517.12', HS_MAP).tier_key).toBe('electronics');
  });

  it('null/empty hs_code resolves to general', () => {
    expect(resolveHsTier(null, HS_MAP).tier_key).toBe('general');
    expect(resolveHsTier('',   HS_MAP).tier_key).toBe('general');
  });
});

describe('per-item customs', () => {
  it('one phone + one general item → mixed customs, both itemised', () => {
    const c = calculateCustomsForItems(
      [
        { hs_code: '851712', qty: 1, declared_value: 600 },  // phone → electronics
        { hs_code: '6109',   qty: 2, declared_value: 30 },   // T-shirts → clothing
      ],
      TIERS,
      HS_MAP,
      120,  // freight
      0     // insurance
    );
    expect(c.items).toHaveLength(2);
    expect(c.items[0].tier_key).toBe('electronics');
    expect(c.items[1].tier_key).toBe('clothing_textiles');
    expect(c.total).toBeGreaterThan(0);
    // Electronics: 0% duty, 16% VAT. Clothing: 25% duty, 16% VAT.
    // Clothing line should have > 0 duty even though it's lighter.
    expect(c.items[1].breakdown.duty).toBeGreaterThan(0);
    expect(c.items[0].breakdown.duty).toBe(0);
  });

  it('zero declared value across all items → zero customs', () => {
    const c = calculateCustomsForItems(
      [{ hs_code: '8517', qty: 1, declared_value: 0 }],
      TIERS, HS_MAP, 50, 0
    );
    expect(c.total).toBe(0);
  });
});

describe('card processing fee', () => {
  // The brief is explicit: card_fee = subtotal × pct, where
  // subtotal = shipping + handling + special + customs_est. Customs IS in.
  it('applies to FULL subtotal incl. customs', () => {
    const r = calculateShippingCost({
      weight_kg: 2,
      dimensions: { length: 60, width: 40, height: 50 }, // 24 kg chargeable
      market: 'UK',
      declared_value: 100, insurance: false,
      items: [{ hs_code: 'general', qty: 1, declared_value: 100 }],
      settings: { ...DEFAULT_SETTINGS, card_processing_pct: 0.03 },
      customsTiers: TIERS, hsMap: HS_MAP,
    });
    const subtotal = r.breakdown.subtotal;
    expect(r.breakdown.card_fee.amount).toBeCloseTo(subtotal * 0.03, 2);
    // Subtotal must include the customs estimate.
    expect(r.breakdown.customs_estimate.amount).toBeGreaterThan(0);
    expect(subtotal).toBeGreaterThan(
      r.breakdown.base_shipping.amount + r.breakdown.handling_fee.amount
    );
  });

  it('toggling 0 → 3% increases total by ~3% of subtotal', () => {
    const base = {
      weight_kg: 2,
      dimensions: { length: 60, width: 40, height: 50 },
      market: 'UK',
      items: [{ hs_code: 'general', qty: 1, declared_value: 100 }],
      customsTiers: TIERS, hsMap: HS_MAP,
    };
    const r0 = calculateShippingCost({ ...base, settings: { ...DEFAULT_SETTINGS, card_processing_pct: 0    } });
    const r3 = calculateShippingCost({ ...base, settings: { ...DEFAULT_SETTINGS, card_processing_pct: 0.03 } });
    // r3.total - r0.total should be ~3% of r0.subtotal (which equals r3.subtotal
    // since the card fee is computed AFTER subtotal, not woven into shipping).
    const delta = r3.total - r0.total;
    expect(delta).toBeCloseTo(r0.breakdown.subtotal * 0.03, 1);
  });
});

describe('base shipping (single-rate model)', () => {
  it('base_shipping_per_kg multiplied by chargeable_kg', () => {
    const r = calculateShippingCost({
      weight_kg: 10, dimensions: null, market: 'UK',
      settings: { ...DEFAULT_SETTINGS, base_shipping_per_kg: 7.5 },
      customsTiers: TIERS,
    });
    // chargeable=10 (no dims), shipping = 10 * 7.5 = 75.
    expect(r.breakdown.base_shipping.amount).toBe(75);
    expect(r.breakdown.base_shipping.rate_gbp_per_kg).toBe(7.5);
  });

  it('handling_fee is a flat fee, not per-kg', () => {
    const r1kg = calculateShippingCost({
      weight_kg: 1, market: 'UK',
      settings: { ...DEFAULT_SETTINGS, base_handling_fee: 5 }, customsTiers: TIERS,
    });
    const r20kg = calculateShippingCost({
      weight_kg: 20, market: 'UK',
      settings: { ...DEFAULT_SETTINGS, base_handling_fee: 5 }, customsTiers: TIERS,
    });
    expect(r1kg.breakdown.handling_fee.amount).toBe(5);
    expect(r20kg.breakdown.handling_fee.amount).toBe(5);
  });
});

describe('legacy single-tier customs path', () => {
  it('calculateCustomsEstimate matches pre-051 numbers for general@CIF=1000', () => {
    const c = calculateCustomsEstimate(1000, 'general', TIERS);
    // duty 25%, IDF 3.5%, RDL 2%, VAT 16% on (cif + duty + idf + rdl).
    // duty=250, idf=35, rdl=20, vatBase=1305, vat=208.80 → total=513.80
    expect(c.total).toBe(513.80);
    expect(c.breakdown.duty).toBe(250);
    expect(c.breakdown.idf).toBe(35);
    expect(c.breakdown.rdl).toBe(20);
    expect(c.breakdown.vat).toBe(208.80);
  });

  // Zero-rated tier means duty=0 and VAT=0, but IDF (3.5%) + RDL (2%) are
  // admin levies that apply to every import regardless of category.
  // So CIF=1000 → 35 + 20 = 55, not 0.
  it('zero-rated tier: duty=0, vat=0, but IDF + RDL still apply', () => {
    const c = calculateCustomsEstimate(1000, 'zero_rated', TIERS);
    expect(c.breakdown.duty).toBe(0);
    expect(c.breakdown.vat).toBe(0);
    expect(c.breakdown.idf).toBe(35);
    expect(c.breakdown.rdl).toBe(20);
    expect(c.total).toBe(55);
  });
});

// The end-to-end parity oracle. This exact input shape MUST produce the same
// total in thapsus-v1.1 — copy the numbers into shared/.../commonTest when
// adding the parity test there.
describe('cross-repo parity oracle', () => {
  it('canonical parcel total locked in', () => {
    const r = calculateShippingCost({
      weight_kg: 2,
      dimensions: { length: 60, width: 40, height: 50 },
      market: 'UK',
      shipping_speed: 'economy',
      insurance: false,
      declared_value: 0,
      items: [
        { hs_code: '8517', qty: 1, declared_value: 600 },
        { hs_code: '6109', qty: 2, declared_value: 30 },
      ],
      settings: {
        base_shipping_per_kg: 8,
        base_handling_fee:    3,
        card_processing_pct:  0.03,
        dim_divisor:          5000,
      },
      customsTiers: TIERS,
      hsMap:        HS_MAP,
    });
    // Hand calc:
    //   chargeable = max(2, 24) = 24 kg
    //   shipping   = 24 × 8 = 192
    //   handling   = 3
    //   electronics_handling = 0 (electronics_item not set even though item is)
    //   insurance  = 0
    //   Items total declared = 600 + 60 = 660
    //   Item A share = 600/660; freight share = 192 × 600/660 = 174.5454…
    //     CIF_A = 600 + 174.5454… = 774.5454… ; electronics → duty 0,
    //     idf 27.10909…, rdl 15.49090…, vat 0.16 × (774.5454 + 0 + 27.1091 + 15.4909)
    //         = 0.16 × 817.1454… = 130.7432… ; total_A ≈ 173.3432…
    //   Item B share = 60/660; freight share = 192 × 60/660 = 17.4545…
    //     CIF_B = 60 + 17.4545… = 77.4545… ; clothing → duty 19.3636…,
    //     idf 2.71090…, rdl 1.54909…, vat 0.16 × (77.4545 + 19.3636 + 2.7109 + 1.5491)
    //         = 0.16 × 101.0782… = 16.1725…, total_B ≈ 39.7961…
    //   customs ≈ 173.343 + 39.796 = 213.139
    //   subtotal = 192 + 3 + 0 + 0 + 213.139 = 408.139
    //   card_fee = 408.139 × 0.03 = 12.244
    //   total ≈ 420.38
    expect(r.breakdown.dimensional_weight.chargeable_kg).toBe(24);
    expect(r.breakdown.base_shipping.amount).toBe(192);
    expect(r.breakdown.handling_fee.amount).toBe(3);
    expect(r.breakdown.customs_estimate.amount).toBeCloseTo(213.14, 1);
    expect(r.breakdown.card_fee.amount).toBeCloseTo(12.24, 1);
    expect(r.total).toBeCloseTo(420.38, 1);
  });
});
