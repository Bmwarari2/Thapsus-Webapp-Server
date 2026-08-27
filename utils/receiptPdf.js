// utils/receiptPdf.js
//
// One-page branded payment receipt for the WhatsApp flow. Rendered with
// pdfkit (pure JS — no headless browser, Railway-safe), uploaded to the
// private Supabase Storage bucket 'receipts', and delivered to the
// customer as a short /r/ link over WhatsApp (see utils/receiptLink.js).
//
// Layout follows the invoice convention the owner asked for: a full-
// height brand rail down the left edge, the word RECEIPT set large at
// the top right over its number and date, an itemised table with ruled
// columns, and a totals block bottom-right facing a terms block
// bottom-left. Everything is laid out in absolute coordinates against
// the constants below rather than pdfkit's text cursor, because the
// cursor drifts as soon as a value wraps.
//
// The 'receipts' bucket must exist (private). Created during cutover —
// see the deploy notes in .env.example / the cutover checklist.

import PDFDocument from 'pdfkit';
import { getSupabaseAdmin } from './supabaseAdmin.js';

const BRAND = '#c2410c';      // Thapsus ember orange
const INK = '#111827';
const MUTED = '#6b7280';
const RULE = '#e5e7eb';
const PANEL = '#f9fafb';

// A5 (419.53 × 595.28pt), not A4: every one of these is opened on a
// phone from a WhatsApp link, and A4 leaves a third of the page empty
// under a two-line receipt. A5 still prints cleanly, scaled onto A4.
// The rail eats the left edge; content runs LEFT → RIGHT with the
// totals column right-aligned at RIGHT.
const RAIL_W = 16;
const LEFT = 42;
const RIGHT = 396;
const WIDTH = RIGHT - LEFT;

const kes = (v) => `KSh ${Math.round(Number(v) || 0).toLocaleString('en-KE')}`;

/**
 * @param {object} p
 * @param {object} p.order    wa_orders row (quote snapshot + tracking_code)
 * @param {object} p.contact  wa_contacts row (name, code, phone)
 * @param {object} p.payment  payments row (id, amounts, mpesa ref, paid_at)
 * @returns {Promise<Buffer>}
 */
