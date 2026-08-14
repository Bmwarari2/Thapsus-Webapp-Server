import { describe, it, expect } from 'vitest';
import { TEMPLATE_SLOTS, toPositionalParams, requiredFields } from '../../utils/waTemplateVars.js';

// These mappings decide which of our values lands in which approved
// template slot. Getting one wrong puts a customer's name where the money
// should be and the message still sends, so the order is pinned here
// against the approved body text.
describe('approved template slots', () => {
  it('fills quote_ready in body order', () => {
    expect(toPositionalParams('quote', {
      full_name: 'Martha', order_ref: 'TRK-8823', total_kes: '6,486',
    })).toEqual({ var_1: 'Martha', var_2: 'TRK-8823', var_3: '6,486' });
  });

  it('fills payment_received: name, then AMOUNT, then order', () => {
    // Note the order — amount is var_2 here but var_3 in quote_ready.
    expect(toPositionalParams('payment_received', {
      full_name: 'Martha', total_kes: '6,486', order_ref: 'TRK-8823',
    })).toEqual({ var_1: 'Martha', var_2: '6,486', var_3: 'TRK-8823' });
  });

  it('fills delivered: ORDER first, then name', () => {
    // "Order {{1}} has been delivered ... with us, {{2}}" — reversed
    // relative to every other template.
    expect(toPositionalParams('delivered', {
      order_ref: 'TRK-8823', full_name: 'Martha',
    })).toEqual({ var_1: 'TRK-8823', var_2: 'Martha' });
  });

  it('fills order_purchased', () => {
    expect(toPositionalParams('purchased', { full_name: 'Martha', order_ref: 'TRK-8823' }))
      .toEqual({ var_1: 'Martha', var_2: 'TRK-8823' });
  });

  it('fills the arrival templates from the tracking code', () => {
    expect(toPositionalParams('arrived_waived', { tracking_code: 'TRK-8829' }))
      .toEqual({ var_1: 'TRK-8829' });
    expect(toPositionalParams('dispatched', { tracking_code: 'TRK-8829' }))
      .toEqual({ var_1: 'TRK-8829' });
  });

  it('puts the fee after the code, not before it', () => {
    expect(toPositionalParams('arrived_fee', { tracking_code: 'TRK-8829', fee_kes: '300' }))
      .toEqual({ var_1: 'TRK-8829', var_2: '300' });
  });

  it('gives the receipt template the bare token, not a URL', () => {
    // The approved body writes "…ready at thapsus.uk/r/{{2}}" itself,
    // because Meta will not approve a body that ends in a variable.
    // Passing the full URL here would render thapsus.uk/r/https://…
    const out = toPositionalParams('receipt', {
      tracking_code: 'TRK-8829', receipt_token: 'TRK-8829.vtDo2gQ',
    });
    expect(out).toEqual({ var_1: 'TRK-8829', var_2: 'TRK-8829.vtDo2gQ' });
    expect(out.var_2).not.toMatch(/^https?:\/\//);
  });

  it('never leaves a slot blank — WhatsApp rejects the send', () => {
    const out = toPositionalParams('quote', {});
    expect(Object.values(out).every((v) => v && v.length)).toBe(true);
    expect(out).toEqual({ var_1: 'there', var_2: 'your order', var_3: '0' });
  });

  it('numbers every slot the body declares, with no gaps', () => {
    for (const [key, slot] of Object.entries(TEMPLATE_SLOTS)) {
      const declared = [...slot.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      expect(declared, `${key} body`).toEqual(slot.vars.map((_, i) => i + 1));
      const filled = Object.keys(toPositionalParams(key, {}));
      expect(filled, `${key} params`).toEqual(slot.vars.map((_, i) => `var_${i + 1}`));
    }
  });

  it('passes unmapped keys straight through', () => {
    expect(toPositionalParams('welcome', { anything: 'x' })).toEqual({ anything: 'x' });
    expect(requiredFields('welcome')).toEqual([]);
  });
});
