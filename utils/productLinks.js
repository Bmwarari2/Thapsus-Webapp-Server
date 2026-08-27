// utils/productLinks.js
//
// The product links on an order: what the operator actually buys, and —
// when there is no product_note — what the receipt calls the item
// (utils/receiptPdf.js reads the first link's hostname). Both the create
// route and the edit route normalise through here so a link typed into
// one screen behaves like a link typed into the other.
//
// Validation is deliberately permissive about SHAPE and strict about
// JUNK. Operators paste whatever the customer sent — a full SHEIN cart
// URL, a bare `m.shein.com/...`, sometimes with stray whitespace — and
// all of that is a usable link. What must not get in is a note, a price,
// or an empty string saved as though it were a product.
//
// A bare domain is stored with https:// in front. The dashboard renders
// links as anchors, and `href="shein.com/x"` resolves RELATIVE to the
// dashboard — an operator clicking it lands on a 404 of our own site
// rather than the product they meant to price.

const MAX_LINKS = 20;
const MAX_LEN = 2048;

// Same deliberately-dumb shape the state machine uses to spot a link in
// an inbound message: a scheme, or something.tld with a plausible TLD.
const HAS_SCHEME = /^https?:\/\//i;
const BARE_DOMAIN = /^(?:www\.|[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#].*)?$/i;

/**
 * Clean one operator-typed link, or null if it isn't one.
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeProductLink(raw) {
  if (typeof raw !== 'string') return null;
  // Whitespace inside a URL is never meaningful, and a pasted link often
  // arrives wrapped across lines.
  const value = raw.trim().replace(/\s+/g, '');
  if (!value || value.length > MAX_LEN) return null;
  if (HAS_SCHEME.test(value)) return value;
  if (BARE_DOMAIN.test(value)) return `https://${value}`;
  return null;
}

/**
 * Normalise a whole list: trim, add missing schemes, drop blanks,
 * de-duplicate, and cap the length.
 *
 * Rejects rather than silently drops: an operator who fat-fingers a link
 * should be told, not left believing a product is on the order when it
 * is not. Blank entries are the one exception — an empty row in the
 * editor is how you delete a link, not a mistake.
 *
 * @param {unknown} input
 * @returns {{ links: string[], error: string|null }}
 */
export function normalizeProductLinks(input) {
  if (!Array.isArray(input)) {
    return { links: [], error: 'product_links must be an array' };
  }
  const links = [];
  const seen = new Set();
  for (const raw of input) {
    // An empty row is a deletion, not a typo.
    if (typeof raw === 'string' && raw.trim() === '') continue;
    const link = normalizeProductLink(raw);
    if (!link) {
      const shown = String(raw ?? '').trim().slice(0, 60);
      return { links: [], error: `"${shown}" is not a usable product link` };
    }
    const key = link.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(link);
  }
  if (links.length > MAX_LINKS) {
    return { links: [], error: `An order can hold at most ${MAX_LINKS} product links` };
  }
  return { links, error: null };
}
