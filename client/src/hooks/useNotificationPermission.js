/**
 * useNotificationPermission
 *
 * Manages the browser Notification API lifecycle:
 *   - Tracks the current permission state ('default' | 'granted' | 'denied')
 *   - Exposes requestPermission() to trigger the native browser prompt
 *   - Exposes notify(title, options) to fire a branded browser notification
 *
 * Does NOT handle the UI prompt — that is delegated to <NotificationBanner />.
 */
import { useState, useEffect, useCallback } from 'react';

const APP_ICON = '/logo.png'; // adjust if your favicon lives elsewhere

/** True when the browser supports the Notifications API */
export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function useNotificationPermission() {
  const [permission, setPermission] = useState(() => {
    if (!isNotificationSupported()) return 'unsupported';
    return Notification.permission;           // 'default' | 'granted' | 'denied'
  });

  // Keep in sync if the user changes permissions in the browser settings
  useEffect(() => {
    if (!isNotificationSupported()) return;
    const sync = () => setPermission(Notification.permission);
    // visibilitychange is the most reliable cross-browser hook for this
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  /**
   * Trigger the native browser permission dialog.
   * Returns the resulting PermissionState string.
   */
  const requestPermission = useCallback(async () => {
    if (!isNotificationSupported()) return 'unsupported';
    try {
      // Safari uses the callback form; modern browsers return a promise
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch {
      // Fallback for very old Safari
      return new Promise((resolve) => {
        Notification.requestPermission((res) => {
          setPermission(res);
          resolve(res);
        });
      });
    }
  }, []);

  /**
   * Fire a branded browser notification.
   * Silently no-ops if permission is not 'granted'.
   *
   * @param {string} title
   * @param {{ body?: string, tag?: string, url?: string }} options
   */
  const notify = useCallback((title, options = {}) => {
    if (!isNotificationSupported() || Notification.permission !== 'granted') return;

    const { url, ...rest } = options;
    const n = new Notification(title, {
      icon: APP_ICON,
      badge: APP_ICON,
      ...rest,
    });

    if (url) {
      n.onclick = () => {
        window.focus();
        window.location.href = url;
        n.close();
      };
    }
  }, []);

  return { permission, requestPermission, notify };
}
