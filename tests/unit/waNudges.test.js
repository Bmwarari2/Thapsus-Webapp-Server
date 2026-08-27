// Revenue follow-ups (utils/waNudges.js): one send each, claimed before
// sending, in-window only, killable from settings. The behaviors pinned
// here come straight from the first month's conversation data — quotes
// and warm leads went permanently silent after our reply because nothing
// ever followed up.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/waSend.js', () => ({
  sendToContact: vi.fn(async () => ({ ok: true, id: 'msg-1' })),
  sessionWindowOpen: vi.fn(async () => true),
}));
vi.mock('../../utils/waSettings.js', () => ({
  getWaSettings: vi.fn(async () => ({
    nudges_enabled: true,
    promo_active: false,
    promo_message: '',
    template_map: {},
  })),
}));
vi.mock('../../utils/waStaffAlert.js', () => ({
  notifyStaff: vi.fn(async () => {}),
}));

import { runNudges } from '../../utils/waNudges.js';
import { sendToContact, sessionWindowOpen } from '../../utils/waSend.js';
import { getWaSettings } from '../../utils/waSettings.js';
import { notifyStaff } from '../../utils/waStaffAlert.js';

beforeEach(() => {
  vi.clearAllMocks();
  // mockResolvedValue overrides persist across tests — restore the
  // defaults so a window-shut test can't leak into the next one.
  sessionWindowOpen.mockResolvedValue(true);
  getWaSettings.mockResolvedValue({
    nudges_enabled: true, promo_active: false, promo_message: '', template_map: {},
  });
});

const QUOTE_ROW = {
  id: 'o1', quote_kes: '4929', quote_expires_at: new Date(Date.now() + 5 * 86400_000).toISOString(),
  tracking_code: null, contact_id: 'c1', phone: '254712345678', full_name: 'Grace Wanjiku',
};

/** pool whose query dispatches on which nudge's SQL is running. */
function makePool({ quoteRows = [], browseRows = [], repeatRows = [], stalledRows = [] } = {}) {
  return {
    query: vi.fn(async (sql) => {
      if (sql.includes('INSERT INTO wa_order_events')) return { rows: [], rowCount: 1 };
      if (sql.includes("interval '4 hours'")) return { rows: quoteRows };
      if (sql.includes("interval '16 hours'")) return { rows: browseRows };
      if (sql.includes("('delivered', 'collected')")) return { rows: repeatRows };
      if (sql.includes("interval '48 hours'")) return { rows: stalledRows };
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('runNudges — kill switch', () => {
  it('does nothing at all when nudges_enabled is off', async () => {
    getWaSettings.mockResolvedValueOnce({ nudges_enabled: false });
    const pool = makePool({ quoteRows: [QUOTE_ROW] });
    await runNudges(pool);
    expect(pool.query).not.toHaveBeenCalled();
    expect(sendToContact).not.toHaveBeenCalled();
    expect(notifyStaff).not.toHaveBeenCalled();
  });
});

describe('quote follow-up', () => {
  it('claims the audit event, then sends a hold-plus-YES message with the amount', async () => {
    const pool = makePool({ quoteRows: [QUOTE_ROW] });
    await runNudges(pool);

    const claim = pool.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO wa_order_events') && sql.includes('Quote follow-up sent'));
    expect(claim).toBeTruthy();

    const send = sendToContact.mock.calls.find(([, , o]) => o.templateKey === 'quote_reminder');
    expect(send).toBeTruthy();
    const text = send[2].text;
    expect(text).toContain('KSh 4,929');
    expect(text).toMatch(/holding it for you/i);
    expect(text).toMatch(/Reply \*YES\*/);
    // Urgency comes from the real expiry, never an invented offer.
    expect(text).toMatch(/locked in until/i);
  });

  it('skips (and does not claim) when the window is shut and no quote_reminder template is mapped', async () => {
    sessionWindowOpen.mockResolvedValue(false);
    const pool = makePool({ quoteRows: [QUOTE_ROW] });
    await runNudges(pool);
    expect(sendToContact).not.toHaveBeenCalled();
    expect(pool.query.mock.calls.some(([sql]) => sql.includes('Quote follow-up sent')
      && sql.includes('INSERT'))).toBe(false);
  });

  it('sends out-of-window once a quote_reminder template is mapped in Settings', async () => {
    sessionWindowOpen.mockResolvedValue(false);
    getWaSettings.mockResolvedValueOnce({
      nudges_enabled: true, promo_active: false, promo_message: '',
      template_map: { quote_reminder: 'tc_quote_reminder' },
    });
    const pool = makePool({ quoteRows: [QUOTE_ROW] });
    await runNudges(pool);
    expect(sendToContact).toHaveBeenCalled();
  });
});

describe('browse-abandon nudge', () => {
  it('sends the how-to-share-your-cart message with its dedupe marker', async () => {
    const pool = makePool({ browseRows: [{ id: 'c2', phone: '254700000001', full_name: 'Amina Yusuf' }] });
    await runNudges(pool);
    const send = sendToContact.mock.calls.find(([, c]) => c.id === 'c2');
    expect(send).toBeTruthy();
    const text = send[2].text;
    expect(text).toMatch(/three dots/i);           // the concrete how-to
    expect(text).toMatch(/within the hour/i);      // the benefit
    expect(text).toContain('nothing to pay until you have seen and accepted the quote');
    expect(text).toContain('Amina');               // first name only
  });

  it('includes the configured promotion, never an invented one', async () => {
    getWaSettings.mockResolvedValueOnce({
      nudges_enabled: true, promo_active: true,
      promo_message: 'No service fee on SHEIN until 15 September.', template_map: {},
    });
    const pool = makePool({ browseRows: [{ id: 'c2', phone: '254700000001', full_name: null }] });
    await runNudges(pool);
    expect(sendToContact.mock.calls[0][2].text).toContain('No service fee on SHEIN until 15 September.');
  });
});

describe('repeat-purchase nudge', () => {
  it('claims once per order and mentions the customer code', async () => {
    const pool = makePool({ repeatRows: [{
      id: 'o9', tracking_code: 'TRK-8830', contact_id: 'c3',
      phone: '254700000002', full_name: 'Peter Otieno', customer_code: 'TC-1051',
    }] });
    await runNudges(pool);
    expect(pool.query.mock.calls.some(([sql]) =>
      sql.includes('Repeat-purchase nudge sent') && sql.includes('INSERT'))).toBe(true);
    const text = sendToContact.mock.calls[0][2].text;
    expect(text).toMatch(/anything else on your list/i);
    expect(text).toContain('TC-1051');
  });

  it('stays silent when the window is shut — no template exists for this', async () => {
    sessionWindowOpen.mockResolvedValue(false);
    const pool = makePool({ repeatRows: [{ id: 'o9', contact_id: 'c3', phone: '2547', customer_code: null }] });
    await runNudges(pool);
    expect(sendToContact).not.toHaveBeenCalled();
  });
});

describe('stalled-quote staff page', () => {
  it('pages staff with the amount and the age', async () => {
    const pool = makePool({ stalledRows: [{
      id: 'o5', quote_kes: '17746', quoted_at: new Date(Date.now() - 3 * 86400_000).toISOString(),
      full_name: 'Marion', phone: '254700000003', customer_code: 'TC-1060',
    }] });
    await runNudges(pool);
    expect(notifyStaff).toHaveBeenCalledWith(pool, expect.objectContaining({
      title: expect.stringMatching(/personal follow-up/i),
      detail: expect.stringContaining('17,746'),
    }));
  });
});
