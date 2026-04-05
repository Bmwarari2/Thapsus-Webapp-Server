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
 * Handles UTF-8 subjects and HTML content.
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

  // Gmail API expects URL-safe base64
  return Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Send an email via Gmail API with retry logic.
 *
 * @param {object} mailOptions – { from, to, subject, html, text }
 * @param {number} retries     – Number of retries (default 2)
 * @returns {Promise<object>}  – Gmail API response
 */
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

      console.log(
        `📧 Email sent to ${mailOptions.to}: ${mailOptions.subject} (attempt ${attempt + 1}) [id: ${response.data.id}]`
      );
      return response.data;
    } catch (err) {
      lastError = err;
      const errMsg = err.response?.data?.error?.message || err.message;
      console.warn(`⚠ Email send attempt ${attempt + 1} failed:`, errMsg);

      // If it's a token refresh issue, clear the cached client so it re-authenticates
      if (err.code === 401 || err.message?.includes('invalid_grant')) {
        _oauth2Client = null;
      }

      // Wait before retrying (exponential backoff: 1s, 2s)
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  console.error(
    `❌ Email to ${mailOptions.to} failed after ${retries + 1} attempts:`,
    lastError.message
  );
  throw lastError;
}

/**
 * Log email sent/failed to database.
 * Does not throw - logs failures silently so email sending doesn't fail if logging fails.
 */
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
    // Log to console but don't throw - don't interrupt email sending
    console.warn('Failed to log email to database:', err.message);
  }
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
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
              ${emailHeader()}
              <tr>
                <td style="padding:40px;">
                  ${bodyHtml}
                </td>
              </tr>
              ${emailFooter()}
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;
}

export async function sendPasswordResetEmail(toEmail, toName, resetLink) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Password Reset Request</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Hello ${toName || 'there'},
    </p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      We received a request to reset the password for your Thapsus Cargo account.
      Click the button below to create a new password. This link will expire in <strong>1 hour</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${resetLink}" target="_blank"
             style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">
            Reset My Password
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you didn't request this, you can safely ignore this email. Your password will not be changed.
    </p>
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      If the button above doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin:8px 0 0;word-break:break-all;color:#f97316;font-size:13px;">
      ${resetLink}
    </p>`;

  const subject = 'Reset Your Thapsus Cargo Password';
  try {
    const result = await sendWithGmail({
      to: toEmail,
      subject,
      html: emailLayout(bodyHtml),
      text: `Hello ${toName || 'there'},\n\nWe received a request to reset your Thapsus Cargo password.\n\nClick this link to reset your password (expires in 1 hour):\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.\n\n— Thapsus Cargo Team`,
    });
    await logEmailSent({ toEmail, emailType: 'password_reset', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'password_reset', subject, errorMessage: error.message });
    throw error;
  }
}

export async function sendAdminPasswordResetEmail(toEmail, toName, resetLink) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Password Reset by Administrator</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Hello ${toName || 'there'},
    </p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      A Thapsus Cargo administrator has initiated a password reset for your account.
      Click the button below to set a new password. This link will expire in <strong>1 hour</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${resetLink}" target="_blank"
             style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">
            Set New Password
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      If you believe this was done in error, please contact our support team.
    </p>
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      If the button above doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin:8px 0 0;word-break:break-all;color:#f97316;font-size:13px;">
      ${resetLink}
    </p>`;

  const subject = 'Your Thapsus Cargo Password Has Been Reset';
  try {
    const result = await sendWithGmail({
      to: toEmail,
      subject,
      html: emailLayout(bodyHtml),
      text: `Hello ${toName || 'there'},\n\nA Thapsus Cargo administrator has initiated a password reset for your account.\n\nClick this link to set a new password (expires in 1 hour):\n${resetLink}\n\nIf you believe this was done in error, please contact support.\n\n— Thapsus Cargo Team`,
    });
    await logEmailSent({ toEmail, emailType: 'admin_password_reset', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'admin_password_reset', subject, errorMessage: error.message });
    throw error;
  }
}

