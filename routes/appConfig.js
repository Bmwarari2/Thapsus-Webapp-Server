/**
 * App configuration route — audit S2-3.
 *
 * GET /api/app-config — public, no auth.
 *
 * Surfaces a small bag of operational constants that mobile clients
 * previously hard-coded. Driven by environment variables so ops can
 * rotate WhatsApp numbers, OTP length, warehouse code, etc. without
 * shipping a new app build.
 *
 * The response is intentionally minimal — only values that change
 * across environments or that a translator/ops user might want to edit.
 * Anything secret (Supabase service-role key, Gmail credentials, M-Pesa
 * paybill — already on /api/wallet/mpesa-info) belongs elsewhere.
 *
 * Cacheable for 5 minutes — clients should refresh on app foreground or
 * sign-in, not per-screen.
 */
import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  const config = {
    warehouse_code: process.env.APP_WAREHOUSE_CODE || 'STK-01',
    sku_prefix: process.env.APP_SKU_PREFIX || 'STK',
    support_whatsapp: process.env.APP_SUPPORT_WHATSAPP || '447424531483',
    support_email: process.env.APP_SUPPORT_EMAIL || 'support@thapsus.uk',
    otp_length: Number(process.env.APP_OTP_LENGTH) || 6,
  };
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ success: true, config });
});

export default router;
