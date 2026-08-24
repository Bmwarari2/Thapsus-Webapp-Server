import { describe, it, expect } from 'vitest';
import { renderReceiptPdf, receiptLineItems } from '../../utils/receiptPdf.js';

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

  it('renders A5, not A4 — these are read on phones', async () => {
    const buf = await renderReceiptPdf({ order, contact, payment });
    // pdfkit writes the page box as /MediaBox [0 0 w h]; A5 is 419×595pt.
    expect(buf.toString('latin1')).toMatch(/MediaBox\s*\[0 0 419\.\d+ 595\.\d+\]/);
  });

  it('itemises goods and service separately from the quote snapshot', () => {
    // 120 × 129.5 = 15,540 goods; 17,094 paid → 1,554 of service.
    const split = receiptLineItems({ order, payment });
    expect(split).toMatchObject({ goodsKes: 15540, serviceKes: 1554, total: 17094 });
    expect(split.items).toHaveLength(2);
    expect(split.items[0].sub).toBe('$120.00 at 1 USD = 129.50 KES');
    expect(split.items[1]).toMatchObject({ desc: 'Service and handling', amount: 'KSh 1,554' });
  });

  it('bills the last-mile fee as its own line, not as service margin', () => {
    // 120 × 129.5 = 15,540 goods, 10% = 1,554 service, +300 delivery.
    // Without splitting the fee out it lands in "Service and handling"
    // labelled "10% of item value", which it plainly is not.
    const split = receiptLineItems({
      order: { ...order, delivery_fee_kes: 300, delivery_fee_in_quote: true },
      payment: { ...payment, amount_due_kes: '17394' },
    });
    expect(split).toMatchObject({ goodsKes: 15540, serviceKes: 1554, deliveryKes: 300, total: 17394 });
    expect(split.items).toHaveLength(3);
    expect(split.items[2]).toMatchObject({ desc: 'Last-mile delivery', amount: 'KSh 300' });
  });

  it('adds no delivery line for a collection order', () => {
    const split = receiptLineItems({
      order: { ...order, delivery_fee_kes: 0, delivery_method: 'collection', delivery_fee_in_quote: true },
      payment,
    });
    expect(split.deliveryKes).toBe(0);
    expect(split.items.some((i) => /delivery/i.test(i.desc))).toBe(false);
  });

  it('leaves a pre-change order alone, fee or no fee', () => {
    // delivery_fee_in_quote is false, so whatever sits in
    // delivery_fee_kes was never part of this payment.
    const split = receiptLineItems({
      order: { ...order, delivery_fee_kes: 300, delivery_fee_in_quote: false },
      payment,
    });
    expect(split).toMatchObject({ goodsKes: 15540, serviceKes: 1554, deliveryKes: 0 });
    expect(split.items).toHaveLength(2);
  });

  it('shows a single line when there is no FX snapshot (delivery fees)', () => {
    const split = receiptLineItems({
      order: { id: 'o2', tracking_code: 'TRK-9001' },
      payment: { amount_due_kes: '300' },
    });
    expect(split).toMatchObject({ goodsKes: 300, serviceKes: 0, total: 300 });
    expect(split.items).toHaveLength(1);
  });

  it('names the item from the note, else the retailer host', () => {
    expect(receiptLineItems({ order: { product_note: 'Nike Air Force 1' }, payment: {} }).items[0].desc)
      .toBe('Nike Air Force 1');
    expect(receiptLineItems({
      order: { product_links: ['https://www.amazon.co.uk/dp/B09'] }, payment: {},
    }).items[0].desc).toBe('Order from amazon.co.uk');
    expect(receiptLineItems({ order: {}, payment: {} }).items[0].desc)
      .toBe('Item purchased on your behalf');
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
