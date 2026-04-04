import express from 'express';

const router = express.Router();

const DEFAULT_RATES = { USD_KES: 130.5, GBP_KES: 164.2, EUR_KES: 142.8, CNY_KES: 18.2 };

async function getExchangeRates(db) {
  let baseRates = { ...DEFAULT_RATES };
  let source = 'SwiftCargo Default Rates';
  let lastUpdated = null;
  try {
    const rows = await db.query('SELECT currency_pair, rate, updated_at FROM exchange_rates');
    if (rows.rows.length > 0) {
      rows.rows.forEach(r => {
        baseRates[r.currency_pair] = parseFloat(r.rate);
        if (!lastUpdated || r.updated_at > lastUpdated) lastUpdated = r.updated_at;
      });
      source = 'SwiftCargo Admin Rates';
    }
  } catch { /* table might not exist yet */ }

  return {
    rates: {
      USD_KES: baseRates.USD_KES, GBP_KES: baseRates.GBP_KES,
      EUR_KES: baseRates.EUR_KES, CNY_KES: baseRates.CNY_KES,
      KES_USD: 1 / baseRates.USD_KES, KES_GBP: 1 / baseRates.GBP_KES,
      KES_EUR: 1 / baseRates.EUR_KES, KES_CNY: 1 / baseRates.CNY_KES,
    },
    source,
    lastUpdated
  };
}

/** GET /api/exchange/rates */
router.get('/rates', async (req, res) => {
  try {
    const { rates, source, lastUpdated } = await getExchangeRates(req.db);
    res.json({
      success: true, message: 'Exchange rates retrieved',
      data: {
        USD_KES: parseFloat(rates.USD_KES.toFixed(2)), GBP_KES: parseFloat(rates.GBP_KES.toFixed(2)),
        EUR_KES: parseFloat(rates.EUR_KES.toFixed(2)), CNY_KES: parseFloat(rates.CNY_KES.toFixed(2)),
        source, timestamp: new Date().toISOString(),
        last_updated: lastUpdated || new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })
      }
    });
  } catch (error) {
    console.error('Get rates error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch exchange rates' });
  }
});

/** POST /api/exchange/convert */
router.post('/convert', async (req, res) => {
  try {
    const { amount, from_currency, to_currency } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });
    if (!from_currency || !to_currency) return res.status(400).json({ success: false, message: 'from_currency and to_currency are required' });
    const validCurrencies = ['USD','GBP','EUR','KES','CNY'];
    if (!validCurrencies.includes(from_currency) || !validCurrencies.includes(to_currency))
      return res.status(400).json({ success: false, message: `Valid currencies are: ${validCurrencies.join(', ')}` });

    const { rates } = await getExchangeRates(req.db);
    let rate = 1;
    const pairKey = `${from_currency}_${to_currency}`;
    if (from_currency === to_currency) rate = 1;
    else if (rates[pairKey] !== undefined) rate = rates[pairKey];
    else {
      const fromToKES = rates[`${from_currency}_KES`];
      const kesToTarget = rates[`KES_${to_currency}`];
      if (fromToKES !== undefined && kesToTarget !== undefined) rate = fromToKES * kesToTarget;
      else return res.status(400).json({ success: false, message: 'Conversion not supported' });
    }

    res.json({
      success: true,
      conversion: { amount, from_currency, to_currency, rate: parseFloat(rate.toFixed(6)),
        converted_amount: parseFloat((amount * rate).toFixed(2)), timestamp: new Date().toISOString() }
    });
  } catch (error) {
    console.error('Convert error:', error);
    res.status(500).json({ success: false, message: 'Currency conversion failed' });
  }
});

export default router;
