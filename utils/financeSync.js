// utils/financeSync.js
//
// Bridges the customer-payment tables into the business finance ledger
// (finance_transactions, migration 057). Settled customer payments and paid
// supplier/agent invoices flow in as money-in / money-out so the books stay
// current without anyone re-keying them. Manual entries (expenses, other
// income) are added through routes/finance.js.
//
// Idempotent: every synced row carries (source, source_id) and the partial
// unique index uq_finance_tx_source makes re-running a no-op. IDs are also
// deterministic (FTX-<src>-<id>) so the PK collides too — belt and braces.
//
// Money is stored in MINOR units (GBP pence, KES cents). fx_rate_gbp_kes is
// KES-per-GBP (e.g. 164.2), matching payments.stripe_fx_rate_kes_gbp and
// utils/fx.js, so: kes_minor = gbp_minor * rate, gbp_minor = kes_minor / rate.

import { getGbpToKesRate, FxRateUnavailableError } from './fx.js';

// Reporting-only fallback. Unlike the payment-creation path (which MUST fail
// when no rate is set), normalising historical reporting figures should never
// block the dashboard, so we approximate with the display default.
const FALLBACK_GBP_KES = 164.2;

async function reportingRate(db) {
  try {
    const { rate } = await getGbpToKesRate(db);
    return rate;
  } catch (e) {
    if (e instanceof FxRateUnavailableError) return FALLBACK_GBP_KES;
    throw e;
  }
}

// Shared SELECT-list builders keep the live hook and the backfill in lock-step.
// $1::numeric is always the reporting/fallback GBP_KES rate.

const PAYMENTS_INSERT = (extraWhere = '') => `
  INSERT INTO finance_transactions
    (id, direction, amount_minor, currency, amount_gbp_minor, amount_kes_minor,
     fx_rate_gbp_kes, category_id, account_id, occurred_on, description,
     reference, source, source_id, status, created_at)
  SELECT
    'FTX-PAY-' || p.id,
    'in',
    (CASE WHEN p.method = 'stripe' AND p.stripe_amount_pence_gbp IS NOT NULL
          THEN p.stripe_amount_pence_gbp
          ELSE p.amount_due_kes * 100 END)::bigint,
    CASE WHEN p.method = 'stripe' THEN 'GBP' ELSE 'KES' END,
    (CASE WHEN p.method = 'stripe' AND p.stripe_amount_pence_gbp IS NOT NULL
          THEN p.stripe_amount_pence_gbp
          ELSE ROUND(p.amount_due_kes * 100 / $1::numeric) END)::bigint,
    (CASE WHEN p.method = 'stripe' AND p.stripe_amount_pence_gbp IS NOT NULL
          THEN ROUND(p.stripe_amount_pence_gbp * COALESCE(p.stripe_fx_rate_kes_gbp, $1::numeric))
          ELSE p.amount_due_kes * 100 END)::bigint,
    COALESCE(p.stripe_fx_rate_kes_gbp, $1::numeric),
    CASE p.target_kind WHEN 'buy_for_me' THEN 'CAT-INC-BFM'
                       WHEN 'consolidation' THEN 'CAT-INC-INVOICE'
                       ELSE 'CAT-INC-SHIPPING' END,
    CASE WHEN p.method = 'stripe' THEN 'ACC-STRIPE-GBP' ELSE 'ACC-MPESA-KES' END,
    COALESCE(p.paid_at, p.created_at)::date,
    'Customer payment (' || p.target_kind || ')',
    COALESCE(p.stripe_payment_intent_id, p.mpesa_reference),
    'payment', p.id, 'cleared', COALESCE(p.paid_at, NOW())
  FROM payments p
  WHERE p.status = 'paid' ${extraWhere}
  ON CONFLICT (source, source_id) WHERE (source <> 'manual') DO NOTHING`;

/**
 * Best-effort live hook — called after markPaymentPaid commits. Inserts the
 * single income row for a freshly-paid payment. NEVER throws into the caller:
 * a finance-ledger hiccup must not affect the customer's settled payment.
 */
export async function recordPaymentIncome(db, paymentId) {
  try {
    const rate = await reportingRate(db);
    await db.query(PAYMENTS_INSERT('AND p.id = $2'), [rate, paymentId]);
  } catch (e) {
    // 42P01 = finance tables not migrated yet; anything else is logged + swallowed.
    if (e?.code !== '42P01') {
      console.warn(`[financeSync] recordPaymentIncome(${paymentId}) failed:`, e?.message);
    }
  }
}

/**
 * Full reconcile / backfill. Upserts ledger rows for every settled payment,
 * standalone paid customer invoice, paid clearing-agent invoice (money out)
 * and paid Tudor supplier invoice (money out). Returns per-source insert
 * counts. Each source runs independently so a missing optional table doesn't
 * abort the whole sync.
 */
