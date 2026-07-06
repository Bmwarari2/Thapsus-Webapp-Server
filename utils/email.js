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

/**
 * Build a raw RFC 2822 email with optional file attachments.
 *
 * Outer boundary wraps a `multipart/mixed`: the first part is the
 * `multipart/alternative` text+html body produced by buildRawEmail's logic,
 * each remaining part is one base64-encoded attachment.
 *
 * `attachments` is `[{ filename, contentType, content }]` — `content` is
 * either a Buffer or a UTF-8 string.
 */
function buildRawEmailWithAttachments({ from, to, subject, html, text, attachments }) {
  const altBoundary   = `alt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const mixedBoundary = `mixed_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const altParts = [
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text || '').toString('base64'),
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html || '').toString('base64'),
    '',
    `--${altBoundary}--`,
  ].join('\r\n');

  const attachmentParts = (attachments || []).map((a) => {
    const buf = Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content || '', 'utf8');
    const encoded = buf.toString('base64').replace(/(.{76})/g, '$1\r\n');
    return [
      `--${mixedBoundary}`,
      `Content-Type: ${a.contentType || 'application/octet-stream'}; name="${a.filename}"`,
      `Content-Disposition: attachment; filename="${a.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      encoded,
      '',
    ].join('\r\n');
  });

  const messageParts = [
    `From: ${from}`,
    `To: ${Array.isArray(to) ? to.join(', ') : to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    altParts,
    '',
    ...attachmentParts,
    `--${mixedBoundary}--`,
  ];

  return Buffer.from(messageParts.join('\r\n'))
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

  const raw = (mailOptions.attachments && mailOptions.attachments.length > 0)
    ? buildRawEmailWithAttachments({
        from,
        to:          mailOptions.to,
        subject:     mailOptions.subject,
        html:        mailOptions.html,
        text:        mailOptions.text,
        attachments: mailOptions.attachments,
      })
    : buildRawEmail({
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

function costBreakdownTable(order, gbpToKes = null) {
  // The order row's money fields are GBP (engine-native). The customer-facing
  // receipt shows KES — fetch the live GBP→KES rate at the call site and pass
  // it in. When gbpToKes is missing (FX row unset, caller didn't fetch, etc.)
  // we fall back to showing £ so the email still goes out with usable numbers
  // rather than nothing.
  const hasRate = Number.isFinite(gbpToKes) && gbpToKes > 0;
  const symbol = hasRate ? 'KES' : '£';
  const fmt = (gbp) => {
    if (gbp == null) return null;
    const value = hasRate ? gbp * gbpToKes : Number(gbp);
    return hasRate
      // KES is integer-formatted (no fractional shillings in receipts).
      ? Math.round(value).toLocaleString()
      : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const shipping_cost  = order.shipping_cost != null ? fmt(order.shipping_cost) : (order.estimated_cost != null ? fmt(order.estimated_cost) : null);
  const handling_fee   = order.handling_fee  > 0 ? fmt(order.handling_fee)  : null;
  const insurance_fee  = order.insurance_fee > 0 ? fmt(order.insurance_fee) : null;
  const customs_duty   = order.customs_duty  > 0 ? fmt(order.customs_duty)  : null;
  const total_cost     = fmt((order.actual_cost ?? order.estimated_cost ?? 0) + (order.customs_duty ?? 0));
  const is_actual_cost = !!order.actual_cost;

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin:16px 0; font-size:14px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:8px 12px; text-align:left; color:#6b7280; font-weight:600;">Item</th>
          <th style="padding:8px 12px; text-align:right; color:#6b7280; font-weight:600;">Amount (${symbol})</th>
        </tr>
      </thead>
      <tbody>
        ${shipping_cost ? `<tr><td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">Shipping Rate</td><td style="padding:8px 12px; text-align:right; border-bottom:1px solid #e5e7eb;">${shipping_cost}</td></tr>` : ''}
        ${handling_fee  ? `<tr><td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">Handling Fee</td><td style="padding:8px 12px; text-align:right; border-bottom:1px solid #e5e7eb;">${handling_fee}</td></tr>`  : ''}
        ${insurance_fee ? `<tr><td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">Insurance Fee</td><td style="padding:8px 12px; text-align:right; border-bottom:1px solid #e5e7eb;">${insurance_fee}</td></tr>` : ''}
        ${customs_duty  ? `<tr><td style="padding:8px 12px; border-bottom:1px solid #e5e7eb;">Customs Duty</td><td style="padding:8px 12px; text-align:right; border-bottom:1px solid #e5e7eb;">${customs_duty}</td></tr>`  : ''}
        <tr style="background:#eff6ff;">
          <td style="padding:10px 12px; font-weight:700; color:#0e1012;">Total</td>
          <td style="padding:10px 12px; text-align:right; font-weight:700; color:#0e1012;">${symbol} ${total_cost}</td>
        </tr>
      </tbody>
    </table>
    ${!is_actual_cost ? `<p style="font-size:12px; color:#f26418; margin-top:4px;">* Estimated cost — final amount confirmed once your parcel is weighed.</p>` : ''}
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
      <td style="background-color:#0e1012;padding:30px 40px;text-align:center;border-bottom:3px solid #f26418;">
        <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:bold;letter-spacing:-0.5px;">
          Thapsus<span style="color:#f26418;">Cargo</span>
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

async function sendEmailVerificationEmail(toEmail, toName, verifyLink) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">Activate your account</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      Welcome to Thapsus Cargo. Tap the button below to confirm your email
      and unlock your account. This link will expire in 24 hours.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f26418;border-radius:8px;">
          <a href="${verifyLink}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">Activate my account</a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Didn't sign up? You can safely ignore this email — no account will be created.
    </p>`;
  const subject = 'Activate your Thapsus Cargo account';
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'email_verification', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'email_verification', subject, errorMessage: error.message });
    throw error;
  }
}

async function sendPasswordResetEmail(toEmail, toName, resetLink) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">Password Reset Request</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      We received a request to reset the password for your Thapsus Cargo account.
      Click the button below to create a new password. This link will expire in 1 hour.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f26418;border-radius:8px;">
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
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">Your Password Has Been Reset</h2>
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
        <td style="background-color:#f26418;border-radius:8px;">
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

async function sendPaymentRequestEmail(toEmail, toName, trackingNumber, amount, notes, paymentLink, order, gbpToKes = null) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">Payment Request</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      A payment is due for your order <strong>${trackingNumber}</strong>.
    </p>

    ${order ? costBreakdownTable(order, gbpToKes) : `<p style="font-size:16px;font-weight:bold;color:#0e1012;">Amount Due: KES ${amount?.toLocaleString?.() ?? amount}</p>`}

    ${notes ? `<p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;background-color:#f9fafb;padding:12px 16px;border-left:4px solid #f26418;border-radius:4px;"><em>${notes}</em></p>` : ''}

    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f26418;border-radius:8px;">
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

async function sendPaymentReminderEmail(toEmail, toName, trackingNumber, amount, notes, paymentLink, order, gbpToKes = null) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">Payment Reminder</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      This is a friendly reminder that a payment is outstanding for your order <strong>${trackingNumber}</strong>.
    </p>

    ${order ? costBreakdownTable(order, gbpToKes) : `<p style="font-size:16px;font-weight:bold;color:#0e1012;">Amount Due: KES ${amount?.toLocaleString?.() ?? amount}</p>`}

    ${notes ? `<div style="margin:0 0 24px;background-color:#fef9c3;padding:12px 16px;border-left:4px solid #f59e0b;border-radius:4px;"><p style="margin:0;color:#92400e;font-size:14px;line-height:1.6;"><strong>Note from admin:</strong> ${notes}</p></div>` : ''}

    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f26418;border-radius:8px;">
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

async function sendOrderCreatedEmail(toEmail, toName, trackingNumber, retailer, description, shippingSpeed, ordersLink, order = null, gbpToKes = null) {
  const speedLabel    = shippingSpeed === 'express' ? 'Express' : 'Economy';

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">Your Order Has Been Created</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      Thapsus Cargo has created a new order on your behalf. Here are the details:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;font-size:15px;">
      <tbody>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;width:40%;">Tracking Number</td>
          <td style="padding:10px 12px;color:#0e1012;font-weight:700;">${trackingNumber}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;background:#f9fafb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">Retailer</td>
          <td style="padding:10px 12px;color:#111827;">${retailer}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">Description</td>
          <td style="padding:10px 12px;color:#111827;">${description}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">Shipping Speed</td>
          <td style="padding:10px 12px;color:#111827;">${speedLabel}</td>
        </tr>
      </tbody>
    </table>

    <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:0 0 24px;">
      <p style="margin:0;color:#92400e;font-size:14px;line-height:1.6;">
        We'll send you a separate email with the final price once your parcel
        has arrived at our warehouse and been consolidated for shipment. No
        payment is due until then.
      </p>
    </div>

    <p style="margin:0 0 24px;color:#4b5563;font-size:14px;line-height:1.6;">
      You'll get further updates as your order progresses through receiving,
      consolidation, and dispatch. You can track it any time using the button
      below.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#0e1012;border-radius:8px;">
          <a href="${ordersLink}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">View My Orders</a>
        </td>
      </tr>
    </table>`;

  // Pre-register confirmation. "Parcel" disambiguates from BFM "Order"
  // emails so customers can scan their inbox and tell the two flows
  // apart at a glance.
  const subject = `Parcel pre-registered — ${trackingNumber}`;
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
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">Welcome to Thapsus Cargo!</h2>
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
          <td style="padding:10px 12px;color:#0e1012;font-weight:700;">${warehouseId}</td>
        </tr>
      </tbody>
    </table>
    <p style="margin:0 0 8px;color:#4b5563;font-size:14px;line-height:1.6;">
      Your <strong>Warehouse ID</strong> is used to identify your shipments at our facility. Keep it handy.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr>
        <td style="background-color:#f26418;border-radius:8px;">
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
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">Payment Received ✓</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      We have successfully received your payment. Below is your receipt:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;font-size:15px;">
      <tbody>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;width:45%;">Tracking Number</td>
          <td style="padding:10px 12px;color:#0e1012;font-weight:700;">${trackingNumber}</td>
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
  description,
  shippingSpeed,
  order,
  ordersLink,
  gbpToKes = null
) {
  const speedLabel    = shippingSpeed === 'express' ? 'Express' : 'Economy';

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">Your Order Has Been Updated</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      An administrator has updated the details and pricing for your order <strong>${trackingNumber}</strong>.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;font-size:15px;">
      <tbody>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;width:40%;">Tracking Number</td>
          <td style="padding:10px 12px;color:#0e1012;font-weight:700;">${trackingNumber}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;background:#f9fafb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">Retailer</td>
          <td style="padding:10px 12px;color:#111827;">${retailer}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">Description</td>
          <td style="padding:10px 12px;color:#111827;">${description}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">Shipping Speed</td>
          <td style="padding:10px 12px;color:#111827;">${speedLabel}</td>
        </tr>
      </tbody>
    </table>

    <h3 style="margin:0 0 8px;color:#0e1012;font-size:16px;font-weight:700;">Updated Cost Breakdown</h3>
    ${costBreakdownTable(order, gbpToKes)}

    <p style="margin:16px 0 24px;color:#4b5563;font-size:14px;line-height:1.6;">
      If anything looks incorrect, please contact support before making payment.
    </p>

    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#0e1012;border-radius:8px;">
          <a href="${ordersLink}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">View My Order</a>
        </td>
      </tr>
    </table>`;

  // Pre-register status update — parallel to the "Parcel pre-registered"
  // confirmation. BFM lifecycle uses different subjects ("Quote ready",
  // "Payment receipt") so this stays scoped to parcel-only updates.
  const subject = `Parcel update — ${trackingNumber}`;
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
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">New support ticket</h2>
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
      <tr><td style="background-color:#f26418;border-radius:8px;">
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
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">We replied to your ticket</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Our team posted an update on your support ticket <strong>${safeSubject}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;background:#f9fafb;border-radius:8px;">
      <tr><td style="padding:14px 16px;color:#374151;font-size:15px;line-height:1.6;white-space:pre-wrap;">${safeReply}</td></tr>
    </table>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr><td style="background-color:#f26418;border-radius:8px;">
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

// ── Parcel-lifecycle status emails ─────────────────────────────────────────
//
// Until now the customer received a single confirmation email at order
// creation and nothing else for the entire lifecycle. The audit punch list
// flagged this as the top customer-facing gap (every status flip on the
// server fired no email and no realtime push).  These four helpers cover
// the remaining lifecycle states that the customer cares about: arrival
// at the warehouse, dispatch (with delivery OTP), delivered, and a failed
// delivery attempt.  All four reuse the standard emailLayout so the
// branding matches the existing transactional emails.

const STATUS_LABEL = {
  received_at_warehouse: 'Received at warehouse',
  consolidating:         'Consolidating',
  in_transit:            'In transit',
  customs:               'Clearing customs',
  out_for_delivery:      'Out for delivery',
  delivered:             'Delivered',
};

async function sendStatusUpdateEmail(toEmail, toName, trackingNumber, newStatus) {
  const trackUrl = `${process.env.APP_URL || 'https://www.thapsus.uk'}/track/${encodeURIComponent(trackingNumber)}`;
  const label = STATUS_LABEL[newStatus] || newStatus;

  const blurb = {
    received_at_warehouse: 'Your parcel has arrived at our warehouse and is being weighed and photographed. You can view it on the tracking page.',
    consolidating:         'Your parcel is being grouped with others on the next flight to Nairobi. We\'ll email again once it leaves the UK.',
    in_transit:            'Your parcel is on its way to Nairobi.',
    customs:               'Your parcel is clearing customs in Nairobi.',
  }[newStatus] || `Status updated to ${label}.`;

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">${label}</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">${blurb}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;font-size:15px;">
      <tbody>
        <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:10px 12px;color:#6b7280;font-weight:600;width:40%;">Tracking number</td><td style="padding:10px 12px;color:#111827;font-family:monospace;">${trackingNumber}</td></tr>
        <tr style="background:#f9fafb;"><td style="padding:10px 12px;color:#6b7280;font-weight:600;">Status</td><td style="padding:10px 12px;color:#111827;font-weight:700;">${label}</td></tr>
      </tbody>
    </table>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr><td style="background-color:#f26418;border-radius:8px;">
        <a href="${trackUrl}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Track parcel</a>
      </td></tr>
    </table>`;

  const subject = `Thapsus Cargo · ${trackingNumber} — ${label}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: `status_${newStatus}`, subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: `status_${newStatus}`, subject, errorMessage: error.message });
    throw error;
  }
}

/**
 * Out-for-delivery email that carries the 4-digit POD OTP the rider will ask
 * for on arrival.  Until now the OTP was only delivered as an in-app
 * `notifications` row, so a customer who wasn't actively in the iOS inbox
 * (or who wasn't signed in) had nothing to give the rider — every POD
 * attempt would 400 with "Invalid or expired OTP".
 */
async function sendDeliveryOtpEmail(toEmail, toName, trackingNumber, otp) {
  const trackUrl = `${process.env.APP_URL || 'https://www.thapsus.uk'}/track/${encodeURIComponent(trackingNumber)}`;
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">Out for delivery</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Your parcel <strong>${trackingNumber}</strong> is on its way. Share the code below
      with the rider when they arrive — they need it to confirm delivery.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">
      <tr><td align="center" style="background:#0e1012;border-radius:12px;padding:24px;">
        <p style="margin:0 0 6px;color:#94a3b8;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Delivery OTP</p>
        <p style="margin:0;color:#ffffff;font-size:40px;font-weight:bold;letter-spacing:8px;font-family:monospace;">${otp}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 16px;color:#9ca3af;font-size:13px;line-height:1.6;">
      Don't share this code with anyone except the rider on arrival. The code expires once delivery is confirmed.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr><td style="background-color:#f26418;border-radius:8px;">
        <a href="${trackUrl}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Track parcel</a>
      </td></tr>
    </table>`;

  const subject = `Out for delivery · ${trackingNumber} — your delivery code is ${otp}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'delivery_otp', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'delivery_otp', subject, errorMessage: error.message });
    throw error;
  }
}

async function sendDeliveredEmail(toEmail, toName, trackingNumber) {
  const trackUrl = `${process.env.APP_URL || 'https://www.thapsus.uk'}/track/${encodeURIComponent(trackingNumber)}`;
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">Delivered ✓</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Your parcel <strong>${trackingNumber}</strong> has been delivered. Thank you for shipping with us!
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr><td style="background-color:#f26418;border-radius:8px;">
        <a href="${trackUrl}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">View receipt</a>
      </td></tr>
    </table>`;

  const subject = `Delivered · ${trackingNumber}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'delivered', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'delivered', subject, errorMessage: error.message });
    throw error;
  }
}

