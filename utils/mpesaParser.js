// utils/mpesaParser.js
// Parses an M-Pesa payment-confirmation SMS pasted by the customer into
// (reference, amount_kes, sender_phone). Forgiving regex — Safaricom has
// shipped at least four message formats over the years.
//
// Examples we handle:
//   "TI82A4XYZ1 Confirmed. Ksh1,500.00 sent to THAPSUS CARGO 5530500
//    on 3/5/26 at 1:24 PM. New M-PESA balance is Ksh3,210.50."
//   "TI82A4XYZ1 Confirmed. Ksh1500 sent to ... on 3/5/26 ..."
//   "JK12LMN9PQ Confirmed. You have received Ksh2,400.00 from JOHN DOE
//    254712345678 on 3/5/26 at 10:00 AM. ..."
//
// The amount + reference are required for an admin to approve the payment.
// The phone is best-effort (some formats omit it entirely).

const REF_RE     = /\b([A-Z0-9]{10})\s+Confirmed/i;
const AMOUNT_RE  = /Ksh\s*([\d,]+(?:\.\d{1,2})?)/i;
// Phone: any 9-12 digit run that starts with 254|07|01|+254 — first match wins.
const PHONE_RE   = /(?:\+?254|0)\s?([17]\d{2})\s?(\d{6})/;

export function parseMpesaMessage(raw) {
  if (typeof raw !== 'string' || raw.length < 20) {
    return { ok: false, reason: 'Message too short or empty' };
  }
  const cleaned = raw.replace(/\s+/g, ' ').trim();

  const refMatch = cleaned.match(REF_RE);
  if (!refMatch) return { ok: false, reason: 'No M-Pesa reference (10-char code) found' };
  const reference = refMatch[1].toUpperCase();

  const amtMatch = cleaned.match(AMOUNT_RE);
  if (!amtMatch) return { ok: false, reason: 'No Ksh amount found' };
  const amountKes = Math.round(Number(amtMatch[1].replace(/,/g, '')));
  if (!Number.isFinite(amountKes) || amountKes <= 0) {
    return { ok: false, reason: 'Could not parse Ksh amount' };
  }

  const phoneMatch = cleaned.match(PHONE_RE);
  const phone = phoneMatch ? `254${phoneMatch[1]}${phoneMatch[2]}` : null;

  return { ok: true, reference, amountKes, phone };
}
