import { describe, it, expect } from 'vitest';
import { renderReceiptPdf } from '../../utils/receiptPdf.js';

const order = {
  id: 'o1', tracking_code: 'TRK-8821',
  usd_price: '120.00', fx_rate: '129.5', markup_pct: '10', quote_kes: '17094',
};
const contact = { full_name: 'Jane Wanjiru', customer_code: 'TC-1042', phone: '254712345678' };
const payment = {
  id: 'PAY-1754983000-abc123', amount_due_kes: '17094',
  mpesa_reference: 'SHL9XK2QRT', paid_at: '2026-08-12T08:30:00Z',
};

describe('renderReceiptPdf', () => {
  it('produces a non-trivial PDF buffer', async () => {
    const buf = await renderReceiptPdf({ order, contact, payment });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
    // %PDF magic bytes + EOF marker
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buf.subarray(-32).toString('ascii')).toContain('%%EOF');
  });

  it('survives missing optional fields (fee receipts, no FX snapshot)', async () => {
    const buf = await renderReceiptPdf({
      order: { id: 'o2', tracking_code: 'TRK-9001' },
      contact: { full_name: null, customer_code: null },
      payment: { id: 'PAY-2', amount_due_kes: '300', paid_at: null },
    });
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
