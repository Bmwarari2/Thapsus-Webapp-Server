import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the outbound sender + SSE + settings so the suite is fully offline.
vi.mock('../../utils/waSend.js', () => ({
  sendToContact: vi.fn(async () => ({ ok: true, id: 'msg-1' })),
}));
vi.mock('../../routes/events.js', () => ({
  pushToStaff: vi.fn(),
  pushToUser: vi.fn(),
  pushToAdmins: vi.fn(),
}));
vi.mock('../../utils/waStaffAlert.js', () => ({
  notifyStaff: vi.fn(async () => {}),
}));
vi.mock('../../utils/waSettings.js', () => ({
  getWaSettings: vi.fn(async () => ({
    markup_pct: 10, promo_active: false, promo_type: 'waive_fee',
    promo_message: '', default_delivery_fee_kes: 300,
    welcome_media_urls: [], template_map: {},
  })),
}));

import { handleInbound } from '../../utils/waStateMachine.js';
import { sendToContact } from '../../utils/waSend.js';
import { pushToStaff } from '../../routes/events.js';
import { getWaSettings } from '../../utils/waSettings.js';
import { notifyStaff } from '../../utils/waStaffAlert.js';
import { flattenForFreeText } from '../../utils/sentdm.js';

function makeDb(queryImpl) {
  return { query: vi.fn(queryImpl ?? (async () => ({ rows: [], rowCount: 0 }))) };
}