export async function sendPaymentRequestEmail(toEmail, toName, trackingNumber, amount, notes, paymentLink) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Payment Request</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Hello ${toName || 'there'},
    </p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      A payment of <strong>KES ${amount.toLocaleString()}</strong> is due for your order <strong>${trackingNumber}</strong>.
    </p>
    ${notes ? `<p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;background-color:#f9fafb;padding:12px 16px;border-left:4px solid #f97316;border-radius:4px;"><em>${notes}</em></p>` : ''}
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${paymentLink}" target="_blank"
             style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">
            Pay Now
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      You can also log in to your Thapsus Cargo account and pay from your wallet.
    </p>
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      If the button above doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin:8px 0 0;word-break:break-all;color:#f97316;font-size:13px;">
      ${paymentLink}
    </p>`;

  const subject = `Payment Request for Order ${trackingNumber} — KES ${amount.toLocaleString()}`;
  try {
    const result = await sendWithGmail({
      to: toEmail,
      subject,
      html: emailLayout(bodyHtml),
      text: `Hello ${toName || 'there'},\n\nA payment of KES ${amount.toLocaleString()} is due for your order ${trackingNumber}.\n\n${notes ? `Note: ${notes}\n\n` : ''}Pay here: ${paymentLink}\n\nYou can also log in and pay from your wallet.\n\n— Thapsus Cargo Team`,
    });
    await logEmailSent({ toEmail, emailType: 'payment_request', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'payment_request', subject, errorMessage: error.message });
    throw error;
  }
}

export async function sendOrderCreatedEmail(toEmail, toName, trackingNumber, retailer, market, description, shippingSpeed, dashboardLink) {
  const speedLabel = shippingSpeed === 'express' ? 'Express (3\u20135 days)' : 'Economy (7\u201314 days)';

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Your Order Has Been Created</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Hello ${toName || 'there'},
    </p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      The Thapsus Cargo team has created a new order on your behalf. Here are the details:
    </p>

    <!-- Order Details Table -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Tracking Number</span><br>
          <strong style="color:#1e3a5f;font-size:16px;font-family:monospace;">${trackingNumber}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Retailer</span><br>
          <strong style="color:#111827;font-size:15px;">${retailer}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Shipping From</span><br>
          <strong style="color:#111827;font-size:15px;">${market}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Description</span><br>
          <strong style="color:#111827;font-size:15px;">${description}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;">
          <span style="color:#6b7280;font-size:14px;">Shipping Speed</span><br>
          <strong style="color:#111827;font-size:15px;">${speedLabel}</strong>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">
      You will receive further updates as your package moves through our warehouse. Our team will contact you regarding payment once the shipment is confirmed.
    </p>

    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${dashboardLink}" target="_blank"
             style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">
            View My Orders
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      If you have any questions, please reach out to our support team via the portal.
    </p>`;

  const subject = `New Order Created for You — ${trackingNumber}`;
  try {
    const result = await sendWithGmail({
      to: toEmail,
      subject,
      html: emailLayout(bodyHtml),
      text: `Hello ${toName || 'there'},\n\nThe Thapsus Cargo team has created a new order on your behalf.\n\nTracking Number: ${trackingNumber}\nRetailer: ${retailer}\nShipping From: ${market}\nDescription: ${description}\nShipping Speed: ${speedLabel}\n\nYou will receive updates as your package progresses. Our team will contact you regarding payment once confirmed.\n\nView your orders: ${dashboardLink}\n\n— Thapsus Cargo Team`,
    });
    await logEmailSent({ toEmail, emailType: 'order_created', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'order_created', subject, errorMessage: error.message });
    throw error;
  }
}

