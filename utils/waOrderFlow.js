// utils/waOrderFlow.js
//
// The ONE place a wa_order changes status. Validates the requested edge,
// stamps the matching timestamp column, writes the wa_order_events audit
// row, notifies open dashboards over SSE, and fires the customer's
// WhatsApp alert for the new stage. routes/waOrders.js (operator
// advance), markPaymentPaid (payment landing), and the fee-waive path all
// call transition() so the pipeline can never skip its side effects.
//
// Special case — arrival: an operator advances to 'in_kenya', but what the
// order actually becomes depends on the promo toggle:
//   • promo waives the fee  → stays 'in_kenya', fee marked waived, arrival
//     message includes the promo line, order is immediately dispatchable.
//   • otherwise             → becomes 'delivery_fee_pending', arrival
//     message asks for the last-mile fee.

import { v4 as uuidv4 } from 'uuid';
import { sendToContact } from './waSend.js';
import { getWaSettings } from './waSettings.js';
import { pushToStaff } from '../routes/events.js';
import { mpesaTill } from './waPayments.js';

// status → set of statuses an operator/system may move it to.
const EDGES = {
  quoting: ['quoted', 'cancelled'],
  quoted: ['quoted', 'confirmed', 'cancelled'],      // 'quoted' again = re-quote
  confirmed: ['paid', 'cancelled'],
  paid: ['purchased', 'cancelled'],
  purchased: ['in_kenya'],
  // 'collected' is the terminal state for a customer who comes to the
  // CBD office. Nothing is dispatched and no rider calls, so it is
  // reached straight from arrival rather than through dispatch.
  in_kenya: ['delivery_fee_pending', 'dispatched', 'collected'],
  // A collection order quoted before the fee moved into the quote can
  // still be sitting here, so it needs the same way out.
  delivery_fee_pending: ['dispatched', 'collected'],
  dispatched: ['delivered'],
  delivered: [],
  collected: [],
  cancelled: [],
};

const TIMESTAMP_COL = {
  quoted: 'quoted_at',
  confirmed: 'confirmed_at',
  paid: 'paid_at',
  purchased: 'purchased_at',
  in_kenya: 'arrived_at',
  delivery_fee_pending: 'arrived_at',
  dispatched: 'dispatched_at',
  delivered: 'delivered_at',
  // Reuses delivered_at deliberately: it means "the customer has it",
  // as true of a parcel picked up over the counter as one handed over
  // at a door. Every reader of that column stays correct without
  // knowing this status exists.
  collected: 'delivered_at',
};

export function isValidEdge(from, to) {
  return Boolean(EDGES[from]?.includes(to));
}

export const WA_ORDER_STATUSES = Object.keys(EDGES);

/**
 * Move an order to `toStatus`, with all side effects.
 *
 * @param {pg.Pool} db  pool (NOT an open transaction — we open our own)
 * @param {string} orderId
 * @param {string} toStatus
 * @param {object} [opts]
 * @param {string} [opts.actorUserId]  operator user id; omit for automation
 * @param {string} [opts.note]         free-text note for the audit row
 * @param {boolean}[opts.silent]       skip the customer WhatsApp message
 * @returns {Promise<{ok: boolean, status?: string, reason?: string}>}
 */
