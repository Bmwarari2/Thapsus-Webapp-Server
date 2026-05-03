/**
 * routes/kpi.js
 *
 * Founder KPI dashboard (Spec §4.12).  Surfaces:
 *   • chargeable kg shipped this week (vs 7-day avg)
 *   • avg margin £/kg (placeholder — needs Tudor invoice data)
 *   • on-time %        — POD captured within SLA
 *   • complaints / 100 — open tickets per 100 parcels
 *   • NPS              — last-30d avg
 *   • days-cash        — wallet balances + Stripe pending
 */
import express from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const db = req.db;

    const weekKg = await db.query(`
      SELECT COALESCE(SUM(COALESCE(chargeable_kg, weight_kg, 0)),0)::float AS kg,
             COUNT(*)::int AS parcels
        FROM orders
       WHERE created_at >= NOW() - INTERVAL '7 days'`);

    const lastWeekKg = await db.query(`
      SELECT COALESCE(SUM(COALESCE(chargeable_kg, weight_kg, 0)),0)::float AS kg,
             COUNT(*)::int AS parcels
        FROM orders
       WHERE created_at >= NOW() - INTERVAL '14 days'
         AND created_at <  NOW() - INTERVAL '7 days'`);

    const onTime = await db.query(`
      WITH d AS (
        SELECT o.id,
               o.created_at,
               (SELECT MIN(p.captured_at) FROM pod_events p
                 WHERE p.parcel_id = o.id AND p.result='delivered') AS delivered_at
          FROM orders o
         WHERE o.created_at >= NOW() - INTERVAL '30 days'
           AND o.status = 'delivered')
      SELECT COUNT(*)::int AS total,
             SUM(CASE WHEN delivered_at IS NOT NULL
                       AND delivered_at - created_at <= INTERVAL '14 days'
                      THEN 1 ELSE 0 END)::int AS on_time
        FROM d`);

    const complaints = await db.query(`
      SELECT (SELECT COUNT(*)::int FROM tickets WHERE status IN ('open','in_progress'))
              AS open_tickets,
             (SELECT COUNT(*)::int FROM orders WHERE created_at >= NOW() - INTERVAL '30 days')
              AS parcels_30d`);

    const nps = await db.query(`
      SELECT AVG(score)::float AS avg_score, COUNT(*)::int AS responses
        FROM nps_responses
       WHERE created_at >= NOW() - INTERVAL '30 days'`);

    // Days-cash: wallet was dropped in migration 028 (PR A) so the
    // "wallet_kes" half is gone. We surface total user_credits sitting
    // on accounts (a near-equivalent liability the business owes back
    // as discounts) and count payments.status='awaiting_review' as the
    // pending-inbound side (M-Pesa awaiting admin approval).
    const cash = await db.query(`
      SELECT (SELECT COALESCE(SUM(balance_kes),0)::float FROM user_credits) AS credit_kes,
             (SELECT COALESCE(SUM(amount_due_kes),0)::float FROM payments
               WHERE status='awaiting_review' AND created_at >= NOW() - INTERVAL '7 days')
              AS pending_inbound`);

    const insuranceClaims = await db.query(`
      SELECT
        (SELECT COALESCE(SUM(payout_gbp),0)::float FROM insurance_policies
          WHERE status='claimed' AND claimed_at >= NOW() - INTERVAL '30 days')
         AS claims_paid_gbp,
        (SELECT COALESCE(SUM(premium_gbp),0)::float FROM insurance_policies
          WHERE created_at >= NOW() - INTERVAL '30 days')
         AS premiums_collected_gbp`);

    const wKg  = weekKg.rows[0].kg;
    const lwKg = lastWeekKg.rows[0].kg;
    const trend = lwKg > 0 ? ((wKg - lwKg) / lwKg) * 100 : null;

    const ontimeStats = onTime.rows[0];
    const ontimePct = ontimeStats.total > 0
      ? (ontimeStats.on_time / ontimeStats.total) * 100 : null;

    const complaintsPer100 = complaints.rows[0].parcels_30d > 0
      ? (complaints.rows[0].open_tickets / complaints.rows[0].parcels_30d) * 100
      : 0;

    res.json({
      success: true,
      kpi: {
        kg_this_week:        Number(wKg.toFixed(1)),
        kg_last_week:        Number(lwKg.toFixed(1)),
        kg_trend_pct:        trend === null ? null : Number(trend.toFixed(1)),
        parcels_this_week:   weekKg.rows[0].parcels,
        on_time_pct:         ontimePct === null ? null : Number(ontimePct.toFixed(1)),
        complaints_per_100:  Number(complaintsPer100.toFixed(2)),
        nps_avg:             nps.rows[0].avg_score === null ? null
                              : Number(nps.rows[0].avg_score.toFixed(1)),
        nps_responses:       nps.rows[0].responses,
        credit_kes:          Number(cash.rows[0].credit_kes.toFixed(0)),
        pending_inbound:     Number(cash.rows[0].pending_inbound.toFixed(0)),
        insurance_claims_gbp: Number(insuranceClaims.rows[0].claims_paid_gbp.toFixed(2)),
        insurance_premiums_gbp: Number(insuranceClaims.rows[0].premiums_collected_gbp.toFixed(2)),
      },
    });
  } catch (err) {
    console.error('GET /kpi error:', err);
    res.status(500).json({ success: false, message: 'Failed to load KPI dashboard' });
  }
});

/** GET /api/kpi/marketing  — UTM rollup + cohort retention (90-day) */
router.get('/marketing', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const utm = await req.db.query(`
      SELECT COALESCE(utm_source,'(direct)') AS source,
             COALESCE(utm_medium,'(none)')   AS medium,
             COALESCE(utm_campaign,'(none)') AS campaign,
             COUNT(DISTINCT user_id)::int AS signups
        FROM marketing_attributions
       WHERE created_at >= NOW() - INTERVAL '90 days'
       GROUP BY 1,2,3
       ORDER BY signups DESC
       LIMIT 50`);

    const repeat = await req.db.query(`
      WITH first_orders AS (
        SELECT user_id, MIN(created_at) AS first_at FROM orders GROUP BY user_id
      )
      SELECT (COUNT(*) FILTER (WHERE first_at <= NOW() - INTERVAL '90 days'))::int AS cohort_size,
             (COUNT(*) FILTER (
               WHERE first_at <= NOW() - INTERVAL '90 days'
                 AND user_id IN (SELECT user_id FROM orders
                                  WHERE created_at >  first_at
                                    AND created_at <= first_at + INTERVAL '90 days')
             ))::int AS repeat_in_90d
        FROM first_orders`);

    const retentionPct = repeat.rows[0].cohort_size > 0
      ? (repeat.rows[0].repeat_in_90d / repeat.rows[0].cohort_size) * 100 : null;

    res.json({
      success: true,
      utm: utm.rows,
      retention_90d: {
        cohort_size: repeat.rows[0].cohort_size,
        repeat_in_90d: repeat.rows[0].repeat_in_90d,
        pct: retentionPct === null ? null : Number(retentionPct.toFixed(1)),
      },
    });
  } catch (err) {
    console.error('GET /kpi/marketing error:', err);
    res.status(500).json({ success: false, message: 'Failed to load marketing KPIs' });
  }
});

export default router;
