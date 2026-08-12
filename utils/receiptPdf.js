// utils/receiptPdf.js
//
// One-page branded payment receipt for the WhatsApp flow. Rendered with
// pdfkit (pure JS — no headless browser, Railway-safe), uploaded to the
// private Supabase Storage bucket 'receipts', delivered to the customer
// as a 7-day signed URL over WhatsApp.
//
// The 'receipts' bucket must exist (private). Created during cutover —
// see the deploy notes in .env.example / the cutover checklist.

import PDFDocument from 'pdfkit';
import { getSupabaseAdmin } from './supabaseAdmin.js';

const BRAND = '#c2410c';      // Thapsus ember orange
const INK = '#111827';
const MUTED = '#6b7280';

/**
 * @param {object} p
 * @param {object} p.order    wa_orders row (quote snapshot + tracking_code)
 * @param {object} p.contact  wa_contacts row (name, code, phone)
 * @param {object} p.payment  payments row (id, amounts, mpesa ref, paid_at)
 * @returns {Promise<Buffer>}
 */
export function renderReceiptPdf({ order, contact, payment }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(22).fillColor(BRAND).font('Helvetica-Bold').text('THAPSUS CARGO');
    doc.fontSize(10).fillColor(MUTED).font('Helvetica')
      .text('Shop the world, delivered to Kenya', { paddingTop: 2 });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(BRAND).lineWidth(2).stroke();
    doc.moveDown(1);

    doc.fontSize(16).fillColor(INK).font('Helvetica-Bold').text('Payment Receipt');
    doc.moveDown(0.8);

    const paidAt = payment.paid_at ? new Date(payment.paid_at) : new Date();
    const rows = [
      ['Receipt no.', payment.id],
      ['Date', paidAt.toLocaleString('en-KE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Nairobi' })],
      ['Customer', `${contact.full_name || '—'} (${contact.customer_code || '—'})`],
      ['Tracking code', order.tracking_code || 'Assigned shortly'],
      ['Payment method', 'M-Pesa'],
      ...(payment.mpesa_reference ? [['M-Pesa reference', payment.mpesa_reference]] : []),
    ];

    for (const [label, value] of rows) {
      const y = doc.y;
      doc.fontSize(10).fillColor(MUTED).font('Helvetica').text(label, 50, y, { width: 150 });
      doc.fontSize(10).fillColor(INK).font('Helvetica-Bold').text(String(value), 210, y, { width: 335 });
      doc.moveDown(0.6);
    }

    doc.moveDown(0.8);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
    doc.moveDown(0.8);

    // Amount breakdown (quote snapshot). All money fields optional-safe.
    const usd = order.usd_price != null ? Number(order.usd_price) : null;
    const rate = order.fx_rate != null ? Number(order.fx_rate) : null;
    const markup = order.markup_pct != null ? Number(order.markup_pct) : null;
    const kes = (v) => `KSh ${Number(v).toLocaleString('en-KE')}`;

    doc.fontSize(12).fillColor(INK).font('Helvetica-Bold').text('Order summary', 50);
    doc.moveDown(0.5);
    const money = [
      ...(usd != null ? [['Item price', `$${usd.toFixed(2)} USD`]] : []),
      ...(rate != null ? [['Exchange rate', `1 USD = ${rate.toFixed(2)} KES`]] : []),
      ...(markup != null ? [['Service margin', `${markup.toFixed(0)}%`]] : []),
      ['Amount paid', kes(payment.amount_due_kes ?? order.quote_kes ?? 0)],
    ];
    for (const [label, value] of money) {
      const y = doc.y;
      const isTotal = label === 'Amount paid';
      doc.fontSize(isTotal ? 12 : 10).fillColor(isTotal ? BRAND : MUTED)
        .font(isTotal ? 'Helvetica-Bold' : 'Helvetica').text(label, 50, y, { width: 150 });
      doc.fontSize(isTotal ? 12 : 10).fillColor(isTotal ? BRAND : INK)
        .font('Helvetica-Bold').text(String(value), 210, y, { width: 335 });
      doc.moveDown(isTotal ? 0.8 : 0.6);
    }

    doc.moveDown(1.5);
    doc.fontSize(9).fillColor(MUTED).font('Helvetica').text(
      `Track your parcel any time: message your tracking code to our WhatsApp line. ` +
      `Keep your customer code (${contact.customer_code || '—'}) for all future orders.`,
      50, doc.y, { width: 495 }
    );
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor(MUTED).text('Asante for shopping with Thapsus Cargo! 🧡', 50);

    doc.end();
  });
}

/**
 * Render + upload the receipt, returning the storage path.
 * Path: receipts/<orderId>/<paymentId>.pdf (idempotent per payment —
 * upsert overwrites on retry).
 */
export async function generateAndStoreReceipt({ order, contact, payment }) {
  const buffer = await renderReceiptPdf({ order, contact, payment });
  const path = `${order.id}/${payment.id}.pdf`;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from('receipts')
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`receipt upload failed: ${error.message}`);
  return path;
}
