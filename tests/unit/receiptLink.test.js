import { describe, it, expect, beforeAll } from 'vitest';

// The module reads JWT_SECRET at import time.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-receipt-links';

let mod;
beforeAll(async () => { mod = await import('../../utils/receiptLink.js'); });

const order = { id: '66a03f6d-56a0-475f-8322-bc7418f1abb1', tracking_code: 'TRK-8821' };

describe('receipt short links', () => {
  it('builds a short, tappable URL', () => {
    const url = mod.receiptShortUrl(order);
    expect(url).toMatch(/^https?:\/\/[^/]+\/r\/TRK-8821\.[A-Za-z0-9_-]{12}$/);
    // The whole point: nothing like the ~600-char Supabase signed URL.
    expect(url.length).toBeLessThan(80);
  });

  it('is stable, so a resend produces the same link', () => {
    expect(mod.receiptShortUrl(order)).toBe(mod.receiptShortUrl(order));
  });

  it('has no link until the order has a tracking code', () => {
    expect(mod.receiptShortUrl({ id: order.id, tracking_code: null })).toBeNull();
  });

  it('exposes the bare token the approved template needs', () => {
    // The template body writes the domain — "…ready at thapsus.uk/r/{{2}}"
    // — so the variable must be the token alone. Meta will not approve a
    // body ending in a variable, which a full URL would have forced.
    const token = mod.receiptToken(order);
    expect(token).toMatch(/^TRK-8821\.[A-Za-z0-9_-]{12}$/);
    expect(token).not.toMatch(/^https?:\/\//);
    expect(mod.receiptShortUrl(order).endsWith(`/r/${token}`)).toBe(true);
    expect(mod.receiptToken({ id: order.id, tracking_code: null })).toBeNull();
  });

  it('round-trips through parse + verify', () => {
    const token = mod.receiptShortUrl(order).split('/r/')[1];
    const parsed = mod.parseReceiptToken(token);
    expect(parsed.trackingCode).toBe('TRK-8821');
    expect(mod.verifyReceiptToken(order.id, parsed.signature)).toBe(true);
  });

  it('rejects a signature minted for a different order', () => {
    const parsed = mod.parseReceiptToken(mod.receiptShortUrl(order).split('/r/')[1]);
    expect(mod.verifyReceiptToken('11111111-2222-3333-4444-555555555555', parsed.signature)).toBe(false);
  });

  it.each(['', 'TRK-8821', 'TRK-8821.', '.abcdefgh', '../../etc/passwd', 'TRK 8821.abcdefgh'])(
    'refuses the malformed token %j', (t) => {
      expect(mod.parseReceiptToken(t)).toBeNull();
    }
  );

  it('drops the www. host that Railway does not serve', () => {
    const before = process.env.SITE_URL;
    process.env.SITE_URL = 'https://www.thapsus.uk/';
    expect(mod.publicBaseUrl()).toBe('https://thapsus.uk');
    if (before === undefined) delete process.env.SITE_URL; else process.env.SITE_URL = before;
  });
});
