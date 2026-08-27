// The sweeper must be safe to run against a quiet database (no rows in
// any of its five sweeps) and must page staff for the states that mean a
// customer is waiting.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/waStaffAlert.js', () => ({
  notifyStaff: vi.fn(async () => {}),
}));
vi.mock('../../utils/sentdm.js', () => ({
  sentDmConfigured: vi.fn(() => true),
  sendText: vi.fn(async () => ({ messageId: 'pm-retry' })),
}));
vi.mock('../../utils/markPaymentPaid.js', () => ({
  fireWaOrderPostPaidHook: vi.fn(async () => {}),
}));

import { sweepOnce } from '../../utils/waSweeper.js';
import { notifyStaff } from '../../utils/waStaffAlert.js';
import { sendText } from '../../utils/sentdm.js';

beforeEach(() => vi.clearAllMocks());

describe('sweepOnce', () => {
  it('does nothing on a quiet database', async () => {
    const pool = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) };
    await sweepOnce(pool);
    expect(notifyStaff).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  it('re-pages staff for a payment stuck in awaiting_review', async () => {
    const pool = {
      query: vi.fn(async (sql) => {
        if (sql.includes("p.status = 'awaiting_review'") && sql.includes('awaiting review') === false) {
          return { rows: [{ id: 'PAY-1', amount_due_kes: '17094', created_at: new Date(Date.now() - 30 * 60000).toISOString(), full_name: 'Jane', phone: '2547', customer_code: 'TC-1', tracking_code: null }] };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    await sweepOnce(pool);
    expect(notifyStaff).toHaveBeenCalledWith(pool, expect.objectContaining({
      title: expect.stringMatching(/still waiting for review/i),
    }));
  });

  it('retries a failed free-text send when the window is open', async () => {
    const pool = {
      query: vi.fn(async (sql) => {
        if (sql.includes("m.status = 'failed'")) {
          return { rows: [{ id: 'msg-1', contact_id: 'c1', body: 'hello', phone: '254712345678' }] };
        }
        if (sql.includes('retry_count = retry_count + 1')) return { rows: [], rowCount: 1 };
        if (sql.includes("direction = 'in'") && sql.includes('24 hours')) return { rows: [{ '?column?': 1 }] };
        return { rows: [], rowCount: 0 };
      }),
    };
    await sweepOnce(pool);
    expect(sendText).toHaveBeenCalledWith('254712345678', 'hello', { idempotencyKey: 'msg-1-r1' });
  });
});

// ── Unanswered-conversation reminder: once per stretch, silenceable ──────────
// This used to re-page hourly for as long as a conversation sat
// unanswered. It now fires once, 15 minutes in, claims the stretch
// (unanswered_alerted_at) before paging, and the inbox's "No reply
// needed" button writes the same stamp to silence it pre-emptively.
describe('unanswered-conversation reminder', () => {
  const WAITING = {
    id: 'c7', full_name: 'Grace', phone: '254712345678', customer_code: 'TC-1042',
    last_message_at: new Date(Date.now() - 20 * 60000).toISOString(),
    last_message_preview: 'is the promo still on?',
  };

  it('pages once and claims the stretch BEFORE paging', async () => {
    const calls = [];
    const pool = {
      query: vi.fn(async (sql) => {
        calls.push(sql);
        if (sql.includes('unanswered_alerted_at IS NULL')) return { rows: [WAITING] };
        if (sql.includes('SET unanswered_alerted_at')) return { rows: [], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }),
    };
    await sweepOnce(pool);
    const claimIdx = calls.findIndex((sql) => sql.includes('SET unanswered_alerted_at'));
    expect(claimIdx).toBeGreaterThan(-1);
    expect(notifyStaff).toHaveBeenCalledWith(pool, expect.objectContaining({
      title: expect.stringMatching(/unanswered/i),
      detail: expect.stringContaining('No reply needed'),
    }));
    // The claim must land before the page went out.
    const pageOrder = notifyStaff.mock.invocationCallOrder[0];
    const claimOrder = pool.query.mock.invocationCallOrder[claimIdx];
    expect(claimOrder).toBeLessThan(pageOrder);
  });

  it('the eligibility query excludes already-alerted (or silenced) stretches', async () => {
    // The dedupe lives in SQL: unanswered_alerted_at newer than the last
    // inbound keeps the row out of the result set entirely. Pin that the
    // query carries the predicate, so a refactor can't quietly go back
    // to hourly re-pages.
    const pool = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) };
    await sweepOnce(pool);
    const sql = pool.query.mock.calls
      .map(([s]) => s)
      .find((s) => s.includes("interval '24 hours'") && s.includes("= 'in'"));
    expect(sql).toContain('unanswered_alerted_at IS NULL');
    expect(sql).toContain('unanswered_alerted_at < c.last_message_at');
    expect(notifyStaff).not.toHaveBeenCalled();
  });
});
