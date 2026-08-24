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
      if (sql.includes('FOR UPDATE')) return { rows: orderRow ? [orderRow] : [] };
      if (sql.includes('FROM wa_contacts')) {
        return { rows: [{ id: orderRow?.contact_id || 'c1', phone: orderRow?.phone || '254712345678' }] };
      }
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

  it('an order whose fee was paid with the quote skips the fee request', async () => {
    // The point of charging last-mile up front: arrival has nothing to
    // collect, so it must not park the order in 'delivery_fee_pending'.
    const { db, calls } = makeDb(orderRow({
      status: 'purchased', delivery_method: 'delivery',
      delivery_fee_kes: 300, delivery_fee_in_quote: true,
    }));
    const r = await transition(db, 'o1', 'in_kenya');
    expect(r).toEqual({ ok: true, status: 'in_kenya' });
    const said = sendToContact.mock.calls[0][2].text;
    expect(said).toMatch(/paid with your order/i);
    expect(said).not.toMatch(/on us/i);      // not a waiver
    expect(said).not.toMatch(/Till/i);       // and not a request for money
  });

  it('a collection order is told where to collect, not that delivery is free', async () => {
    const { db } = makeDb(orderRow({
      status: 'purchased', delivery_method: 'collection',
      delivery_fee_kes: 0, delivery_fee_in_quote: true,
    }));
    const r = await transition(db, 'o1', 'in_kenya');
    expect(r).toEqual({ ok: true, status: 'in_kenya' });
    const said = sendToContact.mock.calls[0][2].text;
    expect(said).toMatch(/ready to collect/i);
    expect(said).toMatch(/Stanbank/i);
    expect(said).not.toMatch(/delivery fee/i);
  });

  it('still asks an order quoted before the change for its fee on arrival', async () => {
    // delivery_fee_kes is NULL on those rows, and Number(null) is 0 —
    // reading that as "nothing owed" would hand every in-flight order a
    // free delivery.
    const { db, calls } = makeDb(orderRow({
      status: 'purchased', delivery_fee_kes: null, delivery_fee_in_quote: false,
    }));
    const r = await transition(db, 'o1', 'in_kenya');
    expect(r).toEqual({ ok: true, status: 'delivery_fee_pending' });
    const update = calls.find(([sql]) => sql.includes('UPDATE wa_orders'));
    expect(update[1]).toContain(300);
  });

  // TRK-8831, from the transcript. It was correctly told "ready to
  // collect at Stanbank House", and seventeen seconds later that it was
  // "out for delivery to your address" and a rider would call. Both were
  // true of the status and false of the parcel.
  describe('a collection order never gets dispatched', () => {
    const collectionOrder = (status) => orderRow({
      status, delivery_method: 'collection',
      delivery_fee_kes: 0, delivery_fee_in_quote: true,
    });

    it('refuses dispatch outright, not just in the dashboard', async () => {
      // The UI offers "Mark as collected" instead, but a stale tab or a
      // direct API call must not be able to send "a rider is on the way"
      // to somebody walking to the CBD office.
      const { db } = makeDb(collectionOrder('in_kenya'));
      const r = await transition(db, 'o1', 'dispatched');
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/collection order/i);
      expect(sendToContact).not.toHaveBeenCalled();
    });

    it('refuses to mark it delivered', async () => {
      const { db } = makeDb(collectionOrder('dispatched'));
      const r = await transition(db, 'o1', 'delivered');
      expect(r.ok).toBe(false);
      expect(sendToContact).not.toHaveBeenCalled();
    });

    it('goes straight from in_kenya to collected', async () => {
      const { db, calls } = makeDb(collectionOrder('in_kenya'));
      const r = await transition(db, 'o1', 'collected');
      expect(r).toEqual({ ok: true, status: 'collected' });
      const update = calls.find(([sql]) => sql.includes('UPDATE wa_orders'));
      expect(update[1]).toContain('collected');
      // delivered_at stands in for "the customer has it".
      expect(update[0]).toMatch(/delivered_at/);
    });

    it('says nothing when it is collected', async () => {
      // They were at the counter. A WhatsApp message telling them they
      // collected it arrives after they have walked out with the parcel.
      const { db } = makeDb(collectionOrder('in_kenya'));
      await transition(db, 'o1', 'collected');
      expect(sendToContact).not.toHaveBeenCalled();
    });

    it('lets a legacy collection order out of delivery_fee_pending', async () => {
      const { db } = makeDb(collectionOrder('delivery_fee_pending'));
      const r = await transition(db, 'o1', 'collected');
      expect(r).toEqual({ ok: true, status: 'collected' });
    });
  });

  it('refuses to mark a delivery order collected', async () => {
    const { db } = makeDb(orderRow({ status: 'in_kenya', delivery_method: 'delivery' }));
    const r = await transition(db, 'o1', 'collected');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/for delivery/i);
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
