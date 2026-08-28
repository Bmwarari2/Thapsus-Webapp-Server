// The inbound webhook, at the two decisions that cost a customer.
//
// 1. A body that is exactly one of sent.dm's opt-out keywords is stored
//    but NOT answered. sent.dm's consent engine flips opt_out on the
//    contact before the event reaches us, across every channel, so a bot
//    reply is filtered on the way out and lands in the transcript as a
//    message the customer never received. Staff get paged instead —
//    "CANCEL" and "END" are things a parcel customer types meaning their
//    order or their sentence, and either one takes them off WhatsApp.
// 2. An ordinary reply still reaches the state machine, keyword-adjacent
//    wording included.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/sentdm.js', async (importOriginal) => ({
  ...(await importOriginal()),
  verifyWebhookSignature: vi.fn(() => ({ valid: true })),
  fetchMessage: vi.fn(async () => ({
    direction: 'INBOUND',
    phone: '+254712345678',
    message_body: { content: null },
  })),
}));
vi.mock('../../utils/waStateMachine.js', () => ({ handleInbound: vi.fn(async () => {}) }));
vi.mock('../../utils/waStaffAlert.js', () => ({ notifyStaff: vi.fn(async () => {}) }));
vi.mock('../../routes/events.js', () => ({ pushToStaff: vi.fn() }));
vi.mock('../../utils/errorLogger.js', () => ({ logError: vi.fn() }));

import { waWebhookHandler } from '../../routes/waWebhook.js';
import { handleInbound } from '../../utils/waStateMachine.js';
import { notifyStaff } from '../../utils/waStaffAlert.js';

function dbStub() {
  return {
    query: vi.fn(async (sql) => {
      if (sql.includes('SELECT 1 FROM wa_messages')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO wa_contacts')) {
        return { rows: [{ id: 'c1', phone: '254712345678', full_name: 'Martha', customer_code: 'TC-1' }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO wa_messages')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }),
  };
}

function inbound(text) {
  const req = {
    headers: {},
    db: dbStub(),
    body: Buffer.from(JSON.stringify({
      field: 'message',
      event: 'message.received',
      payload: {
        message_id: 'pm-1',
        text,
        channel: 'whatsapp',
        inbound_number: '+254712345678',
        outbound_number: '+254740825215',
      },
    })),
  };
  const res = { json: vi.fn(), status: vi.fn(() => res), send: vi.fn() };
  return { req, res };
}

// The handler ACKs and then runs its follow-up work off the response.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => vi.clearAllMocks());

describe('waWebhookHandler — compliance keywords', () => {
  it('stores an opt-out keyword, pages staff, and does not answer it', async () => {
    const { req, res } = inbound('CANCEL');
    await waWebhookHandler(req, res);
    await settle();

    // Stored: the transcript is the record of what the customer said.
    const inserted = req.db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO wa_messages'));
    expect(inserted[1]).toContain('CANCEL');

    expect(handleInbound).not.toHaveBeenCalled();
    expect(notifyStaff).toHaveBeenCalledWith(req.db, expect.objectContaining({
      title: 'Customer opted out of WhatsApp',
      dedupeKey: expect.stringMatching(/^opt-out:/),
    }));
  });

  it('answers an ordinary reply that merely contains a keyword', async () => {
    const { req, res } = inbound('Can I cancel order TRK-8823?');
    await waWebhookHandler(req, res);
    await settle();

    expect(handleInbound).toHaveBeenCalledTimes(1);
    expect(notifyStaff).not.toHaveBeenCalled();
  });
});

describe('waWebhookHandler — suppressed sends', () => {
  it('writes FILTERED as a failure with the reason a customer went quiet', async () => {
    const req = {
      headers: {},
      db: dbStub(),
      body: Buffer.from(JSON.stringify({
        field: 'message',
        event: 'message.filtered',
        payload: { message_id: 'pm-2', message_status: 'FILTERED' },
      })),
    };
    const res = { json: vi.fn(), status: vi.fn(() => res), send: vi.fn() };
    await waWebhookHandler(req, res);
    await settle();

    const update = req.db.query.mock.calls.find(([sql]) => sql.includes('UPDATE wa_messages'));
    expect(update[1][1]).toBe('failed');
    // The status is the whole signal — the ERR_* code behind it is not in
    // the payload — so the row has to carry what FILTERED means.
    expect(update[1][2]).toMatch(/^FILTERED: /);
    expect(res.json).toHaveBeenCalledWith({ received: true, status: 'failed' });
  });
});