export function renderReceiptPdf({ order, contact, payment }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 0 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const H = doc.page.height;

    // ── Brand rail + masthead band ──────────────────────────────────
    doc.rect(0, 0, RAIL_W, H).fill(BRAND);
    doc.rect(RAIL_W, 0, doc.page.width - RAIL_W, 112).fill(INK);

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(19)
      .text('THAPSUS CARGO', LEFT, 30, { characterSpacing: 1 });
    doc.font('Helvetica').fontSize(7).fillColor('#d1d5db')
      .text('SHOP THE WORLD, DELIVERED TO KENYA', LEFT, 52, { characterSpacing: 0.9 });
    doc.fontSize(7).fillColor('#9ca3af')
      .text('WhatsApp support · thapsus.uk', LEFT, 66);

    // RECEIPT wordmark, right-aligned in the band.
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#ffffff')
      .text('RECEIPT', LEFT, 28, { width: WIDTH, align: 'right', characterSpacing: 1.8 });
    const paidAt = payment.paid_at ? new Date(payment.paid_at) : new Date();
    doc.font('Helvetica').fontSize(9).fillColor('#d1d5db')
      .text(`No. ${payment.id}`, LEFT, 57, { width: WIDTH, align: 'right' })
      .text(
        paidAt.toLocaleDateString('en-KE', { dateStyle: 'long', timeZone: 'Africa/Nairobi' }),
        LEFT, 69, { width: WIDTH, align: 'right' }
      );

    // PAID stamp — the one thing a customer scans for.
    doc.roundedRect(RIGHT - 54, 84, 54, 16, 3).fill(BRAND);
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff')
      .text('PAID', RIGHT - 54, 89, { width: 54, align: 'center', characterSpacing: 1.4 });

    // ── Billed-to / order meta, two columns ─────────────────────────
    let y = 134;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
      .text('BILLED TO', LEFT, y, { characterSpacing: 0.8 });
    doc.text('ORDER', LEFT + 200, y, { characterSpacing: 0.8 });
    y += 14;

    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK)
      .text(contact.full_name || '—', LEFT, y, { width: 185 });
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
    let leftY = doc.y + 2;
    if (contact.customer_code) {
      doc.text(`Customer code ${contact.customer_code}`, LEFT, leftY, { width: 185 });
      leftY = doc.y;
    }
    if (contact.phone) {
      doc.text(`+${String(contact.phone).replace(/^\+/, '')}`, LEFT, leftY, { width: 185 });
      leftY = doc.y;
    }
    if (contact.delivery_address) {
      doc.text(contact.delivery_address, LEFT, leftY + 1, { width: 175 });
      leftY = doc.y;
    }

    const meta = [
      ['Tracking code', order.tracking_code || 'Assigned shortly'],
      ['Payment method', 'M-Pesa'],
      ...(payment.mpesa_reference ? [['M-Pesa reference', payment.mpesa_reference]] : []),
    ];
    let rightY = y;
    for (const [label, value] of meta) {
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text(label, LEFT + 200, rightY, { width: 154 });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
        .text(String(value), LEFT + 200, rightY + 10, { width: 154 });
      rightY = doc.y + 5;
    }

    // ── Itemised table ──────────────────────────────────────────────
    y = Math.max(leftY, rightY) + 18;
    const COL = { desc: LEFT + 7, unit: LEFT + 170, qty: LEFT + 236, total: LEFT + 275 };
    const COL_W = { desc: 165, unit: 60, qty: 32, total: 72 };

    doc.rect(LEFT, y, WIDTH, 20).fill(INK);
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff');
    doc.text('DESCRIPTION', COL.desc, y + 7, { width: COL_W.desc, characterSpacing: 0.6 });
    doc.text('UNIT', COL.unit, y + 7, { width: COL_W.unit, align: 'right', characterSpacing: 0.6 });
    doc.text('QTY', COL.qty, y + 7, { width: COL_W.qty, align: 'right', characterSpacing: 0.6 });
    doc.text('AMOUNT', COL.total, y + 7, { width: COL_W.total, align: 'right', characterSpacing: 0.6 });
    y += 20;

    const { goodsKes, serviceKes, total, items } = receiptLineItems({ order, payment });

    doc.font('Helvetica');
    for (const [i, item] of items.entries()) {
      const rowH = 30;
      if (i % 2 === 1) doc.rect(LEFT, y, WIDTH, rowH).fill(PANEL);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK)
        .text(item.desc, COL.desc, y + 6, { width: COL_W.desc, ellipsis: true, height: 11 });
      doc.font('Helvetica').fontSize(7).fillColor(MUTED)
        .text(item.sub, COL.desc, y + 17, { width: COL_W.desc, ellipsis: true, height: 9 });
      doc.font('Helvetica').fontSize(8.5).fillColor(INK);
      doc.text(item.unit, COL.unit, y + 11, { width: COL_W.unit, align: 'right' });
      doc.text(item.qty, COL.qty, y + 11, { width: COL_W.qty, align: 'right' });
      doc.font('Helvetica-Bold')
        .text(item.amount, COL.total, y + 11, { width: COL_W.total, align: 'right' });
      y += rowH;
      doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.5).strokeColor(RULE).stroke();
    }

    // ── Totals block, right-aligned under the table ─────────────────
    const totalsTop = y + 10;
    const labelX = LEFT + 176;
    const valueX = COL.total;
    let ty = totalsTop;
    const totalRow = (label, value, strong = false) => {
      doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 9 : 8.5)
        .fillColor(strong ? INK : MUTED)
        .text(label, labelX, ty, { width: 98, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(strong ? 9 : 8.5).fillColor(INK)
        .text(value, valueX, ty, { width: COL_W.total, align: 'right' });
      ty += 14;
    };
    totalRow('Subtotal', kes(goodsKes));
    if (serviceKes > 0) totalRow('Service', kes(serviceKes));
    totalRow('VAT', 'Not applicable');

    // A receipt is a financial document: the PAID amount must be what was
    // actually verified. When the reviewer recorded a short payment
    // (approved under override), stamp what was received and name the
    // balance instead of asserting the invoice amount was paid.
    const receivedKes = payment.amount_received_kes != null
      ? Number(payment.amount_received_kes) : null;
    const balanceKes = receivedKes != null && receivedKes < total ? total - receivedKes : 0;
    if (balanceKes > 0) totalRow('Invoice total', kes(total));

    doc.rect(labelX, ty + 2, RIGHT - labelX, 24).fill(BRAND);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff')
      .text(balanceKes > 0 ? 'RECEIVED' : 'TOTAL PAID', labelX + 8, ty + 11, { width: 80, characterSpacing: 0.6 });
    doc.fontSize(11)
      .text(kes(balanceKes > 0 ? receivedKes : total), valueX - 8, ty + 9, { width: COL_W.total, align: 'right' });
    ty += 34;
    if (balanceKes > 0) {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK)
        .text('Balance due', labelX, ty, { width: 98, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK)
        .text(kes(balanceKes), valueX, ty, { width: COL_W.total, align: 'right' });
      ty += 14;
    }

    // ── Terms block, facing the totals ──────────────────────────────
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
      .text('TERMS & NEXT STEPS', LEFT, totalsTop, { characterSpacing: 0.8 });
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(
      order.tracking_code
        ? `Text ${order.tracking_code} to our WhatsApp line any time for a live status update. `
          + 'A last-mile delivery fee may apply when the parcel lands in Kenya; we will tell you '
          + 'before dispatch. Keep this receipt for your records.'
        : 'Text your tracking code to our WhatsApp line any time for a live status update. '
          + 'Keep this receipt for your records.',
      LEFT, totalsTop + 12, { width: 160, lineGap: 1.5 }
    );

    // ── Journey strip ───────────────────────────────────────────────
    // Fills the space a two-line invoice leaves on A4 with the one thing
    // a parcel customer actually wants next: where this order goes from
    // here, and which stage it's at right now.
    const stripY = Math.max(ty, doc.y) + 22;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
      .text('WHAT HAPPENS NEXT', LEFT, stripY, { characterSpacing: 0.8 });

    const STAGES = ['Paid', 'Purchased', 'In Kenya', 'Out for delivery', 'Delivered'];
    const reached = STAGE_INDEX[order.status] ?? 0;
    const dotY = stripY + 26;
    const gap = (WIDTH - 10) / (STAGES.length - 1);

    doc.moveTo(LEFT + 5, dotY).lineTo(RIGHT - 5, dotY)
      .lineWidth(1).strokeColor(RULE).stroke();
    if (reached > 0) {
      doc.moveTo(LEFT + 5, dotY).lineTo(LEFT + 5 + gap * reached, dotY)
        .lineWidth(1.5).strokeColor(BRAND).stroke();
    }
    STAGES.forEach((label, i) => {
      const cx = LEFT + 5 + gap * i;
      const done = i <= reached;
      doc.circle(cx, dotY, 4).fill(done ? BRAND : '#ffffff');
      if (!done) doc.circle(cx, dotY, 4).lineWidth(1).strokeColor(RULE).stroke();
      doc.font(i === reached ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.5)
        .fillColor(done ? INK : MUTED)
        .text(label, cx - gap / 2, dotY + 10, { width: gap, align: 'center' });
    });

    // ── Footer ──────────────────────────────────────────────────────
    const footY = Math.max(dotY + 40, H - 62);
    doc.moveTo(LEFT, footY).lineTo(RIGHT, footY).lineWidth(0.5).strokeColor(RULE).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
      .text('Asante for shopping with Thapsus Cargo.', LEFT, footY + 11);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK)
      .text('Thapsus Cargo', LEFT, footY + 11, { width: WIDTH, align: 'right' });
    doc.font('Helvetica').fontSize(7).fillColor(MUTED)
      .text('Authorised — computer generated, no signature required',
        LEFT, footY + 22, { width: WIDTH, align: 'right' });

    doc.end();
  });
}

