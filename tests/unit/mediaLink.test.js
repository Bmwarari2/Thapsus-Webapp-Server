import { describe, it, expect, beforeAll } from 'vitest';

// A Supabase signed URL for an outbox image is ~600 characters, most of
// it JWT. Sent to a customer it arrives as a wall of underlined text
// taller than the photo, and it expires — a message opened a week later
// leads nowhere. Same fix as receipts: send a token, sign at click time.
let mediaShortUrl, mediaToken, parseMediaToken, verifyMediaToken;

beforeAll(async () => {
  process.env.JWT_SECRET ||= 'test-secret-for-media-links';
  process.env.PUBLIC_BASE_URL = 'https://thapsus.uk';
  ({ mediaShortUrl, mediaToken, parseMediaToken, verifyMediaToken } =
    await import('../../utils/mediaLink.js'));
});

const PATH = 'outbox/1787680650408-IMG_0224.png';

describe('media short links', () => {
  it('is a fraction of the length of the signed URL it replaces', () => {
    const url = mediaShortUrl(PATH);
    expect(url.startsWith('https://thapsus.uk/m/')).toBe(true);
    // The real one was 604 characters in the message that prompted this.
    expect(url.length).toBeLessThan(110);
  });

  it('round-trips the storage path', () => {
    const parsed = parseMediaToken(mediaToken(PATH));
    expect(parsed.path).toBe(PATH);
    expect(verifyMediaToken(parsed.path, parsed.signature)).toBe(true);
  });

  it('refuses a signature that belongs to a different path', () => {
    const other = parseMediaToken(mediaToken('outbox/someone-elses.png'));
    expect(verifyMediaToken(PATH, other.signature)).toBe(false);
  });

  it('will not be talked into reaching another object', () => {
    // The token carries a path, so the HMAC is the only thing stopping it
    // being a way to read anything the service key can.
    const forged = `${Buffer.from('outbox/secret.pdf', 'utf8').toString('base64url')}.aaaaaaaaaaaa`;
    const parsed = parseMediaToken(forged);
    expect(verifyMediaToken(parsed.path, parsed.signature)).toBe(false);
  });

  it('rejects traversal and absolute paths before the HMAC is consulted', () => {
    for (const bad of ['../receipts/x.pdf', '/etc/passwd', 'outbox/../../secrets']) {
      const token = `${Buffer.from(bad, 'utf8').toString('base64url')}.aaaaaaaaaaaa`;
      expect(parseMediaToken(token), bad).toBeNull();
    }
  });

  it('rejects malformed tokens without throwing', () => {
    for (const bad of ['', 'nodot', 'a.b', '!!!.aaaaaaaaaaaa', null, undefined]) {
      expect(parseMediaToken(bad)).toBeNull();
    }
  });

  it('handles filenames with spaces and brackets', () => {
    const p = 'outbox/1787 photo (2).png';
    expect(parseMediaToken(mediaToken(p)).path).toBe(p);
  });

  it('gives nothing for an empty path', () => {
    expect(mediaToken('')).toBeNull();
    expect(mediaShortUrl(null)).toBeNull();
  });
});