async function sendDeliveryAttemptedEmail(toEmail, toName, trackingNumber, reason) {
  const trackUrl = `${process.env.APP_URL || 'https://www.thapsus.uk'}/track/${encodeURIComponent(trackingNumber)}`;
  const reasonText = reason || 'Recipient unavailable';
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">Delivery attempted</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      We tried to deliver parcel <strong>${trackingNumber}</strong> but couldn't complete it. Reason given: <em>${reasonText}</em>.
    </p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      We'll attempt re-delivery on the next run. If you'd like to reach us about this delivery, reply to this email or open a ticket from the app.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr><td style="background-color:#f26418;border-radius:8px;">
        <a href="${trackUrl}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Track parcel</a>
      </td></tr>
    </table>`;

  const subject = `Delivery attempted · ${trackingNumber}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'delivery_attempted', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'delivery_attempted', subject, errorMessage: error.message });
    throw error;
  }
}

// ── Invoice emails (Phase 2: per-user customer-consolidation invoicing) ────

/**
 * Sent the moment an admin stamps an invoice on a customer-consolidation.
 * Carries the amount but no parcel-by-parcel breakdown — the customer
 * has already received per-parcel "received at warehouse" emails. CTA
 * deep-links to the iOS Orders tab via /orders (Universal Link match
 * added in PR #54).
 */
