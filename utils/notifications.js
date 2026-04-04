import { v4 as uuidv4 } from 'uuid';

/**
 * Send SMS notification (Africa's Talking API placeholder)
 * @param {string} phone - Phone number in international format
 * @param {string} message - Message to send
 * @returns {Promise<Object>} Result
 */
export async function sendSMS(phone, message) {
  if (!process.env.ENABLE_SMS_NOTIFICATIONS || process.env.ENABLE_SMS_NOTIFICATIONS !== 'true') {
    console.log('[SMS DISABLED]', phone, message);
    return { success: false, reason: 'SMS notifications disabled' };
  }

  try {
    // Placeholder for Africa's Talking API
    // In production, this would make actual API calls to Africa's Talking
    console.log('[SMS PLACEHOLDER]', {
      to: phone,
      message: message,
      provider: 'Africa\'s Talking',
      timestamp: new Date().toISOString()
    });

    // Simulated successful response
    return {
      success: true,
      message_id: `sms_${uuidv4()}`,
      provider: 'africas_talking',
      phone: phone,
      status: 'queued'
    };
  } catch (error) {
    console.error('SMS error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send WhatsApp notification (WhatsApp Business API placeholder)
 * @param {string} phone - Phone number in international format
 * @param {string} message - Message to send
 * @returns {Promise<Object>} Result
 */
export async function sendWhatsApp(phone, message) {
  if (!process.env.ENABLE_WHATSAPP_NOTIFICATIONS || process.env.ENABLE_WHATSAPP_NOTIFICATIONS !== 'true') {
    console.log('[WHATSAPP DISABLED]', phone, message);
    return { success: false, reason: 'WhatsApp notifications disabled' };
  }

  try {
    // Placeholder for WhatsApp Business API
    // In production, this would make actual API calls to WhatsApp
    console.log('[WHATSAPP PLACEHOLDER]', {
      to: phone,
      message: message,
      provider: 'WhatsApp Business API',
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      message_id: `wa_${uuidv4()}`,
      provider: 'whatsapp_business',
      phone: phone,
      status: 'sent'
    };
  } catch (error) {
    console.error('WhatsApp error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send email notification (SendGrid placeholder)
 * @param {string} email - Email address
 * @param {string} subject - Email subject
 * @param {string} body - Email body (HTML or plain text)
 * @returns {Promise<Object>} Result
 */
export async function sendEmail(email, subject, body) {
  if (!process.env.ENABLE_EMAIL_NOTIFICATIONS || process.env.ENABLE_EMAIL_NOTIFICATIONS !== 'true') {
    console.log('[EMAIL DISABLED]', email, subject);
    return { success: false, reason: 'Email notifications disabled' };
  }

  try {
    // Placeholder for SendGrid API
    // In production, this would make actual API calls to SendGrid
    console.log('[EMAIL PLACEHOLDER]', {
      to: email,
      subject: subject,
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@swiftcargo.co.ke',
      provider: 'SendGrid',
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      message_id: `email_${uuidv4()}`,
      provider: 'sendgrid',
      email: email,
      status: 'queued'
    };
  } catch (error) {
    console.error('Email error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send in-app notification (store in database)
 * @param {string} userId - User ID
 * @param {string} message - Notification message
 * @param {Object} db - Database instance
 * @returns {void}
 */
export function sendInAppNotification(userId, message, db = null) {
  try {
    // If no db provided, we'll need to get it from context
    if (!db) {
      console.log('[IN-APP NOTIFICATION]', {
        userId: userId,
        message: message,
        timestamp: new Date().toISOString(),
        note: 'Store in notifications table for later retrieval'
      });
      return;
    }

    const notificationId = uuidv4();
    const insertNotification = db.prepare(`
      INSERT INTO notifications (
        id, user_id, type, message, is_read
      ) VALUES (?, ?, ?, ?, ?)
    `);

    insertNotification.run(
      notificationId,
      userId,
      'in_app',
      message,
      0
    );

    console.log('[IN-APP NOTIFICATION STORED]', {
      notification_id: notificationId,
      user_id: userId,
      message: message
    });
  } catch (error) {
    console.error('In-app notification error:', error);
  }
}

/**
 * Notify about status change via multiple channels
 * @param {string} userId - User ID
 * @param {string} trackingNumber - Tracking number
 * @param {string} newStatus - New status
 * @param {Object} userData - User data (email, phone, name)
 * @param {Object} db - Database instance
 * @returns {Promise<Object>} Results
 */
export async function notifyStatusChange(userId, trackingNumber, newStatus, userData = {}, db = null) {
  try {
    const statusMessages = {
      'pending': `Your order ${trackingNumber} has been created. We'll notify you once it arrives at our warehouse.`,
      'received_at_warehouse': `Good news! Package ${trackingNumber} has arrived at our warehouse.`,
      'consolidating': `Your package ${trackingNumber} is being consolidated with other items. This helps reduce shipping costs!`,
      'in_transit': `Your package ${trackingNumber} is now in transit to Kenya.`,
      'customs': `Your package ${trackingNumber} is currently undergoing customs clearance.`,
      'out_for_delivery': `Your package ${trackingNumber} is out for delivery! Track it for real-time updates.`,
      'delivered': `Your package ${trackingNumber} has been delivered! Thank you for using SwiftCargo.`
    };

    const message = statusMessages[newStatus] || `Your package ${trackingNumber} status has been updated to ${newStatus}.`;

    const results = {};

    // Store in-app notification
    if (db) {
      sendInAppNotification(userId, message, db);
      results.in_app = { success: true };
    }

    // Send SMS if phone provided
    if (userData.phone) {
      results.sms = await sendSMS(userData.phone, message);
    }

    // Send WhatsApp if phone provided
    if (userData.phone) {
      results.whatsapp = await sendWhatsApp(userData.phone, message);
    }

    // Send email if email provided
    if (userData.email) {
      const emailBody = `
        <h2>Package Status Update</h2>
        <p>Hi ${userData.name || 'Customer'},</p>
        <p>${message}</p>
        <p><strong>Tracking Number:</strong> ${trackingNumber}</p>
        <p>Status: <strong>${newStatus.replace('_', ' ').toUpperCase()}</strong></p>
        <p>Track your package: <a href="https://swiftcargo.co.ke/track/${trackingNumber}">View Status</a></p>
        <p>Best regards,<br>SwiftCargo Team</p>
      `;
      results.email = await sendEmail(userData.email, `Package Status Update: ${trackingNumber}`, emailBody);
    }

    return {
      success: true,
      tracking_number: trackingNumber,
      new_status: newStatus,
      notifications_sent: results
    };
  } catch (error) {
    console.error('Status change notification error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  sendSMS,
  sendWhatsApp,
  sendEmail,
  sendInAppNotification,
  notifyStatusChange
};
