// Which stage buttons the order screen offers.
//
// The bug this pins: COLLECTION_ACTIONS used to be written out
// independently, listing only the two arrival stages. A collection order
// sitting at 'purchased' therefore matched nothing and offered NO
// buttons — TRK-8826 (Mercy Mwikali) was stuck with no way to mark it
// arrived in Kenya, even though the server has always allowed
// purchased → in_kenya for collection orders (utils/waOrderFlow.js
// EDGES only forbids dispatch/delivered for them).
import { describe, it, expect } from 'vitest';
import { nextActions, NEXT_ACTIONS, COLLECTION_ACTIONS } from '../../client/src/lib/orderStages.js';

const labels = (order) => nextActions(order).map((a) => a.label);
const targets = (order) => nextActions(order).map((a) => a.to);

describe('collection orders keep the shared early stages', () => {
  it('offers "Arrived in Kenya" for a purchased collection order (TRK-8826)', () => {
    const order = { status: 'purchased', delivery_method: 'collection' };
    expect(targets(order)).toEqual(['in_kenya']);
    expect(labels(order)).toEqual(['Arrived in Kenya']);
  });

  it('offers "Mark purchased" for a paid collection order', () => {
    expect(targets({ status: 'paid', delivery_method: 'collection' })).toEqual(['purchased']);
  });

  it.each(['paid', 'purchased'])(
    'gives a collection order the same buttons as a delivery order at %s', (status) => {
      expect(nextActions({ status, delivery_method: 'collection' }))
        .toEqual(nextActions({ status, delivery_method: 'delivery' }));
    });

  // Guard against the two maps drifting apart again: every stage the
  // delivery journey knows about must resolve to something for a
  // collection order too.
  it('leaves no stage of the delivery journey unhandled for collection', () => {
    for (const status of Object.keys(NEXT_ACTIONS)) {
      expect(nextActions({ status, delivery_method: 'collection' }).length,
        `collection order at '${status}' has no actions`).toBeGreaterThan(0);
    }
  });
});

describe('the journeys still part at arrival', () => {
  it.each(['in_kenya', 'delivery_fee_pending'])(
    'a collection order at %s is collected, never dispatched', (status) => {
      const order = { status, delivery_method: 'collection' };
      expect(targets(order)).toEqual(['collected']);
      expect(labels(order)).toEqual(['Mark as collected']);
    });

  it.each(['in_kenya', 'delivery_fee_pending'])(
    'a delivery order at %s is dispatched', (status) => {
      expect(targets({ status, delivery_method: 'delivery' })).toEqual(['dispatched']);
    });

  it('overrides exactly the two arrival stages, nothing else', () => {
    const overridden = Object.keys(COLLECTION_ACTIONS)
      .filter((k) => COLLECTION_ACTIONS[k] !== NEXT_ACTIONS[k]);
    expect(overridden.sort()).toEqual(['delivery_fee_pending', 'in_kenya']);
  });
});

describe('stages with no operator action', () => {
  it.each(['quoting', 'quoted', 'confirmed', 'delivered', 'collected', 'cancelled'])(
    'offers nothing at %s', (status) => {
      expect(nextActions({ status, delivery_method: 'delivery' })).toEqual([]);
      expect(nextActions({ status, delivery_method: 'collection' })).toEqual([]);
    });

  it('treats a missing order or method as delivery', () => {
    expect(nextActions(null)).toEqual([]);
    expect(targets({ status: 'purchased' })).toEqual(['in_kenya']);
  });
});
