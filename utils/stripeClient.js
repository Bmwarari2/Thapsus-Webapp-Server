// utils/stripeClient.js
// Lazy-initialised Stripe SDK singleton. The secret key is read from env at
// first use so the boot doesn't crash if STRIPE_SECRET_KEY is missing
// (route handlers return 503 instead). Test/live key parity: any sk_test_*
// or sk_live_* works — the publishable key the iOS client uses must come
// from the same mode (see /api/config/stripe).

import Stripe from 'stripe';

let _stripe = null;

export function getStripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }
  _stripe = new Stripe(key, {
    apiVersion: '2024-11-20.acacia',
    typescript: false,
    appInfo: { name: 'thapsus-cargo', version: '1.0.0' },
  });
  return _stripe;
}

export function stripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET || null;
}

/** Publishable key surfaced to the iOS / web clients via /api/config/stripe. */
export function stripePublishableKey() {
  return process.env.STRIPE_PUBLISHABLE_KEY || null;
}
