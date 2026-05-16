// utils/accountDataExport.js
//
// Builds the HTML data export bundled with an account deletion request.
// One readable file per request that covers everything DSAR currently
// ships in JSON form, plus the deletion-timeline footer customers asked
// for. Stored at:
//
//   {bucket}/{user_id}/{request_id}.html
//
// where {bucket} is process.env.ACCOUNT_DELETION_EXPORT_BUCKET (default
// 'account-deletion-exports'). The bucket should be PRIVATE — every
// download flows through a signed URL (createSignedUrl with the
// 30-day max). This is the same surface DSAR uses for export delivery,
// just rendered as HTML rather than JSON so the customer doesn't need
// a tool to read it.
//
// Like the DSAR export, this deliberately omits payment-proof
// artefacts (M-Pesa SMS contents, payer phone, Stripe PaymentIntent IDs):
// the customer already received those at payment time and bundling
// them widens the attack surface if the signed URL is forwarded.

import { getSupabaseAdmin, createSignedDownloadUrl } from './supabaseAdmin.js';

const DEFAULT_BUCKET = 'account-deletion-exports';
// Supabase signed-URL max is 7 days for anon-key paths but unlimited
// for service-role; we cap at 30d so a customer who clicks the email
// link 13 days later still gets a working download.
const SIGNED_URL_TTL_SECONDS = 30 * 24 * 60 * 60;

function bucketName() {
  return process.env.ACCOUNT_DELETION_EXPORT_BUCKET || DEFAULT_BUCKET;
}

function esc(value) {
  if (value === null || value === undefined) return '—';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  } catch {
    return String(iso);
  }
}

function sectionTable(title, rows, columns) {
  if (!rows || rows.length === 0) {
    return `<section><h2>${esc(title)}</h2><p class="empty">No rows on file.</p></section>`;
  }
  const head = columns.map(c => `<th>${esc(c.label)}</th>`).join('');
  const body = rows.map(row => {
    const tds = columns.map(c => `<td>${esc(c.render ? c.render(row) : row[c.key])}</td>`).join('');
    return `<tr>${tds}</tr>`;
  }).join('');
  return `<section><h2>${esc(title)} <span class="count">(${rows.length})</span></h2>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></section>`;
}

/**
 * Gather every row we hold against the user. Same source list as DSAR
 * export, minus payment-proof fields. Each table query is independent
 * so one missing table on an older environment doesn't blow up the
 * whole export.
 */
async function gatherUserData(db, userId) {
  const safeQuery = async (sql, params) => {
    try {
      const { rows } = await db.query(sql, params);
      return rows;
    } catch (e) {
      // Table may not exist on older environments — return an empty
      // section rather than crashing.
      return [];
    }
  };

  const [profile, orders, packages, transactions, payments, tickets, bfm, notifications, consolidations] = await Promise.all([
    safeQuery(`SELECT id, email, name, phone, warehouse_id, language_pref,
                       country_of_residence, kyc_status, marketing_consent_at,
                       utm_source, utm_medium, utm_campaign, role, is_active,
                       created_at
                FROM users WHERE id = $1`, [userId]),
    safeQuery(`SELECT id, tracking_number, retailer, status, description,
                       weight_kg, hold_reason, hold_resolved_at,
                       created_at, updated_at
                FROM orders WHERE user_id = $1
                ORDER BY created_at DESC`, [userId]),
    safeQuery(`SELECT id, order_id, status, description, weight_kg,
                       warehouse_location, received_at
                FROM packages
                WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)
                ORDER BY received_at DESC NULLS LAST`, [userId]),
    safeQuery(`SELECT id, type, amount, currency, payment_method, status,
                       created_at
                FROM transactions WHERE user_id = $1
                ORDER BY created_at DESC`, [userId]),
    safeQuery(`SELECT id, target_kind, target_id, amount_due_kes, currency,
                       method, status, created_at, paid_at
                FROM payments WHERE user_id = $1
                ORDER BY created_at DESC`, [userId]),
    safeQuery(`SELECT id, subject, status, priority, created_at, updated_at
                FROM tickets WHERE user_id = $1
                ORDER BY created_at DESC`, [userId]),
    safeQuery(`SELECT id, retailer_name, item_name, item_qty, status,
                       estimate_gbp, markup_pct, created_at
                FROM buy_for_me_orders WHERE user_id = $1
                ORDER BY created_at DESC`, [userId]),
    safeQuery(`SELECT id, title, body, kind, read_at, created_at
                FROM notifications WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT 200`, [userId]),
    safeQuery(`SELECT id, status, invoice_amount_kes, created_at, paid_at
                FROM customer_consolidations WHERE user_id = $1
                ORDER BY created_at DESC`, [userId]),
  ]);

  return {
    profile: profile[0] || null,
    orders,
    packages,
    transactions,
    payments,
    tickets,
    bfm,
    notifications,
    consolidations,
  };
}

