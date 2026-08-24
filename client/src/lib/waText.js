// client/src/lib/waText.js
//
// WhatsApp's markup, rendered instead of shown.
//
// The inbox printed message bodies raw, so an operator reviewing a
// conversation saw "*TC-1058*" and "*Your quote is ready*" — the
// asterisks WhatsApp uses to mean bold, sitting there as punctuation.
// The customer sees bold text; the person answering them saw the source.
//
// Parsing is deliberately single-level. WhatsApp itself nests, but the
// messages we send never do, and a tokeniser that handles one level
// predictably beats one that handles three unpredictably.
//
// Kept apart from the component so the rules can be tested without a DOM.

const URL_RE = /https?:\/\/[^\s<>"')]+/;

// Order matters: monospace first, because ``` may wrap the other marks.
const MARKS = [
  { type: 'mono', re: /```([\s\S]+?)```/ },
  { type: 'mono', re: /`([^`\n]+?)`/ },
  { type: 'bold', re: /\*([^*\n]+?)\*/ },
  { type: 'italic', re: /_([^_\n]+?)_/ },
  { type: 'strike', re: /~([^~\n]+?)~/ },
];

/**
 * Split a message body into tokens the renderer can map onto elements.
 *
 * @param {string} text
 * @returns {Array<{type: 'text'|'bold'|'italic'|'strike'|'mono'|'link', value: string}>}
 */
export function parseWhatsAppText(text) {
  const src = String(text ?? '');
  if (!src) return [];

  const out = [];
  let rest = src;

  while (rest) {
    // Whichever of the marks (or a bare URL) comes first wins this round.
    let best = null;
    for (const { type, re } of MARKS) {
      const m = re.exec(rest);
      if (m && (!best || m.index < best.index)) {
        best = { type, index: m.index, length: m[0].length, value: m[1] };
      }
    }
    const link = URL_RE.exec(rest);
    if (link && (!best || link.index < best.index)) {
      best = { type: 'link', index: link.index, length: link[0].length, value: link[0] };
    }

    if (!best) { push(out, 'text', rest); break; }
    if (best.index > 0) push(out, 'text', rest.slice(0, best.index));
    push(out, best.type, best.value);
    rest = rest.slice(best.index + best.length);
  }
  return out;
}

// Adjacent plain runs merge, so a body with no markup is one token
// rather than a token per character-run the scanner happened to stop on.
function push(out, type, value) {
  if (value === '') return;
  const last = out[out.length - 1];
  if (type === 'text' && last?.type === 'text') last.value += value;
  else out.push({ type, value });
}
