/**
 * Electronics handling fees (GBP, added on top of base shipping).
 * The minimum chargeable weight for electronics is always 1 kg.
 */
export const ELECTRONICS_HANDLING = {
  phone:      { label: 'Phone',                  fee_gbp: 75, min_weight_kg: 1 },
  laptop:     { label: 'Laptop / Accessories',   fee_gbp: 65, min_weight_kg: 1 },
  tv_monitor: { label: 'TV / Screen / Monitor',  fee_gbp: 65, min_weight_kg: 1 },
};

/**
 * Default shipping rates per kg in GBP.
 * Can be overridden by the admin via the DB.
 */
export const DEFAULT_RATES_GBP = {
  UK:    8,
  China: 6,
};

/**
 * HS-tier table for the customs estimate.
 *
 * Kenyan customs charges vary by HS code: import duty is the per-tier rate
 * applied to the CIF base (declared value + insurance + freight); KE VAT
 * (16 %) is then applied on top of CIF + duty + IDF + RDL; IDF (3.5 %) and
 * RDL (2 %) ride on the CIF base. We expose a small set of pragmatic tiers
 * the admin can map a parcel to — the alternative is a full HS-code lookup
 * which is overkill for the diary of categories Thapsus moves day-to-day.
 *
 * Rates here are KRA's 2024 "general" bands (EAC CET). The admin should
 * adjust for promotional/special tariffs as needed; the goal is a quote
 * that's right ±10 % rather than ±400 %.
 */
export const HS_TIERS = {
  general: {
    label: 'General goods (default)',
    duty_rate: 0.25,
    note: 'Default 25% duty band — most clothing, footwear, toys, household goods.',
  },
  electronics: {
    label: 'Consumer electronics',
    duty_rate: 0.0,
    note: 'Phones, laptops, screens — duty-free at 0% but 16% VAT still applies.',
  },
  clothing_textiles: {
    label: 'Clothing & textiles',
    duty_rate: 0.25,
    note: 'Apparel, footwear, fabric — 25% duty band.',
  },
  food_processed: {
    label: 'Processed food / supplements',
    duty_rate: 0.35,
    note: 'Sensitive list — 35% duty band.',
  },
  raw_materials: {
    label: 'Raw materials / inputs',
    duty_rate: 0.0,
    note: 'Industrial inputs and raw materials — 0% duty.',
  },
  books_media: {
    label: 'Books / printed media',
    duty_rate: 0.0,
    note: 'Books, journals — 0% duty AND zero-rated for VAT.',
    vat_zero_rated: true,
  },
  zero_rated: {
    label: 'Zero-rated (medical / exempt)',
    duty_rate: 0.0,
    note: 'Medical supplies and other gazetted exemptions — 0% duty, 0% VAT.',
    vat_zero_rated: true,
  },
};

const KE_VAT_RATE = 0.16;
const IDF_RATE    = 0.035;  // Import Declaration Fee (3.5 % of CIF)
const RDL_RATE    = 0.02;   // Railway Development Levy (2 % of CIF)

/**
 * Compute KRA-style customs estimate on a CIF base.
 *
 * `cif_gbp` is the GBP-equivalent CIF (declared value + insurance + freight).
 * The function returns each component plus the total so the iOS breakdown
 * can render line-by-line. The total is in GBP — the customer pays KES at
 * clearing, but for the pre-flight quote we want one currency end-to-end.
 *
 * @param {number} cif_gbp
 * @param {string} hs_tier   key from HS_TIERS (defaults to 'general')
 * @returns {object} { total, breakdown: { duty, vat, idf, rdl }, tier }
 */
export function calculateCustomsEstimate(cif_gbp, hs_tier = 'general') {
  const tier = HS_TIERS[hs_tier] || HS_TIERS.general;
  const cif  = Math.max(0, Number(cif_gbp) || 0);
  if (cif === 0) {
    return {
      total: 0,
      tier_key: hs_tier,
      tier_label: tier.label,
      breakdown: { duty: 0, vat: 0, idf: 0, rdl: 0 },
      note: tier.note,
    };
  }

  const duty = cif * tier.duty_rate;
  const idf  = cif * IDF_RATE;
  const rdl  = cif * RDL_RATE;
  const vatBase = cif + duty + idf + rdl;
  const vat = tier.vat_zero_rated ? 0 : vatBase * KE_VAT_RATE;

  const total = duty + vat + idf + rdl;
  return {
    total: parseFloat(total.toFixed(2)),
    tier_key: hs_tier,
    tier_label: tier.label,
    breakdown: {
      duty: parseFloat(duty.toFixed(2)),
      vat:  parseFloat(vat.toFixed(2)),
      idf:  parseFloat(idf.toFixed(2)),
      rdl:  parseFloat(rdl.toFixed(2)),
    },
    rates: {
      duty: tier.duty_rate,
      vat:  tier.vat_zero_rated ? 0 : KE_VAT_RATE,
      idf:  IDF_RATE,
      rdl:  RDL_RATE,
    },
    note: tier.note,
  };
}

