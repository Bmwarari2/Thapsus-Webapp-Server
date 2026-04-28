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

async function sendAdminPasswordResetEmail(toEmail, toName, resetLink) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Your Password Has Been Reset</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      A Thapsus Cargo administrator has initiated a password reset for your account.
      Click the button below to set a new password. This link will expire in <strong>1 hour</strong>.
    </p>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you did not expect this, please contact Thapsus Cargo support immediately.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${resetLink}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">Set New Password</a>
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
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Payment Request</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      A payment is due for your order <strong>${trackingNumber}</strong>.
    </p>

    ${order ? costBreakdownTable(order) : `<p style="font-size:16px;font-weight:bold;color:#1e3a5f;">Amount Due: KES ${amount?.toLocaleString?.() ?? amount}</p>`}

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
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Welcome to Thapsus Cargo!</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Your <strong>${roleLabel}</strong> account has been created by a Thapsus Cargo administrator.
      Click the button below to set your password and activate your account.
      This setup link will expire in <strong>24 hours</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;font-size:15px;">
      <tbody>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;width:40%;">Email</td>
          <td style="padding:10px 12px;color:#111827;">${toEmail}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">Warehouse ID</td>
          <td style="padding:10px 12px;color:#1e3a5f;font-weight:700;">${warehouseId}</td>
        </tr>
      </tbody>
    </table>
    <p style="margin:0 0 8px;color:#4b5563;font-size:14px;line-height:1.6;">
      Your <strong>Warehouse ID</strong> is used to identify your shipments at our facility. Keep it handy.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${setupLink}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">Activate My Account</a>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
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
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Payment Received ✓</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      We have successfully received your payment. Below is your receipt:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;font-size:15px;">
      <tbody>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;width:45%;">Tracking Number</td>
          <td style="padding:10px 12px;color:#1e3a5f;font-weight:700;">${trackingNumber}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;background:#f9fafb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">Amount Paid</td>
          <td style="padding:10px 12px;color:#111827;font-weight:700;">KES ${formattedAmount}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">M-Pesa Reference</td>
          <td style="padding:10px 12px;color:#111827;">${paymentReference || 'N/A'}</td>
        </tr>
        <tr style="background:#f0fdf4;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">Date &amp; Time</td>
          <td style="padding:10px 12px;color:#111827;">${formattedDate}</td>
        </tr>
      </tbody>
    </table>
    <div style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:0 0 24px;">
      <p style="margin:0;color:#166534;font-size:15px;font-weight:600;">✓ Payment Confirmed</p>
      <p style="margin:4px 0 0;color:#166534;font-size:14px;">Your payment has been approved and your order is being processed.</p>
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

async function sendOrderUpdatedEmail(
  toEmail,
  toName,
  trackingNumber,
  retailer,
  market,
  description,
  shippingSpeed,
  order,
  ordersLink
) {
  const speedLabel    = shippingSpeed === 'express' ? 'Express' : 'Economy';
  const marketFlags   = { UK: '🇬🇧', USA: '🇺🇸', China: '🇨🇳' };
  const marketDisplay = `${marketFlags[market] || ''} ${market}`.trim();

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Your Order Has Been Updated</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      An administrator has updated the details and pricing for your order <strong>${trackingNumber}</strong>.
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

    <h3 style="margin:0 0 8px;color:#1e3a5f;font-size:16px;font-weight:700;">Updated Cost Breakdown</h3>
    ${costBreakdownTable(order)}

    <p style="margin:16px 0 24px;color:#4b5563;font-size:14px;line-height:1.6;">
      If anything looks incorrect, please contact support before making payment.
    </p>

    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#1e3a5f;border-radius:8px;">
          <a href="${ordersLink}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">View My Order</a>
        </td>
      </tr>
    </table>`;

  const subject = `Order Updated — ${trackingNumber}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'order_updated', subject, userId: order?.user_id ?? null });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'order_updated', subject, userId: order?.user_id ?? null, errorMessage: error.message });
    throw error;
  }
}

// ── Ticket emails ─────────────────────────────────────────────────────────────

/**
 * sendTicketCreatedEmail — notify the support inbox that a customer raised a
 * new ticket. Called from routes/tickets.js POST /api/tickets.
 */
