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
    // FILTERED is a message that was never dispatched — the contact is
    // opted out or route-denied. It used to fall through to null, which
    // left the row reading 'queued' and told nobody the customer had
    // gone dark. SCHEDULED is the opposite: a quiet-hours hold that
    // releases itself, so it is still in flight, not a failure.
    expect(mapProviderStatus('FILTERED')).toBe('failed');
    expect(mapProviderStatus('SCHEDULED')).toBe('queued');
    expect(mapProviderStatus('ROUTED')).toBe('queued');
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

describe('terminalStatusReason', () => {
  it('explains the two statuses that never carry a reason of their own', async () => {
    const { terminalStatusReason } = await import('../../utils/sentdm.js');
    // The leading token is read by waSweeper to keep a suppressed message
    // out of the retry queue — a consent-blocked send is filtered again
    // every time. Don't rename it without changing that query.
    expect(terminalStatusReason('FILTERED')).toMatch(/^FILTERED: /);
    expect(terminalStatusReason('FILTERED')).toMatch(/opted out/i);
    expect(terminalStatusReason('BLOCKED')).toMatch(/^BLOCKED: /);
    // A plain FAILED is worth a round-trip to the provider, so it must
    // NOT be answered with a canned sentence here.
    expect(terminalStatusReason('FAILED')).toBe(null);
    expect(terminalStatusReason('DELIVERED')).toBe(null);
  });
});

describe('failureReasonFromMessage', () => {
  it('reads the last failing entry out of events[]', async () => {
    const { failureReasonFromMessage } = await import('../../utils/sentdm.js');
    const reason = failureReasonFromMessage({
      status: 'FAILED',
      events: [
        { status: 'QUEUED', description: 'Message accepted and queued for processing' },
        { status: 'SENT', description: 'Message sent via WhatsApp' },
        { status: 'FAILED', description: '131026 Message undeliverable' },
      ],
    });
    expect(reason).toBe('131026 Message undeliverable');
  });

  it('accepts the activities shape and the { data } envelope too', async () => {
    const { failureReasonFromMessage } = await import('../../utils/sentdm.js');
    expect(failureReasonFromMessage({
      data: { activities: [{ status: 'FAILED', description: 'Template parameters invalid' }] },
    })).toBe('Template parameters invalid');
  });

  it('falls back to the documented meaning when the description says nothing', async () => {
    const { failureReasonFromMessage } = await import('../../utils/sentdm.js');
    // The ERR_* code is recorded inside sent.dm and documented as absent
    // from both the payload and the activity log; the description that
    // does arrive is generic. Passing that through would put "Message
    // updated to FILTERED" in front of an operator, which explains
    // nothing about a customer who has gone quiet.
    expect(failureReasonFromMessage({
      events: [{ status: 'FILTERED', description: 'Message updated to FILTERED' }],
    })).toMatch(/^FILTERED: /);
  });

  it('still reads the legacy error keys the archived rows carried', async () => {
    const { failureReasonFromMessage } = await import('../../utils/sentdm.js');
    expect(failureReasonFromMessage({ error: '  131026 Message undeliverable  ' }))
      .toBe('131026 Message undeliverable');
    expect(failureReasonFromMessage({ status: 'DELIVERED', events: [] })).toBe(null);
  });
});

describe('complianceKeyword', () => {
  it('matches sent.dm\'s keywords the way its consent engine does', async () => {
    const { complianceKeyword } = await import('../../utils/sentdm.js');
    for (const word of ['STOP', 'CANCEL', 'UNSUBSCRIBE', 'QUIT', 'END']) {
      expect(complianceKeyword(word)).toBe('opt_out');
      expect(complianceKeyword(` ${word.toLowerCase()} `)).toBe('opt_out');
    }
    for (const word of ['START', 'UNSTOP', 'SUBSCRIBE']) {
      expect(complianceKeyword(word)).toBe('opt_in');
    }
    expect(complianceKeyword('HELP')).toBe('help');
    expect(complianceKeyword('info')).toBe('help');
  });

  it('does not match sentences that merely contain a keyword', async () => {
    const { complianceKeyword } = await import('../../utils/sentdm.js');
    // The must-not-catch list. Matching any of these would silence the
    // bot on an ordinary message — and these are ordinary messages in a
    // parcel conversation.
    for (const text of [
      'Please stop messaging me',
      'cancel my order please',
      'Can I cancel order TRK-8823?',
      'Send me info about shipping',
      'help me choose a size',
      '',
      null,
    ]) {
      expect(complianceKeyword(text)).toBe(null);
    }
  });
});

describe('api() retry policy', () => {
  let savedKey;
  beforeEach(() => {
    savedKey = process.env.SENTDM_API_KEY;
    process.env.SENTDM_API_KEY = 'test-key';
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.SENTDM_API_KEY;
    else process.env.SENTDM_API_KEY = savedKey;
    vi.unstubAllGlobals();
  });

  const reply = (status, body, headers = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h) => headers[h.toLowerCase()] ?? null },
    json: async () => body,
  });

  it('retries a 503 (the idempotency cache refusing to risk a double send)', async () => {
    const { sendText } = await import('../../utils/sentdm.js');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply(503, { success: false, error: { code: 'SERVICE_001' } }))
      .mockResolvedValueOnce(reply(202, {
        success: true, data: { recipients: [{ message_id: 'pm-1' }] },
      }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(sendText('254712345678', 'Hi', { idempotencyKey: 'k1' }))
      .resolves.toEqual({ messageId: 'pm-1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not sleep through a 60-second Retry-After on the request path', async () => {
    const { sendText, SentDmError } = await import('../../utils/sentdm.js');
    // The rate limit and the failed-auth lockout both answer 429 with
    // Retry-After: 60. A customer is waiting on this call, so it fails
    // fast with the code intact and the sweeper retries within 5 minutes.
    const fetchMock = vi.fn().mockResolvedValue(
      reply(429, { success: false, error: { code: 'BUSINESS_002', message: 'Rate limit exceeded' } },
        { 'retry-after': '60' })
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(sendText('254712345678', 'Hi', { idempotencyKey: 'k2' }))
      .rejects.toBeInstanceOf(SentDmError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never repeats an unkeyed mutation on a 5xx', async () => {
    const { createWebhook } = await import('../../utils/sentdm.js');
    // POST /v3/webhooks carries no Idempotency-Key, and a 500 is
    // ambiguous: the webhook may already exist. Two registrations would
    // double every inbound event, so this one attempt is the only one.
    const fetchMock = vi.fn().mockResolvedValue(
      reply(500, { success: false, error: { code: 'INTERNAL_001' } })
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(createWebhook('https://example.com/hook')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps meta.request_id on the error — the only handle support can trace', async () => {
    const { fetchMessage } = await import('../../utils/sentdm.js');
    const fetchMock = vi.fn().mockResolvedValue(
      reply(404, {
        success: false,
        error: { code: 'RESOURCE_003', message: 'Message not found' },
        meta: { request_id: 'req_a1b2c3d4e5f60718' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchMessage('m-1')).rejects.toMatchObject({
      code: 'RESOURCE_003',
      requestId: 'req_a1b2c3d4e5f60718',
    });
  });
});
