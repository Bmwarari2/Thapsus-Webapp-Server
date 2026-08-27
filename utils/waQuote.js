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

/**
 * Switching an order between delivery and collection, as pure arithmetic.
 *
 * Customers change their minds — "actually I'll pick it up", "please
 * bring it after all" — and before this existed the method was fixed at
 * quote time, so every later message fired on the wrong branch: a
 * collector was promised a rider, a delivery customer was sent to
 * Stanbank House. The route (PATCH /wa/orders/:id/delivery-method) does
 * the I/O; this function decides what changes, so the money rules live
 * in one testable place.
 *
 * Money rules:
 *   * Before payment (quoting/quoted/confirmed) the fee moves in and out
 *     of the quote: → collection removes it from quote_kes, → delivery
 *     adds the current default. Any open awaiting_review payment must be
 *     re-amounted by the caller (`updates.quote_kes` says so).
 *   * After payment the agreed total is history and never mutated:
 *     → delivery means a fee is now owed on arrival
 *       (delivery_fee_in_quote=false + the default amount, which is what
 *       the arrival branch reads);
 *     → collection means nothing more is due — fee columns are left as
 *       the record of what was paid, and `refundFeeKes` names the fee
 *       the customer paid for a delivery they no longer want, for the
 *       audit note and the team to settle.
 *   * dispatched/delivered/collected/cancelled are too late to switch.
 *
 * @param {object} order  wa_orders row (status + money columns)
 * @param {'delivery'|'collection'} method  target
 * @param {unknown} defaultFeeKes  wa_settings.default_delivery_fee_kes
 * @returns {{ error: string|null, updates: object, refundFeeKes: number,
 *             feeOwedOnArrivalKes: number, prePayment: boolean }}
 */
export function switchDeliveryMethod(order, method, defaultFeeKes) {
  const fail = (error) => ({ error, updates: {}, refundFeeKes: 0, feeOwedOnArrivalKes: 0, prePayment: false });
  if (method !== 'delivery' && method !== 'collection') {
    return fail("delivery_method must be 'delivery' or 'collection'");
  }
  if ((order.delivery_method || 'delivery') === method) {
    return fail(`Order is already set for ${method}`);
  }
  if (['dispatched', 'delivered', 'collected', 'cancelled'].includes(order.status)) {
    return fail(`Too late to switch an order in status '${order.status}'`);
  }

  const prePayment = ['quoting', 'quoted', 'confirmed'].includes(order.status);
  const updates = { delivery_method: method };
  // pickup_point is a Pickup Mtaani agent — a delivery destination. A
  // collector goes to the CBD office; a stale point would put the wrong
  // place in the dispatch message if they ever switch back.
  if (method === 'collection') updates.pickup_point = null;

  let refundFeeKes = 0;
  let feeOwedOnArrivalKes = 0;

  const quotedFee = order.delivery_fee_in_quote ? Math.max(0, Number(order.delivery_fee_kes || 0)) : 0;
  const { feeKes: defaultFee, error: feeError } = deliveryFeeFor('delivery', defaultFeeKes);

  if (prePayment && order.quote_kes != null) {
    if (method === 'collection') {
      updates.quote_kes = Number(order.quote_kes) - quotedFee;
      updates.delivery_fee_kes = 0;
      updates.delivery_fee_in_quote = true; // "the (zero) fee is in the quote"
    } else {
      if (feeError) return fail(feeError);
      updates.quote_kes = Number(order.quote_kes) - quotedFee + defaultFee;
      updates.delivery_fee_kes = defaultFee;
      updates.delivery_fee_in_quote = true;
    }
    if (!(updates.quote_kes > 0)) return fail('Switching would leave the quote at zero — re-quote instead');
  } else if (!prePayment) {
    if (method === 'delivery') {
      // Nothing was paid for delivery; the fee is owed on arrival unless
      // it was already settled or waived somehow.
      if (!order.delivery_fee_paid_at && !order.delivery_fee_waived) {
        if (feeError) return fail(feeError);
        updates.delivery_fee_kes = defaultFee;
        updates.delivery_fee_in_quote = false;
        feeOwedOnArrivalKes = defaultFee;
      }
    } else if (quotedFee > 0 && !order.delivery_fee_waived) {
      // They paid for a delivery they no longer want.
      refundFeeKes = quotedFee;
    }
  }

  return { error: null, updates, refundFeeKes, feeOwedOnArrivalKes, prePayment };
}