async function sendInvoiceReadyEmail(toEmail, toName, customerConsolidationId, amount, currency = 'KES') {
  const ordersUrl = `${process.env.APP_URL || 'https://www.thapsus.uk'}/orders`;
  const formattedAmount = Number(amount || 0).toLocaleString();
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">Your invoice is ready</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      We've consolidated your parcels and prepared a single invoice covering
      shipping for everything in this batch.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">
      <tr><td align="center" style="background:#0e1012;border-radius:12px;padding:24px;">
        <p style="margin:0 0 6px;color:#94a3b8;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Amount due</p>
        <p style="margin:0;color:#ffffff;font-size:32px;font-weight:bold;">${currency} ${formattedAmount}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 16px;color:#4b5563;font-size:14px;line-height:1.6;">
      Pay from your wallet or top up via the Orders tab. Once payment clears,
      your parcels will be batched onto the next outgoing shipment.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr><td style="background-color:#f26418;border-radius:8px;">
        <a href="${ordersUrl}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">View invoice</a>
      </td></tr>
    </table>`;

  const subject = `Invoice ready · ${currency} ${formattedAmount}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'invoice_ready', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'invoice_ready', subject, errorMessage: error.message });
    throw error;
  }
}

/**
 * Receipt email after the customer-consolidation invoice is marked paid.
 */
