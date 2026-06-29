// routes/finance.js
//
// Business Finance Management — the "selected admin" books. Everything here is
// gated by requireFinanceAccess (users.can_manage_finances), NOT plain admin.
//
// Layered on top of the customer-payment tables: settled payments and paid
// supplier/agent invoices auto-flow into finance_transactions via
// utils/financeSync.js; this router adds the manual ledger (expenses, other
// income), accounts, categories, tax codes/periods, and the live + exportable
// reports (P&L, cash flow, tax/compliance).
//
// Money is stored and returned in MINOR units (GBP pence, KES cents). The
// frontend divides by 100 for display. fx_rate_gbp_kes is KES-per-GBP.

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, requireFinanceAccess } from '../middleware/auth.js';
import { logRouteError } from '../utils/errorLogger.js';
import { getGbpToKesRate, FxRateUnavailableError } from '../utils/fx.js';
import { syncFinanceLedger } from '../utils/financeSync.js';
import { cacheGet, cacheSet, cacheInvalidate } from '../utils/cache.js';

const router = express.Router();

// Every finance route requires an authenticated user WITH finance access.
router.use(authMiddleware, requireFinanceAccess);

const FALLBACK_GBP_KES = 164.2;
const CACHE_PREFIX = 'finance:';

async function reportingRate(db) {
  try {
    const { rate } = await getGbpToKesRate(db);
    return rate;
  } catch (e) {
    if (e instanceof FxRateUnavailableError) return FALLBACK_GBP_KES;
    throw e;
  }
}

function repCol(currency) {
  return currency === 'KES' ? 'amount_kes_minor' : 'amount_gbp_minor';
}

function validCurrency(c) {
  return c === 'GBP' || c === 'KES';
}

// Convert a major-unit number (e.g. 12.34) to integer minor units (1234).
function toMinor(amount) {
  return Math.round(Number(amount) * 100);
}

// Compute the GBP/KES normalised pair from a minor amount in one currency.
function normalise(amountMinor, currency, rate) {
  if (currency === 'GBP') {
    return { gbp: amountMinor, kes: Math.round(amountMinor * rate) };
  }
  return { gbp: Math.round(amountMinor / rate), kes: amountMinor };
}