function contact(overrides = {}) {
  return {
    id: 'c1', phone: '254712345678', state: 'active',
    customer_code: 'TC-1042', full_name: 'Jane Doe',
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('onboarding', () => {
  it('new contact gets the welcome message and moves to awaiting_name', async () => {
    const db = makeDb();
    await handleInbound(db, contact({ state: 'new', customer_code: null, full_name: null }), { id: 'm', body: 'Hi' });
    // state update
    const stateUpdate = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE wa_contacts'));
    expect(stateUpdate[1]).toContain('awaiting_name');
    // welcome copy sent
    expect(sendToContact).toHaveBeenCalled();
    expect(sendToContact.mock.calls[0][2].text).toMatch(/full name/i);
  });

  it('sends configured welcome media after the welcome text', async () => {
    // handleInbound reads settings at dispatch time AND inside the
    // welcome branch — cover both reads.
    const settings = {
      welcome_media_urls: ['https://cdn.example.com/how-it-works.png'],
      template_map: {},
    };
    getWaSettings.mockResolvedValueOnce(settings).mockResolvedValueOnce(settings);
    const db = makeDb();
    await handleInbound(db, contact({ state: 'new' }), { id: 'm', body: 'Hi' });
    const mediaSend = sendToContact.mock.calls.find(([, , o]) => o.mediaUrl);
    expect(mediaSend[2].mediaUrl).toBe('https://cdn.example.com/how-it-works.png');
  });

  it('re-prompts when the "name" is a link or too short', async () => {
    const db = makeDb();
    await handleInbound(db, contact({ state: 'awaiting_name' }), { id: 'm', body: 'https://amazon.com/dp/x' });
    expect(db.query).not.toHaveBeenCalled(); // no state change
    expect(sendToContact.mock.calls[0][2].text).toMatch(/full name/i);
  });

  it('stores the name and asks for the address', async () => {
    const db = makeDb();
    await handleInbound(db, contact({ state: 'awaiting_name' }), { id: 'm', body: 'John Kamau' });
    const update = db.query.mock.calls[0];
    expect(update[0]).toContain('full_name');
    expect(update[1]).toContain('John Kamau');
    expect(sendToContact.mock.calls[0][2].text).toMatch(/address/i);
  });

  it('stores the address and asks for the M-Pesa number', async () => {
    const db = makeDb();
    await handleInbound(db, contact({ state: 'awaiting_address' }), { id: 'm', body: 'Greenspan Estate, Donholm, Nairobi' });
    expect(db.query.mock.calls[0][0]).toContain('delivery_address');
    expect(sendToContact.mock.calls[0][2].text).toMatch(/m-?pesa/i);
  });

  it('rejects an invalid M-Pesa number and re-prompts', async () => {
    const db = makeDb();
    await handleInbound(db, contact({ state: 'awaiting_mpesa' }), { id: 'm', body: '12345' });
    expect(db.query).not.toHaveBeenCalled();
    expect(sendToContact.mock.calls[0][2].text).toMatch(/valid/i);
  });

  it('accepts "this one" (the WhatsApp number), mints the customer code, alerts staff', async () => {
    const db = makeDb(async (sql) => {
      if (sql.includes('nextval')) return { rows: [{ n: '1042' }] };
      return { rows: [], rowCount: 1 };
    });
    await handleInbound(db, contact({ state: 'awaiting_mpesa' }), { id: 'm', body: 'this one' });
    const update = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE wa_contacts'));
    expect(update[1]).toContain('254712345678'); // mpesa = the WA number
    expect(update[1]).toContain('TC-1042');
    expect(pushToStaff).toHaveBeenCalledWith('wa_new_customer', expect.objectContaining({ customer_code: 'TC-1042' }));
    expect(sendToContact.mock.calls[0][2].text).toContain('TC-1042');
  });

  it('normalizes an 07xx-format M-Pesa number', async () => {
    const db = makeDb(async (sql) => {
      if (sql.includes('nextval')) return { rows: [{ n: '1043' }] };
      return { rows: [], rowCount: 1 };
    });
    await handleInbound(db, contact({ state: 'awaiting_mpesa' }), { id: 'm', body: '0712 345 678' });
    const update = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE wa_contacts'));
    expect(update[1]).toContain('254712345678');
  });
});

describe('tracking auto-reply', () => {
  it('replies with the order status for a known TRK code (any formatting)', async () => {
    const db = makeDb(async (sql) => {
      if (sql.includes('tracking_code')) {
        return { rows: [{
          id: 'o1', status: 'in_kenya', tracking_code: 'TRK-8821',
          paid_at: '2026-08-01', purchased_at: '2026-08-02', arrived_at: '2026-08-10',
          dispatched_at: null, delivered_at: null,
          delivery_fee_waived: false, delivery_fee_kes: null, customer_code: 'TC-1042',
        }] };
      }
      return { rows: [] };
    });
    await handleInbound(db, contact(), { id: 'm', body: 'status for trk 8821?' });
    const reply = sendToContact.mock.calls[0][2].text;
    expect(reply).toContain('TRK-8821');
    expect(reply).toMatch(/arrived in Kenya/i);
  });

  it('replies not-found for an unknown code', async () => {
    const db = makeDb(async () => ({ rows: [] }));
    await handleInbound(db, contact(), { id: 'm', body: 'TRK-999999' });
    expect(sendToContact.mock.calls[0][2].text).toMatch(/couldn't find/i);
  });

  // The reply used to be a bare list of dates. It's now a labelled block
  // with a progress bar and a what-happens-next line, and it has to stay
  // legible after sent.dm flattens newlines into " · " separators.
  function trackedOrder(over = {}) {
    return {
      id: 'o1', status: 'dispatched', tracking_code: 'TRK-8821', quote_kes: '17094',
      paid_at: '2026-08-01', purchased_at: '2026-08-02', arrived_at: '2026-08-10',
      dispatched_at: '2026-08-12', delivered_at: null,
      delivery_fee_waived: false, delivery_fee_kes: null, delivery_fee_paid_at: null,
      customer_code: 'TC-1042', ...over,
    };
  }
  const trackDb = (over) => makeDb(async (sql) =>
    (sql.includes('tracking_code') ? { rows: [trackedOrder(over)] } : { rows: [] }));

  it("answers with the parcel's current state, in plain words", async () => {
    await handleInbound(trackDb(), contact(), { id: 'm', body: 'TRK-8821' });
    const reply = sendToContact.mock.calls[0][2].text;
    expect(reply).toBe(
      'TRK-8821 — your parcel went out for delivery on 12 August. '
      + 'Our rider will call you when they arrive, usually within 24 hours.'
    );
    // Everything the earlier version padded it out with is gone.
    expect(reply).not.toMatch(/Progress:|Status:|Next:|KSh/);
  });

  it('words each stage for itself', async () => {
    const cases = [
      ['paid', /we received your payment on 1 August and we're buying your item now/],
      ['purchased', /purchased on 2 August and is on its way to our facility/],
      ['in_kenya', /arrived in Kenya on 10 August/],
      ['delivered', /delivered on 13 August\. Asante/],
      ['cancelled', /this order was cancelled/],
    ];
    for (const [status, expected] of cases) {
      sendToContact.mockClear();
      await handleInbound(trackDb({ status, delivered_at: '2026-08-13' }), contact(), { id: 'm', body: 'TRK-8821' });
      expect(sendToContact.mock.calls[0][2].text).toMatch(expected);
    }
  });

  it('spells out an outstanding delivery fee with the till', async () => {
    await handleInbound(
      trackDb({ status: 'delivery_fee_pending', dispatched_at: null, delivery_fee_kes: '300' }),
      contact(), { id: 'm', body: 'TRK-8821' });
    const reply = sendToContact.mock.calls[0][2].text;
    expect(reply).toMatch(/delivery fee of KSh 300/);
    expect(reply).toMatch(/Buy Goods, Till \d+/);
  });

  it('is a single line, so sent.dm has nothing to flatten', async () => {
    await handleInbound(trackDb(), contact(), { id: 'm', body: 'TRK-8821' });
    const reply = sendToContact.mock.calls[0][2].text;
    expect(reply).not.toContain('\n');
    expect(flattenForFreeText(reply)).toBe(reply);
  });
});

describe('quote confirmation', () => {
  const quotedOrder = { id: 'o1', quote_kes: '14500' };

  function confirmDb({ quotedRows }) {
    return makeDb(async (sql) => {
      if (sql.includes("status = 'quoted'") && sql.startsWith('SELECT')) {
        return { rows: quotedRows };
      }
      return { rows: [], rowCount: 1 };
    });
  }

  it.each(['yes', 'YES', 'sawa', 'ndio', 'ok', 'confirm', '1'])(
    'confirms the single quoted order on %j', async (word) => {
      const db = confirmDb({ quotedRows: [quotedOrder] });
      await handleInbound(db, contact(), { id: 'm', body: word });
      const update = db.query.mock.calls.find(([sql]) => sql.includes("SET status = 'confirmed'"));
      expect(update).toBeTruthy();
      expect(pushToStaff).toHaveBeenCalledWith('wa_pipeline_update', expect.objectContaining({ status: 'confirmed' }));
      expect(sendToContact.mock.calls[0][2].text).toMatch(/confirmed/i);
    }
  );

  it('opens the awaiting_review payment so there is something to approve', async () => {
    const db = confirmDb({ quotedRows: [quotedOrder] });
    await handleInbound(db, contact(), { id: 'm', body: 'yes' });
    const insert = db.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO payments') && sql.includes("'awaiting_review'"));
    expect(insert).toBeTruthy();
    expect(insert[1]).toEqual(expect.arrayContaining(['c1', 'o1', 14500]));
  });

  it('does nothing automated when several orders are quoted (ambiguous)', async () => {
    const db = confirmDb({ quotedRows: [quotedOrder, { id: 'o2', quote_kes: '9000' }] });
    await handleInbound(db, contact(), { id: 'm', body: 'yes' });
    expect(db.query.mock.calls.some(([sql]) => sql.includes("SET status = 'confirmed'"))).toBe(false);
    expect(sendToContact).not.toHaveBeenCalled();
  });

  it('does nothing on unrelated chatter', async () => {
    const db = makeDb(async () => ({ rows: [] }));
    await handleInbound(db, contact(), { id: 'm', body: 'how much for shipping shoes?' });
    expect(sendToContact).not.toHaveBeenCalled();
  });

  it('ignores blocked contacts entirely', async () => {
    const db = makeDb();
    await handleInbound(db, contact({ state: 'blocked' }), { id: 'm', body: 'yes' });
    expect(db.query).not.toHaveBeenCalled();
    expect(sendToContact).not.toHaveBeenCalled();
  });
});

// ── Gemini layer ─────────────────────────────────────────────────────────────
// waAi is module-mocked (hoisted); aiConfigured defaults to false so every
// pre-AI test above runs the deterministic paths unchanged.
vi.mock('../../utils/waAi.js', () => ({
  HANDOFF: 'HANDOFF',
  OFF_TOPIC: 'OFF_TOPIC',
  aiConfigured: vi.fn(() => false),
  chatReply: vi.fn(),
  onboardingTurn: vi.fn(),
  summarizeConversation: vi.fn(async () => 'note'),
}));

// chatReply/onboardingTurn return a tagged result so a sentinel can
// never be mistaken for a message. These wrap the three shapes.
const says = (text) => ({ kind: 'reply', text });
const HANDS_OFF = { kind: 'handoff', text: null };
const OFF_TOPIC_REPLY = { kind: 'off_topic', text: null };

describe('AI-first mode', () => {
  const aiSettings = {
    markup_pct: 10, promo_active: false, promo_type: 'waive_fee',
    promo_message: '', default_delivery_fee_kes: 300,
    welcome_media_urls: [], template_map: {},
    ai_enabled: true, ai_knowledge_base: 'Delivery takes 10-14 days.',
  };

  async function ai(settings = aiSettings) {
    const waAi = await import('../../utils/waAi.js');
    waAi.aiConfigured.mockReturnValue(true);
    getWaSettings.mockResolvedValue(settings);
    return waAi;
  }

  const emptyTurn = { kind: 'reply', reply: 'Karibu! What is your full name?', full_name: null, delivery_address: null, mpesa_number: null };

  it('the FIRST message goes to the AI, not the scripted welcome', async () => {
    const waAi = await ai();
    waAi.onboardingTurn.mockResolvedValueOnce(emptyTurn);
    const db = makeDb();
    await handleInbound(db, contact({ state: 'new', full_name: null, delivery_address: null, mpesa_number: null, customer_code: null }),
      { id: 'm1', body: 'Hi' });
    expect(waAi.onboardingTurn).toHaveBeenCalledTimes(1);
    expect(sendToContact.mock.calls[0][2].text).toMatch(/full name/i);
    // state bookkeeping still tracks the missing field
    const update = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE wa_contacts'));
    expect(update[1]).toContain('awaiting_name');
  });

  it('stores several fields from one message and asks for the rest', async () => {
    const waAi = await ai();
    waAi.onboardingTurn.mockResolvedValueOnce({
      kind: 'reply',
      reply: 'Asante John! Which M-Pesa number will you pay with?',
      full_name: 'John Kamau',
      delivery_address: 'Greenspan Estate, Donholm, Nairobi',
      mpesa_number: null,
    });
    const db = makeDb();
    await handleInbound(db, contact({ state: 'new', full_name: null, delivery_address: null, mpesa_number: null, customer_code: null }),
      { id: 'm1', body: 'Hi, I am John Kamau, Greenspan Estate Donholm Nairobi' });
    const update = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE wa_contacts'));
    expect(update[1]).toContain('awaiting_mpesa');
    expect(update[1]).toContain('John Kamau');
    expect(update[1]).toContain('Greenspan Estate, Donholm, Nairobi');
  });

  it('completes onboarding: validates the number, mints the code, alerts staff', async () => {
    const waAi = await ai();
    waAi.onboardingTurn.mockResolvedValueOnce({
      kind: 'reply',
      reply: 'Perfect!', full_name: null, delivery_address: null, mpesa_number: '0712 345 678',
    });
    const db = makeDb(async (sql) => {
      if (sql.includes('nextval')) return { rows: [{ n: '1042' }] };
      return { rows: [], rowCount: 1 };
    });
    await handleInbound(db, contact({
      state: 'awaiting_mpesa', full_name: 'John Kamau',
      delivery_address: 'Donholm', mpesa_number: null, customer_code: null,
    }), { id: 'm1', body: 'use 0712 345 678' });
    const update = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE wa_contacts'));
    expect(update[1]).toContain('254712345678'); // normalized by the hard gate
    expect(update[1]).toContain('TC-1042');
    expect(pushToStaff).toHaveBeenCalledWith('wa_new_customer', expect.objectContaining({ customer_code: 'TC-1042' }));
    // completion announcement went out after the AI reply
    const texts = sendToContact.mock.calls.map(([, , o]) => o.text || '');
    expect(texts.some((t) => t.includes('TC-1042'))).toBe(true);
  });

  it('an invalid AI-extracted M-Pesa number is NOT stored (hard gate)', async () => {
    const waAi = await ai();
    waAi.onboardingTurn.mockResolvedValueOnce({
      kind: 'reply',
      reply: 'Got it!', full_name: null, delivery_address: null, mpesa_number: '12345',
    });
    const db = makeDb();
    await handleInbound(db, contact({
      state: 'awaiting_mpesa', full_name: 'John', delivery_address: 'Donholm',
      mpesa_number: null, customer_code: null,
    }), { id: 'm1', body: 'one two three' });
    expect(db.query.mock.calls.some(([sql]) => sql.includes('mpesa_number'))).toBe(false);
    expect(pushToStaff).not.toHaveBeenCalledWith('wa_new_customer', expect.anything());
  });

  it('redirects and re-asks when an off-topic question interrupts signup', async () => {
    // Regression: the sentinel used to be stripped to null and the
    // customer got total silence mid-signup.
    const waAi = await ai();
    waAi.onboardingTurn.mockResolvedValueOnce({
      kind: 'off_topic', reply: null, full_name: null, delivery_address: null, mpesa_number: null,
    });
    const db = makeDb();
    await handleInbound(db, contact({
      state: 'awaiting_name', full_name: null, delivery_address: null,
      mpesa_number: null, customer_code: null,
    }), { id: 'm1', body: 'what is the capital of France?' });

    const reply = sendToContact.mock.calls[0][2].text;
    expect(reply).toMatch(/only help with Thapsus Cargo/i);
    // ...and it still moves signup along
    expect(reply).toMatch(/full name/i);
    expect(notifyStaff).not.toHaveBeenCalled();
  });

  it('hands a mid-signup complaint to a human instead of going quiet', async () => {
    const waAi = await ai();
    waAi.onboardingTurn.mockResolvedValueOnce({
      kind: 'handoff', reply: null, full_name: null, delivery_address: null, mpesa_number: null,
    });
    const db = makeDb();
    await handleInbound(db, contact({
      state: 'awaiting_address', full_name: 'John', delivery_address: null,
      mpesa_number: null, customer_code: null,
    }), { id: 'm1', body: 'your driver was rude to my sister last week' });

    expect(sendToContact.mock.calls[0][2].text).toMatch(/team will reply/i);
    expect(db.query.mock.calls.some(([sql]) => sql.includes('human_takeover_at = NOW()'))).toBe(true);
    expect(notifyStaff).toHaveBeenCalledWith(db, expect.objectContaining({
      title: expect.stringMatching(/needs a human/i),
    }));
  });

  it('falls back to the scripted welcome when the AI throws', async () => {
    const waAi = await ai();
    waAi.onboardingTurn.mockRejectedValueOnce(new Error('Gemini HTTP 500'));
    const db = makeDb();
    await handleInbound(db, contact({ state: 'new', full_name: null, customer_code: null }), { id: 'm1', body: 'Hi' });
    // scripted welcome ran instead
    const update = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE wa_contacts'));
    expect(update[1]).toContain('awaiting_name');
    expect(sendToContact.mock.calls.some(([, , o]) => /Karibu Thapsus Cargo/.test(o.text || ''))).toBe(true);
  });

  it('answers a fall-through question for an active contact', async () => {
    const waAi = await ai();
    waAi.chatReply.mockResolvedValueOnce(says('Delivery usually takes 10-14 days. Asante!'));
    const db = makeDb(async (sql) => {
      if (sql.includes('FROM wa_messages')) return { rows: [{ direction: 'in', body: 'Hi' }] };
      return { rows: [] };
    });
    await handleInbound(db, contact(), { id: 'm1', body: 'How long does delivery take?' });
    expect(sendToContact).toHaveBeenCalledTimes(1);
    expect(sendToContact.mock.calls[0][2].text).toMatch(/10-14 days/);
  });

  it('acknowledges the customer on HANDOFF instead of going silent', async () => {
    const waAi = await ai();
    waAi.chatReply.mockResolvedValueOnce(HANDS_OFF);
    const db = makeDb(async () => ({ rows: [] }));
    await handleInbound(db, contact(), { id: 'm1', body: 'I want to complain' });
    expect(sendToContact.mock.calls[0][2].text).toMatch(/team will reply/i);
  });

  it('stays silent when the AI errors (inbox keeps the message)', async () => {
    const waAi = await ai();
    waAi.chatReply.mockRejectedValueOnce(new Error('Gemini HTTP 500'));
    await handleInbound(makeDb(async () => ({ rows: [] })), contact(), { id: 'm2', body: 'random question' });
    expect(sendToContact).not.toHaveBeenCalled();
  });

  it('tracking codes still bypass the AI entirely', async () => {
    const waAi = await ai();
    const db = makeDb(async (sql) => {
      if (sql.includes('tracking_code')) {
        return { rows: [{ id: 'o1', status: 'paid', tracking_code: 'TRK-8821',
          paid_at: '2026-08-01', purchased_at: null, arrived_at: null,
          dispatched_at: null, delivered_at: null,
          delivery_fee_waived: false, delivery_fee_kes: null, customer_code: 'TC-1042' }] };
      }
      return { rows: [] };
    });
    await handleInbound(db, contact(), { id: 'm1', body: 'TRK-8821' });
    expect(waAi.chatReply).not.toHaveBeenCalled();
    expect(sendToContact.mock.calls[0][2].text).toContain('TRK-8821');
  });
});

describe('AI order awareness', () => {
  async function ai() {
    const waAi = await import('../../utils/waAi.js');
    waAi.aiConfigured.mockReturnValue(true);
    getWaSettings.mockResolvedValue({
      markup_pct: 10, promo_active: false, promo_type: 'waive_fee',
      promo_message: '', default_delivery_fee_kes: 300,
      welcome_media_urls: [], template_map: {},
      ai_enabled: true, ai_knowledge_base: 'Delivery takes 10-14 days.',
    });
    return waAi;
  }

  const orderRows = [{
    tracking_code: 'TRK-8821', status: 'dispatched', quote_kes: '17094',
    delivery_fee_kes: 300, delivery_fee_waived: false, delivery_fee_paid_at: '2026-08-11',
    paid_at: '2026-08-01', purchased_at: '2026-08-02', arrived_at: '2026-08-10',
    dispatched_at: '2026-08-11', delivered_at: null, created_at: '2026-08-01',
  }];

  function dbWithOrders(rows = orderRows) {
    return makeDb(async (sql) => {
      if (sql.includes('FROM wa_orders')) return { rows };
      if (sql.includes('FROM wa_messages')) return { rows: [] };
      return { rows: [] };
    });
  }

  it('passes the live order summary to the AI for a vague "where is my parcel?"', async () => {
    const waAi = await ai();
    waAi.chatReply.mockResolvedValueOnce(says('Your parcel TRK-8821 is out for delivery!'));
    await handleInbound(dbWithOrders(), contact(), { id: 'm1', body: 'where is my parcel?' });

    const ctx = waAi.chatReply.mock.calls[0][0].orderContext;
    expect(ctx).toContain('TRK-8821');
    expect(ctx).toContain('Out for delivery');
    expect(ctx).toContain('17,094');
    expect(ctx).toMatch(/paid 1 Aug/);
    expect(sendToContact.mock.calls[0][2].text).toContain('TRK-8821');
  });

  it('flags an outstanding delivery fee in the context', async () => {
    const waAi = await ai();
    waAi.chatReply.mockResolvedValueOnce(says('reply'));
    await handleInbound(dbWithOrders([{
      ...orderRows[0], status: 'delivery_fee_pending',
      dispatched_at: null, delivery_fee_paid_at: null,
    }]), contact(), { id: 'm1', body: 'any update?' });
    expect(waAi.chatReply.mock.calls[0][0].orderContext).toContain('delivery fee outstanding: KSh 300');
  });

  it('reports no orders on file when the customer has none', async () => {
    const waAi = await ai();
    waAi.chatReply.mockResolvedValueOnce(says('reply'));
    await handleInbound(dbWithOrders([]), contact(), { id: 'm1', body: 'hello' });
    expect(waAi.chatReply.mock.calls[0][0].orderContext).toBe('(none on file)');
  });

  it('still prefers the deterministic lookup for an exact TRK code', async () => {
    const waAi = await ai();
    const db = makeDb(async (sql) => {
      if (sql.includes('tracking_code = $1')) return { rows: [{
        id: 'o1', status: 'dispatched', tracking_code: 'TRK-8821',
        paid_at: '2026-08-01', purchased_at: null, arrived_at: null,
        dispatched_at: '2026-08-11', delivered_at: null,
        delivery_fee_waived: false, delivery_fee_kes: null, customer_code: 'TC-1042',
      }] };
      return { rows: [] };
    });
    await handleInbound(db, contact(), { id: 'm1', body: 'TRK-8821' });
    expect(waAi.chatReply).not.toHaveBeenCalled();
    expect(sendToContact.mock.calls[0][2].text).toContain('TRK-8821');
  });
});

describe('staff WhatsApp alerts', () => {
  async function ai() {
    const waAi = await import('../../utils/waAi.js');
    waAi.aiConfigured.mockReturnValue(true);
    getWaSettings.mockResolvedValue({
      markup_pct: 10, promo_active: false, promo_type: 'waive_fee',
      promo_message: '', default_delivery_fee_kes: 300,
      welcome_media_urls: [], template_map: {},
      ai_enabled: true, ai_knowledge_base: 'kb',
    });
    return waAi;
  }

  it('alerts staff when a customer says they have paid, with the M-Pesa ref', async () => {
    const waAi = await ai();
    const db = makeDb(async () => ({ rows: [] }));
    await handleInbound(db, contact(), { id: 'm1', body: 'I have paid, SHL9XK2QRT confirmed Ksh 17,094' });
    expect(notifyStaff).toHaveBeenCalledWith(db, expect.objectContaining({
      title: expect.stringMatching(/payment claimed/i),
      detail: expect.stringContaining('SHL9XK2QRT'),
    }));
    // The customer hears that it's being checked — never the handoff line,
    // which reads like nobody can see their money.
    expect(sendToContact.mock.calls[0][2].text).toMatch(/verifying it with M-Pesa/i);
    expect(sendToContact.mock.calls[0][2].text).toContain('SHL9XK2QRT');
    expect(sendToContact.mock.calls[0][2].text).not.toMatch(/colleague/i);
    expect(waAi.chatReply).not.toHaveBeenCalled();
  });

  it('stamps the M-Pesa ref on the open payment so the operator can match it', async () => {
    await ai();
    const db = makeDb(async (sql) => {
      if (sql.includes('wa_contact_id = $1') && sql.includes('payments')) {
        return { rows: [{ id: 'PAY-1', amount_due_kes: '17094' }] };
      }
      return { rows: [], rowCount: 1 };
    });
    await handleInbound(db, contact(), { id: 'm1', body: 'I have paid, SHL9XK2QRT confirmed Ksh 17,094' });
    const stamp = db.query.mock.calls.find(([sql]) => sql.includes('SET mpesa_reference'));
    expect(stamp[1]).toEqual(['PAY-1', 'SHL9XK2QRT']);
    expect(sendToContact.mock.calls[0][2].text).toMatch(/KSh 17,094/);
  });

  it('only reassures once per burst of payment messages', async () => {
    await ai();
    const db = makeDb(async (sql) => {
      if (sql.includes("direction = 'out'")) return { rows: [{ '?column?': 1 }] };
      return { rows: [] };
    });
    await handleInbound(db, contact(), { id: 'm1', body: 'I have paid' });
    expect(sendToContact).not.toHaveBeenCalled();
    expect(notifyStaff).toHaveBeenCalled(); // staff still get paged
  });

  it.each(['nimelipa', 'I paid already', 'nimetuma the money'])(
    'recognises "%s" as a payment claim', async (msg) => {
      await ai();
      await handleInbound(makeDb(async () => ({ rows: [] })), contact(), { id: 'm1', body: msg });
      expect(notifyStaff).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        title: expect.stringMatching(/payment claimed/i),
      }));
    }
  );

  it.each(['I sent the link', 'can I pay with Lipa na M-Pesa?'])(
    'does not read "%s" as a payment claim', async (msg) => {
      const waAi = await ai();
      waAi.chatReply.mockResolvedValueOnce(says('Sure — here is how.'));
      await handleInbound(makeDb(async () => ({ rows: [] })), contact(), { id: 'm1', body: msg });
      expect(notifyStaff).not.toHaveBeenCalled();
      expect(waAi.chatReply).toHaveBeenCalled();
    }
  );

  it('alerts staff when the AI hands off (customer wants a human)', async () => {
    const waAi = await ai();
    waAi.chatReply.mockResolvedValueOnce(HANDS_OFF);
    await handleInbound(makeDb(async () => ({ rows: [] })), contact(),
      { id: 'm1', body: 'Can I speak to a customer rep?' });
    expect(notifyStaff).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      title: expect.stringMatching(/needs a human/i),
      detail: expect.stringContaining('customer rep'),
    }));
    // and the customer is told a person is coming
    expect(sendToContact.mock.calls[0][2].text).toMatch(/team will reply/i);
  });

  it('redirects an off-topic message without paging anyone', async () => {
    const waAi = await ai();
    waAi.chatReply.mockResolvedValueOnce(OFF_TOPIC_REPLY);
    const db = makeDb(async () => ({ rows: [] }));
    await handleInbound(db, contact(), { id: 'm1', body: 'who won the match last night?' });

    const reply = sendToContact.mock.calls[0][2].text;
    expect(reply).toMatch(/only help with Thapsus Cargo/i);
    expect(reply).toMatch(/product link/i);
    // The three things that separate this from a handoff.
    expect(notifyStaff).not.toHaveBeenCalled();
    expect(db.query.mock.calls.some(([sql]) => sql.includes('human_takeover_at = NOW()'))).toBe(false);
  });

  it('only redirects once an hour, however chatty the wrong number is', async () => {
    const waAi = await ai();
    waAi.chatReply.mockResolvedValueOnce(OFF_TOPIC_REPLY);
    const db = makeDb(async (sql) =>
      (sql.includes("direction = 'out'") ? { rows: [{ '?column?': 1 }] } : { rows: [] }));
    await handleInbound(db, contact(), { id: 'm1', body: 'tell me a joke' });
    expect(sendToContact).not.toHaveBeenCalled();
    expect(notifyStaff).not.toHaveBeenCalled();
  });

  it('does not alert on an ordinary answered question', async () => {
    const waAi = await ai();
    waAi.chatReply.mockResolvedValueOnce(says('We deliver in 10-14 days.'));
    await handleInbound(makeDb(async () => ({ rows: [] })), contact(), { id: 'm1', body: 'how long is delivery?' });
    expect(notifyStaff).not.toHaveBeenCalled();
  });

  it('alerts staff and gives till instructions when a quote is confirmed', async () => {
    process.env.MPESA_TILL_NUMBER = '5530500';
    const db = makeDb(async (sql) => {
      if (sql.includes("status = 'quoted'") && sql.startsWith('SELECT')) {
        return { rows: [{ id: 'o1', quote_kes: '17094' }] };
      }
      return { rows: [], rowCount: 1 };
    });
    await handleInbound(db, contact(), { id: 'm1', body: 'yes' });
    expect(notifyStaff).toHaveBeenCalledWith(db, expect.objectContaining({
      title: expect.stringMatching(/order confirmed/i),
    }));
    const text = sendToContact.mock.calls[0][2].text;
    expect(text).toContain('5530500');
    expect(text).not.toMatch(/enter your PIN/i);   // STK language is gone
  });
});

