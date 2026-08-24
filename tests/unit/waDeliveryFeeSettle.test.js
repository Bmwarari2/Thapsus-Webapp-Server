import { describe, it, expect, vi, beforeEach } from 'vitest';

// Settling the last-mile fee used to stamp delivery_fee_paid_at and stop
// there, leaving status = 'delivery_fee_pending'. The order screen reads
// the fee card from delivery_fee_paid_at and the badge from status, so a
// paid order showed "Paid" and "DELIVERY FEE PENDING" side by side.
vi.mock('../../utils/email.js', () => ({
  sendUnifiedPaymentReceiptEmail: vi.fn(async () => {}),
}));
vi.mock('../../utils/trackingNumber.js', () => ({
  insertWithUniqueTrackingNumber: vi.fn(async () => {}),
}));
// The post-commit hook generates a PDF and sends WhatsApp media; neither
// belongs in a unit test of the transaction.
vi.mock('../../utils/receiptPdf.js', () => ({
  generateAndStoreReceipt: vi.fn(async () => null),
}));
vi.mock('../../utils/waSend.js', () => ({
  sendToContact: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../routes/events.js', () => ({
  pushToStaff: vi.fn(), pushToUser: vi.fn(), pushToAdmins: vi.fn(),
}));

import { markPaymentPaid } from '../../utils/markPaymentPaid.js';

const FEE_PAYMENT = {
  id: 'PAY-fee-1',
  user_id: null,
  wa_contact_id: 'c1',
  target_kind: 'wa_order',
  target_id: 'o1',
  amount_gross_kes: 300,
  amount_credit_kes: 0,
  amount_due_kes: 300,
  method: 'manual',
  mpesa_reference: 'TFE1XYZ',
  paid_at: null,
  status: 'pending',
};

/** Fake pool; the wa_orders row reports whatever status the test sets. */
function makeDb(orderStatus, orderOverrides = {}) {
  const queries = [];
  const client = {
    query: vi.fn(async (sql, params) => {
      queries.push([sql, params]);
      if (/SELECT \* FROM payments WHERE id/i.test(sql)) return { rows: [FEE_PAYMENT] };
      // Matched on the FOR UPDATE lock rather than the column list, so
      // adding a column to the select does not silently turn this mock
      // into "order not found".
      if (/FROM wa_orders WHERE id = \$1 FOR UPDATE/i.test(sql)) {
        return { rows: [{
          id: 'o1', status: orderStatus, tracking_code: 'TRK-8821',
          delivery_fee_in_quote: false, delivery_fee_kes: 300,
          ...orderOverrides,
        }] };
      }
      return { rows: [], rowCount: 1 };
    }),
    release: vi.fn(),
  };
  const db = {
    connect: vi.fn(async () => client),
    query: vi.fn(async () => ({ rows: [] })),
  };
  return { db, queries };
}

const find = (queries, re) => queries.find(([sql]) => re.test(sql));

beforeEach(() => vi.clearAllMocks());

describe('settling the last-mile fee', () => {
  it("moves a 'delivery_fee_pending' order back to 'in_kenya'", async () => {
    const { db, queries } = makeDb('delivery_fee_pending');
    const result = await markPaymentPaid(db, FEE_PAYMENT.id);
    expect(result.ok).toBe(true);

    const update = find(queries, /UPDATE wa_orders[\s\S]*delivery_fee_paid_at/i);
    expect(update, 'the fee update should have run').toBeTruthy();
    // The status is the whole point: 'delivery_fee_pending' is a claim
    // about money owed, and nothing is owed any more.
    expect(update[0]).toMatch(/status = 'in_kenya'/);
    expect(update[0]).toMatch(/delivery_fee_paid_at = COALESCE/);
  });

  it('records the move in the order events, not a no-op self-transition', async () => {
    const { db, queries } = makeDb('delivery_fee_pending');
    await markPaymentPaid(db, FEE_PAYMENT.id);
    const event = find(queries, /INSERT INTO wa_order_events/i);
    expect(event[0]).toMatch(/'in_kenya'/);
    expect(event[1]).toContain('delivery_fee_pending'); // from_status
  });

  it('leaves an order that arrived under the promo alone in in_kenya', async () => {
    const { db, queries } = makeDb('in_kenya');
    await markPaymentPaid(db, FEE_PAYMENT.id);
    const update = find(queries, /UPDATE wa_orders[\s\S]*delivery_fee_paid_at/i);
    expect(update[0]).toMatch(/status = 'in_kenya'/); // unchanged, still valid
  });

  it('takes the main-payment branch from confirmed, minting the code', async () => {
    // 'confirmed' is the order total, not the fee — that branch mints the
    // tracking code and flips to 'paid'.
    const { db, queries } = makeDb('confirmed');
    await markPaymentPaid(db, FEE_PAYMENT.id);
    expect(find(queries, /UPDATE wa_orders[\s\S]*status = 'paid'/i)).toBeTruthy();
  });

  it('settles the fee with the order when the fee was quoted into it', async () => {
    // The whole point of charging last-mile up front: one payment covers
    // both, so arrival must not ask again.
    const { db, queries } = makeDb('confirmed', { delivery_fee_in_quote: true });
    await markPaymentPaid(db, FEE_PAYMENT.id);
    const update = find(queries, /UPDATE wa_orders[\s\S]*status = 'paid'/i);
    expect(update[0]).toMatch(/delivery_fee_paid_at = CASE/);
    expect(update[0]).toMatch(/WHEN delivery_fee_in_quote AND COALESCE\(delivery_fee_kes, 0\) > 0/);
  });

  it('leaves the fee unstamped on an order quoted before the change', async () => {
    // delivery_fee_in_quote is false on every pre-existing order, and the
    // SQL guard is what keeps them on the arrival-fee flow they agreed to.
    const { db, queries } = makeDb('confirmed', { delivery_fee_in_quote: false });
    await markPaymentPaid(db, FEE_PAYMENT.id);
    const update = find(queries, /UPDATE wa_orders[\s\S]*status = 'paid'/i);
    // The CASE is in the statement, but its guard is the row's own
    // column, so an old order falls through to ELSE and keeps its NULL.
    expect(update[0]).toMatch(/ELSE delivery_fee_paid_at/);
  });

  it('leaves a dispatched order alone (idempotent replay)', async () => {
    const { db, queries } = makeDb('dispatched');
    await markPaymentPaid(db, FEE_PAYMENT.id);
    expect(find(queries, /UPDATE wa_orders/i)).toBeFalsy();
  });
});
