// orderStages.js
//
// Which "advance" buttons the order screen offers for a given order.
// Money-moving statuses ('paid') are not here — those go through the
// payments machinery, never a stage button.
//
// The two journeys share everything up to arrival. A parcel is bought
// and lands in Kenya identically whether the customer collects it or we
// deliver; only the final leg differs — a collection parcel is handed
// over at our counter and never rides with a rider.
//
// COLLECTION_ACTIONS is therefore DERIVED from the delivery map rather
// than written out again. It used to be an independent object listing
// only the two arrival stages, which meant a collection order sitting at
// 'purchased' offered no buttons at all: TRK-8826 (Mercy Mwikali) was
// stuck with no way to mark it arrived in Kenya. The server always
// allowed purchased → in_kenya for collection orders — it was only this
// map that disagreed — and deriving it keeps the shared early stages
// from drifting apart again.

export const NEXT_ACTIONS = {
  paid: [{ to: 'purchased', label: 'Mark purchased' }],
  purchased: [{ to: 'in_kenya', label: 'Arrived in Kenya' }],
  in_kenya: [{ to: 'dispatched', label: 'Dispatch' }],
  delivery_fee_pending: [{ to: 'dispatched', label: 'Dispatch' }],
  dispatched: [{ to: 'delivered', label: 'Mark delivered' }],
};

// Offering Dispatch on a collection order is how TRK-8831 was told
// "ready to collect at Stanbank House" and then, seventeen seconds
// later, that a rider was on the way to its address. Arrival is where
// the journeys part.
export const COLLECTION_ACTIONS = {
  ...NEXT_ACTIONS,
  in_kenya: [{ to: 'collected', label: 'Mark as collected' }],
  delivery_fee_pending: [{ to: 'collected', label: 'Mark as collected' }],
};

/**
 * @param {{status: string, delivery_method?: string}} order
 * @returns {Array<{to: string, label: string}>}
 */
export function nextActions(order) {
  if (!order) return [];
  const map = order.delivery_method === 'collection' ? COLLECTION_ACTIONS : NEXT_ACTIONS;
  return map[order.status] || [];
}
