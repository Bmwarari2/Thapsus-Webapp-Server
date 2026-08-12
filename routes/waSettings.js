// routes/waSettings.js
//
// Admin API for the WhatsApp flow settings: quote markup %, the promo
// toggle (waive last-mile fee / discount messaging), the default delivery
// fee, welcome media, and the sent.dm template map.

import express from 'express';
import { authMiddleware, isAdmin } from '../middleware/auth.js';
import { logRouteError } from '../utils/errorLogger.js';
import { getWaSettings, invalidateWaSettings } from '../utils/waSettings.js';

const router = express.Router();

/** GET /api/wa/settings */
router.get('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const settings = await getWaSettings(req.db);
    res.json({ success: true, settings });
  } catch (err) {
    logRouteError(req, res, err, 'GET /api/wa/settings');
    res.status(500).json({ success: false, message: 'Failed to load settings' });
  }
});

/** PUT /api/wa/settings — upsert whitelisted keys. */
router.put('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const updates = [];

    if (body.markup_pct !== undefined) {
      const v = Number(body.markup_pct);
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        return res.status(400).json({ success: false, message: 'markup_pct must be 0–100' });
      }
      updates.push(['markup_pct', String(v)]);
    }
    if (body.promo_active !== undefined) {
      updates.push(['promo_active', body.promo_active === true ? 'true' : 'false']);
    }
    if (body.promo_type !== undefined) {
      if (!['waive_fee', 'discount'].includes(body.promo_type)) {
        return res.status(400).json({ success: false, message: "promo_type must be 'waive_fee' or 'discount'" });
      }
      updates.push(['promo_type', body.promo_type]);
    }
    if (body.promo_message !== undefined) {
      if (typeof body.promo_message !== 'string' || body.promo_message.length > 500) {
        return res.status(400).json({ success: false, message: 'promo_message must be a string (max 500 chars)' });
      }
      updates.push(['promo_message', body.promo_message.trim()]);
    }
    if (body.default_delivery_fee_kes !== undefined) {
      const v = Number(body.default_delivery_fee_kes);
      if (!Number.isFinite(v) || v < 0 || v > 100_000) {
        return res.status(400).json({ success: false, message: 'default_delivery_fee_kes must be 0–100000' });
      }
      updates.push(['default_delivery_fee_kes', String(Math.round(v))]);
    }
    if (body.welcome_media_urls !== undefined) {
      if (!Array.isArray(body.welcome_media_urls)
          || body.welcome_media_urls.some((u) => typeof u !== 'string' || !/^https:\/\//.test(u) || u.length > 2048)
          || body.welcome_media_urls.length > 5) {
        return res.status(400).json({ success: false, message: 'welcome_media_urls must be up to 5 https URLs' });
      }
      updates.push(['welcome_media_urls', JSON.stringify(body.welcome_media_urls)]);
    }
    if (body.template_map !== undefined) {
      if (typeof body.template_map !== 'object' || body.template_map === null || Array.isArray(body.template_map)
          || Object.entries(body.template_map).some(([k, v]) =>
              typeof v !== 'string' || k.length > 64 || v.length > 128)) {
        return res.status(400).json({ success: false, message: 'template_map must be a {key: templateName} object' });
      }
      updates.push(['template_map', JSON.stringify(body.template_map)]);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No recognized settings in body' });
    }
    for (const [key, value] of updates) {
      await req.db.query(
        `INSERT INTO wa_settings (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
        [key, value, req.user.id]
      );
    }
    invalidateWaSettings();
    const settings = await getWaSettings(req.db);
    res.json({ success: true, settings });
  } catch (err) {
    logRouteError(req, res, err, 'PUT /api/wa/settings');
    res.status(500).json({ success: false, message: 'Failed to save settings' });
  }
});

export default router;
