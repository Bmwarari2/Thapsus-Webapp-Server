// utils/parcelStatusNotify.js
//
// Single fan-out point for parcel-status side-effects: the customer-facing
// in-app notification row, the transactional email, and the SSE push to
// every open browser tab via routes/events.js.
//
// Until the audit punch list landed, the only place this fan-out happened
// was at order creation (routes/orders.js).  Every later status flip —
// receive, consolidate, dispatch (out-for-delivery), POD (delivered),
// failed-delivery — wrote the new status to Postgres and that was it.
// Customers got radio silence after the create email and the React
// realtime hooks (`pushToUser`/`useRealtimeUpdates`) never fired.
//
// The orchestrator below is intentionally side-effect-only.  It never
// throws back to its caller because every one of the call sites is in the
// "happy path" of a transaction-committed status change — a Gmail outage
// or a disconnected SSE client must not roll back the user-visible state.
// All four channels are best-effort; failures are logged and swallowed.

import {
  sendStatusUpdateEmail,
  sendDeliveryOtpEmail,
  sendDeliveredEmail,
  sendDeliveryAttemptedEmail,
  sendNpsInvitationEmail,
} from './email.js';
import { pushToUser, pushToAdmins } from '../routes/events.js';
import { sendWebPushToUser } from './webpush.js';

const STATUS_MESSAGE = {
  received_at_warehouse: (tn) => `Good news — your parcel ${tn} has arrived at our warehouse.`,
  consolidating:         (tn) => `Your parcel ${tn} is being consolidated for shipment.`,
  in_transit:            (tn) => `Your parcel ${tn} is now in transit to Nairobi.`,
  customs:               (tn) => `Your parcel ${tn} is clearing customs.`,
  out_for_delivery:      (tn) => `Your parcel ${tn} is out for delivery.`,
  delivered:             (tn) => `Your parcel ${tn} has been delivered.`,
  delivery_attempted:    (tn) => `We tried to deliver parcel ${tn} but couldn't reach you. We'll try again on the next run.`,
};

/**
 * Look up the customer record attached to a parcel/order id. Returns null
 * if the order has no `user_id` (defensive — production schema disallows
 * that, but a half-migrated row would otherwise let email/SSE leak to a
 * non-existent recipient).
 */
async function loadParcelOwner(client, parcelId) {
  const { rows } = await client.query(
    `SELECT o.id           AS order_id,
            o.user_id      AS user_id,
            o.tracking_number,
            u.email        AS email,
            u.name         AS name,
            u.phone        AS phone
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
      WHERE o.id = $1`,
    [parcelId]
  );
  return rows[0] || null;
}

/**
 * notifyParcelStatus — fan out a status change to every customer channel.
 *
 * @param {object}  client     pg Pool *or* connected client. Either works
 *                             — the helper only does SELECTs and INSERTs
 *                             on its own and never opens a transaction.
 * @param {string}  parcelId   orders.id (which is the same as packages.order_id).
 * @param {string}  newStatus  one of STATUS_MESSAGE keys, or any custom
 *                             status string (the email falls back to a
 *                             generic "status updated to X" copy).
 * @param {object}  opts
 * @param {string}  [opts.otp]      4-digit POD OTP — when present and
 *                                  status === 'out_for_delivery', the
 *                                  delivery-OTP email template is used
 *                                  instead of the generic status template.
 * @param {string}  [opts.failReason] Free-text reason for delivery_attempted.
 * @param {string}  [opts.npsLink]  Survey link for the delivered → NPS path.
 *                                  When set, an NPS invitation email is also
 *                                  fired alongside the delivered email.
 * @param {boolean} [opts.skipInApp] Skip the `notifications` row insert
 *                                   (useful when the caller already wrote
 *                                   one, e.g. issuePodOtp wrote the OTP
 *                                   notification row before us).
 */
export async function notifyParcelStatus(client, parcelId, newStatus, opts = {}) {
  const owner = await loadParcelOwner(client, parcelId).catch((err) => {
    console.warn('[parcelStatusNotify] owner lookup failed:', err.message);
    return null;
  });
  if (!owner || !owner.user_id) return;

  const trackingNumber = owner.tracking_number || parcelId;
  const messageBuilder = STATUS_MESSAGE[newStatus] || ((tn) => `Status updated to ${newStatus} for ${tn}.`);
  const message = messageBuilder(trackingNumber);

  // 1. In-app feed — write to `notifications` so the iOS NotificationInbox
  //    picks it up via the Supabase realtime channel. The OTP path writes
  //    its own notification row first (with the actual code), so let the
  //    caller skip this one to avoid two near-duplicate rows.
  if (!opts.skipInApp) {
    try {
      await client.query(
        `INSERT INTO notifications (id, user_id, type, message)
           VALUES ($1, $2, 'in_app', $3)`,
        [
          `NOTIF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          owner.user_id,
          message,
        ]
      );
    } catch (err) {
      console.warn('[parcelStatusNotify] in-app insert failed:', err.message);
    }
  }

  // 2. SSE push for the React webapp's realtime hooks. The iOS app
  //    observes `orders` directly via Supabase realtime and doesn't need
  //    this — but the admin dashboard and customer web tracker do.
  try {
    pushToUser(owner.user_id, 'order_update', {
      action: 'status_changed',
      order_id: parcelId,
      tracking_number: trackingNumber,
      status: newStatus,
    });
    if (newStatus === 'delivered' || newStatus === 'out_for_delivery') {
      pushToAdmins('admin_stats', { action: 'parcel_progress', order_id: parcelId, status: newStatus });
    }
  } catch (err) {
    console.warn('[parcelStatusNotify] SSE push failed:', err.message);
  }

  // Web Push to closed PWAs (best-effort).
  sendWebPushToUser(client, owner.user_id, {
    title: '📦 Parcel update',
    body: message,
    url: parcelId ? `/orders/${parcelId}` : '/orders',
    tag: `order-${parcelId}`,
  }).catch(() => {});

  // 3. Transactional email — picks the right template per status. All
  //    paths log + swallow so a Gmail outage doesn't propagate up to the
  //    caller's transaction.
  if (!owner.email) return;

  const sendErr = (label) => (err) =>
    console.warn(`[parcelStatusNotify] ${label} email failed (non-fatal): ${err.message}`);

  if (newStatus === 'out_for_delivery' && opts.otp) {
    sendDeliveryOtpEmail(owner.email, owner.name, trackingNumber, opts.otp)
      .catch(sendErr('out_for_delivery'));
    return;
  }
  if (newStatus === 'delivered') {
    sendDeliveredEmail(owner.email, owner.name, trackingNumber).catch(sendErr('delivered'));
    if (opts.npsLink !== false) {
      sendNpsInvitationEmail(owner.email, owner.name, trackingNumber, opts.npsLink || null)
        .catch(sendErr('nps_invitation'));
    }
    return;
  }
  if (newStatus === 'delivery_attempted') {
    sendDeliveryAttemptedEmail(owner.email, owner.name, trackingNumber, opts.failReason)
      .catch(sendErr('delivery_attempted'));
    return;
  }

  // Generic status template — only for the lifecycle transitions the
  // customer cares about. Skipping the rest (e.g. internal `consolidating`
  // sub-states) keeps the inbox quiet.
  if (STATUS_MESSAGE[newStatus]) {
    sendStatusUpdateEmail(owner.email, owner.name, trackingNumber, newStatus)
      .catch(sendErr(`status_${newStatus}`));
  }
}

export default notifyParcelStatus;