// Refresh the auto-synced ledger at most once per 5-minute window so /overview
// and the reports reflect newly-settled payments without a manual Sync click.
async function lazySync(db) {
  if (cacheGet(`${CACHE_PREFIX}synced`) !== undefined) return;
  cacheSet(`${CACHE_PREFIX}synced`, true, 5 * 60 * 1000);
  try {
    await syncFinanceLedger(db);
  } catch (e) {
    console.warn('[finance] lazySync failed:', e?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW — money available, P&L, compliance at a glance
// ─────────────────────────────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const db = req.db;
    const currency = validCurrency(req.query.currency) ? req.query.currency : 'GBP';
    await lazySync(db);

    const cacheKey = `${CACHE_PREFIX}overview:${currency}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const rate = await reportingRate(db);
    const col = repCol(currency);

    // Money available per account (opening + Σin − Σout), and currency totals.
    const balances = await db.query(`
      SELECT a.id, a.name, a.type, a.currency,
             a.opening_balance_minor
             + COALESCE(SUM(CASE WHEN t.direction='in'  THEN t.amount_minor ELSE 0 END),0)
             - COALESCE(SUM(CASE WHEN t.direction='out' THEN t.amount_minor ELSE 0 END),0)
               AS balance_minor
        FROM finance_accounts a
        LEFT JOIN finance_transactions t
          ON t.account_id = a.id AND t.status = 'cleared'
       WHERE a.is_active = true
       GROUP BY a.id
       ORDER BY a.currency, a.name`);

    let availGbpMinor = 0, availKesMinor = 0;
    for (const b of balances.rows) {
      const n = normalise(Number(b.balance_minor), b.currency, rate);
      availGbpMinor += n.gbp; availKesMinor += n.kes;
    }

    // P&L (cleared rows) for month-to-date and year-to-date in reporting ccy.
    const pl = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN direction='in'  AND occurred_on >= date_trunc('month', CURRENT_DATE) THEN ${col} ELSE 0 END),0) AS in_mtd,
        COALESCE(SUM(CASE WHEN direction='out' AND occurred_on >= date_trunc('month', CURRENT_DATE) THEN ${col} ELSE 0 END),0) AS out_mtd,
        COALESCE(SUM(CASE WHEN direction='in'  AND occurred_on >= date_trunc('year',  CURRENT_DATE) THEN ${col} ELSE 0 END),0) AS in_ytd,
        COALESCE(SUM(CASE WHEN direction='out' AND occurred_on >= date_trunc('year',  CURRENT_DATE) THEN ${col} ELSE 0 END),0) AS out_ytd
      FROM finance_transactions
      WHERE status='cleared'`);
    const p = pl.rows[0];

    // Tax compliance snapshot.
    const tax = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('filed','paid') AND due_date < CURRENT_DATE) AS overdue,
        COUNT(*) FILTER (WHERE status NOT IN ('filed','paid') AND due_date >= CURRENT_DATE) AS upcoming,
        MIN(due_date) FILTER (WHERE status NOT IN ('filed','paid')) AS next_due
      FROM finance_tax_periods`);

    const payload = {
      success: true,
      currency,
      fx_rate_gbp_kes: rate,
      money_available: {
        gbp_minor: availGbpMinor,
        kes_minor: availKesMinor,
        reporting_minor: currency === 'KES' ? availKesMinor : availGbpMinor,
        accounts: balances.rows.map(b => ({
          id: b.id, name: b.name, type: b.type, currency: b.currency,
          balance_minor: Number(b.balance_minor),
        })),
      },
      profit_loss: {
        mtd: { income_minor: Number(p.in_mtd), expense_minor: Number(p.out_mtd), net_minor: Number(p.in_mtd) - Number(p.out_mtd) },
        ytd: { income_minor: Number(p.in_ytd), expense_minor: Number(p.out_ytd), net_minor: Number(p.in_ytd) - Number(p.out_ytd) },
      },
      compliance: {
        overdue: Number(tax.rows[0].overdue),
        upcoming: Number(tax.rows[0].upcoming),
        next_due: tax.rows[0].next_due,
        status: Number(tax.rows[0].overdue) > 0 ? 'overdue'
              : Number(tax.rows[0].upcoming) > 0 ? 'due' : 'clear',
      },
    };
    cacheSet(cacheKey, payload, 60 * 1000);
    res.json(payload);
  } catch (err) {
    logRouteError(req, res, err, 'GET /finance/overview');
    res.status(500).json({ success: false, message: 'Failed to load finance overview' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTIONS — list / create / edit / void
// ─────────────────────────────────────────────────────────────────────────────
router.get('/transactions', async (req, res) => {
  try {
    const db = req.db;
    const page  = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 200);
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];
    const add = (clause, val) => { params.push(val); where.push(clause.replace('?', `$${params.length}`)); };

    if (req.query.direction === 'in' || req.query.direction === 'out') add('t.direction = ?', req.query.direction);
    if (req.query.category_id) add('t.category_id = ?', req.query.category_id);
    if (req.query.account_id)  add('t.account_id = ?', req.query.account_id);
    if (validCurrency(req.query.currency)) add('t.currency = ?', req.query.currency);
    if (req.query.source)      add('t.source = ?', req.query.source);
    if (req.query.status)      add('t.status = ?', req.query.status);
    if (req.query.from)        add('t.occurred_on >= ?', req.query.from);
    if (req.query.to)          add('t.occurred_on <= ?', req.query.to);
    if (req.query.q) {
      params.push(`%${req.query.q}%`);
      where.push(`(t.description ILIKE $${params.length} OR t.counterparty ILIKE $${params.length} OR t.reference ILIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await db.query(`SELECT COUNT(*)::int AS n FROM finance_transactions t ${whereSql}`, params);
    const rows = await db.query(
      `SELECT t.*, c.name AS category_name, c.kind AS category_kind, a.name AS account_name
         FROM finance_transactions t
         LEFT JOIN finance_categories c ON c.id = t.category_id
         LEFT JOIN finance_accounts   a ON a.id = t.account_id
         ${whereSql}
        ORDER BY t.occurred_on DESC, t.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      transactions: rows.rows,
      pagination: { page, limit, total: countRes.rows[0].n, pages: Math.ceil(countRes.rows[0].n / limit) },
    });
  } catch (err) {
    logRouteError(req, res, err, 'GET /finance/transactions');
    res.status(500).json({ success: false, message: 'Failed to load transactions' });
  }
});

router.post('/transactions', async (req, res) => {
  try {
    const db = req.db;
    const {
      direction, amount, currency, category_id, account_id, occurred_on,
      description, counterparty, reference, tax_code, tax_amount, attachment_url, status,
    } = req.body || {};

    if (direction !== 'in' && direction !== 'out')
      return res.status(400).json({ success: false, message: "direction must be 'in' or 'out'" });
    if (!validCurrency(currency))
      return res.status(400).json({ success: false, message: 'currency must be GBP or KES' });
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0)
      return res.status(400).json({ success: false, message: 'amount must be a positive number' });

    const amountMinor = toMinor(amt);
    const rate = await reportingRate(db);
    const { gbp, kes } = normalise(amountMinor, currency, rate);

    // Tax: explicit tax_amount wins; otherwise derive the VAT-inclusive portion
    // from the tax code rate (amounts are entered gross of VAT).
    let taxMinor = 0;
    if (tax_amount !== undefined && tax_amount !== null && tax_amount !== '') {
      taxMinor = toMinor(tax_amount);
    } else if (tax_code) {
      const tc = await db.query('SELECT rate_pct FROM finance_tax_codes WHERE id = $1', [tax_code]);
      const ratePct = tc.rows[0] ? Number(tc.rows[0].rate_pct) : 0;
      if (ratePct > 0) taxMinor = Math.round(amountMinor * ratePct / (100 + ratePct));
    }

    const id = `FTX-MAN-${uuidv4()}`;
    await db.query(
      `INSERT INTO finance_transactions
        (id, direction, amount_minor, currency, amount_gbp_minor, amount_kes_minor,
         fx_rate_gbp_kes, category_id, account_id, occurred_on, description,
         counterparty, reference, tax_code, tax_amount_minor, attachment_url,
         source, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10, CURRENT_DATE),$11,$12,$13,$14,$15,$16,'manual',$17,$18)`,
      [id, direction, amountMinor, currency, gbp, kes, rate,
       category_id || null, account_id || null, occurred_on || null, description || null,
       counterparty || null, reference || null, tax_code || null, taxMinor, attachment_url || null,
       status === 'pending' ? 'pending' : 'cleared', req.user.id]
    );

    cacheInvalidate(CACHE_PREFIX);
    const created = await db.query('SELECT * FROM finance_transactions WHERE id = $1', [id]);
    res.status(201).json({ success: true, transaction: created.rows[0] });
  } catch (err) {
    logRouteError(req, res, err, 'POST /finance/transactions');
    res.status(500).json({ success: false, message: 'Failed to record transaction' });
  }
});

router.patch('/transactions/:id', async (req, res) => {
  try {
    const db = req.db;
    const { rows } = await db.query('SELECT * FROM finance_transactions WHERE id = $1', [req.params.id]);
    const existing = rows[0];
    if (!existing) return res.status(404).json({ success: false, message: 'Transaction not found' });

    const b = req.body || {};
    // Amount/currency edits are only allowed on manually-entered rows — synced
    // rows must stay faithful to their source object.
    if ((b.amount !== undefined || b.currency !== undefined) && existing.source !== 'manual') {
      return res.status(400).json({ success: false, message: 'Cannot change amount/currency on an auto-synced transaction' });
    }

    const sets = [];
    const params = [];
    const set = (clause, val) => { params.push(val); sets.push(clause.replace('?', `$${params.length}`)); };

    let amountMinor = Number(existing.amount_minor);
    let currency = existing.currency;
    if (b.currency !== undefined) {
      if (!validCurrency(b.currency)) return res.status(400).json({ success: false, message: 'currency must be GBP or KES' });
      currency = b.currency; set('currency = ?', currency);
    }
    if (b.amount !== undefined) {
      const amt = Number(b.amount);
      if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ success: false, message: 'amount must be positive' });
      amountMinor = toMinor(amt); set('amount_minor = ?', amountMinor);
    }
    if (b.amount !== undefined || b.currency !== undefined) {
      const rate = await reportingRate(db);
      const { gbp, kes } = normalise(amountMinor, currency, rate);
      set('amount_gbp_minor = ?', gbp); set('amount_kes_minor = ?', kes); set('fx_rate_gbp_kes = ?', rate);
    }

    for (const f of ['category_id','account_id','occurred_on','description','counterparty','reference','tax_code','attachment_url']) {
      if (b[f] !== undefined) set(`${f} = ?`, b[f] || null);
    }
    if (b.tax_amount !== undefined) set('tax_amount_minor = ?', toMinor(b.tax_amount));
    if (b.status !== undefined) {
      if (!['cleared','pending','void'].includes(b.status)) return res.status(400).json({ success: false, message: 'invalid status' });
      set('status = ?', b.status);
    }
    if (sets.length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });

    params.push(req.params.id);
    await db.query(`UPDATE finance_transactions SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    cacheInvalidate(CACHE_PREFIX);
    const updated = await db.query('SELECT * FROM finance_transactions WHERE id = $1', [req.params.id]);
    res.json({ success: true, transaction: updated.rows[0] });
  } catch (err) {
    logRouteError(req, res, err, 'PATCH /finance/transactions/:id');
    res.status(500).json({ success: false, message: 'Failed to update transaction' });
  }
});