export async function sendWelcomeAccountEmail(toEmail, toName, warehouseId, role, setPasswordLink) {
  const roleLabel = role === 'admin' ? 'Administrator' : 'Customer';

  const warehouseAddresses = warehouseId ? `
    <!-- Warehouse Shipping Addresses -->
    <h3 style="margin:24px 0 12px;color:#1e3a5f;font-size:18px;">Your Shipping Addresses</h3>
    <p style="margin:0 0 16px;color:#4b5563;font-size:14px;line-height:1.6;">
      Use these addresses when shopping from international retailers. Include your Warehouse ID in the recipient/attention field.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f9ff;border-radius:8px;padding:20px;margin-bottom:16px;border:1px solid #bae6fd;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #bae6fd;">
          <span style="color:#6b7280;font-size:13px;">&#127468;&#127463; United Kingdom</span><br>
          <strong style="color:#111827;font-size:14px;">${toName}</strong><br>
          <strong style="color:#f97316;font-size:13px;font-family:monospace;">${warehouseId}</strong><br>
          <strong style="color:#111827;font-size:14px;">31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB, United Kingdom</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #bae6fd;">
          <span style="color:#6b7280;font-size:13px;">&#127482;&#127480; United States</span><br>
          <strong style="color:#111827;font-size:14px;">${toName}</strong><br>
          <strong style="color:#f97316;font-size:13px;font-family:monospace;">${warehouseId}</strong><br>
          <strong style="color:#111827;font-size:14px;">Thapsus Cargo Warehouse, 1234 Commerce Way, Los Angeles, CA 90001, USA</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;">
          <span style="color:#6b7280;font-size:13px;">&#127464;&#127475; China</span><br>
          <strong style="color:#111827;font-size:14px;">${toName}</strong><br>
          <strong style="color:#f97316;font-size:13px;font-family:monospace;">${warehouseId}</strong><br>
          <strong style="color:#111827;font-size:14px;">Thapsus Cargo Warehouse, Shanghai, China</strong>
        </td>
      </tr>
    </table>` : '';

  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Welcome to Thapsus Cargo!</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Hello ${toName || 'there'},
    </p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      A Thapsus Cargo ${roleLabel.toLowerCase()} account has been created for you. Here are your account details:
    </p>

    <!-- Account Details -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Email</span><br>
          <strong style="color:#1e3a5f;font-size:16px;">${toEmail}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Account Type</span><br>
          <strong style="color:#111827;font-size:15px;">${roleLabel}</strong>
        </td>
      </tr>
      ${warehouseId ? `<tr>
        <td style="padding:8px 0;">
          <span style="color:#6b7280;font-size:14px;">Warehouse ID</span><br>
          <strong style="color:#1e3a5f;font-size:16px;font-family:monospace;">${warehouseId}</strong>
        </td>
      </tr>` : ''}
    </table>

    ${warehouseAddresses}

    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      To get started, please set up your password by clicking the button below. This link will expire in <strong>24 hours</strong>.
    </p>

    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${setPasswordLink}" target="_blank"
             style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">
            Create My Password
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      Once your password is set, you can log in at any time to manage your shipments, track packages, and more.
    </p>
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      If the button above doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin:8px 0 0;word-break:break-all;color:#f97316;font-size:13px;">
      ${setPasswordLink}
    </p>`;

  const subject = `Welcome to Thapsus Cargo — Set Up Your Account`;
  try {
    const result = await sendWithGmail({
      to: toEmail,
      subject,
      html: emailLayout(bodyHtml),
      text: `Hello ${toName || 'there'},\n\nA Thapsus Cargo ${roleLabel.toLowerCase()} account has been created for you.\n\nEmail: ${toEmail}\nAccount Type: ${roleLabel}\n${warehouseId ? `Warehouse ID: ${warehouseId}\n\nYour Shipping Addresses:\n\nUK:\n${toName}\n${warehouseId}\n31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB, United Kingdom\n\nUSA:\n${toName}\n${warehouseId}\nThapsus Cargo Warehouse, 1234 Commerce Way, Los Angeles, CA 90001, USA\n\nChina:\n${toName}\n${warehouseId}\nThapsus Cargo Warehouse, Shanghai, China\n` : ''}\nTo get started, please set up your password using this link (expires in 24 hours):\n${setPasswordLink}\n\nOnce your password is set, you can log in to manage your shipments.\n\n— Thapsus Cargo Team`,
    });
    await logEmailSent({ toEmail, emailType: 'welcome_account', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'welcome_account', subject, errorMessage: error.message });
    throw error;
  }
}

export async function sendPaymentReminderEmail(toEmail, toName, trackingNumber, amount, notes, paymentLink) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Payment Reminder</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Hello ${toName || 'there'},
    </p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      This is a friendly reminder that a payment of <strong>KES ${amount.toLocaleString()}</strong> is outstanding for your order <strong>${trackingNumber}</strong>.
    </p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Please complete this payment at your earliest convenience so we can proceed with processing your shipment.
    </p>
    ${notes ? `
    <div style="margin:0 0 24px;background-color:#fef9c3;padding:12px 16px;border-left:4px solid #f59e0b;border-radius:4px;">
      <p style="margin:0;color:#92400e;font-size:14px;line-height:1.6;"><strong>Note from admin:</strong> ${notes}</p>
    </div>` : ''}
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${paymentLink}" target="_blank"
             style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">
            Pay Now
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;">
      You can also log in to your Thapsus Cargo account and pay from your wallet.
    </p>
    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      If the button above doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin:8px 0 0;word-break:break-all;color:#f97316;font-size:13px;">
      ${paymentLink}
    </p>`;

  const subject = `Payment Reminder for Order ${trackingNumber} — KES ${amount.toLocaleString()}`;
  try {
    const result = await sendWithGmail({
      to: toEmail,
      subject,
      html: emailLayout(bodyHtml),
      text: `Hello ${toName || 'there'},\n\nThis is a friendly reminder that a payment of KES ${amount.toLocaleString()} is outstanding for your order ${trackingNumber}.\n\nPlease complete this payment at your earliest convenience so we can proceed with processing your shipment.\n\n${notes ? `Note from admin: ${notes}\n\n` : ''}Pay here: ${paymentLink}\n\nYou can also log in and pay from your wallet.\n\n— Thapsus Cargo Team`,
    });
    await logEmailSent({ toEmail, emailType: 'payment_reminder', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'payment_reminder', subject, errorMessage: error.message });
    throw error;
  }
}

