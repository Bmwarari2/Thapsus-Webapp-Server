import { describe, it, expect } from 'vitest';
import { resolveMarkupPct } from '../../utils/waQuote.js';

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
