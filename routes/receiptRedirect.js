// routes/receiptRedirect.js
//
// GET /r/:token — the public end of the short receipt links we send on
// WhatsApp (see utils/receiptLink.js). Verifies the HMAC, mints a fresh
// short-lived Supabase signed URL and 302s to it, so the customer taps a
// 45-character link and lands on their PDF.
//
// Deliberately unauthenticated: the token IS the credential. It's an
// unguessable HMAC, the redirect target lives for 10 minutes, and the
// route is behind the public tracking rate limiter in server.js.

import express from 'express';
import { logRouteError } from '../utils/errorLogger.js';
import { parseReceiptToken, verifyReceiptToken } from '../utils/receiptLink.js';
import { createSignedDownloadUrl } from '../utils/supabaseAdmin.js';

const router = express.Router();

const SIGNED_URL_TTL_SECONDS = 600;

function notFound(res) {
  // Same response for a bad signature, an unknown code and a receipt
  // that hasn't been generated — nothing here confirms which codes exist.
  return res.status(404).type('html').send(
    '<!doctype html><meta charset="utf-8"><title>Receipt not found</title>'
    + '<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">'
    + '<h1 style="font-size:1.25rem">This receipt link is not valid</h1>'
    + '<p>It may have been mistyped or replaced by a newer one. '
    + 'Message us on WhatsApp with your tracking code and we will send it again.</p>'
  );
}

router.get('/:token', async (req, res) => {
  try {
    const parsed = parseReceiptToken(req.params.token);
    if (!parsed) return notFound(res);

    const { rows } = await req.db.query(
      `SELECT id, receipt_path FROM wa_orders WHERE tracking_code = $1`,
      [parsed.trackingCode]
    );
    const order = rows[0];
    if (!order || !order.receipt_path) return notFound(res);
    if (!verifyReceiptToken(order.id, parsed.signature)) return notFound(res);

    const signed = await createSignedDownloadUrl('receipts', order.receipt_path, SIGNED_URL_TTL_SECONDS);
    if (!signed?.signedUrl) return notFound(res);

    // No-store: the redirect target expires, so a cached 302 would rot.
    res.set('Cache-Control', 'no-store');
    return res.redirect(302, signed.signedUrl);
  } catch (err) {
    logRouteError(req, res, err, 'GET /r/:token');
    return notFound(res);
  }
});

export default router;
