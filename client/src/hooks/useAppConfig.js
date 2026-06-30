/**
 * useAppConfig
 *
 * Fetches the public runtime config exposed at GET /api/app-config — the small
 * bag of operational constants (support WhatsApp number/email, warehouse code,
 * OTP length…) that ops can rotate via env vars without shipping a new build.
 *
 * The response is cached on the server for 5 minutes, so a plain fetch per
 * mount is cheap. We also keep the last good value in a module-level cache so
 * navigating between pages doesn't re-flash the fallback.
 *
 * Falls back to the same defaults the server uses, so buttons keep working
 * even if the request fails or is in flight.
 */
import { useState, useEffect } from 'react';
import { appConfigApi } from '../api';

// Mirror of routes/appConfig.js defaults — keeps UI usable before the
// network call resolves and if the endpoint is unreachable.
const FALLBACK_CONFIG = {
  warehouse_code: 'STK-01',
  sku_prefix: 'STK',
  support_whatsapp: '447424531483',
  support_email: 'support@thapsus.uk',
  otp_length: 6,
};

// Shared across hook instances so we fetch once per session.
let cachedConfig = null;
let inflight = null;

export function useAppConfig() {
  const [config, setConfig] = useState(cachedConfig || FALLBACK_CONFIG);

  useEffect(() => {
    let active = true;
    if (cachedConfig) return;

    inflight = inflight || appConfigApi.get();
    inflight
      .then((res) => {
        const fetched = res?.data?.config;
        if (fetched) cachedConfig = { ...FALLBACK_CONFIG, ...fetched };
        if (active && cachedConfig) setConfig(cachedConfig);
      })
      .catch(() => {
        // Keep the fallback — nothing to do.
      })
      .finally(() => {
        inflight = null;
      });

    return () => { active = false; };
  }, []);

  return config;
}

export default useAppConfig;
