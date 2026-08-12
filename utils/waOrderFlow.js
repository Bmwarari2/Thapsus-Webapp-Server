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

// status → set of statuses an operator/system may move it to.
const EDGES = {
  quoting: ['quoted', 'cancelled'],
  quoted: ['quoted', 'confirmed', 'cancelled'],      // 'quoted' again = re-quote
  confirmed: ['paid', 'cancelled'],
  paid: ['purchased', 'cancelled'],
  purchased: ['in_kenya'],
  in_kenya: ['delivery_fee_pending', 'dispatched'],
  delivery_fee_pending: ['dispatched'],
  dispatched: ['delivered'],
  delivered: [],
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
    const { rows: contactRows } = await client.query(
      `SELECT id, phone FROM wa_contacts WHERE id = $1`,
      [order.contact_id]
    );
    contact = contactRows[0] || { id: order.contact_id, phone: null };

    // Arrival branches on the promo toggle.
    finalStatus = toStatus;
    settings = await getWaSettings(db);
    const waived = toStatus === 'in_kenya'
      && settings.promo_active && settings.promo_type === 'waive_fee';
    if (toStatus === 'in_kenya' && !waived) finalStatus = 'delivery_fee_pending';

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

async function sendCustomerStatusMessage(db, contact, order, settings) {
  const code = order.tracking_code || '';
  switch (order.status) {
    case 'purchased':
      return sendToContact(db, contact, {
        templateKey: 'purchased',
        templateParams: { tracking_code: code },
        text:
          `🛒 Your item has been purchased and is on its way to our facility! ` +
          `Track it anytime by sending your code ${code}.`,
      });
    case 'in_kenya': {
      // Fee waived (promo) — arrival + promo message, ready to dispatch.
      const promoLine = settings?.promo_message
        ? `\n🎉 ${settings.promo_message}`
        : `\n🎉 Good news — your delivery fee is on us!`;
      return sendToContact(db, contact, {
        templateKey: 'arrived_waived',
        templateParams: { tracking_code: code },
        text:
          `📦 ${code} has arrived in Kenya! 🇰🇪${promoLine}\n` +
          `We'll dispatch it to your address shortly.`,
      });
    }
    case 'delivery_fee_pending': {
      const fee = Number(order.delivery_fee_kes || settings?.default_delivery_fee_kes || 0);
      return sendToContact(db, contact, {
        templateKey: 'arrived_fee',
        templateParams: { tracking_code: code, fee_kes: String(fee) },
        text:
          `📦 ${code} has arrived in Kenya! 🇰🇪\n` +
          `Last step: a delivery fee of KSh ${fee.toLocaleString('en-KE')} gets it to your door. ` +
          `We'll send an M-Pesa prompt — or reply here if you have any questions.`,
      });
    }
    case 'dispatched':
      return sendToContact(db, contact, {
        templateKey: 'dispatched',
        templateParams: { tracking_code: code },
        text:
          `🚚 ${code} is out for delivery to your address! ` +
          `Expect it within 1–2 business days. Our rider will call you on arrival.`,
      });
    case 'delivered':
      return sendToContact(db, contact, {
        templateKey: 'delivered',
        templateParams: { tracking_code: code },
        text:
          `✅ ${code} has been delivered — asante for shopping with Thapsus Cargo! ` +
          `Send us another link any time. 🧡`,
      });
    case 'cancelled':
      return sendToContact(db, contact, {
        text: `Your order${code ? ` ${code}` : ''} has been cancelled. Reply here if that's unexpected and we'll sort it out.`,
      });
    default:
      return; // quoting/quoted/confirmed/paid messages are sent by their own flows
  }
}
