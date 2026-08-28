// Brian Mwarari, 28 August, 21:50–21:55.
//
// He gave his name, was asked "delivered to an address, or collect from
// our CBD office?", and answered "CBD collection". Nothing happened: no
// customer code, no confirmation, and the assistant kept the signup open
// for a street address a collector was never going to have. The code
// arrived four minutes and one quote later, when he mentioned Hurlingham.
//
// Collection IS the answer to where the parcel goes — it comes to our
// counter — so a name plus a collection choice is a finished signup.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/waSend.js', () => ({
  sendToContact: vi.fn(async () => ({ ok: true, id: 'msg-1' })),
}));
vi.mock('../../routes/events.js', () => ({
  pushToStaff: vi.fn(), pushToUser: vi.fn(), pushToAdmins: vi.fn(),
}));
vi.mock('../../utils/waStaffAlert.js', () => ({ notifyStaff: vi.fn(async () => {}) }));
vi.mock('../../utils/waSettings.js', () => ({
  getWaSettings: vi.fn(async () => ({
    ai_enabled: true, ai_knowledge_base: 'kb', markup_pct: 10,
    default_delivery_fee_kes: 300, welcome_media_urls: [], template_map: {},
  })),
}));
vi.mock('../../utils/waAi.js', () => ({
  aiConfigured: () => true,
  onboardingTurn: vi.fn(),
  chatReply: vi.fn(),
  renderFacts: vi.fn(() => ''),
  summarizeConversation: vi.fn(async () => null),
}));

import { handleInbound } from '../../utils/waStateMachine.js';
import { onboardingTurn } from '../../utils/waAi.js';
import { sendToContact } from '../../utils/waSend.js';
import { pushToStaff } from '../../routes/events.js';

function makeDb() {
  return {
    query: vi.fn(async (sql) => {
      if (sql.includes('nextval')) return { rows: [{ n: '1064' }] };
      return { rows: [], rowCount: 1 };
    }),
  };
}

const collector = {
  id: 'c1', phone: '447346813917', state: 'awaiting_address',
  full_name: 'Brian Mwarari', customer_code: null,
  delivery_address: null, delivery_preference: null,
};

beforeEach(() => vi.clearAllMocks());

describe('a customer who chooses collection', () => {
  it('is registered and given a customer code, with no address', async () => {
    onboardingTurn.mockResolvedValue({
      kind: 'reply',
      reply: "Perfect, we'll have it ready for you to collect.",
      full_name: null, delivery_address: null, delivery_preference: 'collection',
    });
    const db = makeDb();
    await handleInbound(db, collector, { id: 'm', body: 'CBD collection' });

    const update = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE wa_contacts'));
    expect(update[1]).toContain('active');
    expect(update[1]).toContain('TC-1064');
    expect(pushToStaff).toHaveBeenCalledWith('wa_new_customer', expect.objectContaining({
      customer_code: 'TC-1064',
    }));
    const said = sendToContact.mock.calls.map(([, , o]) => o.text || '').join(' ');
    expect(said).toMatch(/TC-1064/);
    // Confirm the choice back: it is the half of the quote they can check
    // without knowing our fees.
    expect(said).toMatch(/no delivery fee/i);
  });

  it('still waits for a name before issuing a code', async () => {
    onboardingTurn.mockResolvedValue({
      kind: 'reply', reply: 'And your full name?',
      full_name: null, delivery_address: null, delivery_preference: 'collection',
    });
    const db = makeDb();
    await handleInbound(db, { ...collector, full_name: null, state: 'awaiting_name' },
      { id: 'm', body: "I'll collect" });

    const update = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE wa_contacts'));
    expect(update[1]).toContain('awaiting_name');
    expect(db.query.mock.calls.some(([sql]) => sql.includes('nextval'))).toBe(false);
  });

  it('still needs a destination from somebody who has said neither', async () => {
    onboardingTurn.mockResolvedValue({
      kind: 'reply', reply: 'Where should it go?',
      full_name: null, delivery_address: null, delivery_preference: null,
    });
    const db = makeDb();
    await handleInbound(db, collector, { id: 'm', body: 'Hi' });
    expect(db.query.mock.calls.some(([sql]) => sql.includes('nextval'))).toBe(false);
  });

  it('passes the stored preference to the model, so it stops re-asking', async () => {
    onboardingTurn.mockResolvedValue({
      kind: 'reply', reply: 'All set.',
      full_name: null, delivery_address: null, delivery_preference: null,
    });
    await handleInbound(makeDb(), { ...collector, delivery_preference: 'collection' },
      { id: 'm', body: 'Thanks' });
    expect(onboardingTurn.mock.calls[0][0].profile).toEqual(expect.objectContaining({
      delivery_preference: 'collection',
    }));
  });
});