/**
 * Calculate shipping cost with full breakdown.
 *
 * @param {Object}  options
 * @param {number}  options.weight_kg          - Actual weight in kg
 * @param {Object}  options.dimensions         - { length, width, height } in cm
 * @param {string}  options.market             - 'UK' | 'China'
 * @param {string}  options.shipping_speed     - 'economy' | 'express'
 * @param {boolean} options.insurance          - Include insurance?
 * @param {number}  options.declared_value     - Declared value in GBP
 * @param {string}  [options.electronics_item] - Key from ELECTRONICS_HANDLING or null
 * @param {string}  [options.hs_tier]          - Key from HS_TIERS (defaults to 'general')
 * @param {Object}  [options.rates_gbp]        - Admin-overridden rates per kg { UK, USA, China }
 * @returns {Object} Cost breakdown with a `total` property
 */
export function calculateShippingCost(options) {
  const {
    weight_kg = 0,
    dimensions = {},
    market = 'UK',
    shipping_speed = 'economy',
    insurance = false,
    declared_value = 0,
    electronics_item = null,
    hs_tier = null,
    rates_gbp = null,
  } = options;

  // All breakdown amounts are in GBP. Thapsus charges UK customers in GBP for
  // shipping/handling/insurance; the customs estimate is also surfaced in GBP
  // (KRA collects the KES equivalent on arrival). Calling code that needs a
  // KES figure should convert at the live rate.
  const ratesGbp = rates_gbp || DEFAULT_RATES_GBP;
  const rateGbp  = ratesGbp[market] || ratesGbp['UK'] || DEFAULT_RATES_GBP['UK'];

  const electronicsCfg = electronics_item ? ELECTRONICS_HANDLING[electronics_item] : null;
  const effectiveWeight = electronicsCfg
    ? Math.max(weight_kg, electronicsCfg.min_weight_kg)
    : weight_kg;

  let dimensionalWeight = 0;
  if (dimensions && dimensions.length && dimensions.width && dimensions.height) {
    dimensionalWeight = (dimensions.length * dimensions.width * dimensions.height) / 5000;
  }

  const chargeableWeight = Math.max(effectiveWeight, dimensionalWeight);

  let shippingCost = chargeableWeight * rateGbp;
  const speedMultiplier = shipping_speed === 'express' ? 1.5 : 1.0;
  shippingCost *= speedMultiplier;

  const electronicsHandlingGbp = electronicsCfg ? electronicsCfg.fee_gbp : 0;

  // £3 minimum / £0.50 per kg for non-electronics parcels.
  const generalHandlingFee = electronicsCfg ? 0 : Math.max(3, chargeableWeight * 0.5);

  let insuranceCost = 0;
  if (insurance && declared_value > 0) {
    insuranceCost = declared_value * 0.03;
  }

  // Auto-pick a tier when the caller didn't supply one. Electronics → the
  // electronics tier (0% duty, 16% VAT); otherwise default to 'general'.
  const resolvedTier = hs_tier || (electronicsCfg ? 'electronics' : 'general');

  // CIF for KE customs = declared value + insurance + freight (= base shipping).
  const cif = (Number(declared_value) || 0) + insuranceCost + shippingCost;
  const customs = calculateCustomsEstimate(cif, resolvedTier);

  const total = shippingCost + electronicsHandlingGbp + generalHandlingFee + insuranceCost + customs.total;

  return {
    total: parseFloat(total.toFixed(2)),
    currency: 'GBP',
    shipping_speed,
    market,
    hs_tier: resolvedTier,
    breakdown: {
      base_shipping: {
        amount: parseFloat(shippingCost.toFixed(2)),
        rate_gbp_per_kg: rateGbp,
        description: `Base shipping (${chargeableWeight.toFixed(2)} kg @ £${rateGbp.toFixed(2)}/kg ${shipping_speed})`,
      },
      dimensional_weight: {
        actual_weight_kg: weight_kg,
        dimensional_weight_kg: parseFloat(dimensionalWeight.toFixed(2)),
        chargeable_weight_kg: parseFloat(chargeableWeight.toFixed(2)),
        calculation: (dimensions && dimensions.length && dimensions.width && dimensions.height)
          ? `(${dimensions.length}x${dimensions.width}x${dimensions.height})/5000`
          : 'N/A',
      },
      electronics_handling: {
        item: electronics_item || null,
        label: electronicsCfg ? electronicsCfg.label : null,
        fee_gbp: electronicsHandlingGbp,
        amount: parseFloat(electronicsHandlingGbp.toFixed(2)),
        included: !!electronicsCfg,
        description: electronicsCfg
          ? `£${electronicsHandlingGbp} handling fee for ${electronicsCfg.label} (min 1 kg applies)`
          : null,
      },
      handling_fee: {
        amount: parseFloat(generalHandlingFee.toFixed(2)),
        description: 'Handling and processing fee',
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
        cif_gbp: parseFloat(cif.toFixed(2)),
        tier_key: customs.tier_key,
        tier_label: customs.tier_label,
        components: customs.breakdown,
        rates: customs.rates,
        note: customs.note,
      },
    },
    notes: {
      delivery_time: shipping_speed === 'express' ? '5-7 business days' : '10-14 business days',
      warehouse: '31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB',
      disclaimer: 'Customs are estimated against the selected HS tier. Final duty is set by KRA at clearing.',
    },
  };
}