describe('human takeover and AI memory', () => {
  async function ai(extra = {}) {
    const waAi = await import('../../utils/waAi.js');
    waAi.aiConfigured.mockReturnValue(true);
    getWaSettings.mockResolvedValue({
      markup_pct: 10, promo_active: false, promo_type: 'waive_fee',
      promo_message: '', default_delivery_fee_kes: 300,
      welcome_media_urls: [], template_map: {},
      ai_enabled: true, ai_knowledge_base: 'kb', ai_resume_after_minutes: 120,
      ...extra,
    });
    return waAi;
  }

  // db where the previous message was `minutesAgo` old
  function dbSince(minutesAgo) {
    return makeDb(async (sql) => {
      if (sql.includes('MAX(created_at)')) {
        return { rows: [{ at: new Date(Date.now() - minutesAgo * 60_000).toISOString() }] };
      }
      if (sql.includes('count(*)')) return { rows: [{ n: 0 }] };
      return { rows: [] };
    });
  }

  it('tells the customer a human is coming, hands over, and alerts staff', async () => {
    const waAi = await ai();
    waAi.chatReply.mockResolvedValueOnce(HANDS_OFF);
    const db = makeDb(async (sql) => {
      if (sql.includes('count(*)')) return { rows: [{ n: 0 }] };
      return { rows: [] };
    });
    await handleInbound(db, contact(), { id: 'm1', body: 'Can I speak to a customer rep?' });

    // customer is acknowledged, not left in silence
    expect(sendToContact.mock.calls[0][2].text).toMatch(/team will reply/i);
    // thread handed to the humans
    expect(db.query.mock.calls.some(([sql]) => sql.includes('human_takeover_at = NOW()'))).toBe(true);
    expect(notifyStaff).toHaveBeenCalledWith(db, expect.objectContaining({
      title: expect.stringMatching(/needs a human/i),
    }));
  });

  it('stays quiet mid-signup too while a human has the chat', async () => {
    // The takeover check used to sit after the onboarding branch, so a
    // handed-over signup kept getting questionnaire messages.
    const waAi = await ai();
    const db = dbSince(30);
    await handleInbound(db, contact({
      state: 'awaiting_address', human_takeover_at: new Date().toISOString(),
      full_name: 'John', delivery_address: null, customer_code: null,
    }), { id: 'm1', body: 'Donholm, Nairobi' });
    expect(waAi.onboardingTurn).not.toHaveBeenCalled();
    expect(sendToContact).not.toHaveBeenCalled();
  });

  it('stays quiet while a human has the chat (within the resume window)', async () => {
    const waAi = await ai();
    const db = dbSince(30); // last message 30 min ago, window is 120
    await handleInbound(db, contact({ human_takeover_at: new Date().toISOString() }),
      { id: 'm1', body: 'any update?' });
    expect(waAi.chatReply).not.toHaveBeenCalled();
    expect(sendToContact).not.toHaveBeenCalled();
  });

  it('resumes automatically after the quiet period', async () => {
    const waAi = await ai();
    waAi.chatReply.mockResolvedValueOnce(says('Karibu back! How can I help?'));
    const db = dbSince(180); // 3h of silence, window is 120 min
    await handleInbound(db, contact({ human_takeover_at: new Date(Date.now() - 3 * 3600_000).toISOString() }),
      { id: 'm1', body: 'hello again' });
    expect(db.query.mock.calls.some(([sql]) => sql.includes('human_takeover_at = NULL'))).toBe(true);
    expect(waAi.chatReply).toHaveBeenCalled();
    expect(sendToContact.mock.calls[0][2].text).toMatch(/karibu back/i);
  });

  it('honours a custom resume window', async () => {
    const waAi = await ai({ ai_resume_after_minutes: 15 });
    waAi.chatReply.mockResolvedValueOnce(says('back'));
    const db = dbSince(20); // 20 min silence vs a 15 min window
    await handleInbound(db, contact({ human_takeover_at: new Date().toISOString() }),
      { id: 'm1', body: 'hi' });
    expect(waAi.chatReply).toHaveBeenCalled();
  });

  it('deterministic replies still work while a human has the chat', async () => {
    const waAi = await ai();
    const db = makeDb(async (sql) => {
      if (sql.includes('MAX(created_at)')) return { rows: [{ at: new Date().toISOString() }] };
      if (sql.includes('tracking_code = $1')) return { rows: [{
        id: 'o1', status: 'dispatched', tracking_code: 'TRK-8821',
        paid_at: '2026-08-01', purchased_at: null, arrived_at: null,
        dispatched_at: '2026-08-11', delivered_at: null,
        delivery_fee_waived: false, delivery_fee_kes: null, customer_code: 'TC-1042',
      }] };
      return { rows: [] };
    });
    await handleInbound(db, contact({ human_takeover_at: new Date().toISOString() }),
      { id: 'm1', body: 'TRK-8821' });
    expect(sendToContact.mock.calls[0][2].text).toContain('TRK-8821');
    expect(waAi.chatReply).not.toHaveBeenCalled();
  });

  it('passes the stored memory note and customer profile into the prompt', async () => {
    const waAi = await ai();
    waAi.chatReply.mockResolvedValueOnce(says('sure'));
    const db = makeDb(async (sql) => {
      if (sql.includes('count(*)')) return { rows: [{ n: 0 }] };
      return { rows: [] };
    });
    await handleInbound(db, contact({
      ai_summary: 'Prefers Pickup Mtaani. Buys trainers, size 42.',
      delivery_address: 'C1 Muraya Road, Ongata Rongai',
      created_at: '2026-06-01T00:00:00Z',
    }), { id: 'm1', body: 'what did I order last time?' });

    const args = waAi.chatReply.mock.calls[0][0];
    expect(args.summary).toMatch(/Pickup Mtaani/);
    expect(args.profile).toContain('TC-1042');
    expect(args.profile).toContain('Muraya Road');
  });

  it('refreshes the memory note once enough new messages have accumulated', async () => {
    const waAi = await ai();
    waAi.chatReply.mockResolvedValueOnce(says('ok'));
    waAi.summarizeConversation.mockResolvedValueOnce('Wants shoes. Prefers Rongai delivery.');
    const db = makeDb(async (sql) => {
      if (sql.includes('count(*)')) return { rows: [{ n: 25 }] };  // over the threshold
      return { rows: [] };
    });
    await handleInbound(db, contact(), { id: 'm1', body: 'hi' });
    await new Promise((r) => setTimeout(r, 10)); // background refresh
    expect(waAi.summarizeConversation).toHaveBeenCalled();
    expect(db.query.mock.calls.some(([sql]) => sql.includes('SET ai_summary'))).toBe(true);
  });
});
