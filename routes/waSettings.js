// routes/waSettings.js
//
// Admin API for the WhatsApp flow settings: quote markup %, the FX
// buffer, the promo toggle (waive last-mile fee / discount messaging),
// the default delivery fee, welcome media, and the sent.dm template map.

import express from 'express';
import { authMiddleware, isAdmin } from '../middleware/auth.js';
import { logRouteError } from '../utils/errorLogger.js';
import { getWaSettings, invalidateWaSettings } from '../utils/waSettings.js';
import {
  sentDmConfigured, SentDmError,
  listWebhooks, listWebhookEvents, createWebhook,
  updateWebhookUrl, activateWebhook, fetchMessageActivities, businessWhatsAppNumber,
} from '../utils/sentdm.js';
import { aiSelfTest } from '../utils/waAi.js';
import { staffAlertHealth } from '../utils/waStaffAlert.js';

const router = express.Router();

/**
 * The URL sent.dm must deliver to. Built from SITE_URL/FRONTEND_URL with
 * the host normalized to the apex — Railway serves the apex custom domain
 * only, so a www-registered webhook dies with no HTTP response.
 */
function expectedWebhookUrl() {
  const base = process.env.SITE_URL || process.env.FRONTEND_URL || process.env.APP_URL || 'https://thapsus.uk';
  try {
    const u = new URL(base);
    u.hostname = u.hostname.replace(/^www\./i, '');
    return `${u.origin}/api/wa/webhook`;
  } catch {
    return 'https://thapsus.uk/api/wa/webhook';
  }
}