async function sendInvoicePaidEmail(toEmail, toName, customerConsolidationId, amount, currency = 'KES') {
  const ordersUrl = `${process.env.APP_URL || 'https://www.thapsus.uk'}/orders`;
  const formattedAmount = Number(amount || 0).toLocaleString();
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">Payment received ✓</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Thanks — we've received <strong>${currency} ${formattedAmount}</strong> for
      your shipping invoice. Your parcels are now queued for the next outgoing
      shipment, and you'll get a fresh email once they're on their way.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr><td style="background-color:#f26418;border-radius:8px;">
        <a href="${ordersUrl}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">View receipt</a>
      </td></tr>
    </table>`;

  const subject = `Payment received · ${currency} ${formattedAmount}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'invoice_paid', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'invoice_paid', subject, errorMessage: error.message });
    throw error;
  }
}

/**
 * NPS survey invite. Memory's `parity_audit_followups.md` flagged the
 * auto-trigger as TODO — the row was always being inserted into
 * `nps_invitations` on POD success but no email ever fired.
 */
async function sendNpsInvitationEmail(toEmail, toName, trackingNumber, surveyLink) {
  const link = surveyLink || `${process.env.APP_URL || 'https://www.thapsus.uk'}/nps?tn=${encodeURIComponent(trackingNumber)}`;
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">How did we do?</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Now that parcel <strong>${trackingNumber}</strong> has been delivered, we'd love to know how it went.
      One question, takes about ten seconds.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr><td style="background-color:#f26418;border-radius:8px;">
        <a href="${link}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Rate this delivery</a>
      </td></tr>
    </table>`;

  const subject = `Quick favour · how did your delivery go?`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'nps_invitation', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'nps_invitation', subject, errorMessage: error.message });
    throw error;
  }
}

/**
 * Buy-for-me concierge: operator has set a quote on the request. Customer
 * accepts or rejects from the Shop tab — deep-linked via the
 * `/buy-for-me` route which web renders directly and iOS routes into
 * BuyForMeView (PR 2 of the BFM-primary pivot).
 */
async function sendBuyForMeQuoteEmail(toEmail, toName, orderId, itemName, estimateGbp, markupPct) {
  const ordersUrl = `${process.env.APP_URL || 'https://www.thapsus.uk'}/buy-for-me`;
  const gbp = Number(estimateGbp || 0).toFixed(2);
  const total = (Number(estimateGbp || 0) * (1 + Number(markupPct || 0) / 100)).toFixed(2);
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">Your quote is ready</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      We've reviewed your Buy-for-me request for <strong>${itemName}</strong> and prepared a quote.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">
      <tr><td align="center" style="background:#0e1012;border-radius:12px;padding:24px;">
        <p style="margin:0 0 6px;color:#94a3b8;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Quoted total (incl. ${Number(markupPct || 0)}% service)</p>
        <p style="margin:0;color:#ffffff;font-size:32px;font-weight:bold;">£ ${total}</p>
        <p style="margin:6px 0 0;color:#94a3b8;font-size:12px;">Item cost: £${gbp}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 16px;color:#4b5563;font-size:14px;line-height:1.6;">
      Open the Shop tab to <strong>accept</strong> (we'll buy it for you) or <strong>reject</strong> the quote.
      We hold quotes for 7 days.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr><td style="background-color:#f26418;border-radius:8px;">
        <a href="${ordersUrl}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Review quote</a>
      </td></tr>
    </table>`;

  const subject = `Quote ready · ${itemName} · £${total}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'bfm_quote', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'bfm_quote', subject, errorMessage: error.message });
    throw error;
  }
}

/**
 * Admin "new Buy-for-me request" email — fired from utils/buyForMeAdminNotify
 * once per admin so the team is woken on a customer concierge request.
 * Best-effort delivery, errors logged not thrown by the caller.
 */
async function sendBuyForMeAdminNewRequestEmail(toEmail, toName, bfmId, ownerLabel, ownerEmail, itemName, retailerUrl, qty, notes) {
  const adminUrl = `${process.env.APP_URL || 'https://www.thapsus.uk'}/admin?tab=buy-for-me`;
  const safeNotes = (notes || '').toString().slice(0, 280);
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">New Buy-for-me request</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'admin'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      ${ownerLabel}${ownerEmail ? ` (${ownerEmail})` : ''} just opened a concierge request.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0 24px;background:#f8fafc;border-radius:12px;padding:16px;">
      <tr><td style="color:#0e1012;font-size:14px;line-height:1.6;">
        <strong>Item:</strong> ${itemName || '—'}<br/>
        <strong>Qty:</strong> ${qty || 1}<br/>
        <strong>Retailer URL:</strong> ${retailerUrl ? `<a href="${retailerUrl}" target="_blank" style="color:#f26418;">${retailerUrl}</a>` : '—'}<br/>
        ${safeNotes ? `<strong>Notes:</strong> ${safeNotes}<br/>` : ''}
        <strong>BFM ID:</strong> ${bfmId}
      </td></tr>
    </table>
    <p style="margin:0 0 16px;color:#4b5563;font-size:14px;line-height:1.6;">
      Open the admin queue to quote it.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr><td style="background-color:#0e1012;border-radius:8px;">
        <a href="${adminUrl}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Open admin queue</a>
      </td></tr>
    </table>`;
  const subject = `New Buy-for-me · ${itemName || bfmId}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'bfm_admin_new', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'bfm_admin_new', subject, errorMessage: error.message });
    throw error;
  }
}

/**
 * Unified payment receipt — fired from markPaymentPaid for both Stripe and
 * M-Pesa, every target_kind (order / consolidation / buy_for_me). Replaces
 * the old M-Pesa-only `sendPaymentReceiptEmail`.
 *
 * opts shape:
 *   {
 *     paymentId, method ('stripe'|'mpesa'),
 *     amountGrossKes, amountCreditKes, amountDueKes,
 *     reference (stripe PI or M-Pesa ref), paidAt,
 *     stripeAmountPenceGbp (optional),
 *     targetKind ('order'|'consolidation'|'buy_for_me'),
 *     targetLabel (tracking number / item name / consolidation id),
 *     userId
 *   }
 */
async function sendUnifiedPaymentReceiptEmail(toEmail, toName, opts) {
  const {
    paymentId, method,
    amountGrossKes, amountCreditKes, amountDueKes,
    reference, paidAt,
    stripeAmountPenceGbp,
    targetKind, targetLabel,
    userId,
  } = opts;

  const fmtKes = (n) => Number(n || 0).toLocaleString();
  const formattedDate = new Date(paidAt || Date.now())
    .toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });

  const methodLabel = method === 'stripe' ? 'Card (via Stripe)' : 'M-Pesa';
  const targetLine = {
    order:         `Order ${targetLabel}`,
    consolidation: `Shipping invoice ${targetLabel}`,
    buy_for_me:    `Buy-for-me · ${targetLabel}`,
  }[targetKind] || targetKind;

  const ordersUrl = `${process.env.APP_URL || 'https://www.thapsus.uk'}/orders`;

  const gbpRow = (method === 'stripe' && stripeAmountPenceGbp)
    ? `<tr style="border-bottom:1px solid #e5e7eb;">
         <td style="padding:10px 12px;color:#6b7280;font-weight:600;">Charged on card</td>
         <td style="padding:10px 12px;color:#111827;">£ ${(stripeAmountPenceGbp / 100).toFixed(2)}</td>
       </tr>`
    : '';

  const creditRow = Number(amountCreditKes || 0) > 0
    ? `<tr style="border-bottom:1px solid #e5e7eb;background:#f0fdf4;">
         <td style="padding:10px 12px;color:#166534;font-weight:600;">Credit applied</td>
         <td style="padding:10px 12px;color:#166534;font-weight:700;">- KES ${fmtKes(amountCreditKes)}</td>
       </tr>`
    : '';

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">Payment received ✓</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      Thanks — we've received your payment. Here is your receipt for your records.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;font-size:15px;">
      <tbody>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;width:45%;">Receipt no.</td>
          <td style="padding:10px 12px;color:#0e1012;font-weight:700;font-family:monospace;">${paymentId}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;background:#f9fafb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">For</td>
          <td style="padding:10px 12px;color:#111827;">${targetLine}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">Method</td>
          <td style="padding:10px 12px;color:#111827;">${methodLabel}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;background:#f9fafb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">Reference</td>
          <td style="padding:10px 12px;color:#111827;font-family:monospace;">${reference || 'N/A'}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">Subtotal</td>
          <td style="padding:10px 12px;color:#111827;">KES ${fmtKes(amountGrossKes)}</td>
        </tr>
        ${creditRow}
        <tr style="background:#eff6ff;">
          <td style="padding:12px;color:#0e1012;font-weight:700;">Amount paid</td>
          <td style="padding:12px;color:#0e1012;font-weight:700;">KES ${fmtKes(amountDueKes)}</td>
        </tr>
        ${gbpRow}
        <tr style="background:#f9fafb;">
          <td style="padding:10px 12px;color:#6b7280;font-weight:600;">Date</td>
          <td style="padding:10px 12px;color:#111827;">${formattedDate}</td>
        </tr>
      </tbody>
    </table>
    <div style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:0 0 24px;">
      <p style="margin:0;color:#166534;font-size:15px;font-weight:600;">✓ Payment confirmed</p>
      <p style="margin:4px 0 0;color:#166534;font-size:14px;">Your order is now in our queue. You'll receive separate emails as it progresses.</p>
    </div>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr><td style="background-color:#f26418;border-radius:8px;">
        <a href="${ordersUrl}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">View my orders</a>
      </td></tr>
    </table>`;

  const subject = `Receipt · KES ${fmtKes(amountDueKes)} · ${targetLine}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'payment_receipt', subject, userId: userId || null });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'payment_receipt', subject, userId: userId || null, errorMessage: error.message });
    throw error;
  }
}

/**
 * Send the GDPR data export to the customer as a JSON attachment.
 * The export blob is generated upstream in `routes/dsar.js` so this helper
 * stays mailer-only.
 */
async function sendDsarExportEmail({ toEmail, userName, userId, dsarId, exportJson }) {
  const subject = 'Your Thapsus Cargo data export';
  const greeting = userName ? `Hi ${userName.split(' ')[0]},` : 'Hi,';
  const filename = `thapsus-data-export-${dsarId}.json`;
  const text = [
    greeting,
    '',
    'Attached is the JSON export of the personal data we hold on your Thapsus Cargo account, as requested under your GDPR / DPA 2018 right of access.',
    '',
    'The file contains your profile, orders, transactions and support tickets. We have intentionally excluded payment-proof data (M-Pesa SMS contents, payer details, Stripe identifiers).',
    '',
    'If you did not request this, please reply to this email immediately.',
    '',
    'Thapsus Cargo Compliance',
  ].join('\n');
  const html = emailLayout(`
    <p style="margin:0 0 12px;">${greeting}</p>
    <p>Attached is the JSON export of the personal data we hold on your Thapsus Cargo account, as requested under your GDPR / DPA 2018 right of access.</p>
    <p>The file contains your profile, orders, transactions and support tickets. We have intentionally excluded payment-proof data (M-Pesa SMS contents, payer details, Stripe identifiers).</p>
    <p style="font-size:12px; color:#6b7280;">Request reference: <code>${dsarId}</code></p>
    <p style="font-size:12px; color:#6b7280;">If you did not request this, please reply to this email immediately.</p>
  `);
  try {
    const result = await sendWithGmail({
      to: toEmail,
      subject,
      html,
      text,
      attachments: [{
        filename,
        contentType: 'application/json',
        content: exportJson,
      }],
    });
    await logEmailSent({ toEmail, emailType: 'dsar_export', subject, userId: userId || null });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'dsar_export', subject, userId: userId || null, errorMessage: error.message });
    throw error;
  }
}

/**
 * Email config diagnostics — backs the admin /api/admin/email-config endpoint
 * so the app can tell whether Gmail OAuth credentials are present without
 * exposing the secrets themselves.
 */
function emailConfigStatus() {
  const clientId     = process.env.GMAIL_CLIENT_ID || '';
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || '';
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN || '';
  const hasClientId     = clientId.length > 0;
  const hasClientSecret = clientSecret.length > 0;
  const hasRefreshToken = refreshToken.length > 0;
  const sender          = getSenderAddress();
  const supportEmail    = process.env.SUPPORT_EMAIL || process.env.SUPPORT_INBOX || sender;

  // Redacted preview lets the iOS diagnostic prove the value is non-empty
  // and not silently truncated by Railway, without leaking the secret.
  const preview = (s) =>
    s.length > 8 ? `${s.slice(0, 4)}…${s.slice(-4)}` : (s.length ? '****' : '');

  return {
    configured: hasClientId && hasClientSecret && hasRefreshToken,
    has_client_id:     hasClientId,
    has_client_secret: hasClientSecret,
    has_refresh_token: hasRefreshToken,
    client_id_length:     clientId.length,
    client_secret_length: clientSecret.length,
    refresh_token_length: refreshToken.length,
    client_id_preview:    preview(clientId),
    sender_email:         sender,
    support_email:        supportEmail,
    process_uptime_s:     Math.round(process.uptime()),
  };
}

/**
 * Account-deletion confirmation. Customer requested account deletion with
 * a 14-day cooldown; this email confirms the timeline and ships the
 * download link for the HTML data export.
 *
 * Body is the email layout text; the actual export is hosted on Supabase
 * Storage (signed URL valid ~30 days). We do NOT attach the export as an
 * .html file because the file is multi-MB for active accounts and the
 * customer already has the in-app download path.
 */
async function sendAccountDeletionRequestedEmail({ toEmail, toName, scheduledDeletionAt, exportUrl, userId }) {
  const subject = 'Your Thapsus Cargo account will be deleted on ' + new Date(scheduledDeletionAt).toISOString().slice(0,10);
  const greeting = toName ? `Hi ${toName.split(' ')[0]},` : 'Hi,';
  const formattedDate = new Date(scheduledDeletionAt).toUTCString();
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">Account deletion confirmed</h2>
    <p style="margin:0 0 12px;color:#4b5563;font-size:16px;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      We've received your request to delete your Thapsus Cargo account. As a safety net, deletion is held for 14 days from today — your account will be permanently deleted on:
    </p>
    <p style="margin:0 0 24px;color:#0e1012;font-size:18px;font-weight:bold;text-align:center;">
      ${formattedDate}
    </p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Changed your mind? Open the app and tap "Cancel deletion" on the Data rights screen any time before that date and the request will be voided.
    </p>
    <h3 style="margin:24px 0 8px;color:#0e1012;font-size:18px;">Your data, as HTML</h3>
    <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
      We've packaged everything we hold against your account as a single HTML file you can open in any browser. The link below stays live for 30 days from today.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f26418;border-radius:8px;">
          <a href="${exportUrl}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">Download my data</a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.5;">
      Payment-proof artefacts (M-Pesa SMS contents, Stripe identifiers, payer phone numbers) are deliberately excluded — they leave no audit trail for either party if forwarded.
    </p>
    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
      If you didn't request this, reply to this email immediately and we'll cancel the deletion.
    </p>`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'account_deletion_requested', subject, userId: userId || null });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'account_deletion_requested', subject, userId: userId || null, errorMessage: error.message });
    throw error;
  }
}

