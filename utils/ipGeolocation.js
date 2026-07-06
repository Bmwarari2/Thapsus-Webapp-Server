/**
 * utils/ipGeolocation.js — coarse, privacy-preserving visitor geolocation.
 *
 * Used by the influencer link tracker to estimate where a link-open came
 * from. We resolve the visitor's IP to country/region/city via a free,
 * no-key service (ipwho.is) and cache the result; we then store ONLY the
 * coarse location + a salted hash of the IP (for unique-visitor counting).
 * The raw IP is never persisted — consistent with the app's DSAR/GDPR posture.
 *
 * If a CDN/proxy already provides a country header (e.g. Cloudflare's
 * `cf-ipcountry`), we use it as a zero-latency fast path. All lookups are
 * best-effort: a failure or timeout yields nulls and never blocks a request.
 */
import crypto from 'node:crypto';

const IP_HASH_SECRET = process.env.IP_HASH_SECRET || process.env.JWT_SECRET || 'thapsus-ip-salt';
const LOOKUP_TIMEOUT_MS = Number.parseInt(process.env.GEO_LOOKUP_TIMEOUT_MS || '2000', 10);
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — a client's city rarely moves within a day

// Simple in-memory TTL cache keyed by IP.
const cache = new Map(); // ip -> { at, value }

/** Best-effort client IP. Express sets req.ip from X-Forwarded-For (trust proxy=1). */
export function getClientIp(req) {
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) {
    const first = xff.split(',')[0].trim();
    if (first) return normaliseIp(first);
  }
  return normaliseIp(req.ip || req.socket?.remoteAddress || '');
}

function normaliseIp(ip) {
  if (!ip) return '';
  // Strip IPv6-mapped IPv4 prefix and any :port.
  return String(ip).replace(/^::ffff:/, '').trim();
}

/** Salted SHA-256 of the IP — lets us count unique visitors without storing PII. */
export function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(`${IP_HASH_SECRET}:${ip}`).digest('hex');
}

function isPrivateOrLocal(ip) {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  // RFC1918 + link-local + CGNAT.
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip);
}

/** Coarse device class from the User-Agent string. */
export function parseDeviceType(userAgent = '') {
  const ua = String(userAgent).toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry/.test(ua)) return 'mobile';
  if (!ua) return 'unknown';
  return 'desktop';
}

/** Country-only fast path from common CDN/proxy headers. */
export function geoFromHeaders(req) {
  const cc = req.headers?.['cf-ipcountry'] || req.headers?.['x-vercel-ip-country'] || req.headers?.['x-geo-country'];
  if (typeof cc === 'string' && /^[A-Z]{2}$/i.test(cc) && cc.toUpperCase() !== 'XX') {
    return { country_code: cc.toUpperCase(), country: null, region: null, city: null, latitude: null, longitude: null };
  }
  return null;
}

/**
 * Resolve an IP to coarse location. Returns
 * { country, country_code, region, city, latitude, longitude } — any field
 * may be null. Never throws.
 */
export async function lookupGeo(ip) {
  const empty = { country: null, country_code: null, region: null, city: null, latitude: null, longitude: null };
  try {
    const clean = normaliseIp(ip);
    if (!clean || isPrivateOrLocal(clean)) return empty;

    const cached = cache.get(clean);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    let value = empty;
    try {
      const res = await fetch(`https://ipwho.is/${encodeURIComponent(clean)}`, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (res.ok) {
        const j = await res.json();
        if (j && j.success !== false) {
          value = {
            country: j.country || null,
            country_code: j.country_code || null,
            region: j.region || null,
            city: j.city || null,
            latitude: typeof j.latitude === 'number' ? j.latitude : null,
            longitude: typeof j.longitude === 'number' ? j.longitude : null,
          };
        }
      }
    } finally {
      clearTimeout(timer);
    }

    if (cache.size > 5000) cache.clear();
    cache.set(clean, { at: Date.now(), value });
    return value;
  } catch {
    return empty;
  }
}

export default { getClientIp, hashIp, lookupGeo, parseDeviceType, geoFromHeaders };