async function sendTicketCreatedEmail(toEmail, ticket) {
  if (!ticket) return;
  const safeSubject  = ticket.subject || '(no subject)';
  const safeDesc     = ticket.description || '(no description)';
  const priority     = (ticket.priority || 'medium').toUpperCase();
  const adminUrl     = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.thapsus.uk';
  const ticketLink   = `${adminUrl}/admin#tickets`;

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">New support ticket</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      A customer just raised a ticket. Priority: <strong>${priority}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;font-size:15px;">
      <tbody>
        <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:10px 12px;color:#6b7280;font-weight:600;width:40%;">Subject</td><td style="padding:10px 12px;color:#111827;">${safeSubject}</td></tr>
        <tr style="background:#f9fafb;"><td style="padding:10px 12px;color:#6b7280;font-weight:600;">Ticket ID</td><td style="padding:10px 12px;color:#111827;font-family:monospace;">${ticket.id}</td></tr>
      </tbody>
    </table>
    <p style="margin:0 0 16px;color:#4b5563;font-size:14px;line-height:1.6;white-space:pre-wrap;">${safeDesc}</p>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr><td style="background-color:#f97316;border-radius:8px;">
        <a href="${ticketLink}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Open ticket</a>
      </td></tr>
    </table>`;

  const subject = `[Thapsus Support] ${priority} · ${safeSubject}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'ticket_created', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'ticket_created', subject, errorMessage: error.message });
    throw error;
  }
}

/**
 * sendTicketReplyEmail — notify a customer that an admin replied. Called from
 * routes/tickets.js when an admin posts a message on a ticket.
 */
async function sendTicketReplyEmail(toEmail, toName, ticket, replyMessage) {
  if (!ticket) return;
  const safeSubject = ticket.subject || '(your ticket)';
  const safeReply   = replyMessage || '(no message)';
  const ticketsUrl  = `${process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.thapsus.uk'}/support`;

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">We replied to your ticket</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Our team posted an update on your support ticket <strong>${safeSubject}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;background:#f9fafb;border-radius:8px;">
      <tr><td style="padding:14px 16px;color:#374151;font-size:15px;line-height:1.6;white-space:pre-wrap;">${safeReply}</td></tr>
    </table>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr><td style="background-color:#f97316;border-radius:8px;">
        <a href="${ticketsUrl}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">View ticket</a>
      </td></tr>
    </table>
    <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
      Reply from inside the app to keep the conversation in one place.
    </p>`;

  const subject = `Re: ${safeSubject}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'ticket_reply', subject, userId: ticket.user_id || null });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'ticket_reply', subject, errorMessage: error.message });
    throw error;
  }
}

/**
 * Email config diagnostics — backs the admin /api/admin/email-config endpoint
 * so the app can tell whether Gmail OAuth credentials are present without
 * exposing the secrets themselves.
 */
function emailConfigStatus() {
  const hasClientId     = Boolean(process.env.GMAIL_CLIENT_ID);
  const hasClientSecret = Boolean(process.env.GMAIL_CLIENT_SECRET);
  const hasRefreshToken = Boolean(process.env.GMAIL_REFRESH_TOKEN);
  const sender          = getSenderAddress();
  const supportEmail    = process.env.SUPPORT_EMAIL || process.env.SUPPORT_INBOX || sender;
  return {
    configured: hasClientId && hasClientSecret && hasRefreshToken,
    has_client_id:     hasClientId,
    has_client_secret: hasClientSecret,
    has_refresh_token: hasRefreshToken,
    sender_email:      sender,
    support_email:     supportEmail,
  };
}

// ── Exports ────────────────────────────────────────────────────────────────────

export {
  sendPasswordResetEmail,
  sendAdminPasswordResetEmail,
  sendPaymentRequestEmail,
  sendOrderCreatedEmail,
  sendWelcomeAccountEmail,
  sendPaymentReminderEmail,
  sendPaymentReceiptEmail,
  sendOrderUpdatedEmail,
  sendTicketCreatedEmail,
  sendTicketReplyEmail,
  emailConfigStatus,
};

export default {
  sendPasswordResetEmail,
  sendAdminPasswordResetEmail,
  sendPaymentRequestEmail,
  sendOrderCreatedEmail,
  sendWelcomeAccountEmail,
  sendPaymentReminderEmail,
  sendPaymentReceiptEmail,
  sendOrderUpdatedEmail,
  sendTicketCreatedEmail,
  sendTicketReplyEmail,
  emailConfigStatus,
};
