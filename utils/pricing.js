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
 * Calculate shipping cost with full breakdown.
 *
 * @param {Object}  options
 * @param {number}  options.weight_kg        - Actual weight in kg
 * @param {Object}  options.dimensions       - { length, width, height } in cm
 * @param {string}  options.market           - 'UK' | 'China'
 * @param {string}  options.shipping_speed   - 'economy' | 'express'
 * @param {boolean} options.insurance        - Include insurance?
 * @param {number}  options.declared_value   - Declared value in KES
 * @param {string}  [options.electronics_item]  - Key from ELECTRONICS_HANDLING or null
 * @param {Object}  [options.rates_gbp]      - Admin-overridden rates per kg { UK, USA, China }
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
    rates_gbp = null,
  } = options;

  // All breakdown amounts are in GBP. Thapsus charges UK customers in GBP for
  // shipping/handling/insurance; the KES customs liability is collected by KRA
  // on arrival and shown separately as a duty estimate (the iOS cost breakdown
  // surfaces the GBP equivalent of that duty so the customer can see a single
  // pre-flight estimate). The legacy code multiplied each line by 164 and
  // labelled the result as KES while iOS rendered the same number with £, which
  // produced absurd "£1312" base-shipping figures for a 1 kg parcel.
  const ratesGbp = rates_gbp || DEFAULT_RATES_GBP;
  const rateGbp  = ratesGbp[market] || ratesGbp['UK'] || DEFAULT_RATES_GBP['UK'];

  // Electronics: apply minimum weight & determine handling fee
  const electronicsCfg = electronics_item ? ELECTRONICS_HANDLING[electronics_item] : null;
  const effectiveWeight = electronicsCfg
    ? Math.max(weight_kg, electronicsCfg.min_weight_kg)
    : weight_kg;

  // Dimensional weight (volumetric)
  let dimensionalWeight = 0;
  if (dimensions && dimensions.length && dimensions.width && dimensions.height) {
    dimensionalWeight = (dimensions.length * dimensions.width * dimensions.height) / 5000;
  }

  // Chargeable weight = max of effective weight and dimensional weight
  const chargeableWeight = Math.max(effectiveWeight, dimensionalWeight);

  // Base shipping cost in GBP
  let shippingCost = chargeableWeight * rateGbp;
  const speedMultiplier = shipping_speed === 'express' ? 1.5 : 1.0;
  shippingCost *= speedMultiplier;

  // Electronics handling fee (flat GBP fee, applied when an electronics
  // category is selected). Replaces the legacy KES handling line.
  const electronicsHandlingGbp = electronicsCfg ? electronicsCfg.fee_gbp : 0;

  // General handling fee in GBP for non-electronics parcels: £3 minimum or
  // £0.50/kg, whichever is greater. Translates the old KES floor (≈£3) into
  // GBP so the post-fix total stays in the same ballpark for typical parcels.
  const generalHandlingFee = electronicsCfg ? 0 : Math.max(3, chargeableWeight * 0.5);

  // Insurance: 3% of declared value (declared_value is in GBP)
  let insuranceCost = 0;
  if (insurance && declared_value > 0) {
    insuranceCost = declared_value * 0.03;
  }

  // Customs estimate: KE VAT (16%) + duty (10%) on the declared GBP value.
  // The actual KES amount is calculated on arrival; this preview is in GBP
  // so the customer's pre-flight total stays in a single currency.
  let customsDutyEstimate = 0;
  if (declared_value > 0) {
    customsDutyEstimate = declared_value * 0.16 + declared_value * 0.10;
  }

  const total = shippingCost + electronicsHandlingGbp + generalHandlingFee + insuranceCost + customsDutyEstimate;

  const result = {
    total: parseFloat(total.toFixed(2)),
    currency: 'GBP',
    shipping_speed,
    market,
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
        amount: parseFloat(customsDutyEstimate.toFixed(2)),
        vat_rate: '16%',
        duty_rate: '10%',
        declared_value,
        note: 'Estimate only – actual duty depends on product classification',
      },
    },
    notes: {
      delivery_time: shipping_speed === 'express' ? '5-7 business days' : '10-14 business days',
      warehouse: '31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB',
      disclaimer: 'This is an estimate. Final cost may vary based on actual weight, customs clearance, and other factors.',
    },
  };

  return result;
}
