import { describe, it, expect } from 'vitest';
import { extractInboundMedia } from '../../utils/sentdm.js';

// Byrone sent an M-Pesa screenshot and the operator got a blank bubble:
// the ingest INSERT never named media_url, so the attachment was dropped
// on the floor. sent.dm's inbound shape is not documented, so this tries
// the plausible keys rather than betting on one — same reasoning as
// extractError, which was bitten by exactly this guesswork before.
describe('extractInboundMedia', () => {
  const cases = [
    ['media_url on the body', { message_body: { media_url: 'https://cdn.sent.dm/a.jpg' } }],
    ['camelCase', { message_body: { mediaUrl: 'https://cdn.sent.dm/a.jpg' } }],
    ['a bare url key', { message_body: { url: 'https://cdn.sent.dm/a.jpg' } }],
    ['a typed image object', { message_body: { image: { url: 'https://cdn.sent.dm/a.jpg' } } }],
    ['an attachments array', { message_body: { attachments: [{ url: 'https://cdn.sent.dm/a.jpg' }] } }],
    ['top level on the message', { media_url: 'https://cdn.sent.dm/a.jpg' }],
  ];
  it.each(cases)('finds the URL when it arrives as %s', (_label, msg) => {
    expect(extractInboundMedia(msg)?.url).toBe('https://cdn.sent.dm/a.jpg');
  });

  it('classifies by declared type first, then by extension', () => {
    expect(extractInboundMedia({ message_body: { type: 'IMAGE', url: 'https://x/y' } }).type).toBe('image');
    expect(extractInboundMedia({ message_body: { url: 'https://x/receipt.pdf' } }).type).toBe('document');
    expect(extractInboundMedia({ message_body: { url: 'https://x/clip.mp4' } }).type).toBe('video');
    expect(extractInboundMedia({ message_body: { url: 'https://x/note.ogg' } }).type).toBe('audio');
  });

  it('ignores the query string when guessing from the extension', () => {
    expect(extractInboundMedia({ message_body: { url: 'https://x/a.jpg?sig=abc.pdf' } }).type).toBe('image');
  });

  it('falls back to document rather than guessing wrong', () => {
    expect(extractInboundMedia({ message_body: { url: 'https://x/blob' } }).type).toBe('document');
  });

  it('returns null for a text message, so the caller can log the shape', () => {
    expect(extractInboundMedia({ message_body: { content: 'Hello' } })).toBeNull();
    expect(extractInboundMedia({})).toBeNull();
    expect(extractInboundMedia(null)).toBeNull();
    // A relative or non-http value is not a link we can open.
    expect(extractInboundMedia({ message_body: { url: '/local/a.jpg' } })).toBeNull();
  });
});
