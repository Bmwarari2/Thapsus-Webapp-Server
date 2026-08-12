import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  verifyWebhookSignature,
  parseInboundEvent,
  mapProviderStatus,
  toE164,
  fromE164,
} from '../../utils/sentdm.js';

// Compute a valid sent.dm (Svix-style) signature the way the provider does:
// "v1," + base64(HMAC-SHA256(base64decode(secret - "whsec_"), `${id}.${ts}.` + raw)).
function sign(webhookId, timestamp, rawBody, secret) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signed = Buffer.concat([Buffer.from(`${webhookId}.${timestamp}.`, 'utf8'), rawBody]);
  return `v1,${createHmac('sha256', key).update(signed).digest('base64')}`;
}

const SECRET = `whsec_${Buffer.from('test-signing-key-32-bytes-long!!').toString('base64')}`;

describe('verifyWebhookSignature', () => {
  const raw = Buffer.from(JSON.stringify({ field: 'message', payload: { message_id: 'm1' } }));
  let savedSecret;

  beforeEach(() => {
    savedSecret = process.env.SENTDM_WEBHOOK_SECRET;
    process.env.SENTDM_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    if (savedSecret === undefined) delete process.env.SENTDM_WEBHOOK_SECRET;
    else process.env.SENTDM_WEBHOOK_SECRET = savedSecret;
  });

  function headersFor(ts, id = 'wh_1', body = raw, secret = SECRET) {
    return {
      'x-webhook-id': id,
      'x-webhook-timestamp': String(ts),
      'x-webhook-signature': sign(id, String(ts), body, secret),
    };
  }

  it('accepts a correctly signed delivery', () => {
    const ts = Math.floor(Date.now() / 1000);
    expect(verifyWebhookSignature(headersFor(ts), raw)).toEqual({ valid: true });
  });

  it('rejects a tampered body', () => {
    const ts = Math.floor(Date.now() / 1000);
    const headers = headersFor(ts);
    const tampered = Buffer.from(raw.toString('utf8').replace('m1', 'mX'));
    expect(verifyWebhookSignature(headers, tampered).valid).toBe(false);
  });

  it('rejects a stale timestamp (replay window)', () => {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    expect(verifyWebhookSignature(headersFor(stale), raw).valid).toBe(false);
  });

  it('rejects when headers are missing', () => {
    expect(verifyWebhookSignature({}, raw).valid).toBe(false);
  });

  it('rejects a signature minted with a different secret', () => {
    const ts = Math.floor(Date.now() / 1000);
    const otherSecret = `whsec_${Buffer.from('another-key-entirely-not-same!!!').toString('base64')}`;
    const headers = headersFor(ts, 'wh_1', raw, otherSecret);
    expect(verifyWebhookSignature(headers, raw).valid).toBe(false);
  });

  it('fails closed when the secret is unconfigured', () => {
    delete process.env.SENTDM_WEBHOOK_SECRET;
    const ts = Math.floor(Date.now() / 1000);
    expect(verifyWebhookSignature(headersFor(ts), raw).valid).toBe(false);
  });
});

describe('parseInboundEvent', () => {
  it('detects an inbound message event', () => {
    expect(parseInboundEvent({
      field: 'message', sub_type: 'message.received',
      payload: { message_id: 'abc' },
    })).toEqual({ kind: 'message_received', messageId: 'abc' });
  });

  it('detects a delivery-status event via payload.message_status', () => {
    expect(parseInboundEvent({
      field: 'message', sub_type: 'message.status',
      payload: { message_id: 'abc', message_status: 'DELIVERED' },
    })).toEqual({ kind: 'message_status', messageId: 'abc', status: 'DELIVERED' });
  });

  it('detects a status event encoded in the event name', () => {
    expect(parseInboundEvent({
      field: 'message', event: 'message.failed',
      payload: { message_id: 'abc' },
    })).toEqual({ kind: 'message_status', messageId: 'abc', status: 'FAILED' });
  });

  it('ignores events without a message id', () => {
    expect(parseInboundEvent({ field: 'message', payload: {} }).kind).toBe('ignored');
  });

  it('ignores non-message fields', () => {
    expect(parseInboundEvent({ field: 'template', payload: { message_id: 'x' } }).kind).toBe('ignored');
  });
});

describe('status mapping + phone helpers', () => {
  it('maps provider statuses onto wa_messages statuses', () => {
    expect(mapProviderStatus('QUEUED')).toBe('queued');
    expect(mapProviderStatus('SENT')).toBe('sent');
    expect(mapProviderStatus('DELIVERED')).toBe('delivered');
    expect(mapProviderStatus('READ')).toBe('read');
    expect(mapProviderStatus('FAILED')).toBe('failed');
    expect(mapProviderStatus('BLOCKED')).toBe('failed');
    expect(mapProviderStatus('SOMETHING_NEW')).toBe(null);
  });

  it('round-trips phone formats', () => {
    expect(toE164('254712345678')).toBe('+254712345678');
    expect(fromE164('+254 712 345 678')).toBe('254712345678');
    expect(fromE164('+254712345678')).toBe('254712345678');
  });
});

describe('parseInboundEvent — live production payload shape', () => {
  it('extracts text + counterparty from a real message.received delivery', () => {
    const event = parseInboundEvent({
      event: 'message.received',
      field: 'message',
      payload: {
        text: 'Hi',
        channel: 'whatsapp',
        account_id: 'c56c6220-bb32-46d3-a302-42b15b372e2c',
        message_id: '68f60a01-a97c-4400-8463-2c0970a7851a',
        updated_at: '2026-08-12T06:22:24Z',
        received_at: '2026-08-12T06:22:24Z',
        inbound_number: '447424531483',
        outbound_number: '254740825215',
      },
      timestamp: '2026-08-12T06:22:27Z',
    });
    expect(event.kind).toBe('message_received');
    expect(event.messageId).toBe('68f60a01-a97c-4400-8463-2c0970a7851a');
    expect(event.text).toBe('Hi');
    // inbound_number = the external sender; outbound_number = the
    // business's own sent.dm line (confirmed: customers message
    // 254740825215, so the 447… number was the test sender here).
    expect(event.inboundNumber).toBe('447424531483');
    expect(event.outboundNumber).toBe('254740825215');
  });
});