/** GET /api/wa/settings */
router.get('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const settings = await getWaSettings(req.db);
    res.json({
      success: true,
      settings,
      // Environment capabilities the dashboard adapts to.
      capabilities: {
        stk_available: String(process.env.MPESA_PROVIDER || 'manual').toLowerCase().trim() === 'lipana',
        mpesa_till: process.env.MPESA_TILL_NUMBER || null,
      },
    });
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
    if (body.quote_validity_days !== undefined) {
      const v = Number(body.quote_validity_days);
      if (!Number.isFinite(v) || v < 1 || v > 90) {
        return res.status(400).json({ success: false, message: 'quote_validity_days must be 1–90' });
      }
      updates.push(['quote_validity_days', String(Math.round(v))]);
    }
    if (body.fx_buffer_pct !== undefined) {
      const v = Number(body.fx_buffer_pct);
      if (!Number.isFinite(v) || v < 0 || v > 25) {
        return res.status(400).json({ success: false, message: 'fx_buffer_pct must be 0–25' });
      }
      updates.push(['fx_buffer_pct', String(v)]);
    }
    if (body.nudges_enabled !== undefined) {
      updates.push(['nudges_enabled', body.nudges_enabled === true ? 'true' : 'false']);
    }
    if (body.welcome_media_urls !== undefined) {
      if (!Array.isArray(body.welcome_media_urls)
          || body.welcome_media_urls.some((u) => typeof u !== 'string' || !/^https:\/\//.test(u) || u.length > 2048)
          || body.welcome_media_urls.length > 5) {
        return res.status(400).json({ success: false, message: 'welcome_media_urls must be up to 5 https URLs' });
      }
      updates.push(['welcome_media_urls', JSON.stringify(body.welcome_media_urls)]);
    }
    if (body.ai_enabled !== undefined) {
      updates.push(['ai_enabled', body.ai_enabled === true ? 'true' : 'false']);
    }
    if (body.ai_knowledge_base !== undefined) {
      if (typeof body.ai_knowledge_base !== 'string' || body.ai_knowledge_base.length > 20_000) {
        return res.status(400).json({ success: false, message: 'ai_knowledge_base must be a string (max 20000 chars)' });
      }
      updates.push(['ai_knowledge_base', body.ai_knowledge_base.trim()]);
    }
    if (body.ai_resume_after_minutes !== undefined) {
      const v = Number(body.ai_resume_after_minutes);
      if (!Number.isFinite(v) || v < 1 || v > 10_080) {
        return res.status(400).json({ success: false, message: 'ai_resume_after_minutes must be 1–10080 (a week)' });
      }
      updates.push(['ai_resume_after_minutes', String(Math.round(v))]);
    }
    if (body.staff_alert_numbers !== undefined) {
      if (!Array.isArray(body.staff_alert_numbers) || body.staff_alert_numbers.length > 10
          || body.staff_alert_numbers.some((n) => typeof n !== 'string' || n.length > 20)) {
        return res.status(400).json({ success: false, message: 'staff_alert_numbers must be up to 10 phone numbers' });
      }
      const cleaned = body.staff_alert_numbers
        .map((n) => n.replace(/[^\d]/g, ''))
        .filter((n) => n.length >= 9);
      // WhatsApp will not deliver from the business number to itself, and
      // it fails silently: the API accepts the send and the failure
      // arrives later as a status nobody reads. Refuse it at the point
      // where somebody can still fix it.
      const own = businessWhatsAppNumber();
      if (own && cleaned.includes(own)) {
        return res.status(400).json({
          success: false,
          message: `${own} is this business's own WhatsApp number — WhatsApp cannot deliver a message to its own sender, so alerts to it reach nobody. Use a personal number.`,
        });
      }
      updates.push(['staff_alert_numbers', JSON.stringify(cleaned)]);
    }
    if (body.staff_alert_template !== undefined) {
      if (typeof body.staff_alert_template !== 'string' || body.staff_alert_template.length > 128) {
        return res.status(400).json({ success: false, message: 'staff_alert_template must be a template name or ID' });
      }
      updates.push(['staff_alert_template', body.staff_alert_template.trim()]);
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

/**
 * GET /api/wa/settings/webhook-status — what sent.dm has registered vs.
 * what it should be, plus the last delivery attempts per webhook. The
 * server holds the API key, so admins get full visibility from /ops/settings.
 */
router.get('/webhook-status', authMiddleware, isAdmin, async (req, res) => {
  try {
    // AI health first — it's independent of sent.dm, and a live round-trip
    // reports the exact provider error (retired model, bad key, quota).
    const settings = await getWaSettings(req.db).catch(() => null);
    const ai = { enabled: Boolean(settings?.ai_enabled), ...(await aiSelfTest()) };

    if (!sentDmConfigured()) {
      return res.status(503).json({ success: false, ai, message: 'SENTDM_API_KEY is not configured on the server' });
    }
    const expected = expectedWebhookUrl();
    const webhooks = await listWebhooks();
    const detailed = await Promise.all(webhooks.map(async (w) => {
      let events = [];
      try { events = await listWebhookEvents(w.id); } catch { /* best-effort */ }
      return {
        id: w.id,
        endpoint_url: w.endpoint_url,
        is_active: w.is_active,
        event_types: w.event_types,
        consecutive_failures: w.consecutive_failures ?? 0,
        last_delivery_attempt_at: w.last_delivery_attempt_at ?? null,
        last_successful_delivery_at: w.last_successful_delivery_at ?? null,
        url_matches: w.endpoint_url === expected,
        recent_events: events.map((e) => ({
          created_at: e.created_at,
          event_type: e.event_type,
          delivery_status: e.delivery_status,
          http_status_code: e.http_status_code ?? null,
          attempts: e.delivery_attempts,
          error: e.error_message ?? null,
        })),
      };
    }));
    // Why did recent outbound sends fail? Pull sent.dm's per-message
    // activity log for the last few failed sends — downstream WhatsApp
    // failures (balance, sender state, policy) explain themselves there.
    let outboundFailures = [];
    try {
      const { rows } = await req.db.query(
        `SELECT m.id, m.body, m.error, m.provider_message_id, m.created_at, c.phone
           FROM wa_messages m JOIN wa_contacts c ON c.id = m.contact_id
          WHERE m.direction = 'out' AND m.status = 'failed'
          ORDER BY m.created_at DESC LIMIT 3`
      );
      outboundFailures = await Promise.all(rows.map(async (m) => {
        let activities = [];
        if (m.provider_message_id) {
          try {
            activities = (await fetchMessageActivities(m.provider_message_id))
              .map((a) => ({ status: a.status, description: a.description, at: a.timestamp }));
          } catch { /* best-effort */ }
        }
        return {
          at: m.created_at,
          to: m.phone,
          body: String(m.body || '').slice(0, 80),
          request_error: m.error,
          activities,
        };
      }));
    } catch { /* table empty / best-effort */ }

    // Are the staff pages themselves landing? This panel exists because
    // "a number is configured" was the only thing anybody could check,
    // and it stayed true through a week in which every single alert
    // failed to deliver. Same activity-log lookup as above — a page that
    // WhatsApp refused says why here.
    let staffAlerts = [];
    try {
      staffAlerts = await Promise.all((await staffAlertHealth(req.db)).map(async (h) => {
        let activities = [];
        if (h.last_status === 'failed') {
          const { rows } = await req.db.query(
            `SELECT provider_message_id FROM wa_staff_alerts
              WHERE phone = $1 AND status = 'failed' AND provider_message_id IS NOT NULL
              ORDER BY created_at DESC LIMIT 1`,
            [h.phone]
          );
          if (rows[0]?.provider_message_id) {
            try {
              activities = (await fetchMessageActivities(rows[0].provider_message_id))
                .map((a) => ({ status: a.status, description: a.description, at: a.timestamp }));
            } catch { /* best-effort */ }
          }
        }
        return { ...h, activities };
      }));
    } catch { /* table missing / best-effort */ }

    res.json({
      success: true,
      expected_url: expected,
      secret_configured: Boolean(process.env.SENTDM_WEBHOOK_SECRET),
      webhooks: detailed,
      outbound_failures: outboundFailures,
      staff_alerts: staffAlerts,
      ai,
    });
  } catch (err) {
    if (err instanceof SentDmError) {
      return res.status(err.status).json({ success: false, error: err.code, message: err.message });
    }
    logRouteError(req, res, err, 'GET /api/wa/settings/webhook-status');
    res.status(500).json({ success: false, message: 'Failed to load webhook status' });
  }
});

/**
 * POST /api/wa/settings/webhook-repair — make sent.dm's registration
 * match reality: fix the endpoint URL, re-activate if auto-disabled, or
 * create the webhook if none exists (returning the one-time signing
 * secret so the admin can set SENTDM_WEBHOOK_SECRET).
 */
router.post('/webhook-repair', authMiddleware, isAdmin, async (req, res) => {
  try {
    if (!sentDmConfigured()) {
      return res.status(503).json({ success: false, message: 'SENTDM_API_KEY is not configured on the server' });
    }
    const expected = expectedWebhookUrl();
    const webhooks = await listWebhooks();
    const actions = [];

    if (webhooks.length === 0) {
      const created = await createWebhook(expected);
      actions.push(`created webhook → ${expected}`);
      return res.json({
        success: true,
        actions,
        // Shown ONCE by sent.dm — the admin must store it as SENTDM_WEBHOOK_SECRET.
        signing_secret: created?.data?.signing_secret ?? created?.signing_secret ?? null,
        note: 'Set the signing_secret as SENTDM_WEBHOOK_SECRET on Railway, then redeploy.',
      });
    }

    // Prefer the webhook already pointing at our path, else repair the first.
    const target = webhooks.find((w) => String(w.endpoint_url || '').includes('/api/wa/webhook')) || webhooks[0];
    if (target.endpoint_url !== expected) {
      await updateWebhookUrl(target.id, expected);
      actions.push(`endpoint_url: ${target.endpoint_url || '∅'} → ${expected}`);
    }
    if (target.is_active === false) {
      await activateWebhook(target.id);
      actions.push('re-activated');
    }
    if (actions.length === 0) actions.push('nothing to repair — registration already matches');

    res.json({ success: true, webhook_id: target.id, actions });
  } catch (err) {
    if (err instanceof SentDmError) {
      return res.status(err.status).json({ success: false, error: err.code, message: err.message });
    }
    logRouteError(req, res, err, 'POST /api/wa/settings/webhook-repair');
    res.status(500).json({ success: false, message: 'Failed to repair webhook' });
  }
});

export default router;
