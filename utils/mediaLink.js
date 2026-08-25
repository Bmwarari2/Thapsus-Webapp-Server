// utils/mediaLink.js
//
// Short links for the media we send out, the same trick receipts use.
//
// A Supabase signed URL for an outbox image is ~600 characters, most of
// it JWT. Sent to a customer on WhatsApp it arrives as a wall of
// underlined text taller than the photo it points at, and it expires,
// so a message read a week later leads nowhere. Instead we send
//
//     https://thapsus.uk/m/b3V0Ym94LzE3ODc2ODA2NTA0MDgtSU1HXzAyMjQucG5n.k3n9x2qp4a
//
// and routes/mediaRedirect.js mints a fresh signature at click time.
//
// Stateless, like receiptLink: the token is the storage path plus a
// truncated HMAC over it, so there is no column to migrate and nothing
// to clean up when a message is deleted. The HMAC is what stops the
// token being a way to read any object in the bucket — only paths we
// signed resolve, and rotating JWT_SECRET invalidates every link.

import crypto from 'crypto';
import { publicBaseUrl } from './receiptLink.js';

const SECRET = process.env.JWT_SECRET || '';
const SIG_LEN = 12; // base64url chars ≈ 72 bits

// One bucket only. The token carries a path, and a path with no bucket
// pinned to it would let a valid signature reach anywhere the service
// key can — receipts included.
export const MEDIA_BUCKET = 'wa-media';

function signature(path) {
  return crypto.createHmac('sha256', SECRET)
    .update(`wa-media:${path}`)
    .digest('base64url')
    .slice(0, SIG_LEN);
}

/**
 * @param {string} path  object path inside the wa-media bucket
 * @returns {string|null} the short URL, or null without a secret or path
 */
export function mediaShortUrl(path) {
  const token = mediaToken(path);
  return token ? `${publicBaseUrl()}/m/${token}` : null;
}

/** `<base64url(path)>.<sig>`, with no origin in front. */
export function mediaToken(path) {
  const p = String(path || '').trim();
  if (!p || !SECRET) return null;
  return `${Buffer.from(p, 'utf8').toString('base64url')}.${signature(p)}`;
}

/**
 * Split a token back into its parts. Returns null on anything malformed
 * so the route can 404 without touching Supabase.
 */
export function parseMediaToken(token) {
  const m = /^([A-Za-z0-9_-]{4,512})\.([A-Za-z0-9_-]{8,64})$/.exec(String(token || ''));
  if (!m) return null;
  let path;
  try {
    path = Buffer.from(m[1], 'base64url').toString('utf8');
  } catch { return null; }
  // A decoded path must look like one. Traversal and absolute paths are
  // rejected before the HMAC is even consulted.
  if (!path || path.length > 300 || path.includes('..') || path.startsWith('/')) return null;
  if (!/^[\w.\-/ ()]+$/.test(path)) return null;
  return { path, signature: m[2] };
}

/** Constant-time check that `sig` belongs to `path`. */
export function verifyMediaToken(path, sig) {
  if (!SECRET || !path || !sig) return false;
  const expected = Buffer.from(signature(path));
  const given = Buffer.from(String(sig));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