export async function sendPaymentReceiptEmail(toEmail, toName, trackingNumber, amount, paymentReference, approvedAt) {
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">Payment Received</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Hello ${toName || 'there'},
    </p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:16px;line-height:1.6;">
      Thank you! We have successfully received your payment for order <strong>${trackingNumber}</strong>.
    </p>

    <!-- Receipt Details Table -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Tracking Number</span><br>
          <strong style="color:#1e3a5f;font-size:16px;font-family:monospace;">${trackingNumber}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Amount Paid</span><br>
          <strong style="color:#111827;font-size:15px;">KES ${amount.toLocaleString()}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Payment Reference</span><br>
          <strong style="color:#1e3a5f;font-size:15px;font-family:monospace;">${paymentReference}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;">
          <span style="color:#6b7280;font-size:14px;">Approved On</span><br>
          <strong style="color:#111827;font-size:15px;">${new Date(approvedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">
      Thank you for doing business with Thapsus Cargo! Your shipment is now being processed and you will receive updates as it moves through our warehouse.
    </p>

    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="https://thapsus.cargo/orders" target="_blank"
             style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">
            View My Orders
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">
      If you have any questions, please reach out to our support team.
    </p>`;

  const subject = `Payment Received for Order ${trackingNumber}`;
  try {
    const result = await sendWithGmail({
      to: toEmail,
      subject,
      html: emailLayout(bodyHtml),
      text: `Hello ${toName || 'there'},\n\nThank you! We have successfully received your payment for order ${trackingNumber}.\n\nReceipt Details:\nTracking Number: ${trackingNumber}\nAmount Paid: KES ${amount.toLocaleString()}\nPayment Reference: ${paymentReference}\nApproved On: ${new Date(approvedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n\nThank you for doing business with Thapsus Cargo!\n\n— Thapsus Cargo Team`,
    });
    await logEmailSent({ toEmail, emailType: 'payment_receipt', subject });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'payment_receipt', subject, errorMessage: error.message });
    throw error;
  }
}

export async function sendTicketCreatedEmail(toEmail, ticket) {
  const appUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.thapsus.uk';
  const subject = `New Support Ticket: ${ticket.subject}`;
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">New Support Ticket Created</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      A new support ticket has been created in the Thapsus Cargo portal.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Ticket ID</span><br>
          <strong style="color:#1e3a5f;font-size:16px;font-family:monospace;">${ticket.id}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Subject</span><br>
          <strong style="color:#111827;font-size:15px;">${ticket.subject}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Priority</span><br>
          <strong style="color:#111827;font-size:15px;">${ticket.priority}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;">
          <span style="color:#6b7280;font-size:14px;">Description</span><br>
          <span style="color:#111827;font-size:14px;white-space:pre-line;">${ticket.description}</span>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#4b5563;font-size:14px;line-height:1.6;">
      You can view and respond to this ticket from the admin dashboard.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${appUrl}/admin" target="_blank"
             style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">
            Open Admin Dashboard
          </a>
        </td>
      </tr>
    </table>`;

  try {
    const result = await sendWithGmail({
      to: toEmail,
      subject,
      html: emailLayout(bodyHtml),
      text: `A new support ticket has been created.\n\nTicket ID: ${ticket.id}\nSubject: ${ticket.subject}\nPriority: ${ticket.priority}\nDescription:\n${ticket.description}\n\nOpen the admin dashboard to respond: ${appUrl}/admin`,
    });
    await logEmailSent({ toEmail, emailType: 'ticket_created', subject, userId: ticket.user_id });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'ticket_created', subject, userId: ticket.user_id, errorMessage: error.message });
    throw error;
  }
}

export async function sendTicketReplyEmail(toEmail, toName, ticket, replyMessage) {
  const appUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.thapsus.uk';
  const subject = `Support Reply on Ticket ${ticket.id.slice(0, 8).toUpperCase()}`;
  const bodyHtml = `
    <h2 style="margin:0 0 16px;color:#1e3a5f;font-size:22px;">New Reply from Support</h2>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Hello ${toName || 'there'},
    </p>
    <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
      Our support team has replied to your ticket <strong>${ticket.subject}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:14px;">Ticket ID</span><br>
          <strong style="color:#1e3a5f;font-size:16px;font-family:monospace;">${ticket.id}</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;">
          <span style="color:#6b7280;font-size:14px;">Support Reply</span><br>
          <div style="margin-top:8px;padding:12px 16px;background-color:#eff6ff;border-radius:8px;border-left:4px solid #3b82f6;">
            <p style="margin:0;color:#1f2937;font-size:14px;line-height:1.6;white-space:pre-line;">${replyMessage}</p>
          </div>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;color:#4b5563;font-size:14px;line-height:1.6;">
      You can reply to this message from your Thapsus Cargo account.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr>
        <td style="background-color:#f97316;border-radius:8px;">
          <a href="${appUrl}/support" target="_blank"
             style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">
            Open Support Portal
          </a>
        </td>
      </tr>
    </table>`;

  try {
    const result = await sendWithGmail({
      to: toEmail,
      subject,
      html: emailLayout(bodyHtml),
      text: `Hello ${toName || 'there'},\n\nOur support team has replied to your ticket: ${ticket.subject}.\n\nReply:\n${replyMessage}\n\nYou can respond from your account here: ${appUrl}/support\n\n— Thapsus Cargo Support`,
    });
    await logEmailSent({ toEmail, emailType: 'ticket_reply', subject, userId: ticket.user_id });
    return result;
  } catch (error) {
    await logEmailSent({ toEmail, emailType: 'ticket_reply', subject, userId: ticket.user_id, errorMessage: error.message });
    throw error;
  }
}

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
