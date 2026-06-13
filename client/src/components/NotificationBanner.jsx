/**
 * NotificationBanner
 *
 * Handles three distinct browser environments:
 *
 *  1. iOS / iPadOS in regular Safari
 *     └─ Notification API is NOT available in browser tabs on iOS.
 *        Show an "Add to Home Screen" guide so the user can install the PWA,
 *        which unlocks Web Push on iOS 16.4+.
 *
 *  2. iOS / iPadOS installed as PWA (standalone) on iOS 16.4+
 *     └─ Notification API IS available. Show the standard permission prompt.
 *
 *  3. All other browsers (Chrome, Firefox, Edge, Safari macOS …)
 *     └─ Notification API is available. Show the standard permission prompt.
 *
 * Persistence (localStorage key: tc_notif_state):
 *   'granted'   → never show (permission already given)
 *   'dismissed' → hide for this session, re-surface next visit
 *   'never'     → never show (user explicitly declined or browser denied)
 *   absent      → show after a brief paint delay
 *
 * Design: Thapsus Cargo liquid-glass system
 *   bg-surface-2 backdrop-blur-2xl · border-line · animate-morph blobs
 *   glass-sheen CTA · #0f172a / orange-500 brand palette
 */
import React, { useState, useEffect } from 'react';
import { Bell, X, BellOff, Zap, Share, Plus, Smartphone } from 'lucide-react';
import { useNotificationPermission, isNotificationSupported } from '../hooks/useNotificationPermission';
import { enablePush } from '../lib/push';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'tc_notif_state';

// ── Platform detection helpers ────────────────────────────────────────────────

