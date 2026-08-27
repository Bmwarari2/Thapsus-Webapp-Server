// The 24-hour-window decision in sendToContact: free text is the richer
// copy (the quote breakdown, the till number) and wins whenever WhatsApp
// will deliver it; the approved template is what can land once the
// window is shut. Before this check a mapped template ALWAYS won — a
// customer who said YES seconds earlier was sent Payment_Reminder, which
// has no till number in it, instead of the composed instructions.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/sentdm.js', () => ({
  sendText: vi.fn(async () => ({ messageId: 'pm-text' })),
  sendTemplate: vi.fn(async () => ({ messageId: 'pm-tpl' })),
  sentDmConfigured: vi.fn(() => true),
  SentDmError: class SentDmError extends Error {},
}));
vi.mock('../../utils/waSettings.js', () => ({
  getWaSettings: vi.fn(async () => ({
    template_map: { payment_prompt: 'Payment_Reminder', welcome_media: 'tc_welcome_media' },
  })),
}));
vi.mock('../../routes/events.js', () => ({ pushToStaff: vi.fn() }));

import { sendToContact, sessionWindowOpen } from '../../utils/waSend.js';
import { sendText, sendTemplate } from '../../utils/sentdm.js';

const CONTACT = { id: 'c1', phone: '254712345678' };

function makeDb({ windowOpen }) {
  return {
    query: vi.fn(async (sql) => {
      if (sql.includes("direction = 'in'") && sql.includes('24 hours')) {
        return { rows: windowOpen ? [{ '?column?': 1 }] : [] };
      }
      return { rows: [], rowCount: 1 };
    }),
  };
}

const PROMPT = {
  templateKey: 'payment_prompt',
  templateParams: { full_name: 'Jane', order_ref: 'TRK-8821', total_kes: '17,094' },
  text: 'To pay: Lipa na M-Pesa, Buy Goods, Till *5530500*, KSh 17,094.',
};

beforeEach(() => vi.clearAllMocks());

describe('sendToContact — window-aware template fallback', () => {
  it('sends the rich free text while the window is open, even with a mapped template', async () => {
    const db = makeDb({ windowOpen: true });
    const res = await sendToContact(db, CONTACT, PROMPT);
    expect(res.ok).toBe(true);
    expect(sendText).toHaveBeenCalled();
    expect(sendTemplate).not.toHaveBeenCalled();
    const insert = db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO wa_messages'));
    expect(insert[1][2]).toContain('5530500');       // body = what was sent
    expect(insert[1][5]).toBeNull();                 // template_key not recorded
  });

  it('falls back to the approved template when the window is shut, and the transcript stores its rendered body', async () => {
    const db = makeDb({ windowOpen: false });
    await sendToContact(db, CONTACT, PROMPT);
    expect(sendTemplate).toHaveBeenCalledWith(CONTACT.phone, 'Payment_Reminder',
      expect.objectContaining({ var_1: 'Jane', var_3: '17,094' }), expect.anything());
    expect(sendText).not.toHaveBeenCalled();
    const insert = db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO wa_messages'));
    // The customer received the template body — that is what the inbox must show.
    expect(insert[1][2]).toMatch(/still awaiting payment/i);
    expect(insert[1][2]).not.toContain('5530500');
    expect(insert[1][5]).toBe('payment_prompt');
  });

  it('keeps the template for media sends even in-window (media only rides on templates)', async () => {
    const db = makeDb({ windowOpen: true });
    await sendToContact(db, CONTACT, {
      templateKey: 'welcome_media',
      mediaUrl: 'https://cdn.example.com/how.png',
      mediaType: 'image',
    });
    expect(sendTemplate).toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  it('a failed window check keeps the template (fails closed to the copy that can deliver)', async () => {
    const db = {
      query: vi.fn(async (sql) => {
        if (sql.includes("direction = 'in'")) throw new Error('db down');
        return { rows: [], rowCount: 1 };
      }),
    };
    await sendToContact(db, CONTACT, PROMPT);
    expect(sendTemplate).toHaveBeenCalled();
  });
});

describe('sessionWindowOpen', () => {
  it('is true only when an inbound message exists in the last 24 hours', async () => {
    expect(await sessionWindowOpen(makeDb({ windowOpen: true }), 'c1')).toBe(true);
    expect(await sessionWindowOpen(makeDb({ windowOpen: false }), 'c1')).toBe(false);
  });
});
