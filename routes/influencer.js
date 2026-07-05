/**
 * routes/influencer.js — influencer referral tracking (migration 0002).
 *
 * Two routers are exported from one file so the feature stays cohesive:
 *
 *   • default  → mounted at /api/influencer  (PUBLIC, no auth)
 *       GET  /:code           validate a code, return the influencer's name
 *       POST /:code/click     count a link open ("received the link")
 *       POST /:code/signup    create an account + submit item link(s)
 *
 *   • adminRouter → mounted at /api/admin/influencers (admin only)
 *       GET    /                     list codes with funnel stats
 *       POST   /                     mint a new code
 *       GET    /:code                one code + its signups/conversions
 *       PATCH  /:code                edit name/contact/reward/notes/active
 *       POST   /conversions/:id/pay  mark a conversion compensated (or not)
 *
 * The public signup path reuses auth.js::createCustomerAccount so it goes
 * through the exact same validated, email-verification-gated sign-up as the
 * normal register form — it just also stamps the influencer code and turns
 * the pasted item links into buy-for-me requests.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, isAdmin } from '../middleware/auth.js';
import { createCustomerAccount, AccountValidationError } from './auth.js';
import { notifyAdminsOfBuyForMe } from '../utils/buyForMeAdminNotify.js';
import { recordInfluencerConversion } from '../utils/influencerConversion.js';

const router = express.Router();       // PUBLIC
const adminRouter = express.Router();  // /api/admin/influencers

// A code is a short, human-shareable, case-insensitive token.
function normaliseCode(raw) {
  return String(raw || '').trim().toUpperCase();
}
const CODE_RE = /^[A-Z0-9]{3,24}$/;

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no easily-confused 0/O/1/I
  let code = 'INF';
  for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

// Cap how many item links a single signup can submit — abuse guard.
const MAX_ITEMS = 10;

/* ────────────────────────────── PUBLIC ────────────────────────────── */

/** GET /api/influencer/:code — is this a live code, and whose is it? */
router.get('/:code', async (req, res) => {
  try {
    const code = normaliseCode(req.params.code);
    if (!CODE_RE.test(code)) {
      return res.json({ success: true, valid: false });
    }
    const { rows } = await req.db.query(
      'SELECT code, influencer_name, is_active FROM influencer_codes WHERE code = $1',
      [code]
    );
    const row = rows[0];
    if (!row || !row.is_active) {
      return res.json({ success: true, valid: false });
    }
    res.json({ success: true, valid: true, code: row.code, influencer_name: row.influencer_name });
  } catch (err) {
    console.error('GET /influencer/:code error:', err);
    res.status(500).json({ success: false, message: 'Lookup failed' });
  }
});

/**
 * POST /api/influencer/:code/click — count one link open.
 *
 * This is the "how many people RECEIVED the link" number. The landing page
 * fires it once per visit (guarded client-side so a refresh doesn't
 * double-count). Best-effort: a failure here must not break the page.
 */
router.post('/:code/click', async (req, res) => {
  try {
    const code = normaliseCode(req.params.code);
    if (CODE_RE.test(code)) {
      await req.db.query(
        'UPDATE influencer_codes SET click_count = click_count + 1 WHERE code = $1 AND is_active = true',
        [code]
      );
    }
  } catch (err) {
    console.error('POST /influencer/:code/click error (non-fatal):', err?.message);
  }
  // Always 200 — the counter is fire-and-forget.
  res.json({ success: true });
});

/**
 * POST /api/influencer/:code/signup — the landing-page conversion action.
 *
 * Body: { name, email, phone, password, country_of_residence?,
 *         items: [{ url, description?, qty? }] }
 *
 * Creates the account (attributed to the code) and turns each submitted item
 * link into a pending buy-for-me request the ops team can quote. Because
 * sign-up is email-verification-gated, we respond with verification_required
 * and the customer activates before they can log in and pay.
 */