// ── Exports ────────────────────────────────────────────────────────────────────

/**
 * Customer confirmation that we received their Buy-for-me request. Fired on
 * create so they know it's in the queue (the quote email follows later).
 */
async function sendBuyForMeRequestReceivedEmail(toEmail, toName, orderId, itemName) {
  const url = `${process.env.APP_URL || 'https://www.thapsus.uk'}/buy-for-me`;
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">We've got your request</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Thanks — your Buy-for-me request for <strong>${itemName}</strong> is in our queue.
      We'll review it and send you a quote, usually within 24 hours.
    </p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:13px;line-height:1.6;">
      Tip: requests for <strong>UK versions</strong> of stores (e.g. amazon.co.uk) are quickest to fulfil.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr><td style="background-color:#f26418;border-radius:8px;">
        <a href="${url}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">View request</a>
      </td></tr>
    </table>`;
  const subject = `Request received · ${itemName}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'bfm_received', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'bfm_received', subject, errorMessage: error.message });
    throw error;
  }
}

/** Customer notice that staff declined a Buy-for-me request, with the reason. */
async function sendBuyForMeDeclinedEmail(toEmail, toName, orderId, itemName, reason) {
  const url = `${process.env.APP_URL || 'https://www.thapsus.uk'}/buy-for-me`;
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">Update on your request</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      We're sorry — we're unable to proceed with your Buy-for-me request for <strong>${itemName}</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0 24px;background:#fef2f2;border-radius:12px;">
      <tr><td style="padding:16px;color:#7f1d1d;font-size:14px;line-height:1.6;">
        <strong>Reason:</strong> ${(reason || '').toString().slice(0, 500)}
      </td></tr>
    </table>
    <p style="margin:0 0 16px;color:#4b5563;font-size:14px;line-height:1.6;">
      Feel free to start a new request with a different item or retailer.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr><td style="background-color:#0e1012;border-radius:8px;">
        <a href="${url}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Open Shop</a>
      </td></tr>
    </table>`;
  const subject = `Update · ${itemName}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'bfm_declined', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'bfm_declined', subject, errorMessage: error.message });
    throw error;
  }
}

