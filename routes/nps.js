/**
 * routes/nps.js — NPS responses (Spec §4.10).
 */
import express from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = express.Router();

/** POST /api/nps — customer submits a score */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { score, comment, parcel_id } = req.body;
    const s = parseInt(score, 10);
    if (Number.isNaN(s) || s < 0 || s > 10) {
      return res.status(400).json({ success: false, message: 'score must be 0-10' });
    }
    const id = `NPS-${Date.now()}-${Math.random().toString(36).slice(2,5)}`;
    await req.db.query(
      `INSERT INTO nps_responses (id, user_id, parcel_id, score, comment)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, req.user.id, parcel_id || null, s, comment || null]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('POST /nps error:', err);
    res.status(500).json({ success: false, message: 'Failed to record NPS' });
  }
});

/** GET /api/nps/summary — admin */
router.get('/summary', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await req.db.query(`
      SELECT COUNT(*)::int AS total,
             AVG(score)::float AS avg_score,
             COUNT(*) FILTER (WHERE score >= 9)::int AS promoters,
             COUNT(*) FILTER (WHERE score BETWEEN 7 AND 8)::int AS passives,
             COUNT(*) FILTER (WHERE score <= 6)::int AS detractors
        FROM nps_responses
       WHERE created_at >= NOW() - INTERVAL '90 days'`);
    const r = rows[0];
    const nps = r.total > 0
      ? Number((((r.promoters - r.detractors) / r.total) * 100).toFixed(1))
      : null;
    res.json({ success: true, summary: { ...r, nps } });
  } catch (err) {
    console.error('GET /nps/summary error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch NPS summary' });
  }
});

export default router;
