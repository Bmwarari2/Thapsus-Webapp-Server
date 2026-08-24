import { describe, it, expect } from 'vitest';
import { parseWhatsAppText } from '../../client/src/lib/waText.js';

// The inbox printed bodies raw, so an operator saw "*TC-1058*" where the
// customer saw bold. These are the exact strings the app sends.
const flat = (tokens) => tokens.map((t) => `${t.type}:${t.value}`);

describe('parseWhatsAppText', () => {
  it('reads bold out of a customer code', () => {
    expect(flat(parseWhatsAppText('Your customer code is *TC-1058* — keep it handy.')))
      .toEqual(['text:Your customer code is ', 'bold:TC-1058', 'text: — keep it handy.']);
  });

  it('handles a quote with several bold runs', () => {
    const t = parseWhatsAppText('*Your quote is ready*\nItem price: $16.00\n*Total: KSh 2,367*');
    expect(t[0]).toEqual({ type: 'bold', value: 'Your quote is ready' });
    expect(t.at(-1)).toEqual({ type: 'bold', value: 'Total: KSh 2,367' });
  });

  it('links a bare URL', () => {
    const t = parseWhatsAppText("Here's your receipt: https://thapsus.uk/r/TRK-8832.hM70fKjkxyGR");
    expect(t.at(-1)).toEqual({ type: 'link', value: 'https://thapsus.uk/r/TRK-8832.hM70fKjkxyGR' });
  });

  it('covers italic, strikethrough and monospace', () => {
    expect(flat(parseWhatsAppText('_soon_'))).toEqual(['italic:soon']);
    expect(flat(parseWhatsAppText('~600~'))).toEqual(['strike:600']);
    expect(flat(parseWhatsAppText('```TRK-1```'))).toEqual(['mono:TRK-1']);
  });

  it('leaves lone and mid-word asterisks alone', () => {
    // "2 * 3" and "KSh 300 * per parcel" are not bold, and a maths
    // asterisk turning half a sentence bold would be worse than the bug.
    expect(flat(parseWhatsAppText('2 * 3 = 6'))).toEqual(['text:2 * 3 = 6']);
    expect(flat(parseWhatsAppText('an unclosed *mark'))).toEqual(['text:an unclosed *mark']);
  });

  it('does not run a mark across a line break', () => {
    expect(flat(parseWhatsAppText('*not bold\nstill not*'))).toEqual(['text:*not bold\nstill not*']);
  });

  it('merges plain runs and survives empty input', () => {
    expect(parseWhatsAppText('')).toEqual([]);
    expect(parseWhatsAppText(null)).toEqual([]);
    expect(parseWhatsAppText('plain text')).toEqual([{ type: 'text', value: 'plain text' }]);
  });
});