router.post('/transactions/:id/void', async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `UPDATE finance_transactions SET status='void' WHERE id=$1 RETURNING id, status`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Transaction not found' });
    cacheInvalidate(CACHE_PREFIX);
    res.json({ success: true, transaction: rows[0] });
  } catch (err) {
    logRouteError(req, res, err, 'POST /finance/transactions/:id/void');
    res.status(500).json({ success: false, message: 'Failed to void transaction' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const { rows } = await req.db.query('SELECT * FROM finance_categories ORDER BY kind, sort_order, name');
    res.json({ success: true, categories: rows });
  } catch (err) {
    logRouteError(req, res, err, 'GET /finance/categories');
    res.status(500).json({ success: false, message: 'Failed to load categories' });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const { name, kind, is_tax_deductible, default_tax_code, sort_order } = req.body || {};
    if (!name || !['income','expense'].includes(kind))
      return res.status(400).json({ success: false, message: 'name and kind (income|expense) are required' });
    const id = `CAT-${uuidv4().slice(0, 8).toUpperCase()}`;
    await req.db.query(
      `INSERT INTO finance_categories (id, name, kind, is_tax_deductible, default_tax_code, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, name, kind, is_tax_deductible === true, default_tax_code || null, Number(sort_order) || 100]
    );
    res.status(201).json({ success: true, id });
  } catch (err) {
    logRouteError(req, res, err, 'POST /finance/categories');
    res.status(500).json({ success: false, message: 'Failed to create category' });
  }
});

router.patch('/categories/:id', async (req, res) => {
  try {
    const sets = []; const params = [];
    const set = (c, v) => { params.push(v); sets.push(c.replace('?', `$${params.length}`)); };
    for (const f of ['name','kind','default_tax_code']) if (req.body[f] !== undefined) set(`${f} = ?`, req.body[f]);
    if (req.body.is_tax_deductible !== undefined) set('is_tax_deductible = ?', req.body.is_tax_deductible === true);
    if (req.body.sort_order !== undefined) set('sort_order = ?', Number(req.body.sort_order) || 100);
    if (req.body.is_active !== undefined) set('is_active = ?', req.body.is_active === true);
    if (!sets.length) return res.status(400).json({ success: false, message: 'No fields to update' });
    params.push(req.params.id);
    const { rowCount } = await req.db.query(`UPDATE finance_categories SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true });
  } catch (err) {
    logRouteError(req, res, err, 'PATCH /finance/categories/:id');
    res.status(500).json({ success: false, message: 'Failed to update category' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/accounts', async (req, res) => {
  try {
    const { rows } = await req.db.query('SELECT * FROM finance_accounts ORDER BY currency, name');
    res.json({ success: true, accounts: rows });
  } catch (err) {
    logRouteError(req, res, err, 'GET /finance/accounts');
    res.status(500).json({ success: false, message: 'Failed to load accounts' });
  }
});

router.get('/accounts/balances', async (req, res) => {
  try {
    const { rows } = await req.db.query(`
      SELECT a.id, a.name, a.type, a.currency, a.opening_balance_minor,
             a.opening_balance_minor
             + COALESCE(SUM(CASE WHEN t.direction='in'  THEN t.amount_minor ELSE 0 END),0)
             - COALESCE(SUM(CASE WHEN t.direction='out' THEN t.amount_minor ELSE 0 END),0) AS balance_minor
        FROM finance_accounts a
        LEFT JOIN finance_transactions t ON t.account_id = a.id AND t.status='cleared'
       GROUP BY a.id
       ORDER BY a.currency, a.name`);
    res.json({ success: true, accounts: rows.map(r => ({ ...r, balance_minor: Number(r.balance_minor) })) });
  } catch (err) {
    logRouteError(req, res, err, 'GET /finance/accounts/balances');
    res.status(500).json({ success: false, message: 'Failed to load balances' });
  }
});

router.post('/accounts', async (req, res) => {
  try {
    const { name, type, currency, opening_balance } = req.body || {};
    if (!name || !['bank','cash','mpesa','stripe','other'].includes(type) || !validCurrency(currency))
      return res.status(400).json({ success: false, message: 'name, type and currency (GBP|KES) are required' });
    const id = `ACC-${uuidv4().slice(0, 8).toUpperCase()}`;
    await req.db.query(
      `INSERT INTO finance_accounts (id, name, type, currency, opening_balance_minor) VALUES ($1,$2,$3,$4,$5)`,
      [id, name, type, currency, opening_balance ? toMinor(opening_balance) : 0]
    );
    cacheInvalidate(CACHE_PREFIX);
    res.status(201).json({ success: true, id });
  } catch (err) {
    logRouteError(req, res, err, 'POST /finance/accounts');
    res.status(500).json({ success: false, message: 'Failed to create account' });
  }
});

router.patch('/accounts/:id', async (req, res) => {
  try {
    const sets = []; const params = [];
    const set = (c, v) => { params.push(v); sets.push(c.replace('?', `$${params.length}`)); };
    if (req.body.name !== undefined) set('name = ?', req.body.name);
    if (req.body.opening_balance !== undefined) set('opening_balance_minor = ?', toMinor(req.body.opening_balance));
    if (req.body.is_active !== undefined) set('is_active = ?', req.body.is_active === true);
    if (!sets.length) return res.status(400).json({ success: false, message: 'No fields to update' });
    params.push(req.params.id);
    const { rowCount } = await req.db.query(`UPDATE finance_accounts SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Account not found' });
    cacheInvalidate(CACHE_PREFIX);
    res.json({ success: true });
  } catch (err) {
    logRouteError(req, res, err, 'PATCH /finance/accounts/:id');
    res.status(500).json({ success: false, message: 'Failed to update account' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TAX CODES + PERIODS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/tax/codes', async (req, res) => {
  try {
    const { rows } = await req.db.query('SELECT * FROM finance_tax_codes ORDER BY jurisdiction, kind, name');
    res.json({ success: true, codes: rows });
  } catch (err) {
    logRouteError(req, res, err, 'GET /finance/tax/codes');
    res.status(500).json({ success: false, message: 'Failed to load tax codes' });
  }
});

router.post('/tax/codes', async (req, res) => {
  try {
    const { jurisdiction, name, kind, rate_pct } = req.body || {};
    if (!['UK','KE'].includes(jurisdiction) || !name || !['vat','income_tax','withholding'].includes(kind))
      return res.status(400).json({ success: false, message: 'jurisdiction (UK|KE), name and kind are required' });
    const id = `TAX-${uuidv4().slice(0, 8).toUpperCase()}`;
    await req.db.query(
      `INSERT INTO finance_tax_codes (id, jurisdiction, name, kind, rate_pct) VALUES ($1,$2,$3,$4,$5)`,
      [id, jurisdiction, name, kind, Number(rate_pct) || 0]
    );
    res.status(201).json({ success: true, id });
  } catch (err) {
    logRouteError(req, res, err, 'POST /finance/tax/codes');
    res.status(500).json({ success: false, message: 'Failed to create tax code' });
  }
});

router.patch('/tax/codes/:id', async (req, res) => {
  try {
    const sets = []; const params = [];
    const set = (c, v) => { params.push(v); sets.push(c.replace('?', `$${params.length}`)); };
    if (req.body.name !== undefined) set('name = ?', req.body.name);
    if (req.body.rate_pct !== undefined) set('rate_pct = ?', Number(req.body.rate_pct) || 0);
    if (req.body.is_active !== undefined) set('is_active = ?', req.body.is_active === true);
    if (!sets.length) return res.status(400).json({ success: false, message: 'No fields to update' });
    params.push(req.params.id);
    const { rowCount } = await req.db.query(`UPDATE finance_tax_codes SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    if (!rowCount) return res.status(404).json({ success: false, message: 'Tax code not found' });
    res.json({ success: true });
  } catch (err) {
    logRouteError(req, res, err, 'PATCH /finance/tax/codes/:id');
    res.status(500).json({ success: false, message: 'Failed to update tax code' });
  }
});

// Net VAT owed for a tax period = VAT on income (collected) − VAT on expenses
// (reclaimable), summed from the ledger's tax_amount_minor in the window.
async function computePeriodTax(db, period) {
  const codes = await db.query('SELECT id FROM finance_tax_codes WHERE jurisdiction = $1', [period.jurisdiction]);
  const ids = codes.rows.map(r => r.id);
  if (ids.length === 0) return 0;
  const col = repCol(period.currency);
  const { rows } = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN direction='in'  THEN tax_amount_minor ELSE 0 END),0) AS collected,
       COALESCE(SUM(CASE WHEN direction='out' THEN tax_amount_minor ELSE 0 END),0) AS reclaimable
     FROM finance_transactions
     WHERE status='cleared' AND tax_code = ANY($1)
       AND occurred_on >= $2 AND occurred_on <= $3`,
    [ids, period.period_start, period.period_end]
  );
  // tax_amount_minor is stored in the transaction's own currency minor units;
  // for a period we report in its declared currency, so use the reporting
  // normalisation only when currencies differ. Kept simple: tax is small and
  // typically same-currency as the jurisdiction; we return the raw net here.
  void col;
  return Number(rows[0].collected) - Number(rows[0].reclaimable);
}

router.get('/tax/periods', async (req, res) => {
  try {
    const rows = await req.db.query('SELECT * FROM finance_tax_periods ORDER BY due_date DESC');
    // Decorate with live status (overdue) without mutating stored rows.
    const periods = rows.rows.map(p => ({
      ...p,
      effective_status: (p.status !== 'filed' && p.status !== 'paid'
        && new Date(p.due_date) < new Date()) ? 'overdue' : p.status,
    }));
    res.json({ success: true, periods });
  } catch (err) {
    logRouteError(req, res, err, 'GET /finance/tax/periods');
    res.status(500).json({ success: false, message: 'Failed to load tax periods' });
  }
});

router.post('/tax/periods', async (req, res) => {
  try {
    const db = req.db;
    const { jurisdiction, tax_kind, period_start, period_end, due_date, currency, notes } = req.body || {};
    if (!['UK','KE'].includes(jurisdiction) || !['vat','income_tax'].includes(tax_kind)
        || !period_start || !period_end || !due_date)
      return res.status(400).json({ success: false, message: 'jurisdiction, tax_kind, period_start, period_end and due_date are required' });
    const cur = validCurrency(currency) ? currency : (jurisdiction === 'UK' ? 'GBP' : 'KES');
    const id = `TXP-${uuidv4().slice(0, 8).toUpperCase()}`;
    await db.query(
      `INSERT INTO finance_tax_periods (id, jurisdiction, tax_kind, period_start, period_end, due_date, currency, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, jurisdiction, tax_kind, period_start, period_end, due_date, cur, notes || null]
    );
    const created = await db.query('SELECT * FROM finance_tax_periods WHERE id = $1', [id]);
    const amount = await computePeriodTax(db, created.rows[0]);
    await db.query('UPDATE finance_tax_periods SET amount_due_minor = $2 WHERE id = $1', [id, amount]);
    cacheInvalidate(CACHE_PREFIX);
    res.status(201).json({ success: true, id, amount_due_minor: amount });
  } catch (err) {
    logRouteError(req, res, err, 'POST /finance/tax/periods');
    res.status(500).json({ success: false, message: 'Failed to create tax period' });
  }
});

