import xss from 'xss';

// Bound the recursion + breadth so a hostile client can't ship a 10k-deep
// nested object and pin the event loop on xss().  Reject (413) above the
// caps rather than silently truncating.  Audit T25.
const MAX_DEPTH = 16;
const MAX_KEYS = 256;

class PayloadTooLargeError extends Error {
  constructor(reason) {
    super(`Payload exceeded sanitisation limit: ${reason}`);
    this.statusCode = 413;
  }
}

function sanitizeValue(value, depth = 0) {
  if (depth > MAX_DEPTH) {
    throw new PayloadTooLargeError(`max nesting depth (${MAX_DEPTH}) exceeded`);
  }
  if (typeof value === 'string') {
    return xss(value.trim());
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_KEYS) {
      throw new PayloadTooLargeError(`array length ${value.length} > ${MAX_KEYS}`);
    }
    return value.map((item) => sanitizeValue(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length > MAX_KEYS) {
      throw new PayloadTooLargeError(`object key count ${entries.length} > ${MAX_KEYS}`);
    }
    const out = {};
    for (const [k, v] of entries) {
      out[k] = sanitizeValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

function safeSanitize(value) {
  try {
    return { ok: true, value: sanitizeValue(value) };
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      return { ok: false, message: err.message };
    }
    throw err;
  }
}

export function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    const result = safeSanitize(req.body);
    if (!result.ok) {
      return res.status(413).json({ success: false, message: result.message });
    }
    req.body = result.value;
  }
  next();
}

export function sanitizeQuery(req, res, next) {
  if (req.query && typeof req.query === 'object') {
    const result = safeSanitize(req.query);
    if (!result.ok) {
      return res.status(413).json({ success: false, message: result.message });
    }
    // Express 5 made `req.query` a LAZY GETTER — it re-parses the URL
    // on each access, so in-place mutation (Object.assign / delete) of
    // the returned object is silently discarded on the next read.
    // Plain assignment (`req.query = result.value`) also throws
    // `TypeError: Cannot set property query of #<IncomingMessage>`
    // because there's no setter.
    //
    // Override the property descriptor entirely with a frozen value
    // so the getter is replaced and downstream handlers see the
    // sanitised version on every access. `configurable: true` keeps
    // it overridable in the unlikely case some other middleware
    // wants to do the same.
    Object.defineProperty(req, 'query', {
      value: result.value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  next();
}
