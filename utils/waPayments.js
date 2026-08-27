// utils/waPayments.js
//
// Manual M-Pesa payments for the WhatsApp flow. Lipana withdrew STK for
// regulatory reasons, so every order is a Buy Goods transfer to the till
// that the team verifies by hand against the M-Pesa statement.
//
// That only works if the dashboard always has something to approve, so
// this module owns one rule: the moment a customer owes money there is an
// 'awaiting_review' payments row for that order — whether the amount was
// requested by an operator ("Send till instructions") or the customer
// simply replied YES to the quote on WhatsApp. Approving that row is what
// mints the tracking code and fires the receipt, via markPaymentPaid.

const OPEN_STATUSES = ['pending', 'awaiting_review'];

/** The Buy Goods till customers pay into. */
export function mpesaTill() {
  return process.env.MPESA_TILL_NUMBER || '5530500';
}

// M-Pesa references are 10 uppercase alphanumerics carrying at least one
// letter and one digit — the lookaheads stop us grabbing a phone number
// or a bare word out of a chatty message.
const MPESA_REF =
  /\b(?=[A-Z0-9]{10}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])[A-Z0-9]{10}\b/;

/** @returns {string|null} the M-Pesa confirmation code in `text`, if any. */
export function extractMpesaReference(text) {
  if (!text) return null;
  const m = String(text).toUpperCase().match(MPESA_REF);
  return m ? m[0] : null;
}

function newPaymentId() {
  return `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The order's live payment (pending or awaiting review), or null. */
export async function findOpenOrderPayment(db, orderId) {
  const { rows } = await db.query(
    `SELECT * FROM payments
      WHERE target_kind = 'wa_order' AND target_id = $1
        AND status = ANY($2::text[])
      ORDER BY created_at DESC LIMIT 1`,
    [orderId, OPEN_STATUSES]
  );
  return rows[0] || null;
}

/** The contact's most recent live payment across their orders, or null. */
export async function findOpenContactPayment(db, contactId) {
  const { rows } = await db.query(
    `SELECT * FROM payments
      WHERE wa_contact_id = $1 AND status = ANY($2::text[])
      ORDER BY created_at DESC LIMIT 1`,
    [contactId, OPEN_STATUSES]
  );
  return rows[0] || null;
}

/**
 * Get-or-create the awaiting_review row for a manual till payment.
 * Idempotent by design — callers fire it from several places (quote
 * confirmation on WhatsApp, the operator's "Send till instructions"
 * button, "Mark payment received") and must all land on the same row.
 *
 * @returns {Promise<{payment: object, created: boolean}>}
 */
export async function ensureManualPayment(db, { orderId, contactId, amountKes, phone = null }) {
  const open = await findOpenOrderPayment(db, orderId);
  if (open) return { payment: open, created: false };

  const id = newPaymentId();
  try {
    const { rows } = await db.query(
      `INSERT INTO payments
         (id, user_id, wa_contact_id, target_kind, target_id,
          amount_gross_kes, amount_credit_kes, amount_due_kes,
          currency, method, status, mpesa_provider, mpesa_phone_used)
       VALUES ($1, NULL, $2, 'wa_order', $3, $4, 0, $4, 'KES', 'mpesa',
               'awaiting_review', 'manual', $5)
       RETURNING *`,
      [id, contactId, orderId, amountKes, phone]
    );
    return { payment: rows[0], created: true };
  } catch (e) {
    // Check-then-insert race: a concurrent caller (a double "yes", the
    // YES handler vs the operator's request-payment click) landed its
    // row between our check and our insert. uq_payments_open_wa_order
    // (migration 0014) turns that into a 23505 instead of a duplicate
    // payment — settle for the row that won.
    if (e?.code === '23505') {
      const winner = await findOpenOrderPayment(db, orderId);
      if (winner) return { payment: winner, created: false };
    }
    throw e;
  }
}

/**
 * Record the customer's M-Pesa confirmation code on their open payment so
 * the operator can match it against the till statement before approving.
 * Best-effort: a duplicate reference (uq_payments_mpesa_ref) means the
 * code was already banked against another payment — worth knowing, never
 * worth failing the conversation over.
 */
export async function attachMpesaReference(db, paymentId, reference) {
  if (!paymentId || !reference) return false;
  try {
    const { rowCount } = await db.query(
      `UPDATE payments
          SET mpesa_reference = $2, updated_at = NOW()
        WHERE id = $1 AND mpesa_reference IS NULL`,
      [paymentId, reference]
    );
    return rowCount > 0;
  } catch (e) {
    if (e?.code === '23505') {
      console.warn(`[waPayments] M-Pesa ref ${reference} already used by another payment`);
      return false;
    }
    console.warn('[waPayments] failed to attach M-Pesa ref:', e?.message);
    return false;
  }
}