/** True on iPhone / iPad / iPod — including iPad pretending to be macOS */
function detectIOS() {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports itself as macOS but has touch points
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** True when running as an installed PWA (standalone / fullscreen) */
function detectPWA() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

// ── Shared animation styles ───────────────────────────────────────────────────

const STYLES = `
  @keyframes slideUp {
    from { transform: translateY(120%); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
  @keyframes slideDown {
    from { transform: translateY(0);    opacity: 1; }
    to   { transform: translateY(120%); opacity: 0; }
  }
  @keyframes morphBanner {
    0%   { transform: translate(0,0)        scale(1);   }
    33%  { transform: translate(20px,-30px) scale(1.1); }
    66%  { transform: translate(-15px,15px) scale(0.9); }
    100% { transform: translate(0,0)        scale(1);   }
  }
  @keyframes sheen {
    0%   { transform: translateX(-100%) skewX(-15deg); }
    100% { transform: translateX(200%)  skewX(-15deg); }
  }
  .nb-slide-up   { animation: slideUp   0.4s cubic-bezier(0.16,1,0.3,1) forwards; }
  .nb-slide-down { animation: slideDown 0.35s cubic-bezier(0.4,0,1,1)   forwards; }
  .nb-morph      { animation: morphBanner 14s ease-in-out infinite; }
  .nb-sheen      { position: relative; overflow: hidden; }
  .nb-sheen::after {
    content: '';
    position: absolute; top: 0; left: 0; width: 50%; height: 100%;
    background: linear-gradient(to right, transparent, rgba(255,255,255,0.35), transparent);
    animation: sheen 3.5s infinite;
  }
`;

// ── Shell card (shared by both banner variants) ───────────────────────────────

function BannerShell({ leaving, onClose, children }) {
  return (
    <>
      <style>{STYLES}</style>
      <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-6 right-4 left-4 md:left-auto md:right-6 md:max-w-sm z-[55] pointer-events-none">
        <div className={`pointer-events-auto ${leaving ? 'nb-slide-down' : 'nb-slide-up'}`}>
          <div className="relative overflow-hidden rounded-[2rem] bg-surface-2 backdrop-blur-2xl border border-line shadow-[0_24px_64px_-12px_rgba(15,23,42,0.18)]">
            {/* Liquid blobs */}
            <div className="absolute top-[-30%] right-[-20%] w-48 h-48 bg-ember-500/20 blur-[60px] rounded-full nb-morph pointer-events-none" />
            <div className="absolute bottom-[-20%] left-[-10%] w-36 h-36 bg-ember-500/10 blur-[50px] rounded-full nb-morph pointer-events-none" style={{ animationDelay: '4s' }} />
            {/* Crystal overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />

            <div className="relative z-10 p-6">
              {/* Close */}
              <button
                onClick={onClose}
                aria-label="Dismiss"
                className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-dim hover:text-mute transition-all"
              >
                <X size={14} />
              </button>

              {children}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Variant A: Standard permission prompt (non-iOS or iOS PWA) ────────────────

function PermissionBanner({ onDismiss }) {
  const { requestPermission } = useNotificationPermission();
  const [loading, setLoading] = useState(false);
  const [leaving, setLeaving] = useState(false);

  function dismiss(permanent = false) {
    setLeaving(true);
    setTimeout(() => onDismiss(permanent), 380);
  }

  async function handleAllow() {
    setLoading(true);
    const result = await requestPermission();
    // On grant, also register the Web Push subscription so notifications reach
    // a closed PWA — not just open tabs. Best-effort; ignore the result.
    if (result === 'granted') { try { await enablePush(); } catch { /* noop */ } }
    setLoading(false);
    dismiss(result === 'denied');
  }

  return (
    <BannerShell leaving={leaving} onClose={() => dismiss(false)}>
      {/* Icon + eyebrow */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative w-11 h-11 bg-ember-gradient rounded-2xl flex items-center justify-center shadow-lg shrink-0">
          <Bell size={20} className="text-white" />
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-ember-500 rounded-full border-2 border-line">
            <span className="absolute inset-0 bg-ember-400 rounded-full animate-ping opacity-75" />
          </span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 backdrop-blur-md border border-line text-[9px] font-black uppercase tracking-[0.25em] text-mute">
          <Zap size={9} className="text-ember-400" />
          Live Shipment Alerts
        </div>
      </div>

      <h3 className="text-xl font-black text-white tracking-tighter leading-tight mb-1.5">
        Never Miss a<br />Status Update.
      </h3>
      <p className="text-sm font-medium text-mute leading-relaxed mb-5">
        Get instant alerts when your package moves — from warehouse receipt right to your door.
      </p>

      <div className="flex flex-col gap-2.5">
        <button
          onClick={handleAllow}
          disabled={loading}
          className="nb-sheen w-full bg-ember-gradient hover:brightness-110 disabled:opacity-60 text-white py-3.5 rounded-[1.25rem] font-black text-xs uppercase tracking-widest transition-all shadow-lg hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2"
        >
          <Bell size={14} />
          {loading ? 'Requesting…' : 'Allow Notifications'}
        </button>
        <button
          onClick={() => dismiss(false)}
          className="w-full py-3 rounded-[1.25rem] font-black text-xs uppercase tracking-widest text-dim hover:text-mute hover:bg-white/[0.06] transition-all flex items-center justify-center gap-2"
        >
          <BellOff size={13} />
          Not Right Now
        </button>
      </div>

      <p className="mt-4 text-center text-[9px] text-dim font-bold">
        You can change this anytime in your browser settings.
      </p>
    </BannerShell>
  );
}

// ── Variant B: iOS "Add to Home Screen" guide ─────────────────────────────────
// iOS Safari blocks the Notification API in browser tabs entirely.
// The user must install the app as a PWA first (iOS 16.4+ requirement).

function IOSInstallBanner({ onDismiss }) {
  const [leaving, setLeaving] = useState(false);

  function dismiss(permanent = false) {
    setLeaving(true);
    setTimeout(() => onDismiss(permanent), 380);
  }

  const steps = [
    { icon: Share,    text: 'Tap the Share icon in Safari\'s toolbar' },
    { icon: Plus,     text: 'Scroll down and tap "Add to Home Screen"' },
    { icon: Bell,     text: 'Open the app from your Home Screen to enable alerts' },
  ];

  return (
    <BannerShell leaving={leaving} onClose={() => dismiss(false)}>
      {/* Icon + eyebrow */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative w-11 h-11 bg-ember-gradient rounded-2xl flex items-center justify-center shadow-lg shrink-0">
          <Smartphone size={20} className="text-white" />
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-ember-500 rounded-full border-2 border-line">
            <span className="absolute inset-0 bg-ember-400 rounded-full animate-ping opacity-75" />
          </span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 backdrop-blur-md border border-line text-[9px] font-black uppercase tracking-[0.25em] text-mute">
          <Zap size={9} className="text-ember-400" />
          Enable Notifications
        </div>
      </div>

      <h3 className="text-xl font-black text-white tracking-tighter leading-tight mb-1.5">
        Install for<br />Live Tracking Alerts.
      </h3>
      <p className="text-sm font-medium text-mute leading-relaxed mb-5">
        iOS requires the app to be on your Home Screen to send notifications. It only takes a few seconds.
      </p>

      {/* Step-by-step guide */}
      <div className="space-y-3 mb-5">
        {steps.map(({ icon: Icon, text }, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="shrink-0 w-7 h-7 rounded-xl bg-white/[0.06] border border-line flex items-center justify-center">
              <Icon size={13} className="text-mute" />
            </div>
            <p className="text-xs font-bold text-mute leading-relaxed pt-0.5">{text}</p>
          </div>
        ))}
      </div>

      {/* The downward-pointing arrow cue toward Safari's toolbar */}
      <div className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-ember-500/10 border border-ember-500/20 mb-4">
        <Share size={14} className="text-ember-400 shrink-0" />
        <span className="text-xs font-black text-orange-600 uppercase tracking-wider">
          Look for the Share icon below ↓
        </span>
      </div>

      <button
        onClick={() => dismiss(true)}
        className="w-full py-3 rounded-[1.25rem] font-black text-xs uppercase tracking-widest text-dim hover:text-mute hover:bg-white/[0.06] transition-all"
      >
        Maybe Later
      </button>
    </BannerShell>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function NotificationBanner() {
  const { user }       = useAuth();
  const { permission } = useNotificationPermission();
  const [mode, setMode] = useState(null); // null | 'permission' | 'ios-install'

  useEffect(() => {
    if (!user) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'granted' || stored === 'never') return;

    const ios = detectIOS();
    const pwa = detectPWA();

    // iOS in a regular browser tab — Notification API is not available
    if (ios && !pwa) {
      // Show the install guide (slightly longer delay so the page settles)
      const t = setTimeout(() => setMode('ios-install'), 2200);
      return () => clearTimeout(t);
    }

    // All other environments where the API is available
    if (isNotificationSupported() && permission === 'default') {
      const t = setTimeout(() => setMode('permission'), 1800);
      return () => clearTimeout(t);
    }
  }, [user, permission]);

  // If permission was granted elsewhere, persist, register push, and hide.
  useEffect(() => {
    if (permission === 'granted') {
      localStorage.setItem(STORAGE_KEY, 'granted');
      enablePush().catch(() => {});
      setMode(null);
    }
  }, [permission]);

  function handleDismiss(permanent) {
    localStorage.setItem(STORAGE_KEY, permanent ? 'never' : 'dismissed');
    setMode(null);
  }

  if (!mode) return null;

  if (mode === 'ios-install') return <IOSInstallBanner onDismiss={handleDismiss} />;
  return <PermissionBanner onDismiss={handleDismiss} />;
}