/**
 * Split the amount paid back into goods + service using the quote
 * snapshot, and describe both as table rows. Exported because this is
 * the only arithmetic on the page worth testing — the rest is layout.
 *
 * @returns {{goodsKes: number, serviceKes: number, total: number, items: object[]}}
 */
export function receiptLineItems({ order, payment }) {
  const usd = order.usd_price != null ? Number(order.usd_price) : null;
  const rate = order.fx_rate != null ? Number(order.fx_rate) : null;
  const markup = order.markup_pct != null ? Number(order.markup_pct) : null;
  const total = Number(payment.amount_due_kes ?? order.quote_kes ?? 0);

  // The last-mile fee is inside quote_kes when it was charged with the
  // order, so it has to come out before the remainder can be called
  // "service and handling" — otherwise a KSh 300 delivery charge is
  // billed to the customer as part of a 10% margin.
  const deliveryKes = order.delivery_fee_in_quote
    ? Math.max(0, Number(order.delivery_fee_kes || 0))
    : 0;
  const goodsKes = (usd != null && rate != null) ? Math.round(usd * rate) : Math.max(0, total - deliveryKes);
  const serviceKes = Math.max(0, total - goodsKes - deliveryKes);

  const items = [
    {
      desc: describeItem(order),
      sub: usd != null && rate != null
        ? `$${usd.toFixed(2)} at 1 USD = ${rate.toFixed(2)} KES`
        : 'Purchased on your behalf',
      unit: kes(goodsKes),
      qty: '1',
      amount: kes(goodsKes),
    },
    ...(serviceKes > 0 ? [{
      desc: 'Service and handling',
      sub: markup != null ? `${markup.toFixed(0)}% of item value` : 'Sourcing, purchase and shipping',
      unit: kes(serviceKes),
      qty: '1',
      amount: kes(serviceKes),
    }] : []),
    ...(deliveryKes > 0 ? [{
      desc: 'Last-mile delivery',
      sub: 'To your address in Kenya',
      unit: kes(deliveryKes),
      qty: '1',
      amount: kes(deliveryKes),
    }] : []),
  ];
  return { goodsKes, serviceKes, deliveryKes, total, items };
}

// Which journey dot is lit, by order status. A receipt is only ever
// generated from 'paid' onwards, so 0 is the floor.
const STAGE_INDEX = {
  paid: 0, purchased: 1, in_kenya: 2, delivery_fee_pending: 2,
  dispatched: 3, delivered: 4,
  // A collected parcel skipped dispatch, but the journey is over — it
  // lights the last dot, not the third.
  collected: 4,
};

/** Best available human name for what was bought. */
function describeItem(order) {
  if (order.product_note) return String(order.product_note).slice(0, 90);
  const links = Array.isArray(order.product_links) ? order.product_links : [];
  if (links[0]) {
    try {
      return `Order from ${new URL(links[0]).hostname.replace(/^www\./i, '')}`;
    } catch { /* fall through */ }
  }
  return 'Item purchased on your behalf';
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
