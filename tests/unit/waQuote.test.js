import { describe, it, expect } from 'vitest';
import { deliveryFeeFor, effectiveFxRate, resolveMarkupPct } from '../../utils/waQuote.js';

// The 10% service fee is a SHEIN charge and nothing else pays it: UK is
// £9/kg + £3, Dubai is $9/kg, and SHEIN itself is 0 while the promotion
// runs. A single global markup added it to all three.
describe('resolveMarkupPct', () => {
  it('falls back to the settings default when nothing is asked for', () => {
    expect(resolveMarkupPct(undefined, 10)).toEqual({ markup: 10, error: null });
    expect(resolveMarkupPct(null, 10).markup).toBe(10);
    expect(resolveMarkupPct('', 10).markup).toBe(10);
  });

  it('honours an explicit 0 instead of falling back', () => {
    // The whole point. `requested || fallback` would return 10 here and
    // overcharge every UK, Dubai and promotional SHEIN order.
    expect(resolveMarkupPct(0, 10)).toEqual({ markup: 0, error: null });
    expect(resolveMarkupPct('0', 10).markup).toBe(0);
  });

  it('takes a per-order margin over the default', () => {
    expect(resolveMarkupPct(15, 10).markup).toBe(15);
    expect(resolveMarkupPct('7.5', 10).markup).toBe(7.5);
  });

  it('rejects anything outside 0–100', () => {
    for (const bad of [-1, 101, 'abc', NaN, Infinity]) {
      expect(resolveMarkupPct(bad, 10).error).toMatch(/between 0 and 100/);
    }
  });

  it('rejects a broken settings default rather than guessing', () => {
    expect(resolveMarkupPct(undefined, null).error).toMatch(/between 0 and 100/);
  });
});

// The last-mile fee is charged with the order now, not on arrival, and
// only when the customer wants it delivered.
describe('deliveryFeeFor', () => {
  it('charges the settings amount for a delivery', () => {
    expect(deliveryFeeFor('delivery', 300)).toEqual({ feeKes: 300, error: null });
    expect(deliveryFeeFor('delivery', '300').feeKes).toBe(300);
  });

  it('charges nothing for a collection', () => {
    // Even when the settings amount is nonsense — collection is free by
    // definition, so there is nothing to read.
    expect(deliveryFeeFor('collection', 300)).toEqual({ feeKes: 0, error: null });
    expect(deliveryFeeFor('collection', null)).toEqual({ feeKes: 0, error: null });
  });

  it('refuses a method it does not recognise', () => {
    for (const bad of [undefined, null, '', 'pickup', 'mtaani', 'DELIVERY']) {
      expect(deliveryFeeFor(bad, 300).error).toMatch(/delivery.*collection/);
    }
  });

  it('refuses an unusable settings amount rather than quoting a free delivery', () => {
    for (const bad of [null, '', undefined, 'abc', -1]) {
      expect(deliveryFeeFor('delivery', bad).error).toMatch(/not a usable amount/);
    }
  });

  it('rounds to whole shillings', () => {
    expect(deliveryFeeFor('delivery', 299.6).feeKes).toBe(300);
  });
});


// exchange_rates.USD_KES is a MID-market rate. The business collects KES
// and pays suppliers in GBP from the UK, and that round trip costs 3–4
// shillings on the cross — so quoting at mid gives the spread away. All
// 18 quotes to date also ran at markup_pct = 0, so nothing else absorbed
// it either.
describe('effectiveFxRate', () => {
  it('lifts the mid rate by the buffer', () => {
    expect(effectiveFxRate(129, 2.5)).toEqual({ rate: 132.23, bufferPct: 2.5, error: null });
    expect(effectiveFxRate(130, 4).rate).toBe(135.2);
  });

  it('honours a deliberate 0 — quote at mid, absorb the spread', () => {
    expect(effectiveFxRate(129, 0)).toEqual({ rate: 129, bufferPct: 0, error: null });
    expect(effectiveFxRate(129, '0').rate).toBe(129);
  });

  it('refuses an absent buffer rather than treating it as zero', () => {
    // Number(null) and Number('') are both 0, so a broken settings read
    // would look exactly like "quote at mid" and quietly hand the spread
    // back — on every order, with nothing said.
    for (const missing of [undefined, null, '']) {
      expect(effectiveFxRate(129, missing).error).toMatch(/not a usable percentage/);
    }
  });

  it('rejects a buffer outside 0–25', () => {
    for (const bad of [-0.5, 26, 'abc', NaN, Infinity]) {
      expect(effectiveFxRate(129, bad).error).toMatch(/between 0 and 25/);
    }
  });

  it('rejects an unusable rate', () => {
    for (const bad of [0, -1, null, undefined, '', 'abc', NaN]) {
      expect(effectiveFxRate(bad, 2.5).error).toMatch(/not a usable number/);
    }
  });

  it('rounds to the 2dp the quote message prints', () => {
    // The customer is shown "1 USD = X KES" to two decimals. Pricing at
    // full float precision and printing a rounded rate left a few
    // shillings on every quote that nobody could reconcile.
    const { rate } = effectiveFxRate(129.4567, 2.5);
    expect(rate).toBe(Number(rate.toFixed(2)));
    expect(rate).toBe(132.69);
  });

  it('is the same arithmetic the quote route runs', () => {
    // usd × buffered rate × (1 + margin%), the goods half of quote_kes.
    const { rate } = effectiveFxRate(129, 2.5);
    expect(Math.round(60 * rate * (1 + 0 / 100))).toBe(7934);
    expect(Math.round(60 * 129)).toBe(7740); // what mid would have billed
  });
});
