import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/waSend.js', () => ({
  sendToContact: vi.fn(async () => ({ ok: true, id: 'msg-1' })),
}));
vi.mock('../../routes/events.js', () => ({
  pushToStaff: vi.fn(), pushToUser: vi.fn(), pushToAdmins: vi.fn(),
}));
vi.mock('../../utils/waSettings.js', () => ({
  getWaSettings: vi.fn(async () => ({
    markup_pct: 10, promo_active: false, promo_type: 'waive_fee',
    promo_message: '', default_delivery_fee_kes: 300,
    welcome_media_urls: [], template_map: {},
  })),
}));

import { transition, isValidEdge } from '../../utils/waOrderFlow.js';
import { sendToContact } from '../../utils/waSend.js';
import { getWaSettings } from '../../utils/waSettings.js';

function makeDb(orderRow) {
  const calls = [];
  const client = {
    query: vi.fn(async (sql, params) => {
      calls.push([sql, params]);
      if (sql.includes('FOR UPDATE OF o')) return { rows: orderRow ? [orderRow] : [] };
      return { rows: [], rowCount: 1 };
    }),
    release: vi.fn(),
  };
  return { db: { connect: vi.fn(async () => client), query: client.query }, client, calls };
}

function orderRow(overrides = {}) {
  return {
    id: 'o1', contact_id: 'c1', phone: '254712345678',
    status: 'purchased', tracking_code: 'TRK-8821',
    delivery_fee_kes: null, delivery_fee_waived: false,
    full_name: 'Jane', customer_code: 'TC-1042',
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('edge validation', () => {
  it.each([
    ['quoting', 'quoted', true],
    ['quoted', 'confirmed', true],
    ['confirmed', 'paid', true],
    ['paid', 'purchased', true],
    ['purchased', 'in_kenya', true],
    ['in_kenya', 'dispatched', true],
    ['delivery_fee_pending', 'dispatched', true],
    ['dispatched', 'delivered', true],
    ['quoting', 'delivered', false],
    ['paid', 'quoted', false],
    ['delivered', 'dispatched', false],
    ['purchased', 'cancelled', false],
  ])('%s → %s = %s', (from, to, ok) => {
    expect(isValidEdge(from, to)).toBe(ok);
  });
});

describe('transition()', () => {
  it('rejects an invalid edge without touching the row', async () => {
    const { db, calls } = makeDb(orderRow({ status: 'delivered' }));
    const r = await transition(db, 'o1', 'dispatched');
    expect(r.ok).toBe(false);
    expect(calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });

  it('purchased → in_kenya becomes delivery_fee_pending when no promo, with the default fee', async () => {
    const { db, calls } = makeDb(orderRow({ status: 'purchased' }));
    const r = await transition(db, 'o1', 'in_kenya');
    expect(r).toEqual({ ok: true, status: 'delivery_fee_pending' });
    const update = calls.find(([sql]) => sql.includes('UPDATE wa_orders'));
    expect(update[1]).toContain('delivery_fee_pending');
    expect(update[1]).toContain(300);
    // fee-request message went out
    expect(sendToContact.mock.calls[0][2].text).toMatch(/delivery fee/i);
  });

  it('purchased → in_kenya stays in_kenya with the fee waived during a promo', async () => {
    getWaSettings.mockResolvedValueOnce({
      promo_active: true, promo_type: 'waive_fee', promo_message: 'Free delivery till mid-August!',
      default_delivery_fee_kes: 300, template_map: {}, welcome_media_urls: [],
    });
    const { db, calls } = makeDb(orderRow({ status: 'purchased' }));
    const r = await transition(db, 'o1', 'in_kenya');
    expect(r).toEqual({ ok: true, status: 'in_kenya' });
    const update = calls.find(([sql]) => sql.includes('UPDATE wa_orders'));
    expect(update[0]).toContain('delivery_fee_waived = true');
    expect(sendToContact.mock.calls[0][2].text).toContain('Free delivery till mid-August!');
  });

  it('writes the audit row with actor + note', async () => {
    const { db, calls } = makeDb(orderRow({ status: 'paid' }));
    await transition(db, 'o1', 'purchased', { actorUserId: 'op-1', note: 'bought on amazon' });
    const audit = calls.find(([sql]) => sql.includes('wa_order_events'));
    expect(audit[1]).toContain('op-1');
    expect(audit[1]).toContain('bought on amazon');
    expect(sendToContact.mock.calls[0][2].text).toMatch(/purchased/i);
  });

  it('silent transitions skip the customer message', async () => {
    const { db } = makeDb(orderRow({ status: 'quoted' }));
    await transition(db, 'o1', 'confirmed', { silent: true });
    expect(sendToContact).not.toHaveBeenCalled();
  });

  it('dispatched and delivered send their alerts', async () => {
    const { db } = makeDb(orderRow({ status: 'dispatched' }));
    await transition(db, 'o1', 'delivered');
    expect(sendToContact.mock.calls[0][2].text).toMatch(/delivered/i);
  });

  it('returns order-not-found for an unknown id', async () => {
    const { db } = makeDb(null);
    const r = await transition(db, 'nope', 'delivered');
    expect(r).toEqual({ ok: false, reason: 'order-not-found' });
  });
});
