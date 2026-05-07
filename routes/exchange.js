import express from 'express';
import { getGbpToKesRate, FxRateUnavailableError } from '../utils/fx.js';
import { getOrCompute } from '../utils/cache.js';

const router = express.Router();

const DEFAULT_RATES = { USD_KES: 130.5, GBP_KES: 164.2, EUR_KES: 142.8, CNY_KES: 18.2 };

const EXCHANGE_RATES_CACHE_KEY = 'exchange:display_rates';
const EXCHANGE_RATES_CACHE_TTL_MS = 60 * 1000; // 60 seconds

async function getExchangeRates(db) {
  // Display rates are read on every /rates and /convert call. The
  // underlying `exchange_rates` table is updated by admin
  // (PUT /api/admin/exchange-rates), which calls cacheInvalidate
  // on the same key — so the TTL is just the safety net for cases
  // where the cache miss happens between writes.
  return getOrCompute(EXCHANGE_RATES_CACHE_KEY, EXCHANGE_RATES_CACHE_TTL_MS, async () => {
    let baseRates = { ...DEFAULT_RATES };
    let source = 'Thapsus Cargo Default Rates';
    let lastUpdated = null;
    try {
      const rows = await db.query('SELECT currency_pair, rate, updated_at FROM exchange_rates');
      if (rows.rows.length > 0) {
        rows.rows.forEach(r => {
          baseRates[r.currency_pair] = parseFloat(r.rate);
          if (!lastUpdated || r.updated_at > lastUpdated) lastUpdated = r.updated_at;
        });
        source = 'Thapsus Cargo Admin Rates';
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
  });
}

// Exported so admin write paths can bust the cache on update.
export const EXCHANGE_RATES_CACHE_KEY_EXPORT = EXCHANGE_RATES_CACHE_KEY;

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

/**
 * GET /api/exchange/health — payments-side FX health (audit P1.3).
 *
 * Surfaces whether the GBP→KES rate is configured and how stale the
 * stored rate is. Designed for an admin dashboard / KPI tile / cron
 * monitor — not for public consumption. Returns 200 when healthy, 503
 * when missing so a probe can alert.
 *
 *   200  { healthy: true,  gbp_kes_rate, updated_at, age_hours }
 *   503  { healthy: false, error, message }
 *
 * Distinct from `/rates` which returns the *display* rates with
 * fallbacks; this one tells you whether `POST /api/payments` will
 * actually succeed right now.
 */
router.get('/health', async (req, res) => {
  try {
    const { rate, updatedAt } = await getGbpToKesRate(req.db);
    const ageHours = updatedAt
      ? (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60)
      : null;
    res.json({
      success: true,
      healthy: true,
      gbp_kes_rate: rate,
      updated_at: updatedAt,
      age_hours: ageHours != null ? Math.round(ageHours * 10) / 10 : null,
    });
  } catch (e) {
    if (e instanceof FxRateUnavailableError) {
      return res.status(503).json({
        success: false,
        healthy: false,
        error: e.code,
        message: e.message,
      });
    }
    console.error('GET /exchange/health error:', e);
    res.status(500).json({ success: false, healthy: false, message: 'Failed to read FX health' });
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
