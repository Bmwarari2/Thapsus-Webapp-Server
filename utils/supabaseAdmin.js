// utils/supabaseAdmin.js
//
// Service-role Supabase client for server-only operations:
//   - issuing signed-upload URLs (POST /agent-invoices/upload-url)
//   - issuing signed-download URLs (GET /agent-invoices/:id/document-url)
//
// SUPABASE_SERVICE_KEY is the project's service_role JWT (Supabase Dashboard
// → Project Settings → API → service_role key). It bypasses RLS, so this
// module MUST NOT be imported into any route that runs under user
// credentials — the Express layer is responsible for vetting the caller's
// role/identity before invoking these helpers.
//
// Lazy-loaded: if SUPABASE_SERVICE_KEY is not set we don't crash on boot;
// the calling route surfaces a clean 503 instead. This lets the PR ship the
// migration + new endpoints without taking down environments where the
// service key has not been provisioned yet.

import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let _client = null;

export function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return null;
  }
  if (!_client) {
    // supabase-js >=2.45 always boots a RealtimeClient inside createClient,
    // even when the caller only uses storage / PostgREST. On Node < 22
    // there's no global WebSocket, so the realtime constructor throws
    // "Suggested solution: For Node.js < 22, install 'ws' package and
    // provide it via the transport option" and the whole createClient
    // call rejects — which means EVERY consumer of getSupabaseAdmin
    // (signed upload URLs, signed download URLs for POD photos / agent
    // invoices / ticket attachments) silently fails. Railway currently
    // runs Node 20, so we hit this on every POD fetch. Pass the `ws`
    // package as the realtime transport so the constructor finds a
    // WebSocket implementation regardless of Node version.
    //
    // We never actually open a realtime channel from the admin client —
    // the only reason the transport matters is the constructor's eager
    // check. The `ws` Node module is only loaded on the server, never
    // bundled into the React client.
    _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WebSocket }
    });
  }
  return _client;
}

/**
 * Hands out a signed URL the caller can PUT bytes to without a Supabase JWT.
 * Used by the iOS clearing-agent invoice upload flow to bypass storage RLS
 * entirely (the bucket is private; only the service role can mint these
 * signed-upload URLs). 5-minute TTL by default.
 */
export async function createSignedUploadUrl(bucket, path) {
  const sb = getSupabaseAdmin();
  if (!sb) {
    throw new Error('Supabase admin client not configured (SUPABASE_SERVICE_KEY missing)');
  }
  const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(path);
  if (error) throw error;
  return data; // { signedUrl, token, path }
}

/**
 * Hands out a short-lived signed download URL for a path inside a private
 * bucket. expiresInSeconds defaults to 300 (5 minutes), enough for the
 * client to download the PDF for rendering without leaking a long-lived
 * URL into logs / screenshots.
 */
export async function createSignedDownloadUrl(bucket, path, expiresInSeconds = 300) {
  const sb = getSupabaseAdmin();
  if (!sb) {
    throw new Error('Supabase admin client not configured (SUPABASE_SERVICE_KEY missing)');
  }
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data; // { signedUrl }
}

/**
 * Defence-in-depth filename sanitiser for the upload endpoints that
 * accept a `filename` from the client (tickets, agent-invoices). The
 * bucket-level `file_size_limit` + `allowed_mime_types` (migration
 * 036) are the primary controls; this just keeps weird characters
 * and pathological lengths out of storage paths.
 *
 *   - drops anything outside `[a-zA-Z0-9._-]`
 *   - strips leading `.` so the result can't be a hidden file
 *   - caps total length at 100 chars; long tails are truncated
 *   - falls back to the supplied default if the input collapses to empty
 */
export function sanitizeUploadFilename(rawFilename, fallback) {
  const cleaned = String(rawFilename || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 100);
  return cleaned || fallback;
}

/**
 * Strips the bucket prefix off a stored doc_url, returning the in-bucket
 * path the Supabase signing API expects. Handles both:
 *   - public URLs:  https://{ref}.supabase.co/storage/v1/object/public/agent-invoices/<path>
 *   - already-relative paths: <agentId>/<ts>.pdf
 *
 * Returns null if the URL is for a different bucket / not parseable.
 */
export function extractAgentInvoicePath(docUrl) {
  if (!docUrl) return null;
  if (!docUrl.includes('://')) return docUrl; // already a relative path
  const marker = '/agent-invoices/';
  const idx = docUrl.indexOf(marker);
  if (idx === -1) return null;
  return docUrl.slice(idx + marker.length);
}