export async function transition(db, orderId, toStatus, opts = {}) {
  const client = await db.connect();
  let order, contact, finalStatus, settings;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM wa_orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    order = rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'order-not-found' };
    }
    if (!isValidEdge(order.status, toStatus)) {
      await client.query('ROLLBACK');
      return { ok: false, reason: `invalid transition ${order.status} → ${toStatus}` };
    }
    // The edge table cannot express this: dispatch is a legal move out of
    // 'in_kenya' in general and never legal for a collection order. The
    // dashboard offers 'Mark as collected' instead, but a stale tab or a
    // direct API call would otherwise still send "a rider is on the way"
    // to somebody who agreed to walk to the CBD office.
    if (order.delivery_method === 'collection' && ['dispatched', 'delivered'].includes(toStatus)) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'this is a collection order — mark it collected instead of dispatching' };
    }
    if (order.delivery_method !== 'collection' && toStatus === 'collected') {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'this order is for delivery, not collection' };
    }
    const { rows: contactRows } = await client.query(
      `SELECT id, phone, full_name FROM wa_contacts WHERE id = $1`,
      [order.contact_id]
    );
    contact = contactRows[0] || { id: order.contact_id, phone: null };

    // Arrival branches on whether anything is still owed.
    finalStatus = toStatus;
    settings = await getWaSettings(db);
    const waived = toStatus === 'in_kenya'
      && settings.promo_active && settings.promo_type === 'waive_fee';
    // Nothing to collect when the fee rode in on the quote (the normal
    // case now), when the customer is collecting so there is no fee at
    // all, or when it was already settled or waived by hand. Only an
    // order that genuinely owes money goes to 'delivery_fee_pending' —
    // that status is a claim about a debt.
    // Note the null check on the fee: Number(null) is 0, and an order
    // quoted before the fee moved into the quote carries a NULL fee
    // while genuinely still owing it — the arrival branch is where it
    // gets its amount. Treating that as "zero, so settled" would hand
    // every in-flight order a free delivery.
    const feeIsExplicitlyZero = order.delivery_fee_kes != null
      && Number(order.delivery_fee_kes) === 0;
    const feeSettled = order.delivery_fee_in_quote
      || order.delivery_method === 'collection'
      || order.delivery_fee_waived
      || order.delivery_fee_paid_at != null
      || feeIsExplicitlyZero;
    if (toStatus === 'in_kenya' && !waived && !feeSettled) finalStatus = 'delivery_fee_pending';

    const sets = ['status = $2', 'updated_at = NOW()'];
    const params = [orderId, finalStatus];
    const tsCol = TIMESTAMP_COL[finalStatus];
    if (tsCol) sets.push(`${tsCol} = COALESCE(${tsCol}, NOW())`);
    if (waived) {
      sets.push('delivery_fee_waived = true', 'delivery_fee_kes = 0');
    } else if (finalStatus === 'delivery_fee_pending') {
      params.push(settings.default_delivery_fee_kes);
      sets.push(`delivery_fee_kes = COALESCE(delivery_fee_kes, $${params.length})`);
    }
    await client.query(
      `UPDATE wa_orders SET ${sets.join(', ')} WHERE id = $1`,
      params
    );

    await client.query(
      `INSERT INTO wa_order_events (id, order_id, from_status, to_status, actor_user_id, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [uuidv4(), orderId, order.status, finalStatus, opts.actorUserId || null, opts.note || null]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`[waOrderFlow:${orderId}] transition failed:`, err);
    return { ok: false, reason: 'transition-failed', error: err.message };
  } finally {
    client.release();
  }

  pushToStaff('wa_pipeline_update', {
    order_id: orderId,
    contact_id: contact.id,
    from: order.status,
    status: finalStatus,
  });

  if (!opts.silent) {
    try {
      await sendCustomerStatusMessage(db, contact, { ...order, status: finalStatus }, settings);
    } catch (e) {
      console.warn(`[waOrderFlow:${orderId}] customer alert failed:`, e?.message);
    }
  }
  return { ok: true, status: finalStatus };
}

/**
 * The customer-facing message for a stage. Exported so an order added
 * directly at a later stage can opt into the same copy the pipeline
 * would have sent.
 */
export async function sendCustomerStatusMessage(db, contact, order, settings) {
  const code = order.tracking_code || '';
  switch (order.status) {
    case 'purchased':
      return sendToContact(db, contact, {
        templateKey: 'purchased',
        templateParams: { full_name: contact.full_name, order_ref: code },
        text:
          `Your item has been purchased and is on its way to our facility. ` +
          `Most parcels land in Kenya within 14 to 21 days of purchase — we'll message you the moment yours arrives. ` +
          `Track it anytime by sending your code ${code}.`,
      });
    case 'in_kenya': {
      // Three ways to owe nothing on arrival, and they are not
      // interchangeable. "Your delivery fee is on us" is a lie to
      // somebody who paid it with their order, and gibberish to somebody
      // who is coming to collect.
      if (order.delivery_method === 'collection') {
        return sendToContact(db, contact, {
          templateKey: 'arrived_collect',
          templateParams: { tracking_code: code },
          text:
            `${code} has arrived and is ready to collect at Stanbank House, ` +
            `4th floor, room 28, Nairobi CBD.\n` +
            `We're open Monday to Saturday, closed Sunday.`,
        });
      }
      if (order.delivery_fee_in_quote && Number(order.delivery_fee_kes) > 0) {
        return sendToContact(db, contact, {
          templateKey: 'arrived_paid',
          templateParams: { tracking_code: code },
          text:
            `${code} has arrived in Kenya. Your delivery was paid with your ` +
            `order, so nothing more is due.\n` +
            `We'll send it on to you shortly.`,
        });
      }
      // Fee waived (promo, or by hand) — arrival + promo message.
      const promoLine = settings?.promo_message
        ? `\n${settings.promo_message}`
        : `\nGood news — your delivery fee is on us.`;
      return sendToContact(db, contact, {
        templateKey: 'arrived_waived',
        templateParams: { tracking_code: code },
        text:
          `${code} has arrived in Kenya.${promoLine}\n` +
          `We'll dispatch it to your address shortly.`,
      });
    }
    case 'delivery_fee_pending': {
      const fee = Number(order.delivery_fee_kes || settings?.default_delivery_fee_kes || 0);
      return sendToContact(db, contact, {
        templateKey: 'arrived_fee',
        templateParams: { tracking_code: code, fee_kes: String(fee) },
        text:
          `${code} has arrived in Kenya.\n` +
          `Last step: a delivery fee of KSh ${fee.toLocaleString('en-KE')} gets it to your door. ` +
          `Pay it on Lipa na M-Pesa, Buy Goods, Till ${mpesaTill()}, then reply here and we'll confirm it.`,
      });
    }
    case 'dispatched':
      // A parcel going to a Pickup Mtaani agent is not being brought to
      // anybody's door, and "our rider will call you on arrival" sends
      // that customer home to wait. Name the point the team assigned.
      if (order.pickup_point) {
        return sendToContact(db, contact, {
          templateKey: 'dispatched',
          templateParams: { tracking_code: code },
          text:
            `${code} is on its way to ${order.pickup_point} via Pickup Mtaani. ` +
            `You'll get a notification from Pickup Mtaani when it's ready to collect.`,
        });
      }
      return sendToContact(db, contact, {
        templateKey: 'dispatched',
        templateParams: { tracking_code: code },
        text:
          `${code} is out for delivery to your address. ` +
          `Expect it within 24 hours. Our rider will call you on arrival.`,
      });
    case 'delivered':
      return sendToContact(db, contact, {
        templateKey: 'delivered',
        templateParams: { order_ref: code, full_name: contact.full_name },
        text:
          `${code} has been delivered — asante for shopping with Thapsus Cargo. ` +
          `Send us another link any time.`,
      });
    // Marking a collection complete sends nothing. The customer was
    // standing at the counter when it happened; a WhatsApp message
    // telling them so arrives after they have already walked out with
    // the parcel. The arrival message already told them where to come.
    case 'collected':
      return;
    case 'cancelled':
      return sendToContact(db, contact, {
        text: `Your order${code ? ` ${code}` : ''} has been cancelled. Reply here if that's unexpected and we'll sort it out.`,
      });
    default:
      return; // quoting/quoted/confirmed/paid messages are sent by their own flows
  }
}
