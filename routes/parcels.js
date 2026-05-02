/**
 * routes/parcels.js
 *
 * Operator-side parcel intake helpers. Currently exposes a single
 * signed-upload endpoint so the iOS receive flow can PUT the intake
 * JPEG via URLSession instead of going through the K/N ByteArray
 * bridge — which froze the app on multi-MB photos (audit D19 / N1).
 */
import express from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { createSignedUploadUrl, getSupabaseAdmin } from '../utils/supabaseAdmin.js';

const router = express.Router();

const PARCEL_BUCKET = 'parcels';

/**
 * POST /api/parcels/upload-url
 *
 * Mints a 5-minute signed-upload URL into the public `parcels` bucket.
 * The iOS operator-receive flow PUTs the intake JPEG directly to
 * `signed_url` via URLSession; the response also includes a
 * `public_url` that's stamped on `packages.intake_photo_url` after the
 * upload completes (the bucket is public, no /document-url companion
 * needed — unlike pods, which is private).
 *
 * Body: { parcel_id }
 * Returns: { success, bucket, path, signed_url, token, public_url }
 *
 * Auth: operator role. Admin passes through requireRole's built-in
 * fall-through. We deliberately don't scope to a specific operator —
 * intake legitimately touches any inbound parcel and operators are
 * trusted staff.
 */
router.post(
  '/upload-url',
  authMiddleware,
  requireRole('operator'),
  async (req, res) => {
    try {
      if (!getSupabaseAdmin()) {
        return res.status(503).json({
          success: false,
          message: 'Storage admin not configured. Set SUPABASE_SERVICE_KEY on the server.',
        });
      }
      const parcelId = String(req.body?.parcel_id || '').trim();
      if (!parcelId) {
        return res.status(400).json({ success: false, message: 'parcel_id is required' });
      }

      // Sanity check: parcel must exist. Without it a typo'd id silently
      // mints a path nothing ever reads, and the bucket fills with
      // orphaned bytes.
      const { rows } = await req.db.query(
        `SELECT 1 FROM packages WHERE id = $1 LIMIT 1`,
        [parcelId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Parcel not found' });
      }

      const ts = Date.now();
      const path = `parcels/${parcelId}/${ts}.jpg`;
      const data = await createSignedUploadUrl(PARCEL_BUCKET, path);
      const sb = getSupabaseAdmin();
      const { data: pub } = sb.storage.from(PARCEL_BUCKET).getPublicUrl(path);

      return res.json({
        success: true,
        bucket: PARCEL_BUCKET,
        path,
        signed_url: data.signedUrl,
        token: data.token,
        public_url: pub?.publicUrl || null,
      });
    } catch (err) {
      console.error('POST /parcels/upload-url error:', err);
      return res.status(500).json({ success: false, message: 'Failed to mint upload URL' });
    }
  }
);

export default router;
