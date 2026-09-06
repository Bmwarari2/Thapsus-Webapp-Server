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
  // The message record carries no history — the shape production actually
  // returns, and the reason every failure read "no reason given".
  fetchMessageActivities: vi.fn(async () => []),
}));
vi.mock('../../utils/waStateMachine.js', () => ({ handleInbound: vi.fn(async () => {}) }));
vi.mock('../../utils/waStaffAlert.js', () => ({
  notifyStaff: vi.fn(async () => {}),
  recordStaffAlertStatus: vi.fn(async () => false),
}));
vi.mock('../../routes/events.js', () => ({ pushToStaff: vi.fn() }));
vi.mock('../../utils/errorLogger.js', () => ({ logError: vi.fn() }));

import { waWebhookHandler } from '../../routes/waWebhook.js';
import { handleInbound } from '../../utils/waStateMachine.js';
import { notifyStaff, recordStaffAlertStatus } from '../../utils/waStaffAlert.js';
import { fetchMessageActivities } from '../../utils/sentdm.js';

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

  // A status for an id that is in no wa_messages row used to be the end
  // of the road: alertStaffOfFailedSend looked it up, missed, returned.
  // Staff alerts are sent outside wa_messages, so every failed page took
  // that exit — seven in a row, in silence.
  it('recognises a failed staff alert instead of dropping the event', async () => {
    recordStaffAlertStatus.mockResolvedValueOnce(true);
    const req = {
      headers: {},
      db: dbStub(),
      body: Buffer.from(JSON.stringify({
        field: 'message',
        event: 'message.failed',
        payload: { message_id: 'pm-staff-1', message_status: 'FAILED' },
      })),
    };
    const res = { json: vi.fn(), status: vi.fn(() => res), send: vi.fn() };
    await waWebhookHandler(req, res);
    await settle();

    // A bare FAILED carries no reason on the event, so both provider
    // lookups are spent before giving up — and with neither answering,
    // the row records the honest null rather than a guess.
    expect(fetchMessageActivities).toHaveBeenCalledWith('pm-staff-1');
    expect(recordStaffAlertStatus).toHaveBeenCalledWith(req.db, 'pm-staff-1', 'failed', null);
    // and it must not then try to page staff about the page.
    expect(notifyStaff).not.toHaveBeenCalled();
  });

  // The gap that made every failure unexplainable. GET /v3/messages/{id}
  // has no events[]; the descriptions live in /activities, which
  // /ops/settings had been reading since 0019 while the webhook — the only
  // thing that can record the reason at the moment it is known — asked the
  // endpoint that does not have it. Eighteen failures, eighteen "no reason
  // given", and three different faults that need three different fixes all
  // looking identical.
  it('falls back to the activity log for a reason the message record lacks', async () => {
    fetchMessageActivities.mockResolvedValueOnce([
      { status: 'SENT', description: 'Message sent via WhatsApp' },
      { status: 'FAILED', description: '131026 Message undeliverable' },
    ]);
    recordStaffAlertStatus.mockResolvedValueOnce(true);
    const req = {
      headers: {},
      db: dbStub(),
      body: Buffer.from(JSON.stringify({
        field: 'message',
        event: 'message.failed',
        payload: { message_id: 'pm-staff-2', message_status: 'FAILED' },
      })),
    };
    const res = { json: vi.fn(), status: vi.fn(() => res), send: vi.fn() };
    await waWebhookHandler(req, res);
    await settle();

    expect(recordStaffAlertStatus)
      .toHaveBeenCalledWith(req.db, 'pm-staff-2', 'failed', '131026 Message undeliverable');
  });
});
