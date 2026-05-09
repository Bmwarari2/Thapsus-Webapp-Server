// middleware/deprecation.js
//
// Tags responses to deprecated routes with the standard RFC 8594
// Deprecation + Sunset headers, and emits a one-time stderr warning
// per (caller, path) so the operator dashboard can see exactly which
// clients are still hitting the old surface.
//
// Used by server.js to mark `/api/consolidation/*` (the v1 legacy)
// as deprecated. The route mount itself is unchanged, so existing
// callers keep working until the Sunset date.

/**
 * Build a deprecation middleware.
 *
 * @param {object} opts
 * @param {string} opts.replacement   - the path callers should migrate to,
 *                                      e.g. '/api/consolidations'.
 * @param {Date}   opts.sunset        - hard removal date. Sent as Sunset
 *                                      header in HTTP-date form.
 * @returns {import('express').RequestHandler}
 */
export function deprecate({ replacement, sunset }) {
  if (!(sunset instanceof Date)) {
    throw new TypeError('deprecate(): sunset must be a Date');
  }
  const sunsetHttpDate = sunset.toUTCString();
  // De-dupe key per process: (path + user_id || ip). One warning per
  // unique caller per deploy. Railway redeploys frequently enough that
  // the Set never grows unbounded; Set#size is also capped below as a
  // belt-and-braces guard.
  const seen = new Set();
  const SEEN_CAP = 1024;

  return function deprecationMiddleware(req, res, next) {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', sunsetHttpDate);
    res.setHeader(
      'Link',
      `<${replacement}>; rel="successor-version"`
    );

    const caller = req.user?.id || req.ip || 'unknown';
    const key = `${req.method} ${req.originalUrl} :: ${caller}`;
    if (!seen.has(key)) {
      // Cap the dedupe set so a hostile / leaky client can't OOM us.
      if (seen.size >= SEEN_CAP) seen.clear();
      seen.add(key);
      console.warn(
        `[deprecation] ${req.method} ${req.originalUrl} → use ${replacement} (sunset ${sunsetHttpDate}); caller=${caller}`
      );
    }
    next();
  };
}
