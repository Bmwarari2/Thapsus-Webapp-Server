/**
 * useRealtimeUpdates
 *
 * Opens a persistent SSE connection to /api/events and dispatches
 * incoming events into React components in real time.
 */
import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

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

  ['order_update', 'ticket_update', 'notification', 'wallet_update', 'admin_stats', 'package_update']
    .forEach(type => {
      source.addEventListener(type, e => {
        try { dispatch(type, JSON.parse(e.data)); } catch (_) { /* ignore */ }
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
export function useWalletUpdates(cb) {
  const { on } = useRealtimeUpdates();
  const ref = useRef(cb); ref.current = cb;
  useEffect(() => on('wallet_update', data => ref.current(data)), [on]);
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