router.patch('/tax/periods/:id', async (req, res) => {
  try {
    const db = req.db;
    const { rows } = await db.query('SELECT * FROM finance_tax_periods WHERE id = $1', [req.params.id]);
    const period = rows[0];
    if (!period) return res.status(404).json({ success: false, message: 'Tax period not found' });

    const sets = []; const params = [];
    const set = (c, v) => { params.push(v); sets.push(c.replace('?', `$${params.length}`)); };
    if (req.body.status !== undefined) {
      if (!['open','due','filed','overdue','paid'].includes(req.body.status))
        return res.status(400).json({ success: false, message: 'invalid status' });
      set('status = ?', req.body.status);
      if (req.body.status === 'filed') set('filed_on = ?', req.body.filed_on || new Date().toISOString().slice(0, 10));
      if (req.body.status === 'paid')  set('paid_on = ?',  req.body.paid_on  || new Date().toISOString().slice(0, 10));
    }
    if (req.body.reference !== undefined) set('reference = ?', req.body.reference || null);
    if (req.body.notes !== undefined) set('notes = ?', req.body.notes || null);
    if (req.body.recompute === true) set('amount_due_minor = ?', await computePeriodTax(db, period));
    if (!sets.length) return res.status(400).json({ success: false, message: 'No fields to update' });
    params.push(req.params.id);
    await db.query(`UPDATE finance_tax_periods SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    cacheInvalidate(CACHE_PREFIX);
    const updated = await db.query('SELECT * FROM finance_tax_periods WHERE id = $1', [req.params.id]);
    res.json({ success: true, period: updated.rows[0] });
  } catch (err) {
    logRouteError(req, res, err, 'PATCH /finance/tax/periods/:id');
    res.status(500).json({ success: false, message: 'Failed to update tax period' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// REPORTS (live)
// ─────────────────────────────────────────────────────────────────────────────
function dateRange(req) {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from = req.query.from || `${new Date().getFullYear()}-01-01`;
  const currency = validCurrency(req.query.currency) ? req.query.currency : 'GBP';
  return { from, to, currency };
}

async function pnlData(db, from, to, currency) {
  const col = repCol(currency);
  const byCat = await db.query(
    `SELECT c.id, c.name, c.kind,
            COALESCE(SUM(t.${col}),0) AS total_minor
       FROM finance_transactions t
       LEFT JOIN finance_categories c ON c.id = t.category_id
      WHERE t.status='cleared' AND t.occurred_on >= $1 AND t.occurred_on <= $2
      GROUP BY c.id, c.name, c.kind
      ORDER BY c.kind, total_minor DESC`,
    [from, to]
  );
  const income = byCat.rows.filter(r => r.kind === 'income');
  const expense = byCat.rows.filter(r => r.kind === 'expense');
  const other = byCat.rows.filter(r => !r.kind); // uncategorised — infer by direction below
  const incTotal = income.reduce((s, r) => s + Number(r.total_minor), 0);
  const expTotal = expense.reduce((s, r) => s + Number(r.total_minor), 0);
  return { currency, from, to, income, expense, uncategorised: other,
           income_minor: incTotal, expense_minor: expTotal, net_minor: incTotal - expTotal };
}

router.get('/reports/pnl', async (req, res) => {
  try {
    const { from, to, currency } = dateRange(req);
    res.json({ success: true, report: await pnlData(req.db, from, to, currency) });
  } catch (err) {
    logRouteError(req, res, err, 'GET /finance/reports/pnl');
    res.status(500).json({ success: false, message: 'Failed to build P&L' });
  }
});

async function cashflowData(db, from, to, currency) {
  const col = repCol(currency);
  const rows = await db.query(
    `SELECT to_char(date_trunc('month', occurred_on), 'YYYY-MM') AS month,
            COALESCE(SUM(CASE WHEN direction='in'  THEN ${col} ELSE 0 END),0) AS in_minor,
            COALESCE(SUM(CASE WHEN direction='out' THEN ${col} ELSE 0 END),0) AS out_minor
       FROM finance_transactions
      WHERE status='cleared' AND occurred_on >= $1 AND occurred_on <= $2
      GROUP BY 1 ORDER BY 1`,
    [from, to]
  );
  return { currency, from, to, months: rows.rows.map(r => ({
    month: r.month, in_minor: Number(r.in_minor), out_minor: Number(r.out_minor),
    net_minor: Number(r.in_minor) - Number(r.out_minor),
  })) };
}

router.get('/reports/cashflow', async (req, res) => {
  try {
    const { from, to, currency } = dateRange(req);
    res.json({ success: true, report: await cashflowData(req.db, from, to, currency) });
  } catch (err) {
    logRouteError(req, res, err, 'GET /finance/reports/cashflow');
    res.status(500).json({ success: false, message: 'Failed to build cash flow' });
  }
});

async function taxData(db, from, to, jurisdiction) {
  const params = [from, to];
  let jWhere = '';
  if (jurisdiction === 'UK' || jurisdiction === 'KE') { params.push(jurisdiction); jWhere = `AND tc.jurisdiction = $3`; }
  const rows = await db.query(
    `SELECT tc.jurisdiction, tc.id AS tax_code, tc.name, tc.rate_pct,
            COALESCE(SUM(CASE WHEN t.direction='in'  THEN t.tax_amount_minor ELSE 0 END),0) AS collected_minor,
            COALESCE(SUM(CASE WHEN t.direction='out' THEN t.tax_amount_minor ELSE 0 END),0) AS reclaimable_minor
       FROM finance_transactions t
       JOIN finance_tax_codes tc ON tc.id = t.tax_code
      WHERE t.status='cleared' AND t.occurred_on >= $1 AND t.occurred_on <= $2 ${jWhere}
      GROUP BY tc.jurisdiction, tc.id, tc.name, tc.rate_pct
      ORDER BY tc.jurisdiction, tc.name`,
    params
  );
  const lines = rows.rows.map(r => ({
    jurisdiction: r.jurisdiction, tax_code: r.tax_code, name: r.name, rate_pct: Number(r.rate_pct),
    collected_minor: Number(r.collected_minor), reclaimable_minor: Number(r.reclaimable_minor),
    net_minor: Number(r.collected_minor) - Number(r.reclaimable_minor),
  }));
  return { from, to, jurisdiction: jurisdiction || 'all', lines,
           net_minor: lines.reduce((s, l) => s + l.net_minor, 0) };
}

router.get('/reports/tax', async (req, res) => {
  try {
    const { from, to } = dateRange(req);
    res.json({ success: true, report: await taxData(req.db, from, to, req.query.jurisdiction) });
  } catch (err) {
    logRouteError(req, res, err, 'GET /finance/reports/tax');
    res.status(500).json({ success: false, message: 'Failed to build tax report' });
  }
});

// ── CSV export ───────────────────────────────────────────────────────────────
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(headers, rows) {
  return [headers.join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
}
function money(minor) { return (Number(minor) / 100).toFixed(2); }

router.get('/reports/:type/export', async (req, res) => {
  try {
    const db = req.db;
    const { from, to, currency } = dateRange(req);
    const type = req.params.type;
    const format = (req.query.format || 'csv').toLowerCase();
    if (format !== 'csv') return res.status(400).json({ success: false, message: 'Only format=csv is supported server-side' });

    let csv = '';
    let filename = `finance-${type}-${from}_to_${to}.csv`;

    if (type === 'pnl') {
      const r = await pnlData(db, from, to, currency);
      const rows = [
        ...r.income.map(c => ['Income', c.name || 'Uncategorised', money(c.total_minor)]),
        ...r.expense.map(c => ['Expense', c.name || 'Uncategorised', money(c.total_minor)]),
        ['', 'Total income', money(r.income_minor)],
        ['', 'Total expense', money(r.expense_minor)],
        ['', `Net profit/loss (${currency})`, money(r.net_minor)],
      ];
      csv = toCsv(['Type', 'Category', `Amount (${currency})`], rows);
    } else if (type === 'cashflow') {
      const r = await cashflowData(db, from, to, currency);
      csv = toCsv(['Month', `Money in (${currency})`, `Money out (${currency})`, `Net (${currency})`],
        r.months.map(m => [m.month, money(m.in_minor), money(m.out_minor), money(m.net_minor)]));
    } else if (type === 'tax') {
      const r = await taxData(db, from, to, req.query.jurisdiction);
      csv = toCsv(['Jurisdiction', 'Tax code', 'Rate %', 'Collected', 'Reclaimable', 'Net due'],
        r.lines.map(l => [l.jurisdiction, l.name, l.rate_pct, money(l.collected_minor), money(l.reclaimable_minor), money(l.net_minor)]));
    } else if (type === 'transactions') {
      const rows = await db.query(
        `SELECT t.occurred_on, t.direction, t.amount_minor, t.currency, t.description,
                t.counterparty, t.reference, c.name AS category, a.name AS account, t.status
           FROM finance_transactions t
           LEFT JOIN finance_categories c ON c.id = t.category_id
           LEFT JOIN finance_accounts a ON a.id = t.account_id
          WHERE t.occurred_on >= $1 AND t.occurred_on <= $2
          ORDER BY t.occurred_on DESC`, [from, to]);
      csv = toCsv(['Date', 'Direction', 'Amount', 'Currency', 'Description', 'Counterparty', 'Reference', 'Category', 'Account', 'Status'],
        rows.rows.map(t => [t.occurred_on?.toISOString?.().slice(0, 10) || t.occurred_on, t.direction,
          money(t.amount_minor), t.currency, t.description, t.counterparty, t.reference, t.category, t.account, t.status]));
    } else {
      return res.status(400).json({ success: false, message: 'Unknown report type' });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    logRouteError(req, res, err, 'GET /finance/reports/:type/export');
    res.status(500).json({ success: false, message: 'Failed to export report' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SYNC — manual reconcile/backfill from the customer-payment tables
// ─────────────────────────────────────────────────────────────────────────────
router.post('/sync', async (req, res) => {
  try {
    const counts = await syncFinanceLedger(req.db);
    cacheInvalidate(CACHE_PREFIX);
    res.json({ success: true, synced: counts });
  } catch (err) {
    logRouteError(req, res, err, 'POST /finance/sync');
    res.status(500).json({ success: false, message: 'Failed to sync finance ledger' });
  }
});

export default router;
