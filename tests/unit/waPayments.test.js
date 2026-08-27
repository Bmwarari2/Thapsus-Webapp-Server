// The open-payment race: ensureManualPayment is check-then-insert, and
// migration 0014's uq_payments_open_wa_order turns a concurrent double
// insert into a 23505. The loser must settle for the winner's row, not
// throw — a customer double-sending "yes" is not an error.
import { describe, it, expect, vi } from 'vitest';
import { ensureManualPayment, extractMpesaReference } from '../../utils/waPayments.js';

describe('ensureManualPayment — concurrent-insert race', () => {
  it('returns the winning row when the unique index rejects a duplicate open payment', async () => {
    let selects = 0;
    const winner = { id: 'PAY-WINNER', status: 'awaiting_review', amount_due_kes: '14500' };
    const db = {
      query: vi.fn(async (sql) => {
        if (sql.trim().startsWith('SELECT')) {
          // First check finds nothing open; the re-check after the 23505
          // finds the row the concurrent caller inserted.
          selects += 1;
          return { rows: selects === 1 ? [] : [winner] };
        }
        const err = new Error('duplicate key value violates unique constraint "uq_payments_open_wa_order"');
        err.code = '23505';
        throw err;
      }),
    };
    const res = await ensureManualPayment(db, { orderId: 'o1', contactId: 'c1', amountKes: 14500 });
    expect(res.created).toBe(false);
    expect(res.payment).toEqual(winner);
  });

  it('still throws non-unique-violation insert errors', async () => {
    const db = {
      query: vi.fn(async (sql) => {
        if (sql.trim().startsWith('SELECT')) return { rows: [] };
        throw new Error('connection reset');
      }),
    };
    await expect(ensureManualPayment(db, { orderId: 'o1', contactId: 'c1', amountKes: 100 }))
      .rejects.toThrow('connection reset');
  });
});

describe('extractMpesaReference', () => {
  it('pulls the 10-char confirmation code out of a pasted SMS', () => {
    expect(extractMpesaReference('SHL9XK2QRT Confirmed. Ksh17,094 sent to Thapsus'))
      .toBe('SHL9XK2QRT');
  });
  it('ignores phone numbers and plain words', () => {
    expect(extractMpesaReference('call me on 0712345678 please')).toBeNull();
    expect(extractMpesaReference('nimelipa asante sana')).toBeNull();
  });
});
