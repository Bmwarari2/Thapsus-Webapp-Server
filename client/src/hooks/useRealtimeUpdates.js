/**
 * useRealtimeUpdates
 *
 * Opens a persistent SSE connection to /api/events and dispatches
 * incoming events into React components in real time.
 *
 * Also fires browser Notifications (if permission is 'granted') whenever
 * an order_update: status_changed event arrives.
 */
import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Every event name the server can send.
 *
 * EventSource has no wildcard: a named event with no addEventListener for
 * it is received and thrown away in silence. The three wa_* names were
 * missing from this list for the whole life of the WhatsApp rebuild, so
 * the operator inbox never refreshed on its own, the pipeline board never
 * moved, and the new-customer toast never fired — the hooks were all
 * wired up correctly to a dispatcher nothing ever called.
 *
 * Keep in step with the `pushTo*` call sites in routes/ and utils/.
 * tests/unit/sseEvents.test.js fails if the server learns a new event and
 * this list does not.
 */
export const SSE_EVENTS = [
  'order_update', 'ticket_update', 'notification', 'credit_update', 'admin_stats',
  'package_update', 'buy_for_me_update', 'invoice_update',
  'wa_inbox_update', 'wa_pipeline_update', 'wa_new_customer',
];


// ── Browser notification helpers ──────────────────────────────────────────────

const STATUS_LABELS = {
  pending:               'Order Placed',
  received_at_warehouse: 'Received at Warehouse',
  consolidating:         'Being Consolidated',
  in_transit:            'In Transit',
  customs:               'Customs Clearance',
  out_for_delivery:      'Out for Delivery',
  delivered:             'Delivered!',
};

const STATUS_BODIES = {
  pending:               'Your order has been created. We\'ll notify you once it reaches our warehouse.',
  received_at_warehouse: 'Your package has arrived at our warehouse and is being processed.',
  consolidating:         'Your package is being consolidated. This helps reduce your shipping costs!',
  in_transit:            'Your package is now in transit to Kenya.',
  customs:               'Your package is undergoing customs clearance.',
  out_for_delivery:      'Your package is out for delivery — expect it soon!',
  delivered:             'Your package has been delivered. Thank you for using Thapsus Cargo!',
};

function fireBrowserNotification(order) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const status  = order?.status;
  const tracking = order?.tracking_number || '';
  const title   = `📦 ${STATUS_LABELS[status] || 'Shipment Update'}`;
  const body    = STATUS_BODIES[status]
    ? `${STATUS_BODIES[status]}\n\nTracking: ${tracking}`
    : `Your package ${tracking} has been updated.`;

  try {
    const n = new Notification(title, {
      body,
      icon:  '/logo.png',
      badge: '/logo.png',
      tag:   `order-${order?.id || tracking}`,   // collapses duplicate alerts
    });
    n.onclick = () => {
      window.focus();
      if (order?.id) window.location.href = `/orders/${order.id}`;
      n.close();
    };
  } catch (err) {
    console.warn('[Notification] Failed to fire:', err);
  }
}

const BASE_URL = import.meta.env.VITE_API_URL || '';

// ── Robust storage helper (mirrors api/client.js) ─────────────────────────────
function getToken() {
  try {
    return sessionStorage.getItem('sc_token') || localStorage.getItem('sc_token') || null;
  } catch (_) {
    return null;
  }
}

// ── Singleton SSE connection ──────────────────────────────────────────────────
let globalSource    = null;
let globalListeners = {};    // { eventType: Set<callback> }
let reconnectTimer  = null;
let currentToken    = null;

function subscribe(eventType, cb) {
  if (!globalListeners[eventType]) globalListeners[eventType] = new Set();
  globalListeners[eventType].add(cb);
  return () => globalListeners[eventType]?.delete(cb);
}

function dispatch(eventType, data) {
  globalListeners[eventType]?.forEach(cb => cb(data));
  globalListeners['*']?.forEach(cb => cb({ type: eventType, data }));
}

