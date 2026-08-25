// routes/mediaRedirect.js
//
// GET /m/:token — the public end of the short media links we send on
// WhatsApp (see utils/mediaLink.js). Verifies the HMAC, mints a fresh
// short-lived Supabase signed URL and 302s to it.
//
// Deliberately unauthenticated: the token IS the credential. It is an
// unguessable HMAC over the object path, the redirect target lives for
// ten minutes, and the route sits behind the public rate limiter in
// server.js. Same shape as the receipt redirect next door.

import express from 'express';
import { logRouteError } from '../utils/errorLogger.js';
import { MEDIA_BUCKET, parseMediaToken, verifyMediaToken } from '../utils/mediaLink.js';
import { createSignedDownloadUrl } from '../utils/supabaseAdmin.js';

const router = express.Router();

const SIGNED_URL_TTL_SECONDS = 600;

function notFound(res) {
  // One response for a bad signature, a deleted object and a mistyped
  // token alike — nothing here reveals which paths exist.
  return res.status(404).type('html').send(
    '<!doctype html><meta charset="utf-8"><title>Attachment not found</title>'
    + '<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">'
    + '<h1 style="font-size:1.25rem">This attachment link is not valid</h1>'
    + '<p>It may have been mistyped, or the file may have been removed. '
    + 'Message us on WhatsApp and we will send it again.</p>'
  );
}

router.get('/:token', async (req, res) => {
  try {
    const parsed = parseMediaToken(req.params.token);
    if (!parsed) return notFound(res);
    if (!verifyMediaToken(parsed.path, parsed.signature)) return notFound(res);

    const signed = await createSignedDownloadUrl(MEDIA_BUCKET, parsed.path, SIGNED_URL_TTL_SECONDS);
    if (!signed?.signedUrl) return notFound(res);

    // No-store: the target expires, so a cached 302 would rot.
    res.set('Cache-Control', 'no-store');
    return res.redirect(302, signed.signedUrl);
  } catch (err) {
    logRouteError(req, res, err, 'GET /m/:token');
    return notFound(res);
  }
});

export default router;