/**
 * Customer notice that we've suggested an alternative product (the original
 * was unavailable). They can accept / decline / counter in the app.
 */
async function sendBuyForMeAlternativeEmail(toEmail, toName, orderId, itemName, alternativeUrl, alternativeNote) {
  const url = `${process.env.APP_URL || 'https://www.thapsus.uk'}/buy-for-me`;
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">We found an alternative</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      The item you requested (<strong>${itemName}</strong>) wasn't available, so we've suggested
      an alternative for you to review.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0 24px;background:#f8fafc;border-radius:12px;">
      <tr><td style="padding:16px;color:#0e1012;font-size:14px;line-height:1.6;">
        ${alternativeNote ? `<strong>Note:</strong> ${(alternativeNote || '').toString().slice(0, 400)}<br/>` : ''}
        ${alternativeUrl ? `<strong>Alternative:</strong> <a href="${alternativeUrl}" target="_blank" style="color:#f26418;">${alternativeUrl}</a>` : ''}
      </td></tr>
    </table>
    <p style="margin:0 0 16px;color:#4b5563;font-size:14px;line-height:1.6;">
      Open the Shop tab to <strong>accept</strong>, <strong>decline</strong>, or <strong>suggest your own link</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr><td style="background-color:#f26418;border-radius:8px;">
        <a href="${url}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Review alternative</a>
      </td></tr>
    </table>`;
  const subject = `Alternative suggested · ${itemName}`;
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'bfm_alternative', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'bfm_alternative', subject, errorMessage: error.message });
    throw error;
  }
}

/**
 * Invite email for a newly-provisioned INFLUENCER account. Mirrors the
 * welcome-account flow but with partner/dashboard copy instead of the
 * customer warehouse framing. The link points at /reset-password?token=…
 * where the influencer sets their password, then signs in to their dashboard.
 */
async function sendInfluencerInviteEmail(toEmail, toName, setupLink, codeLabel) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#0e1012;font-size:22px;">You're now a Thapsus Cargo partner 🎉</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">Hello ${toName || 'there'},</p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      We've set up your <strong>influencer partner account</strong>. Set your password to unlock your
      dashboard, where you can grab your referral link and see — in real time — how many people opened it,
      signed up, and placed an order.
    </p>
    ${codeLabel ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;font-size:15px;">
      <tbody><tr style="background:#f9fafb;">
        <td style="padding:10px 12px;color:#6b7280;font-weight:600;width:40%;">Your referral code</td>
        <td style="padding:10px 12px;color:#0e1012;font-weight:700;">${codeLabel}</td>
      </tr></tbody></table>` : ''}
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      This setup link expires in <strong>24 hours</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:16px auto 24px;">
      <tr>
        <td style="background-color:#f26418;border-radius:8px;">
          <a href="${setupLink}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">Set Password & Open Dashboard</a>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
      If you weren't expecting this, you can safely ignore this email.
    </p>`;

  const subject = 'Your Thapsus Cargo partner dashboard is ready';
  try {
    const result = await sendWithGmail({ to: toEmail, subject, html: emailLayout(bodyHtml) });
    await logEmailSent({ toEmail, emailType: 'influencer_invite', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'influencer_invite', subject, errorMessage: error.message });
    throw error;
  }
}

export {
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
  sendInfluencerInviteEmail,
  sendAdminPasswordResetEmail,
  sendPaymentRequestEmail,
  sendOrderCreatedEmail,
  sendWelcomeAccountEmail,
  sendPaymentReminderEmail,
  sendPaymentReceiptEmail,
  sendOrderUpdatedEmail,
  sendTicketCreatedEmail,
  sendTicketReplyEmail,
  sendStatusUpdateEmail,
  sendDeliveryOtpEmail,
  sendDeliveredEmail,
  sendDeliveryAttemptedEmail,
  sendNpsInvitationEmail,
  sendInvoiceReadyEmail,
  sendInvoicePaidEmail,
  sendBuyForMeQuoteEmail,
  sendBuyForMeAdminNewRequestEmail,
  sendBuyForMeRequestReceivedEmail,
  sendBuyForMeDeclinedEmail,
  sendBuyForMeAlternativeEmail,
  sendUnifiedPaymentReceiptEmail,
  sendDsarExportEmail,
  sendAccountDeletionRequestedEmail,
  emailConfigStatus,
};

export default {
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
  sendInfluencerInviteEmail,
  sendAdminPasswordResetEmail,
  sendPaymentRequestEmail,
  sendOrderCreatedEmail,
  sendWelcomeAccountEmail,
  sendPaymentReminderEmail,
  sendPaymentReceiptEmail,
  sendOrderUpdatedEmail,
  sendTicketCreatedEmail,
  sendTicketReplyEmail,
  sendStatusUpdateEmail,
  sendDeliveryOtpEmail,
  sendDeliveredEmail,
  sendDeliveryAttemptedEmail,
  sendNpsInvitationEmail,
  sendInvoiceReadyEmail,
  sendInvoicePaidEmail,
  sendBuyForMeQuoteEmail,
  sendBuyForMeAdminNewRequestEmail,
  sendBuyForMeRequestReceivedEmail,
  sendBuyForMeDeclinedEmail,
  sendBuyForMeAlternativeEmail,
  sendUnifiedPaymentReceiptEmail,
  sendDsarExportEmail,
  sendAccountDeletionRequestedEmail,
  emailConfigStatus,
};
