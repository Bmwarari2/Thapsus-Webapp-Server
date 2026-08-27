// utils/waSend.js
//
// The single outbound WhatsApp path. Bot replies, pipeline status alerts,
// and operator-composed messages ALL go through sendToContact() so every
// send lands in wa_messages (the inbox transcript is complete), bumps the
// conversation head on wa_contacts, and reaches open dashboards over SSE.
//
// Template strategy: `templateKey` is a logical name ('welcome', 'quote',
// 'receipt', …). Free text is richer than any approved template — the
// quote carries its full breakdown, the payment prompt carries the till
// number — so it wins whenever WhatsApp will deliver it: inside the 24-hour
// customer-service window that every inbound message opens. Outside that
// window free text is refused outright, so the mapped template (approved
// for business-initiated delivery) is the only thing that can land, and
// its poorer copy beats silence. Before this check existed a mapped
// template always won, and a customer who said YES seconds earlier was
// sent the template with no till number in it instead of the composed
// instructions.
//
// Media (welcome infographics) can only ride on templates in sent.dm's
// v3 API, so a send carrying media keeps its template even in-window; the
// no-template fallback appends the media URL to the text body instead.

import { v4 as uuidv4 } from 'uuid';
import { sendText, sendTemplate, sentDmConfigured, SentDmError } from './sentdm.js';
import { getWaSettings } from './waSettings.js';
import { toPositionalParams, renderTemplateBody } from './waTemplateVars.js';
import { pushToStaff } from '../routes/events.js';

const PREVIEW_LEN = 120;

/**
 * Is WhatsApp's 24-hour customer-service window open for this contact?
 * True when they've sent us anything in the last 24 hours — the window a
 * free-form message can be delivered in. Fails closed (window shut) so an
 * errored check falls back to the template, which can always deliver.
 */
export async function sessionWindowOpen(db, contactId) {
  const { rows } = await db.query(
    `SELECT 1 FROM wa_messages
      WHERE contact_id = $1 AND direction = 'in'
        AND created_at > NOW() - interval '24 hours'
      LIMIT 1`,
    [contactId]
  );
  return rows.length > 0;
}

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

  // Free text wins while the customer's 24-hour window is open — it is
  // always the richer copy (see the header). The template is kept when
  // the send carries media (media only rides on templates) or when there
  // is no text to fall back to.
  if (templateName && text && !mediaUrl) {
    try {
      if (await sessionWindowOpen(db, contact.id)) templateName = null;
    } catch (e) {
      console.warn('[waSend] window check failed — keeping template:', e?.message);
    }
  }

  // Transcript body: what the customer actually receives. For a template
  // send that is the rendered template body, not the free-text fallback.
  let effectiveText = text || '';
  if (templateName) {
    const rendered = renderTemplateBody(templateKey, templateParams || {});
    if (rendered) effectiveText = rendered;
  } else if (mediaUrl) {
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
