// The alerting channel, tested as the thing that breaks rather than a
// thing shaped like it.
//
// Every page this system sends is one WhatsApp template per staff number.
// Between 4 and 6 September 2026 eighteen of those failed — thirteen of
// them staff pages — and every single one was recorded "no reason given"
// while nobody was told at all. The three properties below are what the
// recovery rests on: every row of a page carries the same batch_id (so
// "did ANY number get it?" is a question the database can answer), a send
// that throws still writes its row (so a failure cannot be invisible),
// and the rescue claim is taken exactly once (so two instances cannot
// both email the same lost page).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendTemplate = vi.fn(async () => ({ messageId: 'pm-1' }));
vi.mock('../../utils/sentdm.js', () => ({
  sendTemplate: (...a) => sendTemplate(...a),
  sentDmConfigured: () => true,
  businessWhatsAppNumber: () => '254740825215',
}));
vi.mock('../../utils/waSettings.js', () => ({
  getWaSettings: vi.fn(async () => ({
    staff_alert_numbers: ['447424531483', '447346813917'],
    staff_alert_template: 'Staff_Alert',
  })),
}));
vi.mock('../../utils/errorLogger.js', () => ({ logError: vi.fn(async () => {}) }));

import {
  notifyStaff, usableStaffNumbers, recordStaffAlertStatus, claimAlertRescue,
} from '../../utils/waStaffAlert.js';
import { logError } from '../../utils/errorLogger.js';

function fakeDb(handler) {
  const inserts = [];
  const db = {
    inserts,
    query: vi.fn(async (sql, params) => {
      if (sql.includes('INSERT INTO wa_staff_alerts')) {
        inserts.push({
          id: params[0], batchId: params[1], phone: params[2], title: params[3],
          detail: params[4], dedupeKey: params[5], template: params[6],
          providerMessageId: params[7], status: params[8], error: params[9],
        });
        return { rows: [], rowCount: 1 };
      }
      return handler ? handler(sql, params) : { rows: [], rowCount: 0 };
    }),
  };
  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
  sendTemplate.mockImplementation(async () => ({ messageId: `pm-${Math.random()}` }));
});

describe('notifyStaff — one page, one batch', () => {
  it('stamps every number of a page with the same batch_id', async () => {
    const db = fakeDb();
    const result = await notifyStaff(db, { title: 'Product link received', detail: 'TC-1 sent a cart' });

    expect(db.inserts).toHaveLength(2);
    // The whole point: per-phone rows can say "this number missed it".
    // Only the batch answers "nobody got it", which is the question that
    // decides whether a human has to be told twice.
    const batches = new Set(db.inserts.map((r) => r.batchId));
    expect(batches.size).toBe(1);
    expect([...batches][0]).toBe(result.batchId);
    expect(result.attempted).toBe(2);
  });

  it('records a row for a send that threw — a failure with no row is a failure nobody can see', async () => {
    sendTemplate.mockImplementation(async (phone) => {
      if (phone === '447346813917') throw new Error('recipient not reachable');
      return { messageId: 'pm-ok' };
    });
    const db = fakeDb();
    await notifyStaff(db, { title: 'Payment claimed', detail: 'ref ABC' });

    const failed = db.inserts.find((r) => r.phone === '447346813917');
    expect(failed.status).toBe('failed');
    expect(failed.error).toMatch(/not reachable/);
    expect(failed.providerMessageId).toBeNull();
    // …and the number that worked is still recorded as sent, so the batch
    // reads "one of two landed" rather than "the page is lost".
    expect(db.inserts.find((r) => r.phone === '447424531483').status).toBe('sent');
  });

  it('never throws — alerting must not take down the conversation it reports on', async () => {
    sendTemplate.mockImplementation(async () => { throw new Error('boom'); });
    const db = { query: vi.fn(async () => { throw new Error('db down'); }) };
    await expect(notifyStaff(db, { title: 't', detail: 'd' })).resolves.toBeTruthy();
  });
});

describe('usableStaffNumbers', () => {
  it('rejects the business\'s own number — WhatsApp will not deliver to its own sender', () => {
    const { numbers, rejected } = usableStaffNumbers(['254740825215', '447424531483']);
    expect(rejected).toEqual(['254740825215']);
    expect(numbers).toEqual(['447424531483']);
  });

  it('keeps a non-Kenyan staff number: both operators are on UK phones', () => {
    // normalizeKenyanPhone returns null for +44, and the digits fallback is
    // the only reason the people who actually receive these pages get them.
    expect(usableStaffNumbers(['+44 7424 531483']).numbers).toEqual(['447424531483']);
  });
});

describe('recordStaffAlertStatus', () => {
  it('reports false for a provider id that is not one of ours', async () => {
    // The webhook uses this to decide whether an unmatched failure was a
    // staff page or a customer send it still has to alert about.
    const db = fakeDb(() => ({ rows: [], rowCount: 0 }));
    expect(await recordStaffAlertStatus(db, 'not-ours', 'failed', 'nope')).toBe(false);
  });

  it('logs a failed page to error_logs — the one failure that cannot page about itself', async () => {
    const db = fakeDb(() => ({ rows: [{ phone: '447346813917', title: 'Product link received' }], rowCount: 1 }));
    expect(await recordStaffAlertStatus(db, 'pm-1', 'failed', 'undeliverable')).toBe(true);
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({
      source: 'wa-staff-alert',
      message: expect.stringContaining('447346813917'),
    }));
  });
});

describe('claimAlertRescue', () => {
  it('claims only rows that are still unclaimed, so a second instance stays quiet', async () => {
    const db = { query: vi.fn(async (sql) => {
      expect(sql).toContain('rescued_at IS NULL');
      return { rowCount: 0 };
    }) };
    expect(await claimAlertRescue(db, ['a', 'b'])).toBe(0);
  });

  it('does not query at all for an empty list', async () => {
    const db = { query: vi.fn() };
    expect(await claimAlertRescue(db, [])).toBe(0);
    expect(db.query).not.toHaveBeenCalled();
  });
});
