// Switching an order between delivery and collection
// (utils/waQuote.switchDeliveryMethod): the messages follow
// delivery_method automatically, so what this pins is the MONEY — the
// fee moves in and out of the quote before payment, and becomes owed /
// refundable (never silently mutated) after.
import { describe, it, expect } from 'vitest';
import { switchDeliveryMethod } from '../../utils/waQuote.js';

const DEFAULT_FEE = 300;

function order(over = {}) {
  return {
    status: 'quoted', delivery_method: 'delivery',
    quote_kes: 5300, delivery_fee_kes: 300, delivery_fee_in_quote: true,
    delivery_fee_paid_at: null, delivery_fee_waived: false, pickup_point: null,
    ...over,
  };
}

describe('before payment — the fee moves in and out of the quote', () => {
  it('delivery → collection removes the fee from the total', () => {
    const r = switchDeliveryMethod(order(), 'collection', DEFAULT_FEE);
    expect(r.error).toBeNull();
    expect(r.updates.quote_kes).toBe(5000);
    expect(r.updates.delivery_fee_kes).toBe(0);
    expect(r.updates.delivery_method).toBe('collection');
    expect(r.updates.pickup_point).toBeNull();
    expect(r.prePayment).toBe(true);
  });

  it('collection → delivery adds the current default fee', () => {
    const r = switchDeliveryMethod(
      order({ delivery_method: 'collection', quote_kes: 5000, delivery_fee_kes: 0 }),
      'delivery', DEFAULT_FEE
    );
    expect(r.error).toBeNull();
    expect(r.updates.quote_kes).toBe(5300);
    expect(r.updates.delivery_fee_kes).toBe(300);
    expect(r.updates.delivery_fee_in_quote).toBe(true);
  });

  it('pre-quote (status quoting, no total yet) just flips the method', () => {
    const r = switchDeliveryMethod(
      order({ status: 'quoting', quote_kes: null, delivery_fee_kes: null, delivery_fee_in_quote: false }),
      'collection', DEFAULT_FEE
    );
    expect(r.error).toBeNull();
    expect(r.updates).toEqual({ delivery_method: 'collection', pickup_point: null });
  });
});

describe('after payment — the agreed total is history', () => {
  it('delivery → collection names the paid fee for the team to settle, touches no totals', () => {
    const r = switchDeliveryMethod(order({ status: 'purchased' }), 'collection', DEFAULT_FEE);
    expect(r.error).toBeNull();
    expect(r.updates.quote_kes).toBeUndefined();
    expect(r.updates.delivery_fee_kes).toBeUndefined();
    expect(r.refundFeeKes).toBe(300);
    expect(r.prePayment).toBe(false);
  });

  it('collection → delivery makes the fee due on arrival', () => {
    const r = switchDeliveryMethod(
      order({ status: 'paid', delivery_method: 'collection', delivery_fee_kes: 0 }),
      'delivery', DEFAULT_FEE
    );
    expect(r.error).toBeNull();
    // delivery_fee_in_quote=false + the amount is exactly what the
    // arrival branch reads to route into delivery_fee_pending.
    expect(r.updates.delivery_fee_in_quote).toBe(false);
    expect(r.updates.delivery_fee_kes).toBe(300);
    expect(r.feeOwedOnArrivalKes).toBe(300);
  });

  it('no refund is owed when the fee was waived', () => {
    const r = switchDeliveryMethod(
      order({ status: 'in_kenya', delivery_fee_waived: true }),
      'collection', DEFAULT_FEE
    );
    expect(r.error).toBeNull();
    expect(r.refundFeeKes).toBe(0);
  });
});

describe('refusals', () => {
  it.each(['dispatched', 'delivered', 'collected', 'cancelled'])(
    'is too late in status %s', (status) => {
      expect(switchDeliveryMethod(order({ status }), 'collection', DEFAULT_FEE).error)
        .toMatch(/too late/i);
    });

  it('rejects a no-op switch and an unknown method', () => {
    expect(switchDeliveryMethod(order(), 'delivery', DEFAULT_FEE).error).toMatch(/already/i);
    expect(switchDeliveryMethod(order(), 'boda', DEFAULT_FEE).error).toMatch(/must be/i);
  });

  it('refuses to leave a fee-only quote at zero', () => {
    const r = switchDeliveryMethod(order({ quote_kes: 300 }), 'collection', DEFAULT_FEE);
    expect(r.error).toMatch(/zero/i);
  });
});
