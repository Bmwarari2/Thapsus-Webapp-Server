import { google } from 'googleapis';
import { getPool } from '../database/init.js';
import { v4 as uuidv4 } from 'uuid';

// ── Gmail OAuth2 Client ────────────────────────────────────────────────────
let _oauth2Client = null;

function getOAuth2Client() {
  if (_oauth2Client) return _oauth2Client;

  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
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
  if (!auth) {
    throw new Error(
      'Gmail API not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, ' +
      'GMAIL_REFRESH_TOKEN, and GMAIL_SENDER_EMAIL in Railway → Variables.'
    );
  }

  const gmail = google.gmail({ version: 'v1', auth });

  const senderEmail = getSenderAddress();
  const from = mailOptions.from || `Thapsus Cargo <${senderEmail}>`;

  const raw = buildRawEmail({
    from,
    to:      mailOptions.to,
    subject: mailOptions.subject,
    html:    mailOptions.html,
    text:    mailOptions.text,
  });

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await gmail.users.messages.send({
        userId:      'me',
        requestBody: { raw },
      });
      console.log(
        `📧 Email sent to ${mailOptions.to}: ${mailOptions.subject} (attempt ${attempt + 1})`
      );
      return response.data;
    } catch (err) {
      lastError = err;
      if (
        err.code === 401 ||
        err.code === 400 ||
        err.message?.includes('invalid_grant') ||
        err.message?.includes('Invalid Credentials')
      ) {
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
  const shipping_cost  = order.shipping_cost?.toLocaleString() ?? order.estimated_cost?.toLocaleString();
  const handling_fee   = order.handling_fee  > 0 ? order.handling_fee.toLocaleString()  : null;
  const insurance_fee  = order.insurance_fee > 0 ? order.insurance_fee.toLocaleString() : null;
  const customs_duty   = order.customs_duty  > 0 ? order.customs_duty.toLocaleString()  : null;
  const total_cost     = ((order.actual_cost ?? order.estimated_cost ?? 0) + (order.customs_duty ?? 0)).toLocaleString();
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
        ${handling_fee  ? `<tr><td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">Handling Fee</td><td style="padding:8px 12px; text-align:right; border-bottom:1px solid #e5e7eb;">${handling_fee}</td></tr>`  : ''}
        ${insurance_fee ? `<tr><td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">Insurance Fee</td><td style="padding:8px 12px; text-align:right; border-bottom:1px solid #e5e7eb;">${insurance_fee}</td></tr>` : ''}
        ${customs_duty  ? `<tr><td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">Customs Duty</td><td style="padding:8px 12px; text-align:right; border-bottom:1px solid #e5e7eb;">${customs_duty}</td></tr>`  : ''}
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
      <td style="padding:0;">
        <!-- Footer Strip -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:32px 40px;border-radius:0 0 20px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.1);">
                    <p style="margin:0;font-size:20px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">
                      Thapsus<span style="color:#f97316;">Cargo</span>
                    </p>
                    <p style="margin:4px 0 0;font-size:11px;color:rgba(255,255,255,0.5);font-weight:600;letter-spacing:2px;text-transform:uppercase;">Shipping &amp; Forwarding</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.5);line-height:1.8;">
                            UK Warehouse: 31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB<br>
                            Website: <a href="https://www.thapsus.uk" style="color:#f97316;text-decoration:none;font-weight:700;">www.thapsus.uk</a>
                          </p>
                        </td>
                        <td align="right" valign="top">
                          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.3);white-space:nowrap;">Automated message</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function emailHeader() {
  return `
    <tr>
      <td style="padding:0;">
        <!-- Header with gradient and brand mark -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 60%,#1e4a7f 100%);padding:36px 40px 32px;border-radius:20px 20px 0 0;position:relative;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <!-- Logo -->
                    <p style="margin:0;font-size:26px;font-weight:900;color:#ffffff;letter-spacing:-1px;line-height:1;">
                      Thapsus<span style="color:#f97316;">Cargo</span>
                    </p>
                    <p style="margin:4px 0 0;font-size:10px;color:rgba(255,255,255,0.45);font-weight:700;letter-spacing:3px;text-transform:uppercase;">
                      Global Logistics
                    </p>
                  </td>
                  <td align="right" valign="middle">
                    <!-- Decorative accent pill -->
                    <span style="display:inline-block;background:rgba(249,115,22,0.2);border:1px solid rgba(249,115,22,0.4);color:#f97316;font-size:10px;font-weight:800;padding:4px 12px;border-radius:100px;letter-spacing:2px;text-transform:uppercase;">
                      LIVE
                    </span>
                  </td>
                </tr>
              </table>
              <!-- Decorative orange bottom accent bar -->
              <div style="position:absolute;bottom:0;left:40px;right:40px;height:2px;background:linear-gradient(to right,#f97316,rgba(249,115,22,0));border-radius:2px;"></div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function emailLayout(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Thapsus Cargo</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">
  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <!-- Email card -->
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(15,23,42,0.12),0 4px 16px rgba(15,23,42,0.06);">
          ${emailHeader()}
          <!-- Divider accent -->
          <tr><td style="height:4px;background:linear-gradient(to right,#f97316,#fb923c,rgba(249,115,22,0.1));"></td></tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;background:#ffffff;">
              ${bodyHtml}
            </td>
          </tr>
          ${emailFooter()}
        </table>
        <!-- Below-card note -->
        <p style="margin:24px 0 0;font-size:11px;color:#94a3b8;text-align:center;font-weight:600;letter-spacing:1px;text-transform:uppercase;">
          © ${new Date().getFullYear()} Thapsus Cargo Ltd. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Exported Email Functions ───────────────────────────────────────────────

async function sendPasswordResetEmail(toEmail, toName, resetLink) {
  const bodyHtml = `
    <h2 style="margin:0 0 8px;color:#0f172a;font-size:24px;font-weight:900;letter-spacing:-0.5px;">Password Reset Request</h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Security Notice</p>
    <p style="margin:0 0 16px;color:#334155;font-size:16px;line-height:1.7;font-weight:500;">Hello <strong style="color:#0f172a;">${toName || 'there'}</strong>,</p>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.7;">
      We received a request to reset the password for your Thapsus Cargo account.
      Click the button below to create a new password. This link will expire in <strong>1 hour</strong>.
    </p>
    <!-- CTA Button -->
    <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr>
        <td style="background:linear-gradient(135deg,#ea580c,#f97316);border-radius:12px;box-shadow:0 4px 14px rgba(249,115,22,0.4);">
          <a href="${resetLink}" target="_blank" style="display:inline-block;padding:16px 36px;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;letter-spacing:0.5px;">Reset My Password →</a>
        </td>
      </tr>
    </table>
    <!-- Info note -->
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:8px;">
      <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;font-weight:600;">⚠️ If you did not request this reset, please ignore this email. Your password will not change.</p>
    </div>`;
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

async function sendAdminPasswordResetEmail(toEmail, toName, resetLink) {
  const bodyHtml = `
    <h2 style="margin:0 0 8px;color:#0f172a;font-size:24px;font-weight:900;letter-spacing:-0.5px;">Admin Password Reset</h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Account Security</p>
    <p style="margin:0 0 16px;color:#334155;font-size:16px;line-height:1.7;font-weight:500;">Hello <strong style="color:#0f172a;">${toName || 'there'}</strong>,</p>
    <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.7;">
      A Thapsus Cargo administrator has initiated a password reset for your account.
      Click the button below to set a new password. This link will expire in <strong>1 hour</strong>.
    </p>
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 18px;margin:0 0 24px;">
      <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">If you were not expecting this, contact Thapsus Cargo support immediately.</p>
    </div>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="background:linear-gradient(135deg,#ea580c,#f97316);border-radius:12px;box-shadow:0 4px 14px rgba(249,115,22,0.4);">
          <a href="${resetLink}" target="_blank" style="display:inline-block;padding:16px 36px;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;">Set New Password →</a>
        </td>
      </tr>
    </table>`;
  const subject = 'Your Thapsus Cargo Password Has Been Reset by an Admin';
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'admin_password_reset', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'admin_password_reset', subject, errorMessage: error.message });
    throw error;
  }
}

async function sendPaymentRequestEmail(toEmail, toName, trackingNumber, amount, notes, paymentLink, order) {
  const bodyHtml = `
    <h2 style="margin:0 0 8px;color:#0f172a;font-size:24px;font-weight:900;letter-spacing:-0.5px;">Payment Required</h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Action Needed</p>
    <p style="margin:0 0 16px;color:#334155;font-size:16px;line-height:1.7;font-weight:500;">Hello <strong style="color:#0f172a;">${toName || 'there'}</strong>,</p>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.7;">
      A payment is due for order <strong style="color:#0f172a;font-family:monospace;">${trackingNumber}</strong>. Please complete your payment to allow us to proceed with shipping.
    </p>
    ${order ? costBreakdownTable(order) : `
    <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);border-radius:16px;padding:24px 28px;margin:0 0 24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:11px;color:rgba(255,255,255,0.5);font-weight:700;letter-spacing:2px;text-transform:uppercase;">Amount Due</p>
      <p style="margin:0;font-size:36px;font-weight:900;color:#f97316;letter-spacing:-1px;">KES ${amount?.toLocaleString?.() ?? amount}</p>
    </div>`}
    ${notes ? `<div style="background:#fff7ed;border-left:4px solid #f97316;border-radius:0 8px 8px 0;padding:14px 18px;margin:0 0 24px;"><p style="margin:0;color:#9a3412;font-size:14px;line-height:1.6;"><strong>Note:</strong> ${notes}</p></div>` : ''}
    <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      <tr>
        <td style="background:linear-gradient(135deg,#ea580c,#f97316);border-radius:12px;box-shadow:0 4px 14px rgba(249,115,22,0.4);">
          <a href="${paymentLink}" target="_blank" style="display:inline-block;padding:16px 40px;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;">Pay via M-Pesa →</a>
        </td>
      </tr>
    </table>`;

  const subject = `Payment Request for Order ${trackingNumber}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'payment_request', subject, userId: order?.user_id ?? null });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'payment_request', subject, userId: order?.user_id ?? null, errorMessage: error.message });
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

    ${order ? costBreakdownTable(order) : `<p style="font-size:16px;font-weight:bold;color:#1e3a5f;">Amount Due: KES ${amount?.toLocaleString?.() ?? amount}</p>`}

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
    await logEmailSent({ toEmail, emailType: 'payment_reminder', subject, userId: order?.user_id ?? null });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'payment_reminder', subject, userId: order?.user_id ?? null, errorMessage: error.message });
    throw error;
  }
}

