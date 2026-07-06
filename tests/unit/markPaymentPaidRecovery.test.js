import { describe, it, expect, vi, beforeEach } from 'vitest';

// markPaymentPaid fires real side-effects (receipt email, finance mirror,
// parcel auto-registration). Stub them so the suite stays offline and we can
// focus on the status-machine recovery behaviour — the fix for the M-Pesa
// "STK timed out but the customer still paid" race, where a genuine late
// success must be allowed to settle a row we'd already marked 'failed'.
vi.mock('../../utils/email.js', () => ({
  sendUnifiedPaymentReceiptEmail: vi.fn(async () => {}),
}));
vi.mock('../../utils/financeSync.js', () => ({
  recordPaymentIncome: vi.fn(async () => {}),
}));
vi.mock('../../utils/trackingNumber.js', () => ({
  insertWithUniqueTrackingNumber: vi.fn(async () => {}),
}));

import { markPaymentPaid } from '../../utils/markPaymentPaid.js';

const BASE_PAYMENT = {
  id: 'PAY-1783372063545-j2i66g',
  user_id: 'user-1',
  target_kind: 'buy_for_me',
  target_id: 'bfm-1',
  amount_gross_kes: 14980,
  amount_credit_kes: 0,
  amount_due_kes: 14980,
  method: 'mpesa',
  mpesa_reference: 'UG736AYEMT',
  paid_at: null,
};

/**
 * Build a fake pg pool whose connect() hands back a client whose query()
 * dispatches on the SQL text. Records every statement it sees so tests can
 * assert which transitions ran. The buy_for_me row reports an existing
 * parcel_id so the parcel auto-registration branch is a no-op.
 */
function makeDb(paymentRow) {
  const clientQueries = [];
  const dispatch = (sql) => {
    if (/SELECT \* FROM payments WHERE id/i.test(sql)) return { rows: [paymentRow] };
    if (/SELECT id, user_id, retailer_url, item_name, parcel_id/i.test(sql)) {
      return { rows: [{ id: 'bfm-1', user_id: 'user-1', parcel_id: 'already-linked' }] };
    }
    return { rows: [], rowCount: 1 };
  };
  const client = {
    query: vi.fn(async (sql) => { clientQueries.push(sql); return dispatch(sql); }),
    release: vi.fn(),
  };
  const db = {
    connect: vi.fn(async () => client),
    // Pool-level query used by the post-paid receipt hook.
    query: vi.fn(async (sql) => {
      if (/SELECT email, name FROM users/i.test(sql)) return { rows: [{ email: 'c@example.com', name: 'Cust' }] };
      if (/SELECT item_name FROM buy_for_me_orders/i.test(sql)) return { rows: [{ item_name: 'Clothes' }] };
      return { rows: [] };
    }),
  };
  return { db, client, clientQueries };
}

const paidUpdate = (qs) => qs.some((s) => /UPDATE\s+payments\s+SET status = 'paid'/i.test(s));
const targetFlip = (qs) => qs.some((s) => /UPDATE buy_for_me_orders/i.test(s));

beforeEach(() => { vi.clearAllMocks(); });

describe('markPaymentPaid — late-success recovery from failed', () => {
  it("recovers a 'failed' payment to 'paid' (STK timeout that settled anyway)", async () => {
    const { db, clientQueries } = makeDb({ ...BASE_PAYMENT, status: 'failed' });

    const result = await markPaymentPaid(db, BASE_PAYMENT.id);

    expect(result.ok).toBe(true);
    expect(result.recovered).toBe(true);
    expect(result.alreadyPaid).toBe(false);
    expect(paidUpdate(clientQueries)).toBe(true);   // row flipped to paid
    expect(targetFlip(clientQueries)).toBe(true);    // BFM order flipped
    expect(clientQueries.some((s) => /COMMIT/i.test(s))).toBe(true);
  });

  it("still settles a normal 'pending' payment without the recovered flag", async () => {
    const { db, clientQueries } = makeDb({ ...BASE_PAYMENT, status: 'pending' });

    const result = await markPaymentPaid(db, BASE_PAYMENT.id);

    expect(result.ok).toBe(true);
    expect(result.recovered).toBe(false);
    expect(paidUpdate(clientQueries)).toBe(true);
  });

  it("is idempotent on an already-'paid' row", async () => {
    const { db, clientQueries } = makeDb({ ...BASE_PAYMENT, status: 'paid' });

    const result = await markPaymentPaid(db, BASE_PAYMENT.id);

    expect(result).toMatchObject({ ok: true, alreadyPaid: true });
    expect(paidUpdate(clientQueries)).toBe(false); // no re-flip
  });

  it("refuses to recover a 'cancelled' row (superseded by a retry — double-settle risk)", async () => {
    const { db, clientQueries } = makeDb({ ...BASE_PAYMENT, status: 'cancelled' });

    const result = await markPaymentPaid(db, BASE_PAYMENT.id);

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/cancelled/);
    expect(paidUpdate(clientQueries)).toBe(false);
    expect(targetFlip(clientQueries)).toBe(false);
  });

  it("refuses to recover a 'rejected' row (explicit admin decision)", async () => {
    const { db, clientQueries } = makeDb({ ...BASE_PAYMENT, status: 'rejected' });

    const result = await markPaymentPaid(db, BASE_PAYMENT.id);

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/rejected/);
    expect(paidUpdate(clientQueries)).toBe(false);
  });
});
