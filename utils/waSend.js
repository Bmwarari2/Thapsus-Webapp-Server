// utils/waSend.js
//
// The single outbound WhatsApp path. Bot replies, pipeline status alerts,
// and operator-composed messages ALL go through sendToContact() so every
// send lands in wa_messages (the inbox transcript is complete), bumps the
// conversation head on wa_contacts, and reaches open dashboards over SSE.
//
// Template strategy: `templateKey` is a logical name ('welcome', 'quote',
// 'receipt', …). If wa_settings.template_map maps it to an approved
// sent.dm template name, we send that template with `templateParams`;
// otherwise we fall back to free-form `text` (valid inside WhatsApp's 24h
// customer-service window — true for every reply to a customer message).
// Media (welcome infographics, PDF receipts) can only ride on templates
// in sent.dm's v3 API, so the no-template fallback appends the media URL
// to the text body instead.

import { v4 as uuidv4 } from 'uuid';
import { sendText, sendTemplate, sentDmConfigured, SentDmError } from './sentdm.js';
import { getWaSettings } from './waSettings.js';
import { toPositionalParams } from './waTemplateVars.js';
import { pushToStaff } from '../routes/events.js';

const PREVIEW_LEN = 120;

/**
 * @param {pg.Pool|pg.PoolClient} db
 * @param {{id: string, phone: string}} contact  wa_contacts row (id + phone)
 * @param {object} opts
 * @param {string}  [opts.text]           free-form body (fallback + transcript copy)
 * @param {string}  [opts.templateKey]    logical template key (see template_map)
 * @param {object}  [opts.templateParams] template variable map
 * @param {string}  [opts.mediaUrl]       media URL (sent via template header or appended to text)
 * @param {string}  [opts.mediaType]      'image' | 'document'
 * @param {string}  [opts.sentBy]         operator user id; omit for bot sends
 * @returns {Promise<{ok: boolean, id: string, error?: string}>} never throws
 */
export async function sendToContact(db, contact, opts = {}) {
  const { text, templateKey, templateParams, mediaUrl, mediaType, sentBy } = opts;
  const id = uuidv4();

  let templateName = null;
  if (templateKey) {
    try {
      const settings = await getWaSettings(db);
      templateName = settings.template_map?.[templateKey] || null;
    } catch (e) {
      console.warn('[waSend] settings read failed, using text fallback:', e?.message);
    }
  }

  // Transcript body: what the customer effectively receives.
  let effectiveText = text || '';
  if (mediaUrl && !templateName) {
    effectiveText = effectiveText ? `${effectiveText}\n${mediaUrl}` : mediaUrl;
  }

  let providerMessageId = null;
  let status = 'queued';
  let error = null;

  if (!sentDmConfigured()) {
    // Keep the flow (and the transcript) alive in environments without
    // credentials — dev, CI, and the pre-cutover window.
    status = 'failed';
    error = 'sentdm_not_configured';
    console.warn(`[waSend] SENTDM_API_KEY unset — message to ${contact.phone} recorded as failed`);
  } else {
    try {
      const result = templateName
        ? await sendTemplate(contact.phone, templateName, {
            // Approved templates take var_1..var_N in body order; our
            // callers pass meaningful names. See utils/waTemplateVars.js.
            ...toPositionalParams(templateKey, templateParams || {}),
            ...(mediaUrl ? { media_url: mediaUrl } : {}),
          }, { idempotencyKey: id })
        : await sendText(contact.phone, effectiveText, { idempotencyKey: id });
      providerMessageId = result.messageId;
    } catch (e) {
      status = 'failed';
      error = e instanceof SentDmError ? `${e.code}: ${e.message}` : String(e?.message || e);
      console.error(`[waSend] send to ${contact.phone} failed:`, error);
    }
  }

  try {
    await db.query(
      `INSERT INTO wa_messages
         (id, contact_id, direction, body, media_url, media_type,
          template_key, provider_message_id, status, error, sent_by)
       VALUES ($1,$2,'out',$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, contact.id, effectiveText || null, mediaUrl || null, mediaType || null,
       templateName ? templateKey : null, providerMessageId, status, error, sentBy || null]
    );
    await db.query(
      `UPDATE wa_contacts
          SET last_message_at = NOW(),
              last_message_preview = $2,
              updated_at = NOW()
        WHERE id = $1`,
      [contact.id, (effectiveText || `[${mediaType || 'media'}]`).slice(0, PREVIEW_LEN)]
    );
  } catch (e) {
    console.error('[waSend] failed to persist outbound message:', e?.message);
  }

  try {
    pushToStaff('wa_inbox_update', {
      contact_id: contact.id,
      direction: 'out',
      message_id: id,
      status,
      preview: (effectiveText || '').slice(0, PREVIEW_LEN),
    });
  } catch { /* SSE best-effort */ }

  return error ? { ok: false, id, error } : { ok: true, id };
}
