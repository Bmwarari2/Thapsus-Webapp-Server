import { google } from 'googleapis';
import { getPool } from '../database/init.js';
import { v4 as uuidv4 } from 'uuid';

// ── Gmail OAuth2 Client ────────────────────────────────────────────────────
let _oauth2Client = null;

function getOAuth2Client() {
  if (_oauth2Client) return _oauth2Client;

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Gmail API not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN environment variables.'
    );
  }

  _oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'https://developers.google.com/oauthplayground'
  );

  _oauth2Client.setCredentials({ refresh_token: refreshToken });
  return _oauth2Client;
}

function getSenderAddress() {
  return process.env.GMAIL_SENDER_EMAIL || process.env.EMAIL_FROM || 'noreply@thapsus.uk';
}

/**
 * Build a raw RFC 2822 email message for the Gmail API.
 */
function buildRawEmail({ from, to, subject, html, text }) {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const messageParts = [
    `From: ${from}`,
    `To: ${Array.isArray(to) ? to.join(', ') : to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text || '').toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html || '').toString('base64'),
    '',
    `--${boundary}--`,
  ];

  const rawMessage = messageParts.join('\r\n');

  return Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendWithGmail(mailOptions, retries = 2) {
  const auth = getOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth });

  const senderEmail = getSenderAddress();
  const from = mailOptions.from || `Thapsus Cargo <${senderEmail}>`;

  const raw = buildRawEmail({
    from,
    to: mailOptions.to,
    subject: mailOptions.subject,
    html: mailOptions.html,
    text: mailOptions.text,
  });

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw },
      });
      console.log(`📧 Email sent to ${mailOptions.to}: ${mailOptions.subject} (attempt ${attempt + 1})`);
      return response.data;
    } catch (err) {
      lastError = err;
      if (err.code === 401 || err.message?.includes('invalid_grant')) {
        _oauth2Client = null;
      }
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

async function logEmailSent({ toEmail, emailType, subject, userId = null, errorMessage = null }) {
  try {
    const pool = getPool();
    const status = errorMessage ? 'failed' : 'sent';
    await pool.query(
      `INSERT INTO email_logs (id, user_id, email_to, email_type, subject, status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [uuidv4(), userId, toEmail, emailType, subject, status, errorMessage || null]
    );
  } catch (err) {
    console.warn('Failed to log email to database:', err.message);
  }
}

// ── Helpers & Layouts ──────────────────────────────────────────────────────

function costBreakdownTable(order) {
  const shipping_cost = order.shipping_cost?.toLocaleString() ?? order.estimated_cost?.toLocaleString();
  const handling_fee = order.handling_fee > 0 ? order.handling_fee.toLocaleString() : null;
  const insurance_fee = order.insurance_fee > 0 ? order.insurance_fee.toLocaleString() : null;
  const customs_duty = order.customs_duty > 0 ? order.customs_duty.toLocaleString() : null;
  const total_cost = ((order.actual_cost ?? order.estimated_cost ?? 0) + (order.customs_duty ?? 0)).toLocaleString();
  const is_actual_cost = !!order.actual_cost;

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin:16px 0; font-size:14px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:8px 12px; text-align:left; color:#6b7280; font-weight:600;">Item</th>
          <th style="padding:8px 12px; text-align:right; color:#6b7280; font-weight:600;">Amount (KES)</th>
        </tr>
      </thead>
      <tbody>
        ${shipping_cost ? `<tr><td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">Shipping Rate</td><td style="padding:8px 12px; text-align:right; border-bottom:1px solid #e5e7eb;">${shipping_cost}</td></tr>` : ''}
        ${handling_fee ? `<tr><td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">Handling Fee</td><td style="padding:8px 12px; text-align:right; border-bottom:1px solid #e5e7eb;">${handling_fee}</td></tr>` : ''}
        ${insurance_fee ? `<tr><td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">Insurance Fee</td><td style="padding:8px 12px; text-align:right; border-bottom:1px solid #e5e7eb;">${insurance_fee}</td></tr>` : ''}
        ${customs_duty ? `<tr><td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">Customs Duty</td><td style="padding:8px 12px; text-align:right; border-bottom:1px solid #e5e7eb;">${customs_duty}</td></tr>` : ''}
        <tr style="background:#eff6ff;">
          <td style="padding:10px 12px; font-weight:700; color:#1e3a5f;">Total</td>
          <td style="padding:10px 12px; text-align:right; font-weight:700; color:#1e3a5f;">KES ${total_cost}</td>
        </tr>
      </tbody>
    </table>
    ${!is_actual_cost ? `<p style="font-size:12px; color:#f97316; margin-top:4px;">* Estimated cost — final amount confirmed once your parcel is weighed.</p>` : ''}
  `;
}

function emailFooter() {
  return `
    <tr>
      <td style="background-color:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
          Thapsus Cargo Shipping &amp; Forwarding &bull; Nairobi, Kenya<br>
          This is an automated message. Please do not reply to this email.
        </p>
      </td>
    </tr>`;
}

function emailHeader() {
  return `
    <tr>
      <td style="background-color:#1e3a5f;padding:32px 40px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:bold;">
          Thapsus<span style="color:#f97316;">Cargo</span>
        </h1>
      </td>
    </tr>`;
}

function emailLayout(bodyHtml) {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
              ${emailHeader()}
              <tr><td style="padding:40px;">${bodyHtml}</td></tr>
              ${emailFooter()}
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;
}

// ── Exported Email Functions ───────────────────────────────────────────────

async function sendPasswordResetEmail(toEmail, toName, resetLink) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Password Reset Request</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      We received a request to reset the password for your Thapsus Cargo account.
      Click the button below to create a new password. This link will expire in 1 hour.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${resetLink}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">Reset My Password</a>
        </td>
      </tr>
    </table>`;
  const subject = 'Reset Your Thapsus Cargo Password';
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'password_reset', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'password_reset', subject, errorMessage: error.message });
    throw error;
  }
}