function renderHtml({ user, request, data }) {
  const scheduledDate = formatDate(request.scheduled_deletion_at);
  const requestedDate = formatDate(request.requested_at);
  const generatedDate = formatDate(new Date().toISOString());

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Thapsus Cargo — your data export</title>
  <style>
    body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
           color: #1a1a1a; background: #faf7f1; margin: 0; padding: 32px; line-height: 1.5; }
    header { border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 24px; }
    h1 { font-size: 26pt; margin: 0 0 6px; }
    h2 { font-size: 14pt; color: #0c2747; margin: 24px 0 8px; }
    h2 .count { font-size: 11pt; color: #6b6b6b; font-weight: 400; }
    section { background: #fff; padding: 18px 20px; border-radius: 12px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.04); margin: 16px 0; }
    table { border-collapse: collapse; width: 100%; font-size: 11pt; }
    th { text-align: left; background: #0c2747; color: #fff; padding: 8px 10px; }
    td { padding: 7px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    .meta { color: #6b6b6b; font-size: 11pt; }
    .empty { color: #6b6b6b; font-style: italic; }
    .timeline { background: #1a1a1a; color: #faf7f1; padding: 18px 20px;
                border-radius: 12px; margin: 24px 0; }
    .timeline h2 { color: #faf7f1; }
    .timeline p { margin: 6px 0; }
    .footer { color: #6b6b6b; font-size: 10pt; margin-top: 32px;
              border-top: 1px solid #ddd; padding-top: 16px; }
  </style>
</head>
<body>
<header>
  <h1>Your Thapsus Cargo data</h1>
  <p class="meta">Generated ${esc(generatedDate)} · Account: ${esc(user.email)}</p>
</header>

<div class="timeline">
  <h2>Account deletion timeline</h2>
  <p><strong>Requested:</strong> ${esc(requestedDate)}</p>
  <p><strong>Scheduled deletion:</strong> ${esc(scheduledDate)}</p>
  <p>You can cancel this deletion from the app at any point before the scheduled date. After deletion completes, this download link will continue to work for 30 days from the request date so you keep an offline copy of your data.</p>
</div>

${data.profile ? `<section><h2>Profile</h2>
  <table>
    <tr><th>Field</th><th>Value</th></tr>
    <tr><td>Email</td><td>${esc(data.profile.email)}</td></tr>
    <tr><td>Name</td><td>${esc(data.profile.name)}</td></tr>
    <tr><td>Phone</td><td>${esc(data.profile.phone)}</td></tr>
    <tr><td>Warehouse ID</td><td>${esc(data.profile.warehouse_id)}</td></tr>
    <tr><td>Country of residence</td><td>${esc(data.profile.country_of_residence)}</td></tr>
    <tr><td>Language</td><td>${esc(data.profile.language_pref)}</td></tr>
    <tr><td>KYC status</td><td>${esc(data.profile.kyc_status)}</td></tr>
    <tr><td>Marketing consent</td><td>${esc(formatDate(data.profile.marketing_consent_at))}</td></tr>
    <tr><td>Role</td><td>${esc(data.profile.role)}</td></tr>
    <tr><td>Account created</td><td>${esc(formatDate(data.profile.created_at))}</td></tr>
  </table></section>` : ''}

${sectionTable('Orders / pre-registered parcels', data.orders, [
  { key: 'tracking_number', label: 'Tracking #' },
  { key: 'retailer', label: 'Retailer' },
  { key: 'description', label: 'Description' },
  { key: 'status', label: 'Status' },
  { label: 'Weight (kg)', render: r => r.weight_kg },
  { label: 'Created', render: r => formatDate(r.created_at) },
])}

${sectionTable('Packages', data.packages, [
  { key: 'id', label: 'Package ID' },
  { key: 'description', label: 'Description' },
  { key: 'status', label: 'Status' },
  { label: 'Weight (kg)', render: r => r.weight_kg },
  { label: 'Received', render: r => formatDate(r.received_at) },
])}

${sectionTable('Buy-for-me orders', data.bfm, [
  { key: 'retailer_name', label: 'Retailer' },
  { key: 'item_name', label: 'Item' },
  { key: 'item_qty', label: 'Qty' },
  { key: 'status', label: 'Status' },
  { label: 'Estimate (GBP)', render: r => r.estimate_gbp },
  { label: 'Markup %', render: r => r.markup_pct },
  { label: 'Created', render: r => formatDate(r.created_at) },
])}

${sectionTable('Consolidations', data.consolidations, [
  { key: 'id', label: 'Consolidation ID' },
  { key: 'status', label: 'Status' },
  { label: 'Invoice (KES)', render: r => r.invoice_amount_kes },
  { label: 'Created', render: r => formatDate(r.created_at) },
  { label: 'Paid', render: r => formatDate(r.paid_at) },
])}

${sectionTable('Transactions (legacy)', data.transactions, [
  { key: 'type', label: 'Type' },
  { label: 'Amount', render: r => `${r.amount} ${r.currency}` },
  { key: 'payment_method', label: 'Method' },
  { key: 'status', label: 'Status' },
  { label: 'Created', render: r => formatDate(r.created_at) },
])}

${sectionTable('Payments', data.payments, [
  { key: 'target_kind', label: 'Target' },
  { label: 'Amount (KES)', render: r => r.amount_due_kes },
  { key: 'method', label: 'Method' },
  { key: 'status', label: 'Status' },
  { label: 'Created', render: r => formatDate(r.created_at) },
  { label: 'Paid', render: r => formatDate(r.paid_at) },
])}

${sectionTable('Support tickets', data.tickets, [
  { key: 'subject', label: 'Subject' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { label: 'Created', render: r => formatDate(r.created_at) },
  { label: 'Updated', render: r => formatDate(r.updated_at) },
])}

${sectionTable('Notifications (last 200)', data.notifications, [
  { key: 'kind', label: 'Kind' },
  { key: 'title', label: 'Title' },
  { label: 'Created', render: r => formatDate(r.created_at) },
  { label: 'Read', render: r => formatDate(r.read_at) },
])}

<div class="footer">
  <p>This export was generated for your record under your GDPR / DPA 2018 right of access. Payment-proof artefacts (M-Pesa SMS contents, Stripe PaymentIntent IDs, payer phone numbers) are deliberately excluded. If you didn't request this, please reply to the email this link was attached to immediately.</p>
  <p>Thapsus Cargo Compliance</p>
</div>
</body>
</html>`;
}

/**
 * Build and upload the HTML export. Returns the storage path + a
 * fresh signed URL. Caller writes both onto the
 * `account_deletion_requests` row.
 */
export async function generateAndUploadHtmlExport(db, { userId, request }) {
  const data = await gatherUserData(db, userId);
  if (!data.profile) {
    throw new Error('User no longer exists — cannot build export.');
  }

  const html = renderHtml({ user: data.profile, request, data });
  const bucket = bucketName();
  const path   = `${userId}/${request.id}.html`;

  const sb = getSupabaseAdmin();
  if (!sb) {
    throw new Error('Supabase service-role client not configured (SUPABASE_SERVICE_KEY missing).');
  }

  // Bucket is provisioned manually in Supabase Studio (private). The
  // PR description documents the one-time setup. supabase-js upload()
  // will surface a clear "Bucket not found" if the operator skips
  // that step.
  const { error: uploadErr } = await sb.storage
    .from(bucket)
    .upload(path, html, {
      contentType: 'text/html; charset=utf-8',
      upsert: true,
    });
  if (uploadErr) {
    throw new Error(`Failed to upload export: ${uploadErr.message}`);
  }

  const signed = await createSignedDownloadUrl(bucket, path, SIGNED_URL_TTL_SECONDS);
  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

  return {
    storagePath: `${bucket}/${path}`,
    signedUrl: signed?.signedUrl || null,
    expiresAt,
  };
}

/**
 * Re-issue a fresh signed URL for an existing export. Used when the
 * stored URL is past its TTL or the customer wants a new one from
 * inside the app.
 */
export async function refreshExportSignedUrl(storagePath) {
  if (!storagePath) return null;
  const [bucket, ...rest] = storagePath.split('/');
  const path = rest.join('/');
  const signed = await createSignedDownloadUrl(bucket, path, SIGNED_URL_TTL_SECONDS);
  return {
    signedUrl: signed?.signedUrl || null,
    expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  };
}