async function sendOrderCreatedEmail(toEmail, toName, trackingNumber, retailer, market, description, shippingSpeed, ordersLink, order = null) {
  const speedLabel    = shippingSpeed === 'express' ? 'Express' : 'Economy';
  const marketFlags   = { UK: '🇬🇧', USA: '🇺🇸', China: '🇨🇳' };
  const marketDisplay = `${marketFlags[market] || ''} ${market}`.trim();

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Your Order Has Been Created</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      Thapsus Cargo has created a new order on your behalf. Here are the details:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;font-size:15px;">
      <tbody>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;width:40%;">Tracking Number</td>
          <td style="padding:10px 12px;color:#1e3a5f;font-weight:700;">${trackingNumber}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;background:#f9fafb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">Retailer</td>
          <td style="padding:10px 12px;color:#111827;">${retailer}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">Market</td>
          <td style="padding:10px 12px;color:#111827;">${marketDisplay}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;background:#f9fafb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">Description</td>
          <td style="padding:10px 12px;color:#111827;">${description}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">Shipping Speed</td>
          <td style="padding:10px 12px;color:#111827;">${speedLabel}</td>
        </tr>
      </tbody>
    </table>

    ${order ? `
    <h3 style="margin:0 0 8px;color:#1e3a5f;font-size:16px;font-weight:700;">Cost Breakdown</h3>
    ${costBreakdownTable(order)}
    ` : `
    <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:0 0 24px;">
      <p style="margin:0;color:#92400e;font-size:14px;line-height:1.6;">
        💡 Your order cost will be calculated once our warehouse team weighs and measures your package. You'll receive a payment request once it arrives.
      </p>
    </div>
    `}

    <p style="margin:0 0 24px;color:#4b5563;font-size:14px;line-height:1.6;">
      You will receive further updates as your order progresses. You can track your order at any time using the button below.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#1e3a5f;border-radius:8px;">
          <a href="${ordersLink}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">View My Orders</a>
        </td>
      </tr>
    </table>`;

  const subject = `New Order Created — ${trackingNumber}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'order_created', subject, userId: order?.user_id ?? null });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'order_created', subject, userId: order?.user_id ?? null, errorMessage: error.message });
    throw error;
  }
}

