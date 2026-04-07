/**
 * NotificationBanner
 *
 * A glassmorphic slide-up card that asks the user to grant browser notification
 * permission. Follows the Thapsus Cargo liquid-glass design system:
 *   - animate-morph background blob
 *   - bg-white/40 backdrop-blur-2xl crystal border
 *   - glass-sheen on the primary CTA
 *   - #0f172a / orange-500 brand palette
 *
 * Visibility rules (stored in localStorage):
 *   tc_notif_state = 'granted'   → never show  (permission already given)
 *   tc_notif_state = 'dismissed' → hide for this session, show next visit
 *   tc_notif_state = 'never'     → never show  (user explicitly declined)
 *   (absent)                     → show the prompt
 */
import React, { useState, useEffect } from 'react';
import { Bell, X, BellOff, Zap } from 'lucide-react';
import { useNotificationPermission, isNotificationSupported } from '../hooks/useNotificationPermission';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'tc_notif_state';

export function NotificationBanner() {
  const { user } = useAuth();
  const { permission, requestPermission } = useNotificationPermission();
  const [visible, setVisible]   = useState(false);
  const [leaving, setLeaving]   = useState(false);   // triggers slide-out animation
  const [loading, setLoading]   = useState(false);

  // Decide whether to surface the banner
  useEffect(() => {
    if (!user) return;                                   // only for logged-in users
    if (!isNotificationSupported()) return;              // browser doesn't support it
    if (permission === 'granted' || permission === 'denied') return; // already decided

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'granted' || stored === 'never') return;
    // 'dismissed' or absent → show after a brief delay so the page renders first
    const t = setTimeout(() => setVisible(true), 1800);
    return () => clearTimeout(t);
  }, [user, permission]);

  // Also hide if the user granted permission elsewhere (e.g. browser settings)
  useEffect(() => {
    if (permission === 'granted') {
      localStorage.setItem(STORAGE_KEY, 'granted');
      dismiss();
    }
  }, [permission]);

  function dismiss(permanent = false) {
    setLeaving(true);
    localStorage.setItem(STORAGE_KEY, permanent ? 'never' : 'dismissed');
    setTimeout(() => setVisible(false), 400);          // wait for slide-out
  }

  async function handleAllow() {
    setLoading(true);
    const result = await requestPermission();
    setLoading(false);
    if (result === 'granted') {
      localStorage.setItem(STORAGE_KEY, 'granted');
    } else if (result === 'denied') {
      localStorage.setItem(STORAGE_KEY, 'never');
    }
    // Either way, dismiss the banner
    dismiss(result === 'denied');
  }

  if (!visible) return null;

  return (
    <>
      {/* Inline styles for animations — same keyframes used elsewhere in the app */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(120%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes slideDown {
          from { transform: translateY(0);    opacity: 1; }
          to   { transform: translateY(120%); opacity: 0; }
        }
        @keyframes morphBanner {
          0%   { transform: translate(0,0)       scale(1);   }
          33%  { transform: translate(20px,-30px) scale(1.1);}
          66%  { transform: translate(-15px,15px) scale(0.9);}
          100% { transform: translate(0,0)       scale(1);   }
        }
        @keyframes sheen {
          0%   { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(200%)  skewX(-15deg); }
        }
        .banner-slide-up   { animation: slideUp   0.4s cubic-bezier(0.16,1,0.3,1) forwards; }
        .banner-slide-down { animation: slideDown 0.35s cubic-bezier(0.4,0,1,1)   forwards; }
        .banner-morph      { animation: morphBanner 14s ease-in-out infinite; }
        .banner-sheen      { position: relative; overflow: hidden; }
        .banner-sheen::after {
          content: '';
          position: absolute; top: 0; left: 0; width: 50%; height: 100%;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.35), transparent);
          animation: sheen 3.5s infinite;
        }
      `}</style>

      {/* Fixed anchor — bottom-right on desktop, bottom-center on mobile */}
      <div className="fixed bottom-6 right-6 left-6 md:left-auto md:max-w-sm z-[9999] pointer-events-none">
        <div className={`pointer-events-auto ${leaving ? 'banner-slide-down' : 'banner-slide-up'}`}>

          {/* Glass card */}
          <div className="relative overflow-hidden rounded-[2rem] bg-white/50 backdrop-blur-2xl border border-white/50 shadow-[0_24px_64px_-12px_rgba(15,23,42,0.18)]">

            {/* Liquid background blob */}
            <div className="absolute top-[-30%] right-[-20%] w-48 h-48 bg-orange-300/40 blur-[60px] rounded-full banner-morph pointer-events-none" />
            <div className="absolute bottom-[-20%] left-[-10%] w-36 h-36 bg-blue-300/30 blur-[50px] rounded-full banner-morph pointer-events-none" style={{ animationDelay: '4s' }} />
            {/* Subtle gradient sheen overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />

            <div className="relative z-10 p-6">

              {/* Close button */}
              <button
                onClick={() => dismiss(false)}
                aria-label="Dismiss"
                className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-xl bg-slate-100/70 hover:bg-slate-200/80 text-slate-400 hover:text-slate-600 transition-all"
              >
                <X size={14} />
              </button>

              {/* Icon + eyebrow */}
              <div className="flex items-center gap-3 mb-4">
                <div className="relative w-11 h-11 bg-[#0f172a] rounded-2xl flex items-center justify-center shadow-lg shrink-0">
                  <Bell size={20} className="text-white" />
                  {/* Ping dot */}
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-orange-500 rounded-full border-2 border-white">
                    <span className="absolute inset-0 bg-orange-400 rounded-full animate-ping opacity-75" />
                  </span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 backdrop-blur-md border border-white/60 text-[9px] font-black uppercase tracking-[0.25em] text-slate-500">
                  <Zap size={9} className="text-orange-500" />
                  Live Shipment Alerts
                </div>
              </div>

              {/* Headline */}
              <h3 className="text-xl font-black text-[#0f172a] tracking-tighter leading-tight mb-1.5">
                Never Miss a<br />Status Update.
              </h3>
              <p className="text-sm font-medium text-slate-500 leading-relaxed mb-5">
                Get instant browser alerts when your package moves — from warehouse receipt to your door.
              </p>

              {/* Actions */}
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={handleAllow}
                  disabled={loading}
                  className="banner-sheen w-full bg-[#0f172a] hover:bg-slate-800 disabled:opacity-60 text-white py-3.5 rounded-[1.25rem] font-black text-xs uppercase tracking-widest transition-all shadow-lg hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2"
                >
                  <Bell size={14} />
                  {loading ? 'Requesting…' : 'Allow Notifications'}
                </button>

                <button
                  onClick={() => dismiss(false)}
                  className="w-full py-3 rounded-[1.25rem] font-black text-xs uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-100/60 transition-all flex items-center justify-center gap-2"
                >
                  <BellOff size={13} />
                  Not Right Now
                </button>
              </div>

              {/* Fine-print */}
              <p className="mt-4 text-center text-[9px] text-slate-300 font-bold leading-relaxed">
                You can change this anytime in your browser settings.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