router.post('/:code/signup', async (req, res) => {
  try {
    const code = normaliseCode(req.params.code);
    if (!CODE_RE.test(code)) {
      return res.status(404).json({ success: false, message: 'Unknown referral code' });
    }
    const { rows: codeRows } = await req.db.query(
      'SELECT code, influencer_name FROM influencer_codes WHERE code = $1 AND is_active = true',
      [code]
    );
    if (!codeRows[0]) {
      return res.status(404).json({ success: false, message: 'Unknown or inactive referral code' });
    }

    // Normalise submitted items. Accept either items:[{url,description,qty}]
    // or a bare item_links:[string]. A URL is required per item; the
    // description is optional and falls back to a readable label.
    const rawItems = Array.isArray(req.body.items) ? req.body.items
      : Array.isArray(req.body.item_links) ? req.body.item_links.map((u) => ({ url: u }))
      : [];
    const items = [];
    for (const it of rawItems) {
      const url = typeof it === 'string' ? it.trim() : String(it?.url || '').trim();
      if (!url) continue;
      const description = String(it?.description || '').trim();
      const qty = Math.min(Math.max(parseInt(it?.qty, 10) || 1, 1), 999);
      items.push({ url, item_name: description || labelFromUrl(url), qty });
      if (items.length >= MAX_ITEMS) break;
    }

    // Create the account (throws AccountValidationError on bad input / dupe).
    const account = await createCustomerAccount(req.db, { ...req.body, influencer_code: code });

    // Turn each link into a buy-for-me request owned by the new account.
    // Best-effort so a hiccup here doesn't undo a successful signup.
    const createdOrderIds = [];
    for (const item of items) {
      try {
        const id = `BFM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        await req.db.query(
          `INSERT INTO buy_for_me_orders
             (id, user_id, retailer_url, item_name, qty, notes, status)
           VALUES ($1,$2,$3,$4,$5,$6,'pending_quote')`,
          [id, account.userId, item.url, item.item_name, item.qty,
           `Submitted via influencer link (${codeRows[0].influencer_name} · ${code})`]
        );
        createdOrderIds.push(id);
        try {
          await notifyAdminsOfBuyForMe(
            req.db, req,
            { id, item_name: item.item_name, retailer_url: item.url, qty: item.qty, notes: null },
            { id: account.userId, email: account.email, name: account.name }
          );
        } catch (notifyErr) {
          console.error('Influencer BFM admin notify failed (non-fatal):', notifyErr?.message);
        }
      } catch (bfmErr) {
        console.error('Influencer BFM insert failed (non-fatal):', bfmErr?.message);
      }
    }

    // Submitting item link(s) at signup IS placing an order — record the
    // conversion so the influencer's funnel reflects it immediately. If they
    // signed up without items, no conversion yet; it's recorded later when
    // they place their first order through the normal flow. Best-effort.
    if (createdOrderIds.length > 0) {
      recordInfluencerConversion(req.db, account.userId, createdOrderIds[0], 'buy_for_me');
    }

    res.status(201).json({
      success: true,
      message: 'Account created. Please check your email to activate it.',
      verification_required: true,
      email: account.email,
      requests_created: createdOrderIds.length,
    });
  } catch (error) {
    if (error instanceof AccountValidationError) {
      return res.status(error.status).json({ success: false, message: error.message, code: error.code || undefined });
    }
    console.error('POST /influencer/:code/signup error:', error);
    res.status(500).json({ success: false, message: 'Signup failed' });
  }
});

function labelFromUrl(url) {
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '');
    return `Item from ${host}`;
  } catch {
    return 'Requested item';
  }
}

/* ────────────────────────────── ADMIN ────────────────────────────── */

/** GET /api/admin/influencers — every code + its funnel numbers. */
adminRouter.get('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT c.code, c.influencer_name, c.influencer_contact, c.reward_per_order,
              c.notes, c.is_active, c.click_count, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM users u WHERE u.influencer_code = c.code) AS signups,
              (SELECT COUNT(*) FROM influencer_conversions ic WHERE ic.code = c.code) AS conversions,
              (SELECT COUNT(*) FROM influencer_conversions ic
                WHERE ic.code = c.code AND ic.payout_status = 'unpaid') AS unpaid_conversions
         FROM influencer_codes c
        ORDER BY c.created_at DESC`
    );
    res.json({ success: true, influencers: rows.map(shapeCodeRow) });
  } catch (err) {
    console.error('GET /admin/influencers error:', err);
    res.status(500).json({ success: false, message: 'Failed to load influencers' });
  }
});

/** POST /api/admin/influencers — mint a code. */
adminRouter.post('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { influencer_name, influencer_contact, reward_per_order, notes } = req.body;
    if (!influencer_name || !String(influencer_name).trim()) {
      return res.status(400).json({ success: false, message: 'influencer_name is required' });
    }

    // Admin may supply a custom code, else we generate one.
    let code = req.body.code ? normaliseCode(req.body.code) : generateCode();
    if (!CODE_RE.test(code)) {
      return res.status(400).json({ success: false, message: 'Code must be 3–24 letters/numbers' });
    }

    let reward = null;
    if (reward_per_order !== undefined && reward_per_order !== null && reward_per_order !== '') {
      reward = Number(reward_per_order);
      if (!Number.isFinite(reward) || reward < 0) {
        return res.status(400).json({ success: false, message: 'reward_per_order must be a non-negative number' });
      }
    }

    // Retry a couple of times on auto-generated collisions.
    let attempts = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const exists = await req.db.query('SELECT code FROM influencer_codes WHERE code = $1', [code]);
      if (exists.rows.length === 0) break;
      if (req.body.code || attempts >= 5) {
        return res.status(409).json({ success: false, message: 'That code is already in use' });
      }
      code = generateCode();
      attempts += 1;
    }

    const { rows } = await req.db.query(
      `INSERT INTO influencer_codes
         (code, influencer_name, influencer_contact, reward_per_order, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING code, influencer_name, influencer_contact, reward_per_order,
                 notes, is_active, click_count, created_at, updated_at`,
      [code, String(influencer_name).trim(),
       influencer_contact ? String(influencer_contact).trim() : null,
       reward,
       notes ? String(notes).trim() : null,
       req.user.id]
    );
    res.status(201).json({ success: true, influencer: shapeCodeRow({ ...rows[0], signups: 0, conversions: 0, unpaid_conversions: 0 }) });
  } catch (err) {
    console.error('POST /admin/influencers error:', err);
    res.status(500).json({ success: false, message: 'Failed to create code' });
  }
});

