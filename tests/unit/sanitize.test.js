import { describe, it, expect, vi } from 'vitest';
import { sanitizeBody, sanitizeQuery } from '../../middleware/sanitize.js';

// Build a minimal mock express req/res/next triple so we can exercise the
// middleware as if it were running inside the real pipeline.
function makeReq({ body, query } = {}) {
  const req = {};
  if (body !== undefined) req.body = body;
  if (query !== undefined) {
    // Express 5 makes req.query a getter; mimic that with defineProperty so
    // the middleware's defineProperty override actually has something to
    // replace (rather than a plain assignment).
    Object.defineProperty(req, 'query', {
      value: query,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  return req;
}

function makeRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

describe('sanitizeBody', () => {
  it('scrubs HTML / script tags from string fields', () => {
    const req = makeReq({ body: { name: '<script>alert(1)</script>Hello' } });
    const res = makeRes();
    const next = vi.fn();

    sanitizeBody(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body.name).not.toContain('<script>');
    expect(req.body.name).toContain('Hello');
  });

  it('trims whitespace on strings', () => {
    const req = makeReq({ body: { email: '  foo@bar.com  ' } });
    const res = makeRes();
    const next = vi.fn();

    sanitizeBody(req, res, next);

    expect(req.body.email).toBe('foo@bar.com');
  });

  it('walks nested objects and arrays', () => {
    const req = makeReq({
      body: {
        user: { bio: '<img src=x onerror=alert(1)>' },
        tags: ['<script>x</script>one', 'two'],
      },
    });
    const res = makeRes();
    const next = vi.fn();

    sanitizeBody(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    // xss() strips dangerous attributes (onerror, etc.) but is permissive
    // about benign tags like <b>. We only assert that the actively
    // exploitable bits are gone, not that all HTML is removed.
    expect(req.body.user.bio).not.toContain('onerror=');
    expect(req.body.tags[0]).not.toContain('<script>');
    expect(req.body.tags[0]).toContain('one');
    expect(req.body.tags[1]).toBe('two');
  });

  it('rejects payloads deeper than MAX_DEPTH (16) with HTTP 413', () => {
    // Build a 20-deep nested object to trip the guard.
    let nested = { v: 'leaf' };
    for (let i = 0; i < 20; i++) nested = { child: nested };

    const req = makeReq({ body: nested });
    const res = makeRes();
    const next = vi.fn();

    sanitizeBody(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(413);
    expect(res.body?.success).toBe(false);
    expect(res.body?.message).toMatch(/depth/i);
  });

  it('rejects objects with more than MAX_KEYS (256) properties with HTTP 413', () => {
    const fat = {};
    for (let i = 0; i < 300; i++) fat[`k${i}`] = i;

    const req = makeReq({ body: fat });
    const res = makeRes();
    const next = vi.fn();

    sanitizeBody(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(413);
    expect(res.body?.message).toMatch(/object key count/i);
  });

  it('rejects arrays with more than MAX_KEYS (256) entries with HTTP 413', () => {
    const arr = new Array(300).fill('x');
    const req = makeReq({ body: { items: arr } });
    const res = makeRes();
    const next = vi.fn();

    sanitizeBody(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(413);
    expect(res.body?.message).toMatch(/array length/i);
  });

  it('passes through non-object bodies untouched', () => {
    const req = {}; // no body
    const res = makeRes();
    const next = vi.fn();

    sanitizeBody(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });
});

describe('sanitizeQuery', () => {
  it('replaces the express 5 lazy getter with a sanitised value', () => {
    const req = makeReq({ query: { q: '<script>x</script>shoes' } });
    const res = makeRes();
    const next = vi.fn();

    sanitizeQuery(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    // After the middleware, repeated reads must still see the sanitised
    // value — the original Express 5 getter would otherwise re-parse the
    // URL and undo any mutation.
    expect(req.query.q).not.toContain('<script>');
    expect(req.query.q).toContain('shoes');
    // Read it again — should still be sanitised.
    expect(req.query.q).not.toContain('<script>');
  });

  it('rejects oversize query objects with HTTP 413', () => {
    const fat = {};
    for (let i = 0; i < 300; i++) fat[`q${i}`] = String(i);

    const req = makeReq({ query: fat });
    const res = makeRes();
    const next = vi.fn();

    sanitizeQuery(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(413);
  });
});