function connectSSE(token) {
  if (globalSource) { globalSource.close(); globalSource = null; }
  currentToken = token;

  const url    = `${BASE_URL}/api/events?token=${encodeURIComponent(token)}`;
  const source = new EventSource(url);
  globalSource = source;

  source.addEventListener('connected', () => {
    console.debug('[SSE] connected');
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  });

  SSE_EVENTS.forEach(type => {
      source.addEventListener(type, e => {
        try {
          const data = JSON.parse(e.data);
          dispatch(type, data);

          // Fire a browser notification whenever an order changes status
          if (type === 'order_update' && data?.action === 'status_changed' && data?.order) {
            fireBrowserNotification(data.order);
          }
        } catch (_) { /* ignore */ }
    });
  });

  source.onerror = () => {
    source.close();
    globalSource = null;
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        const t = getToken();
        if (t) connectSSE(t);
      }, 3000);
    }
  };
}

function disconnectSSE() {
  if (globalSource) { globalSource.close(); globalSource = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  currentToken = null;
}

// ── Main hook ─────────────────────────────────────────────────────────────────
export function useRealtimeUpdates() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) { disconnectSSE(); return; }
    const token = getToken();
    if (!token) return;
    if (!globalSource || currentToken !== token) connectSSE(token);
    return () => { /* keep singleton alive across page transitions */ };
  }, [user]);

  const on = useCallback((eventType, cb) => subscribe(eventType, cb), []);
  return { on };
}

// ── Typed helpers ─────────────────────────────────────────────────────────────
export function useOrderUpdates(cb) {
  const { on } = useRealtimeUpdates();
  const ref = useRef(cb); ref.current = cb;
  useEffect(() => on('order_update',  data => ref.current(data)), [on]);
}
export function useTicketUpdates(cb) {
  const { on } = useRealtimeUpdates();
  const ref = useRef(cb); ref.current = cb;
  useEffect(() => on('ticket_update', data => ref.current(data)), [on]);
}
export function useNotificationUpdates(cb) {
  const { on } = useRealtimeUpdates();
  const ref = useRef(cb); ref.current = cb;
  useEffect(() => on('notification',  data => ref.current(data)), [on]);
}
/**
 * Replaced useWalletUpdates in PR C — wallet was dropped in
 * migration 028. The new SSE event is `credit_update`, fired from
 * routes/orders.js when a referral reward bumps user_credits.
 */
export function useCreditUpdates(cb) {
  const { on } = useRealtimeUpdates();
  const ref = useRef(cb); ref.current = cb;
  useEffect(() => on('credit_update', data => ref.current(data)), [on]);
}
export function useAdminStats(cb) {
  const { on } = useRealtimeUpdates();
  const ref = useRef(cb); ref.current = cb;
  useEffect(() => on('admin_stats',   data => ref.current(data)), [on]);
}
export function usePackageUpdates(cb) {
  const { on } = useRealtimeUpdates();
  const ref = useRef(cb); ref.current = cb;
  useEffect(() => on('package_update',data => ref.current(data)), [on]);
}
export function useBuyForMeUpdates(cb) {
  const { on } = useRealtimeUpdates();
  const ref = useRef(cb); ref.current = cb;
  useEffect(() => on('buy_for_me_update', data => ref.current(data)), [on]);
}
export function useInvoiceUpdates(cb) {
  const { on } = useRealtimeUpdates();
  const ref = useRef(cb); ref.current = cb;
  useEffect(() => on('invoice_update', data => ref.current(data)), [on]);
}

// ── WhatsApp-flow events (operator dashboard) ─────────────────────────────────
export function useWaInboxUpdates(cb) {
  const { on } = useRealtimeUpdates();
  const ref = useRef(cb); ref.current = cb;
  useEffect(() => on('wa_inbox_update', data => ref.current(data)), [on]);
}
export function useWaPipelineUpdates(cb) {
  const { on } = useRealtimeUpdates();
  const ref = useRef(cb); ref.current = cb;
  useEffect(() => on('wa_pipeline_update', data => ref.current(data)), [on]);
}
export function useWaNewCustomer(cb) {
  const { on } = useRealtimeUpdates();
  const ref = useRef(cb); ref.current = cb;
  useEffect(() => on('wa_new_customer', data => ref.current(data)), [on]);
}