export async function syncFinanceLedger(db) {
  const rate = await reportingRate(db);
  const counts = {};

  const runStep = async (key, sql, params = [rate]) => {
    try {
      const r = await db.query(sql, params);
      counts[key] = r.rowCount || 0;
    } catch (e) {
      counts[key] = `error: ${e.message}`;
      console.warn(`[financeSync] step '${key}' failed:`, e?.message);
    }
  };

  await runStep('payments', PAYMENTS_INSERT());

  // Customer invoices paid WITHOUT a payments row (admin-marked / legacy).
  // Anything paid through the payments flow is already captured above, so the
  // NOT EXISTS guard prevents double-counting the same income.
  await runStep('customer_invoices', `
    INSERT INTO finance_transactions
      (id, direction, amount_minor, currency, amount_gbp_minor, amount_kes_minor,
       fx_rate_gbp_kes, category_id, account_id, occurred_on, description,
       reference, source, source_id, status, created_at)
    SELECT
      'FTX-CCI-' || c.id::text, 'in',
      ROUND(c.invoice_amount * 100)::bigint,
      COALESCE(c.invoice_currency, 'KES'),
      (CASE WHEN COALESCE(c.invoice_currency,'KES') = 'GBP'
            THEN ROUND(c.invoice_amount * 100)
            ELSE ROUND(c.invoice_amount * 100 / $1::numeric) END)::bigint,
      (CASE WHEN COALESCE(c.invoice_currency,'KES') = 'GBP'
            THEN ROUND(c.invoice_amount * 100 * $1::numeric)
            ELSE ROUND(c.invoice_amount * 100) END)::bigint,
      $1::numeric,
      'CAT-INC-INVOICE',
      CASE WHEN COALESCE(c.invoice_currency,'KES') = 'GBP' THEN 'ACC-BANK-GBP' ELSE 'ACC-MPESA-KES' END,
      COALESCE(c.invoice_paid_at, c.updated_at, c.created_at)::date,
      'Customer invoice', c.id::text,
      'customer_invoice', c.id::text, 'cleared', COALESCE(c.invoice_paid_at, NOW())
    FROM customer_consolidations c
    WHERE c.invoice_status = 'paid' AND c.invoice_amount IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM payments p
         WHERE p.target_kind = 'consolidation' AND p.target_id = c.id::text AND p.status = 'paid'
      )
    ON CONFLICT (source, source_id) WHERE (source <> 'manual') DO NOTHING`);

  // Clearing-agent invoices (money out, KES).
  await runStep('agent_invoices', `
    INSERT INTO finance_transactions
      (id, direction, amount_minor, currency, amount_gbp_minor, amount_kes_minor,
       fx_rate_gbp_kes, category_id, account_id, occurred_on, description,
       reference, source, source_id, status, created_at)
    SELECT
      'FTX-AGT-' || a.id, 'out',
      ROUND(a.amount_kes * 100)::bigint, 'KES',
      ROUND(a.amount_kes * 100 / $1::numeric)::bigint,
      ROUND(a.amount_kes * 100)::bigint,
      $1::numeric, 'CAT-EXP-AGENT', 'ACC-BANK-KES',
      COALESCE(a.paid_at, a.created_at)::date,
      'Clearing agent invoice', a.invoice_no,
      'agent_invoice', a.id, 'cleared', COALESCE(a.paid_at, NOW())
    FROM agent_invoices a
    WHERE a.status = 'paid'
    ON CONFLICT (source, source_id) WHERE (source <> 'manual') DO NOTHING`);

  // Tudor supplier invoices (money out, GBP).
  await runStep('tudor_invoices', `
    INSERT INTO finance_transactions
      (id, direction, amount_minor, currency, amount_gbp_minor, amount_kes_minor,
       fx_rate_gbp_kes, category_id, account_id, occurred_on, description,
       counterparty, reference, source, source_id, status, created_at)
    SELECT
      'FTX-TDR-' || t.id, 'out',
      ROUND(t.amount_gbp * 100)::bigint, 'GBP',
      ROUND(t.amount_gbp * 100)::bigint,
      ROUND(t.amount_gbp * 100 * $1::numeric)::bigint,
      $1::numeric, 'CAT-EXP-SUPPLIER', 'ACC-BANK-GBP',
      COALESCE(t.paid_at, t.created_at)::date,
      'Supplier (Tudor) invoice', 'Tudor', t.invoice_no,
      'tudor_invoice', t.id, 'cleared', COALESCE(t.paid_at, NOW())
    FROM tudor_invoices t
    WHERE t.status = 'paid'
    ON CONFLICT (source, source_id) WHERE (source <> 'manual') DO NOTHING`);

  return counts;
}