async function sendWelcomeAccountEmail(toEmail, toName, warehouseId, role, setupLink) {
  const roleLabel = role === 'admin' ? 'Administrator' : 'Customer';
  const bodyHtml = `
    <h2 style="margin:0 0 8px;color:#0f172a;font-size:24px;font-weight:900;letter-spacing:-0.5px;">Welcome to Thapsus Cargo! 🎉</h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Account Activation</p>
    <p style="margin:0 0 16px;color:#334155;font-size:16px;line-height:1.7;font-weight:500;">Hello <strong style="color:#0f172a;">${toName || 'there'}</strong>,</p>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.7;">
      Your <strong>${roleLabel}</strong> account has been created. Click the button below to set your password and start shipping from the UK &amp; China to Kenya.
      This link expires in <strong>24 hours</strong>.
    </p>
    <!-- Warehouse ID highlight card -->
    <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);border-radius:16px;padding:24px 28px;margin:0 0 28px;">
      <p style="margin:0 0 4px;font-size:11px;color:rgba(255,255,255,0.5);font-weight:700;letter-spacing:2px;text-transform:uppercase;">Your Warehouse ID</p>
      <p style="margin:0;font-size:28px;font-weight:900;color:#f97316;letter-spacing:-1px;font-family:monospace;">${warehouseId}</p>
      <p style="margin:8px 0 0;font-size:12px;color:rgba(255,255,255,0.5);line-height:1.6;">Include this ID in the delivery name when shipping to our UK warehouse.</p>
    </div>
    <!-- Details table -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 28px;font-size:14px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <tr style="background:#f8fafc;">
        <td style="padding:12px 16px;color:#64748b;font-weight:700;width:40%;border-bottom:1px solid #e2e8f0;">Email</td>
        <td style="padding:12px 16px;color:#0f172a;font-weight:600;border-bottom:1px solid #e2e8f0;">${toEmail}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;color:#64748b;font-weight:700;">Account Type</td>
        <td style="padding:12px 16px;color:#0f172a;font-weight:600;">${roleLabel}</td>
      </tr>
    </table>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="background:linear-gradient(135deg,#ea580c,#f97316);border-radius:12px;box-shadow:0 4px 14px rgba(249,115,22,0.4);">
          <a href="${setupLink}" target="_blank" style="display:inline-block;padding:16px 36px;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;">Activate My Account →</a>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">
      If you were not expecting this email, you can safely ignore it.
    </p>`;

  const subject = 'Welcome to Thapsus Cargo — Activate Your Account';
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'welcome_account', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'welcome_account', subject, errorMessage: error.message });
    throw error;
  }
}

