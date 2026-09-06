// The sweeper must be safe to run against a quiet database (no rows in
// any of its five sweeps) and must page staff for the states that mean a
// customer is waiting.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/waStaffAlert.js', () => ({
  notifyStaff: vi.fn(async () => ({ batchId: 'b-new', attempted: 1, rejected: 0 })),
  // The boot check and the alert-channel sweep read these. Stubbing only
  // notifyStaff made assertAlertConfig throw into its own catch, which is
  // exactly the shape of silence this file exists to prevent — and the
  // same omission on the four below would silently disable the sweep that
  // exists because seven pages died unseen on 5-6 September 2026.
  usableStaffNumbers: vi.fn((raw) => ({ numbers: raw || [], rejected: [] })),
  staffAlertHealth: vi.fn(async () => []),
  lostAlertBatches: vi.fn(async () => []),
  deadStaffNumbers: vi.fn(async () => []),
  claimAlertRescue: vi.fn(async (_db, ids) => ids.length),
}));
const sendStaffAlertFallbackEmail = vi.fn(async () => ({}));
vi.mock('../../utils/email.js', () => ({
  sendStaffAlertFallbackEmail: (...a) => sendStaffAlertFallbackEmail(...a),
}));
vi.mock('../../utils/sentdm.js', () => ({
  sentDmConfigured: vi.fn(() => true),
  sendText: vi.fn(async () => ({ messageId: 'pm-retry' })),
}));
vi.mock('../../utils/markPaymentPaid.js', () => ({
  fireWaOrderPostPaidHook: vi.fn(async () => {}),
}));

import { sweepOnce } from '../../utils/waSweeper.js';
import {
  notifyStaff, lostAlertBatches, deadStaffNumbers, claimAlertRescue, staffAlertHealth,
} from '../../utils/waStaffAlert.js';
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
      title: expect.stringMatching(/waiting for review/i),
      detail: expect.stringContaining("won't repeat"),
    }));
    // Once-only: the stamp is claimed before the page goes out, and the
    // eligibility query excludes already-alerted (or muted) rows.
    const claimIdx = pool.query.mock.calls.findIndex(([sql]) => sql.includes('SET review_alerted_at'));
    expect(claimIdx).toBeGreaterThan(-1);
    expect(pool.query.mock.invocationCallOrder[claimIdx])
      .toBeLessThan(notifyStaff.mock.invocationCallOrder[0]);
    const eligibility = pool.query.mock.calls
      .map(([sql]) => sql)
      .find((sql) => sql.includes("p.status = 'awaiting_review'") && sql.trim().startsWith('SELECT'));
    expect(eligibility).toContain('review_alerted_at IS NULL');
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

// ── Money pages fire once, not on a repeat schedule ──────────────────────────
// Stalled orders and expired quotes used to re-page daily; each is now
// claimed in the audit trail before paging, exactly like the customer
// nudges.
describe('once-only money pages', () => {
  it('stalled-order page claims the audit event first and says it will not repeat', async () => {
    const pool = {
      query: vi.fn(async (sql) => {
        if (sql.includes("interval '48 hours'") && sql.includes('Stalled-order staff page sent')
            && sql.trim().startsWith('SELECT')) {
          return { rows: [{ id: 'o1', tracking_code: 'TRK-8825', status: 'paid',
            paid_at: new Date(Date.now() - 3 * 86400_000).toISOString(), dispatched_at: null,
            full_name: 'Jane', phone: '2547', customer_code: 'TC-1' }] };
        }
        return { rows: [], rowCount: 1 };
      }),
    };
    await sweepOnce(pool);
    const claim = pool.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO wa_order_events') && sql.includes('Stalled-order staff page sent'));
    expect(claim).toBeTruthy();
    expect(notifyStaff).toHaveBeenCalledWith(pool, expect.objectContaining({
      title: expect.stringMatching(/not yet purchased/i),
      detail: expect.stringContaining("won't repeat"),
    }));
  });

  it('expired-quote page is excluded once its audit note exists', async () => {
    const pool = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) };
    await sweepOnce(pool);
    const sql = pool.query.mock.calls
      .map(([s]) => s)
      .find((s) => s.includes('quote_expires_at < NOW()') && s.trim().startsWith('SELECT'));
    expect(sql).toContain('Expired-quote staff page sent');
    expect(notifyStaff).not.toHaveBeenCalled();
  });
});

