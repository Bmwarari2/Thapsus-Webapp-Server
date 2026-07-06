/**
 * routes/influencerPortal.js — the influencer's own self-serve analytics.
 *
 * Mounted at /api/influencer-portal, gated to role='influencer' (admins pass
 * too, but see only codes they personally own). Everything is scoped to the
 * codes whose owner_user_id is the signed-in user, so an influencer can only
 * ever see their own numbers.
 *
 *   GET /dashboard  — one call returns headline KPIs, per-link breakdown,
 *                     a daily time-series, location + device breakdowns, and
 *                     a recent-activity feed. Kept as a single endpoint so the
 *                     dashboard paints in one round-trip.
 */
import express from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = express.Router();

const num = (v) => parseInt(v, 10) || 0;
const money = (v) => (v === null || v === undefined ? 0 : Number(v));

router.get('/dashboard', authMiddleware, requireRole('influencer'), async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 180);

    const me = await db.query('SELECT name, email FROM users WHERE id = $1', [userId]);

    // The influencer's codes (with per-code funnel numbers).
    const codesRes = await db.query(
      `SELECT c.code, c.influencer_name, c.is_active, c.reward_per_order, c.click_count,
              (SELECT COUNT(*) FROM users u WHERE u.influencer_code = c.code) AS signups,
              (SELECT COUNT(*) FROM influencer_conversions ic WHERE ic.code = c.code) AS conversions,
              (SELECT COUNT(*) FROM influencer_conversions ic
                WHERE ic.code = c.code AND ic.payout_status = 'unpaid') AS unpaid_conversions
         FROM influencer_codes c
        WHERE c.owner_user_id = $1
        ORDER BY c.created_at DESC`,
      [userId]
    );
    const codes = codesRes.rows.map((r) => r.code);

    // No codes yet → return an empty-but-valid shape so the UI renders cleanly.
    if (codes.length === 0) {
      return res.json({
        success: true,
        profile: { name: me.rows[0]?.name || null, email: me.rows[0]?.email || null },
        totals: emptyTotals(),
        links: [], timeseries: [], locations: [], devices: [], recent: [],
      });
    }

    const [openAgg, signupAgg, orderAgg, earnAgg, opensByDay, signupsByDay, ordersByDay, locs, devs, recent] =
      await Promise.all([
        db.query(
          `SELECT COUNT(*) AS opens,
                  COUNT(DISTINCT ip_hash) AS unique_visitors,
                  COUNT(*) FILTER (WHERE converted) AS converted_opens
             FROM influencer_link_events WHERE code = ANY($1::text[])`,
          [codes]
        ),
        db.query('SELECT COUNT(*) AS signups FROM users WHERE influencer_code = ANY($1::text[])', [codes]),
        db.query('SELECT COUNT(*) AS orders FROM influencer_conversions WHERE code = ANY($1::text[])', [codes]),
        db.query(
          `SELECT COALESCE(SUM(c.reward_per_order),0) AS earnings,
                  COALESCE(SUM(CASE WHEN ic.payout_status='unpaid' THEN c.reward_per_order ELSE 0 END),0) AS unpaid_earnings
             FROM influencer_conversions ic
             JOIN influencer_codes c ON c.code = ic.code
            WHERE c.owner_user_id = $1`,
          [userId]
        ),
        db.query(
          `SELECT to_char(date_trunc('day', occurred_at), 'YYYY-MM-DD') AS day, COUNT(*) AS n
             FROM influencer_link_events
            WHERE code = ANY($1::text[]) AND occurred_at >= now() - ($2 || ' days')::interval
            GROUP BY 1`,
          [codes, String(days)]
        ),
        db.query(
          `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COUNT(*) AS n
             FROM users
            WHERE influencer_code = ANY($1::text[]) AND created_at >= now() - ($2 || ' days')::interval
            GROUP BY 1`,
          [codes, String(days)]
        ),
        db.query(
          `SELECT to_char(date_trunc('day', converted_at), 'YYYY-MM-DD') AS day, COUNT(*) AS n
             FROM influencer_conversions
            WHERE code = ANY($1::text[]) AND converted_at >= now() - ($2 || ' days')::interval
            GROUP BY 1`,
          [codes, String(days)]
        ),
        db.query(
          `SELECT COALESCE(country,'Unknown') AS country, country_code,
                  COALESCE(city,'') AS city, COUNT(*) AS n
             FROM influencer_link_events
            WHERE code = ANY($1::text[])
            GROUP BY country, country_code, city
            ORDER BY n DESC LIMIT 20`,
          [codes]
        ),
        db.query(
          `SELECT COALESCE(device_type,'unknown') AS device_type, COUNT(*) AS n
             FROM influencer_link_events WHERE code = ANY($1::text[])
            GROUP BY device_type ORDER BY n DESC`,
          [codes]
        ),
        db.query(
          `SELECT occurred_at, city, country, country_code, device_type, converted
             FROM influencer_link_events
            WHERE code = ANY($1::text[])
            ORDER BY occurred_at DESC LIMIT 20`,
          [codes]
        ),
      ]);

    const opens = num(openAgg.rows[0].opens);
    const convertedOpens = num(openAgg.rows[0].converted_opens);
    const signups = num(signupAgg.rows[0].signups);
    const orders = num(orderAgg.rows[0].orders);

    const totals = {
      opens,
      unique_visitors: num(openAgg.rows[0].unique_visitors),
      signups,
      orders,
      opened_not_signed_up: Math.max(opens - convertedOpens, 0),
      earnings: money(earnAgg.rows[0].earnings),
      unpaid_earnings: money(earnAgg.rows[0].unpaid_earnings),
      signup_rate: opens > 0 ? Math.round((signups / opens) * 1000) / 10 : 0,   // %
      order_rate: signups > 0 ? Math.round((orders / signups) * 1000) / 10 : 0, // %
    };

    res.json({
      success: true,
      profile: { name: me.rows[0]?.name || null, email: me.rows[0]?.email || null },
      totals,
      links: codesRes.rows.map((r) => ({
        code: r.code,
        influencer_name: r.influencer_name,
        is_active: r.is_active,
        reward_per_order: r.reward_per_order === null ? null : Number(r.reward_per_order),
        clicks: num(r.click_count),
        signups: num(r.signups),
        conversions: num(r.conversions),
        unpaid_conversions: num(r.unpaid_conversions),
      })),
      timeseries: buildTimeseries(days, opensByDay.rows, signupsByDay.rows, ordersByDay.rows),
      locations: locs.rows.map((l) => ({
        country: l.country, country_code: l.country_code, city: l.city, count: num(l.n),
      })),
      devices: devs.rows.map((d) => ({ device_type: d.device_type, count: num(d.n) })),
      recent: recent.rows.map((e) => ({
        at: e.occurred_at,
        city: e.city || null,
        country: e.country || null,
        country_code: e.country_code || null,
        device: e.device_type || null,
        converted: !!e.converted,
      })),
    });
  } catch (err) {
    console.error('GET /influencer-portal/dashboard error:', err);
    res.status(500).json({ success: false, message: 'Failed to load dashboard' });
  }
});

function emptyTotals() {
  return {
    opens: 0, unique_visitors: 0, signups: 0, orders: 0, opened_not_signed_up: 0,
    earnings: 0, unpaid_earnings: 0, signup_rate: 0, order_rate: 0,
  };
}

// Merge the three per-day aggregates into a dense, zero-filled series so the
// chart has a point for every day in the window.
function buildTimeseries(days, opensRows, signupsRows, ordersRows) {
  const idx = (rows) => {
    const m = new Map();
    for (const r of rows) m.set(r.day, parseInt(r.n, 10) || 0);
    return m;
  };
  const o = idx(opensRows), s = idx(signupsRows), ord = idx(ordersRows);
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, opens: o.get(key) || 0, signups: s.get(key) || 0, orders: ord.get(key) || 0 });
  }
  return out;
}

export default router;