async function sendPaymentReceiptEmail(toEmail, toName, trackingNumber, amount, paymentReference, paidAt) {
  const formattedAmount = typeof amount === 'number' ? amount.toLocaleString() : amount;
  const formattedDate   = paidAt
    ? new Date(paidAt).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })
    : new Date().toLocaleString('en-GB',        { dateStyle: 'long', timeStyle: 'short' });

  const bodyHtml = `
    <h2 style="margin:0 0 8px;color:#0f172a;font-size:24px;font-weight:900;letter-spacing:-0.5px;">Payment Confirmed ✓</h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Receipt</p>
    <p style="margin:0 0 16px;color:#334155;font-size:16px;line-height:1.7;font-weight:500;">Hello <strong style="color:#0f172a;">${toName || 'there'}</strong>,</p>
    <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.7;">
      We have successfully received your payment. Here is your receipt — please keep this for your records.
    </p>
    <!-- Receipt Card -->
    <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);border-radius:16px;padding:28px;margin:0 0 24px;">
      <p style="margin:0 0 20px;font-size:11px;color:rgba(255,255,255,0.4);font-weight:700;letter-spacing:2px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:12px;">Payment Receipt</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:8px 0;color:rgba(255,255,255,0.5);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;width:45%;">Tracking Number</td><td style="padding:8px 0;color:#f97316;font-size:14px;font-weight:900;font-family:monospace;">${trackingNumber}</td></tr>
        <tr><td style="padding:8px 0;color:rgba(255,255,255,0.5);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Amount Paid</td><td style="padding:8px 0;color:#4ade80;font-size:20px;font-weight:900;">KES ${formattedAmount}</td></tr>
        <tr><td style="padding:8px 0;color:rgba(255,255,255,0.5);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">M-Pesa Ref.</td><td style="padding:8px 0;color:#ffffff;font-size:14px;font-weight:700;font-family:monospace;">${paymentReference || 'N/A'}</td></tr>
        <tr><td style="padding:8px 0;color:rgba(255,255,255,0.5);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Date &amp; Time</td><td style="padding:8px 0;color:rgba(255,255,255,0.8);font-size:13px;font-weight:600;">${formattedDate}</td></tr>
      </table>
    </div>
    <!-- Confirmation banner -->
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:16px 20px;margin:0 0 8px;display:flex;align-items:center;">
      <p style="margin:0;color:#166534;font-size:15px;font-weight:700;">✓ Payment verified and approved. Your order is now being processed.</p>
    </div>`;

  const subject = `Payment Receipt — ${trackingNumber}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'payment_receipt', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'payment_receipt', subject, errorMessage: error.message });
    throw error;
  }
}

// ── Ticket emails (stubs retained) ────────────────────────────────────────────
async function sendTicketCreatedEmail() { /* TODO: implement when ticket email flow is added */ }
async function sendTicketReplyEmail()   { /* TODO: implement when ticket email flow is added */ }

// ── Exports ────────────────────────────────────────────────────────────────────

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
