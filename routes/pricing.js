import express from 'express';

const router = express.Router();

/**
 * POST /api/pricing/calculate
 * Calculate shipping cost with detailed breakdown
 */
router.post('/calculate', (req, res) => {
  try {
    const {
      weight_kg = 0,
      dimensions,
      market,
      shipping_speed = 'economy',
      insurance = false,
      declared_value = 0
    } = req.body;

    // Validation
    if (!market || !['UK', 'USA', 'China'].includes(market)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid market. Must be UK, USA, or China'
      });
    }

    if (!['economy', 'express'].includes(shipping_speed)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid shipping_speed. Must be economy or express'
      });
    }

    const breakdown = calculateShippingCost({
      weight_kg,
      dimensions,
      market,
      shipping_speed,
      insurance,
      declared_value
    });

    res.json({
      success: true,
      pricing: breakdown
    });
  } catch (error) {
    console.error('Calculate pricing error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate pricing'
    });
  }
});

/**
 * Calculate shipping cost with full breakdown
 * @param {Object} options - Pricing options
 * @returns {Object} Cost breakdown
 */
export function calculateShippingCost(options) {
  const {
    weight_kg = 0,
    dimensions = {},
    market = 'UK',
    shipping_speed = 'economy',
    insurance = false,
    declared_value = 0
  } = options;

  // Base rates per kg (in KES equivalent of USD rates converted at ~130 KES/USD)
  const baseRates = {
    'UK': 8 * 130,      // $8 = ~1040 KES
    'USA': 10 * 130,    // $10 = ~1300 KES
    'China': 6 * 130    // $6 = ~780 KES
  };

  const baseRate = baseRates[market] || baseRates['UK'];

  // Calculate dimensional weight (volumetric weight)
  let dimensionalWeight = 0;
  if (dimensions && dimensions.length && dimensions.width && dimensions.height) {
    // Volumetric weight = (L x W x H) / 5000
    dimensionalWeight = (dimensions.length * dimensions.width * dimensions.height) / 5000;
  }

  // Use whichever is greater: actual weight or dimensional weight
  const chargeableWeight = Math.max(weight_kg, dimensionalWeight);

  // Calculate base shipping cost
  let shippingCost = chargeableWeight * baseRate;

  // Apply speed multiplier
  const speedMultiplier = shipping_speed === 'express' ? 1.5 : 1.0;
  shippingCost *= speedMultiplier;

  // Calculate insurance (3% of declared value)
  let insuranceCost = 0;
  if (insurance && declared_value > 0) {
    insuranceCost = declared_value * 0.03;
  }

  // Calculate customs duty estimate (16% VAT + applicable duty)
  let customsDutyEstimate = 0;
  if (declared_value > 0) {
    // Estimated VAT at 16% of declared value
    customsDutyEstimate = declared_value * 0.16;

    // Add base duty rate (varies by product type, using 10% as average)
    customsDutyEstimate += declared_value * 0.10;
  }

  // Calculate handling and processing fee
  const handlingFee = Math.max(500, chargeableWeight * 100); // Min 500 KES or 100 KES per kg

  // Total cost
  const total = shippingCost + insuranceCost + handlingFee + customsDutyEstimate;

  return {
    summary: {
      total: parseFloat(total.toFixed(2)),
      currency: 'KES',
      shipping_speed: shipping_speed,
      market: market
    },
    breakdown: {
      base_shipping: {
        amount: parseFloat(shippingCost.toFixed(2)),
        description: `Base shipping cost (${chargeableWeight.toFixed(2)} kg @ ${(baseRate / 130).toFixed(2)} USD/kg ${shipping_speed})`
      },
      dimensional_weight: {
        actual_weight_kg: weight_kg,
        dimensional_weight_kg: parseFloat(dimensionalWeight.toFixed(2)),
        chargeable_weight_kg: parseFloat(chargeableWeight.toFixed(2)),
        calculation: dimensions ? `(${dimensions.length}x${dimensions.width}x${dimensions.height})/5000` : 'N/A'
      },
      insurance: {
        amount: parseFloat(insuranceCost.toFixed(2)),
        rate: '3% of declared value',
        declared_value: declared_value,
        included: insurance
      },
      handling_fee: {
        amount: parseFloat(handlingFee.toFixed(2)),
        description: 'Handling and processing fee'
      },
      customs_estimate: {
        amount: parseFloat(customsDutyEstimate.toFixed(2)),
        vat_rate: '16%',
        duty_rate: '10%',
        declared_value: declared_value,
        note: 'Estimate only - actual duty depends on product classification'
      }
    },
    notes: {
      delivery_time: shipping_speed === 'express' ? '5-7 business days' : '10-14 business days',
      warehouse: '31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB',
      disclaimer: 'This is an estimate. Final cost may vary based on actual weight, customs clearance, and other factors.'
    }
  };
}

export default router;
