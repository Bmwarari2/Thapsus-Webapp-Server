// utils/waSettings.js
//
// Typed reader for the wa_settings key/value table (migration 0004).
// 30s in-process cache — same tradeoff as utils/pricing.js's settings
// cache: operators change these rarely, quoting reads them constantly.

import { getOrCompute, cacheInvalidate } from './cache.js';

const CACHE_KEY = 'wa_settings_v1';
const TTL_MS = 30_000;

const DEFAULTS = {
  markup_pct: 10,
  promo_active: false,
  promo_type: 'waive_fee',       // 'waive_fee' | 'discount'
  promo_message: '',
  default_delivery_fee_kes: 300,
  welcome_media_urls: [],
  // Optional map of logical message keys → approved sent.dm template names.
  // Empty until WhatsApp templates are registered/approved; senders fall
  // back to free-form text (fine inside the 24h service window).
  template_map: {},
};

function parseJsonOr(fallback, raw) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

/** @returns {Promise<typeof DEFAULTS>} merged settings (DB over defaults) */
export async function getWaSettings(db) {
  return getOrCompute(CACHE_KEY, TTL_MS, async () => {
    const { rows } = await db.query(`SELECT key, value FROM wa_settings`);
    const kv = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      markup_pct: Number.isFinite(Number(kv.markup_pct)) ? Number(kv.markup_pct) : DEFAULTS.markup_pct,
      promo_active: kv.promo_active === 'true',
      promo_type: kv.promo_type === 'discount' ? 'discount' : 'waive_fee',
      promo_message: kv.promo_message ?? '',
      default_delivery_fee_kes: Number.isFinite(Number(kv.default_delivery_fee_kes))
        ? Number(kv.default_delivery_fee_kes) : DEFAULTS.default_delivery_fee_kes,
      welcome_media_urls: Array.isArray(parseJsonOr(null, kv.welcome_media_urls))
        ? parseJsonOr([], kv.welcome_media_urls) : [],
      template_map: (typeof parseJsonOr(null, kv.template_map) === 'object'
        && parseJsonOr(null, kv.template_map) !== null)
        ? parseJsonOr({}, kv.template_map) : {},
    };
  });
}

export function invalidateWaSettings() {
  cacheInvalidate(CACHE_KEY);
}

export const WA_SETTING_KEYS = Object.keys(DEFAULTS);