/** GET /api/admin/influencers/:code — detail + signups + conversions. */
adminRouter.get('/:code', authMiddleware, isAdmin, async (req, res) => {
  try {
    const code = normaliseCode(req.params.code);
    const { rows } = await req.db.query(
      `SELECT c.code, c.influencer_name, c.influencer_contact, c.reward_per_order,
              c.notes, c.is_active, c.click_count, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM users u WHERE u.influencer_code = c.code) AS signups,
              (SELECT COUNT(*) FROM influencer_conversions ic WHERE ic.code = c.code) AS conversions,
              (SELECT COUNT(*) FROM influencer_conversions ic
                WHERE ic.code = c.code AND ic.payout_status = 'unpaid') AS unpaid_conversions
         FROM influencer_codes c WHERE c.code = $1`,
      [code]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Code not found' });

    const signups = await req.db.query(
      `SELECT u.id, u.name, u.email, u.created_at AS joined_at,
              (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders_count,
              (SELECT COUNT(*) FROM buy_for_me_orders b WHERE b.user_id = u.id) AS bfm_count
         FROM users u WHERE u.influencer_code = $1
        ORDER BY u.created_at DESC`,
      [code]
    );

    const conversions = await req.db.query(
      `SELECT ic.id, ic.user_id, ic.order_ref, ic.order_kind, ic.converted_at,
              ic.payout_status, ic.payout_at, ic.payout_note,
              u.name AS user_name, u.email AS user_email
         FROM influencer_conversions ic
         LEFT JOIN users u ON u.id = ic.user_id
        WHERE ic.code = $1
        ORDER BY ic.converted_at DESC`,
      [code]
    );

    res.json({
      success: true,
      influencer: shapeCodeRow(rows[0]),
      signups: signups.rows.map((s) => ({
        id: s.id, name: s.name, email: s.email, joined_at: s.joined_at,
        orders_count: parseInt(s.orders_count, 10) || 0,
        bfm_count: parseInt(s.bfm_count, 10) || 0,
        has_ordered: (parseInt(s.orders_count, 10) || 0) + (parseInt(s.bfm_count, 10) || 0) > 0,
      })),
      conversions: conversions.rows,
    });
  } catch (err) {
    console.error('GET /admin/influencers/:code error:', err);
    res.status(500).json({ success: false, message: 'Failed to load code' });
  }
});

/** PATCH /api/admin/influencers/:code — edit metadata / toggle active. */
adminRouter.patch('/:code', authMiddleware, isAdmin, async (req, res) => {
  try {
    const code = normaliseCode(req.params.code);
    const fields = [];
    const values = [];
    let i = 1;

    if (req.body.influencer_name !== undefined) {
      const v = String(req.body.influencer_name).trim();
      if (!v) return res.status(400).json({ success: false, message: 'influencer_name cannot be empty' });
      fields.push(`influencer_name = $${i++}`); values.push(v);
    }
    if (req.body.influencer_contact !== undefined) {
      fields.push(`influencer_contact = $${i++}`);
      values.push(req.body.influencer_contact ? String(req.body.influencer_contact).trim() : null);
    }
    if (req.body.reward_per_order !== undefined) {
      let reward = null;
      if (req.body.reward_per_order !== null && req.body.reward_per_order !== '') {
        reward = Number(req.body.reward_per_order);
        if (!Number.isFinite(reward) || reward < 0) {
          return res.status(400).json({ success: false, message: 'reward_per_order must be a non-negative number' });
        }
      }
      fields.push(`reward_per_order = $${i++}`); values.push(reward);
    }
    if (req.body.notes !== undefined) {
      fields.push(`notes = $${i++}`);
      values.push(req.body.notes ? String(req.body.notes).trim() : null);
    }
    if (req.body.is_active !== undefined) {
      fields.push(`is_active = $${i++}`); values.push(!!req.body.is_active);
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }
    fields.push('updated_at = now()');
    values.push(code);

    const { rows } = await req.db.query(
      `UPDATE influencer_codes SET ${fields.join(', ')} WHERE code = $${i}
       RETURNING code, influencer_name, influencer_contact, reward_per_order,
                 notes, is_active, click_count, created_at, updated_at`,
      values
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Code not found' });
    res.json({ success: true, influencer: shapeCodeRow(rows[0]) });
  } catch (err) {
    console.error('PATCH /admin/influencers/:code error:', err);
    res.status(500).json({ success: false, message: 'Failed to update code' });
  }
});

/** POST /api/admin/influencers/conversions/:id/pay — mark compensated. */
adminRouter.post('/conversions/:id/pay', authMiddleware, isAdmin, async (req, res) => {
  try {
    const paid = req.body.paid === undefined ? true : !!req.body.paid;
    const note = req.body.note ? String(req.body.note).trim() : null;
    const { rows } = await req.db.query(
      `UPDATE influencer_conversions
          SET payout_status = $1,
              payout_at     = $2,
              payout_note   = $3
        WHERE id = $4
        RETURNING id, code, user_id, order_ref, order_kind, converted_at,
                  payout_status, payout_at, payout_note`,
      [paid ? 'paid' : 'unpaid', paid ? new Date().toISOString() : null, note, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Conversion not found' });
    res.json({ success: true, conversion: rows[0] });
  } catch (err) {
    console.error('POST /admin/influencers/conversions/:id/pay error:', err);
    res.status(500).json({ success: false, message: 'Failed to update payout' });
  }
});

function shapeCodeRow(r) {
  return {
    code: r.code,
    influencer_name: r.influencer_name,
    influencer_contact: r.influencer_contact,
    reward_per_order: r.reward_per_order === null ? null : Number(r.reward_per_order),
    notes: r.notes,
    is_active: r.is_active,
    clicks: parseInt(r.click_count, 10) || 0,
    signups: parseInt(r.signups, 10) || 0,
    conversions: parseInt(r.conversions, 10) || 0,
    unpaid_conversions: parseInt(r.unpaid_conversions, 10) || 0,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export default router;
export { adminRouter };
