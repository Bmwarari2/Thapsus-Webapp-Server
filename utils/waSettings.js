// utils/waSettings.js
//
// Typed reader for the wa_settings key/value table (migration 0004).
// 30s in-process cache — same tradeoff as utils/pricing.js's settings
// cache: operators change these rarely, quoting reads them constantly.

import { getOrCompute, cacheInvalidate } from './cache.js';

const CACHE_KEY = 'wa_settings_v1';
const TTL_MS = 30_000;

export const DEFAULTS = {
  markup_pct: 10,
  promo_active: false,
  promo_type: 'waive_fee',       // 'waive_fee' | 'discount'
  promo_message: '',
  default_delivery_fee_kes: 300,
  welcome_media_urls: [],
  // Optional map of logical message keys → approved sent.dm template names.
  // The templates approved in the sent.dm console, keyed by our logical
  // slot. These are defaults, not lore: each name was confirmed against
  // the approved body character-for-character (see the check in
  // tests/unit/waTemplateVars.test.js), so a fresh install sends real
  // templates instead of free text that dies outside the 24h window.
  //
  // A stored map is merged OVER these per key, not swapped in for them.
  // Production held a four-key map written before most templates were
  // approved, and a wholesale replace meant the other seven silently
  // resolved to nothing — every one of those sends went out as free
  // text and was refused outside the 24-hour window. Eunice Ngasura's
  // arrival notice failed that way ten days after she last wrote in.
  //
  // The asymmetry decides it: an unwanted template still delivers a
  // message, while a missing key delivers nothing and says nothing. To
  // deliberately turn one off, map it to an empty string.
  //
  // Two slots are deliberately absent because no approved template
  // exists yet: arrived_paid and arrived_collect. They fall back to free
  // text, which reaches nobody at arrival — add them here once approved.
  template_map: {
    quote: 'Quote_Ready',
    payment_prompt: 'Payment_Reminder',
    payment_received: 'Payment_Received',
    receipt: 'Receipt',
    purchased: 'Order_Purchased',
    arrived_fee: 'Arrived_Fee',
    arrived_waived: 'Arrived_Waived',
    // The console holds two identical dispatch templates. This is the
    // UTILITY one; the MARKETING twin ('Dispatched') can be refused for
    // anyone who has opted out of marketing messages.
    dispatched: 'Dispatched__Out_For_Delivery',
    delivered: 'Delivered',
  },
  // Gemini assistant (utils/waAi.js): answers general questions from the
  // knowledge base and interprets onboarding replies. Requires
  // GEMINI_API_KEY on the server; this flag is the operator kill-switch.
  ai_enabled: false,
  ai_knowledge_base: '',
  // Minutes of silence after a human takes over before the assistant
  // starts answering that conversation again.
  ai_resume_after_minutes: 120,
  // Staff WhatsApp alerts: numbers that receive the approved
  // "staff_alert" template when something needs a human (new customer,
  // customer confirmed a quote, customer says they paid, AI handed off).
  // Empty list = alerts off.
  staff_alert_numbers: [],
  staff_alert_template: 'Staff_Alert',
};

function parseJsonOr(fallback, raw) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

/**
 * Stored overrides layered over the approved defaults, key by key.
 * An empty-string value means "no template for this one, send free
 * text" — the only way to switch one off deliberately.
 */
function mergeTemplateMap(stored) {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return DEFAULTS.template_map;
  }
  const merged = { ...DEFAULTS.template_map };
  for (const [key, name] of Object.entries(stored)) {
    if (typeof name !== 'string') continue;
    if (name.trim() === '') delete merged[key];
    else merged[key] = name.trim();
  }
  return merged;
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
      template_map: mergeTemplateMap(parseJsonOr(null, kv.template_map)),
      ai_enabled: kv.ai_enabled === 'true',
      ai_knowledge_base: kv.ai_knowledge_base ?? '',
      ai_resume_after_minutes: Number.isFinite(Number(kv.ai_resume_after_minutes))
        ? Number(kv.ai_resume_after_minutes) : DEFAULTS.ai_resume_after_minutes,
      staff_alert_numbers: Array.isArray(parseJsonOr(null, kv.staff_alert_numbers))
        ? parseJsonOr([], kv.staff_alert_numbers) : [],
      staff_alert_template: kv.staff_alert_template || DEFAULTS.staff_alert_template,
    };
  });
}

export function invalidateWaSettings() {
  cacheInvalidate(CACHE_KEY);
}

export const WA_SETTING_KEYS = Object.keys(DEFAULTS);