// ── The pages that reached nobody ────────────────────────────────────────────
// Everything above ends in notifyStaff(), which is one WhatsApp template
// per staff number and nothing else. Seven of those failed on 5 and 6
// September 2026 — among them the "Product link received — quote needed"
// for a customer who then waited eighteen hours — and the whole response
// was a console line each. These tests pin the two failures worth
// spending a second channel on, and the claim that stops two instances
// spending it twice.
describe('alert-channel rescue', () => {
  const quietPool = () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })) });

  it('stays silent when nothing is lost and no number is dead', async () => {
    await sweepOnce(quietPool());
    expect(sendStaffAlertFallbackEmail).not.toHaveBeenCalled();
    expect(claimAlertRescue).not.toHaveBeenCalled();
  });

  it('emails a page that reached none of the staff numbers, verbatim', async () => {
    process.env.ADMIN_EMAIL = 'ops@thapsus.uk';
    lostAlertBatches.mockResolvedValueOnce([{
      batch_id: 'b-1', at: '2026-09-05T21:02:04.000Z',
      title: 'Product link received — quote needed',
      detail: 'TC-1064 (+254790325255): "https://onelink.shein.com/…"',
      phones: ['447424531483'], ids: ['a1'],
    }]);
    await sweepOnce(quietPool());

    // Claimed BEFORE the fallback goes out: a crash emails zero times.
    expect(claimAlertRescue.mock.invocationCallOrder[0])
      .toBeLessThan(sendStaffAlertFallbackEmail.mock.invocationCallOrder[0]);
    const [to, { lines }] = sendStaffAlertFallbackEmail.mock.calls[0];
    expect(to).toBe('ops@thapsus.uk');
    // The email IS the page. Summarising it would lose the only copy.
    expect(lines.join('\n')).toContain('Product link received — quote needed');
    expect(lines.join('\n')).toContain('+254790325255');
  });

  it('does not email when another instance claimed the same failures first', async () => {
    lostAlertBatches.mockResolvedValueOnce([{
      batch_id: 'b-1', at: new Date().toISOString(), title: 't', detail: 'd',
      phones: ['4474'], ids: ['a1'],
    }]);
    claimAlertRescue.mockResolvedValueOnce(0);
    await sweepOnce(quietPool());
    expect(sendStaffAlertFallbackEmail).not.toHaveBeenCalled();
  });

  it('reports a dead number to the numbers that still work, and never to itself', async () => {
    deadStaffNumbers.mockResolvedValueOnce([{
      phone: '447346813917', failures: 2, last_at: new Date().toISOString(),
      last_ok_at: null, last_error: null, ids: ['a1', 'a2'],
    }]);
    staffAlertHealth.mockResolvedValueOnce([
      { phone: '447424531483', own_number: false, failed_since_ok: 0 },
      { phone: '447346813917', own_number: false, failed_since_ok: 2 },
    ]);
    await sweepOnce(quietPool());
    // "A failed page cannot page about itself" is true of a NUMBER, not of
    // the channel: the colleague's phone is working and is exactly who
    // should hear that this one is not.
    expect(notifyStaff).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      title: expect.stringMatching(/not receiving alerts/i),
      detail: expect.stringContaining('447346813917'),
    }));
    expect(sendStaffAlertFallbackEmail).toHaveBeenCalled();
  });

  it('still emails when every configured number is dead and there is no colleague left', async () => {
    deadStaffNumbers.mockResolvedValueOnce([{
      phone: '447424531483', failures: 5, last_at: new Date().toISOString(),
      last_ok_at: '2026-09-05T11:11:54.000Z', last_error: null, ids: ['a1'],
    }]);
    staffAlertHealth.mockResolvedValueOnce([
      { phone: '447424531483', own_number: false, failed_since_ok: 5 },
    ]);
    await sweepOnce(quietPool());
    expect(notifyStaff).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      title: expect.stringMatching(/not receiving alerts/i),
    }));
    expect(sendStaffAlertFallbackEmail).toHaveBeenCalled();
  });
});

// ── A link with no quote behind it ───────────────────────────────────────────
// The page that says "a customer wants a quote" fires once, when the link
// arrives. Every stalled-quote sweep in this repo keys on an order that
// already HAS a quote, so a link whose page was never delivered had
// nothing at all watching it — which is how +254790325255 waited from
// 21:02 on 5 September until 15:22 the next day while the assistant told
// her four times that it was on its way.
describe('unquoted links', () => {
  const linkRow = (body) => ({
    id: 'c1', full_name: null, phone: '254790325255', customer_code: null,
    at: new Date(Date.now() - 4 * 60 * 60_000).toISOString(),
    link_key: '2026-09-05 21:02:04.194072+00',
    body,
  });
  const poolWith = (row) => ({
    query: vi.fn(async (sql) => {
      if (sql.includes('AND m.direction = \'in\'') && sql.includes('unquoted-link:')) {
        return { rows: [row] };
      }
      return { rows: [], rowCount: 0 };
    }),
  });

  it('pages once for a cart link nobody has quoted', async () => {
    await sweepOnce(poolWith(linkRow('https://onelink.shein.com/51/614cv6o2fsip?shc=2_R8NTvjymJzb')));
    expect(notifyStaff).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      title: expect.stringMatching(/still not quoted/i),
      detail: expect.stringContaining('4 hours ago'),
      // The claim is the alert row itself, keyed on the link's timestamp
      // as Postgres renders it — a JS Date in the key would never match
      // the SQL that suppresses the repeat.
      dedupeKey: 'unquoted-link:c1:2026-09-05 21:02:04.194072+00',
    }));
  });

  it('does not page for a SHEIN product link — we asked THEM for a cart', async () => {
    // Reporting our own correct behaviour as a fault is how the pages
    // that matter stop being read.
    await sweepOnce(poolWith(linkRow('https://www.shein.com/Product-p-12345-cat-1234.html')));
    expect(notifyStaff).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      title: expect.stringMatching(/still not quoted/i),
    }));
  });

  it('does not page for an inbound message that is not a link at all', async () => {
    // The SQL pattern is a superset of PRODUCT_LINK (which has a lookbehind
    // Postgres cannot express); the JS test is what decides. An email
    // address collected at signup must not read as a quote request.
    await sweepOnce(poolWith(linkRow('kibugicharles128@gmail.com')));
    expect(notifyStaff).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      title: expect.stringMatching(/still not quoted/i),
    }));
  });
});
