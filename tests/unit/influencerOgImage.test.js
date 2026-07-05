import { describe, it, expect } from 'vitest';
import { buildInfluencerOgSvg, renderInfluencerOgPng } from '../../utils/influencerOgImage.js';

// The per-influencer preview image renders the name onto a 1200×630 card.
// These lock in that the name lands in the SVG (escaped) and that resvg +
// the bundled Liberation Sans font actually produce a valid PNG — the same
// path production uses, so a broken font bundle or resvg install fails here.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('buildInfluencerOgSvg', () => {
  it('embeds the influencer name and brand copy', () => {
    const svg = buildInfluencerOgSvg('Aisha K.');
    expect(svg).toContain('Aisha K.');
    expect(svg).toContain('invited you to Thapsus Cargo');
    expect(svg).toContain('SHIP FROM THE UK TO KENYA');
    expect(svg).toMatch(/width="1200" height="630"/);
  });

  it('escapes XML-hostile characters in the name', () => {
    const svg = buildInfluencerOgSvg('A & B <x>');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&lt;x&gt;');
    expect(svg).not.toContain('<x>');
  });

  it('truncates an absurdly long name so the card cannot overflow', () => {
    const svg = buildInfluencerOgSvg('A'.repeat(80));
    expect(svg).toContain('…');
  });
});

describe('renderInfluencerOgPng', () => {
  it('produces a valid PNG buffer', () => {
    const png = renderInfluencerOgPng('Aisha K.');
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.length).toBeGreaterThan(1000);
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  });

  it('renders long names without throwing', () => {
    expect(() => renderInfluencerOgPng('Verylonginfluencername Superstar')).not.toThrow();
  });
});
