import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    expect(verifyWebhookSignature(headersFor(ts), raw))
      .toEqual({ valid: true, lateBySeconds: 0 });
  });

  it('rejects a tampered body', () => {
    const ts = Math.floor(Date.now() / 1000);
    const headers = headersFor(ts);
    const tampered = Buffer.from(raw.toString('utf8').replace('m1', 'mX'));
    expect(verifyWebhookSignature(headers, tampered).valid).toBe(false);
  });

  it('accepts a retry the provider queued for 19 minutes', () => {
    // The 14 Aug break. sent.dm signs once at creation and replays the
    // same signature and timestamp on every retry, so a backed-up queue
    // used to mean a 401 the event could never recover from — it just
    // retried once a minute until the provider gave up.
    const late = Math.floor(Date.now() / 1000) - 19 * 60;
    const r = verifyWebhookSignature(headersFor(late), raw);
    expect(r.valid).toBe(true);
    expect(r.lateBySeconds).toBeGreaterThan(300);
  });

  it('rejects a timestamp old enough not to be live traffic', () => {
    const ancient = Math.floor(Date.now() / 1000) - 2 * 86_400;
    const r = verifyWebhookSignature(headersFor(ancient), raw);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/outside tolerance/);
  });

  it('rejects a timestamp from the future beyond tolerance', () => {
    const ahead = Math.floor(Date.now() / 1000) + 2 * 86_400;
    expect(verifyWebhookSignature(headersFor(ahead), raw).valid).toBe(false);
  });

  it('honours SENTDM_WEBHOOK_TOLERANCE_SECONDS', async () => {
    // Read at module load, so this asserts the override is wired rather
    // than re-importing: a fresh module registry picks up the env var.
    process.env.SENTDM_WEBHOOK_TOLERANCE_SECONDS = '60';
    vi.resetModules();
    const { verifyWebhookSignature: verifyTight } = await import('../../utils/sentdm.js');
    const late = Math.floor(Date.now() / 1000) - 600;
    expect(verifyTight(headersFor(late), raw).valid).toBe(false);
    delete process.env.SENTDM_WEBHOOK_TOLERANCE_SECONDS;
    vi.resetModules();
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
    // The whole payload rides along now: inbound media is not in the
    // hydrated message (a real photo came back as an empty content
    // field), so the webhook envelope is the only place left to look.
    const parsed = parseInboundEvent({
      field: 'message', sub_type: 'message.received',
      payload: { message_id: 'abc' },
    });
    expect(parsed).toMatchObject({ kind: 'message_received', messageId: 'abc' });
    expect(parsed.payload).toEqual({ message_id: 'abc' });
  });

  it('detects a delivery-status event via payload.message_status', () => {
    expect(parseInboundEvent({
      field: 'message', sub_type: 'message.status',
      payload: { message_id: 'abc', message_status: 'DELIVERED' },
    })).toEqual({ kind: 'message_status', messageId: 'abc', status: 'DELIVERED', error: null });
  });

  it('detects a status event encoded in the event name', () => {
    expect(parseInboundEvent({
      field: 'message', event: 'message.failed',
      payload: { message_id: 'abc' },
    })).toEqual({ kind: 'message_status', messageId: 'abc', status: 'FAILED', error: null });
  });

  it('keeps the provider error off a failed status', () => {
    // The shape the archived platform recorded: WhatsApp's own error
    // array. The Meta code is the part worth keeping — 131026 means the
    // number cannot receive from us, which is actionable; "failed" is not.
    const event = parseInboundEvent({
      field: 'message', event: 'message.failed',
      payload: {
        message_id: 'abc',
        errors: [{ code: 131026, title: 'Message undeliverable' }],
      },
    });
    expect(event.status).toBe('FAILED');
    expect(event.error).toContain('131026');
  });

  it('keeps a string error verbatim', () => {
    const event = parseInboundEvent({
      field: 'message', sub_type: 'message.status',
      payload: { message_id: 'abc', message_status: 'FAILED', error_message: 'Recipient blocked' },
    });
    expect(event.error).toBe('Recipient blocked');
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

describe('flattenForFreeText', () => {
  it('flattens paragraph breaks and single newlines into inline separators', async () => {
    const { flattenForFreeText } = await import('../../utils/sentdm.js');
    const input = 'Karibu!\n\nHow it works:\n1. Send a link\n2. Pay via M-Pesa\n\nAsante!';
    const out = flattenForFreeText(input);
    expect(out).not.toMatch(/\n/);
    expect(out).not.toMatch(/ {4,}/);
    expect(out).toContain('1. Send a link · 2. Pay via M-Pesa');
    expect(out).toContain('Karibu!  —  How it works');
  });
  it('leaves single-line text untouched', async () => {
    const { flattenForFreeText } = await import('../../utils/sentdm.js');
    expect(flattenForFreeText('Test')).toBe('Test');
  });
});

describe('Gemini model discovery (scoreModel)', () => {
  it('prefers the newest stable flash model the key can call', async () => {
    const { scoreModel } = await import('../../utils/waAi.js');
    const models = [
      { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.0-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.0-pro', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.0-flash-preview', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/imagen-4.0', supportedGenerationMethods: ['generateContent'] },
    ];
    const best = models
      .map((m) => ({ name: m.name.replace(/^models\//, ''), score: scoreModel(m) }))
      .filter((m) => m.score >= 0)
      .sort((a, b) => b.score - a.score)[0];
    expect(best.name).toBe('gemini-3.0-flash');
  });

  it('rejects non-chat and non-gemini entries', async () => {
    const { scoreModel } = await import('../../utils/waAi.js');
    expect(scoreModel({ name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] })).toBe(-1);
    expect(scoreModel({ name: 'models/gemma-3', supportedGenerationMethods: ['generateContent'] })).toBe(-1);
    expect(scoreModel({ name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['countTokens'] })).toBe(-1);
    expect(scoreModel({ name: 'models/gemini-2.5-flash-tts', supportedGenerationMethods: ['generateContent'] })).toBe(-1);
  });

  it('prefers a rolling alias over a dated snapshot of the same model', async () => {
    const { scoreModel } = await import('../../utils/waAi.js');
    const alias = scoreModel({ name: 'models/gemini-3.0-flash', supportedGenerationMethods: ['generateContent'] });
    const dated = scoreModel({ name: 'models/gemini-3.0-flash-09-25', supportedGenerationMethods: ['generateContent'] });
    expect(alias).toBeGreaterThan(dated);
  });
});
