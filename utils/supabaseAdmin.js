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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let _client = null;

export function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return null;
  }
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
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
