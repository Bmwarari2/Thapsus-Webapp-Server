/**
 * routes/push.js — Web Push subscription management for the PWA.
 *
 *   GET  /api/push/public-key   → VAPID public key (so the client can subscribe)
 *   POST /api/push/subscribe    → store a PushSubscription for the user
 *   POST /api/push/unsubscribe  → remove a subscription by endpoint
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';
import { getVapidPublicKey, webPushConfigured } from '../utils/webpush.js';

const router = express.Router();

/** Public — the client needs this before it can call PushManager.subscribe(). */
router.get('/public-key', (req, res) => {
  res.json({ success: true, publicKey: getVapidPublicKey(), enabled: webPushConfigured() });
});

/** Store (or refresh) a subscription. Endpoint is unique → upsert on it. */
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ success: false, message: 'Invalid subscription' });
    }
    await req.db.query(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (endpoint) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             p256dh  = EXCLUDED.p256dh,
             auth    = EXCLUDED.auth,
             user_agent = EXCLUDED.user_agent`,
      [uuidv4(), req.user.id, endpoint, keys.p256dh, keys.auth,
       (req.headers['user-agent'] || '').slice(0, 300)]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('POST /push/subscribe error:', err);
    res.status(500).json({ success: false, message: 'Failed to save subscription' });
  }
});

/** Remove a subscription (user disabled notifications or rotated endpoint). */
router.post('/unsubscribe', authMiddleware, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ success: false, message: 'endpoint required' });
    await req.db.query(
      `DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`,
      [endpoint, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('POST /push/unsubscribe error:', err);
    res.status(500).json({ success: false, message: 'Failed to remove subscription' });
  }
});

export default router;
