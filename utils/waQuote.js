// utils/waQuote.js
//
// The margin on a WhatsApp quote.
//
// There was one global markup_pct in wa_settings, applied to every quote.
// That was only ever right for SHEIN at full price. The rate card has
// three lanes and two of them carry no percentage at all:
//
//   * SHEIN         — 10% service fee, covering taxes and clearance.
//                     Waived entirely while the SHEIN promotion runs.
//   * UK stores     — £9/kg plus a £3 handling fee.
//   * Dubai         — $9/kg.
//
// Weight-based lanes are priced by the operator, who types the resulting
// figure in. Adding a global 10% on top of that overcharged every UK and
// Dubai customer by 10% of their whole order, silently, with the quote
// message printing "Service margin: 10%" as if it were meant.
//
// So the margin is per-order, and the settings value is only a default.

/**
 * @param {unknown} requested   markup_pct from the request body, if any
 * @param {unknown} fallback    wa_settings.markup_pct
 * @returns {{ markup: number, error: string|null }}
 */
export function resolveMarkupPct(requested, fallback) {
  // An explicit 0 is the normal case for UK and Dubai orders, and for
  // SHEIN during the promotion — so this tests for "absent", not for
  // "falsy". `requested || fallback` would put the 10% back on exactly
  // the orders that must not carry it.
  const absent = requested === undefined || requested === null || requested === '';
  const raw = absent ? fallback : requested;
  // Number(null) and Number('') are both 0, so a settings row with no
  // markup would quote at 0% and undercharge without saying a word.
  // Nothing here may become a number by accident.
  if (raw === undefined || raw === null || raw === '') {
    return { markup: NaN, error: 'markup_pct must be between 0 and 100' };
  }
  const markup = Number(raw);
  if (!Number.isFinite(markup) || markup < 0 || markup > 100) {
    return { markup: NaN, error: 'markup_pct must be between 0 and 100' };
  }
  return { markup, error: null };
}

/**
 * The last-mile fee for an order, charged with the quote rather than on
 * arrival.
 *
 * Collection costs the customer nothing — they come to the CBD office —
 * so the fee is purely a function of which they chose. The amount is the
 * operator-set default from wa_settings rather than a constant here, so
 * it can be changed without a deploy.
 *
 * @param {'delivery'|'collection'|null|undefined} method
 * @param {unknown} defaultFeeKes  wa_settings.default_delivery_fee_kes
 * @returns {{ feeKes: number, error: string|null }}
 */
export function deliveryFeeFor(method, defaultFeeKes) {
  if (method !== 'delivery' && method !== 'collection') {
    return { feeKes: NaN, error: "delivery_method must be 'delivery' or 'collection'" };
  }
  if (method === 'collection') return { feeKes: 0, error: null };

  // Number(null) and Number('') are both 0, so an unset setting would
  // quote a free delivery and nobody would notice until the month's
  // takings came up short. Nothing may become a number by accident.
  if (defaultFeeKes === undefined || defaultFeeKes === null || defaultFeeKes === '') {
    return { feeKes: NaN, error: 'default_delivery_fee_kes is not a usable amount' };
  }
  const fee = Number(defaultFeeKes);
  if (!Number.isFinite(fee) || fee < 0) {
    return { feeKes: NaN, error: 'default_delivery_fee_kes is not a usable amount' };
  }
  return { feeKes: Math.round(fee), error: null };
}