async function sendPaymentRequestEmail(toEmail, toName, trackingNumber, amount, notes, paymentLink, order) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Payment Request</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      A payment is due for your order <strong>${trackingNumber}</strong>.
    </p>
    
    ${costBreakdownTable(order)}

    ${notes ? `<p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;background-color:#f9fafb;padding:12px 16px;border-left:4px solid #f97316;border-radius:4px;"><em>${notes}</em></p>` : ''}
    
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${paymentLink}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">Pay Now</a>
        </td>
      </tr>
    </table>`;

  const subject = `Payment Request for Order ${trackingNumber}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'payment_request', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'payment_request', subject, errorMessage: error.message });
    throw error;
  }
}

async function sendPaymentReminderEmail(toEmail, toName, trackingNumber, amount, notes, paymentLink, order) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Payment Reminder</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      This is a friendly reminder that a payment is outstanding for your order <strong>${trackingNumber}</strong>.
    </p>

    ${costBreakdownTable(order)}

    ${notes ? `<div style="margin:0 0 24px;background-color:#fef9c3;padding:12px 16px;border-left:4px solid #f59e0b;border-radius:4px;"><p style="margin:0;color:#92400e;font-size:14px;line-height:1.6;"><strong>Note from admin:</strong> ${notes}</p></div>` : ''}
    
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${paymentLink}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">Pay Now</a>
        </td>
      </tr>
    </table>`;

  const subject = `Payment Reminder for Order ${trackingNumber}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'payment_reminder', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'payment_reminder', subject, errorMessage: error.message });
    throw error;
  }
}

// Placeholders for remaining functions used in admin.js
async function sendAdminPasswordResetEmail() { /* implementation */ }
async function sendOrderCreatedEmail() { /* implementation */ }
async function sendWelcomeAccountEmail() { /* implementation */ }
async function sendPaymentReceiptEmail() { /* implementation */ }
async function sendTicketCreatedEmail() { /* implementation */ }
async function sendTicketReplyEmail() { /* implementation */ }

// --- FIXED EXPORTS BLOCK ---

// Explicitly add named exports for all functions
export {
  sendPasswordResetEmail,
  sendAdminPasswordResetEmail,
  sendPaymentRequestEmail,
  sendOrderCreatedEmail,
  sendWelcomeAccountEmail,
  sendPaymentReminderEmail,
  sendPaymentReceiptEmail,
  sendTicketCreatedEmail,
  sendTicketReplyEmail,
};

// Keep default export for components relying on a default import
export default {
  sendPasswordResetEmail,
  sendAdminPasswordResetEmail,
  sendPaymentRequestEmail,
  sendOrderCreatedEmail,
  sendWelcomeAccountEmail,
  sendPaymentReminderEmail,
  sendPaymentReceiptEmail,
  sendTicketCreatedEmail,
  sendTicketReplyEmail,
};
