// Product-link normalisation shared by order creation and the link
// editor. What matters: an operator's paste is accepted in the shapes it
// actually arrives in, junk is refused loudly rather than saved as
// though it were a product, and a bare domain gets a scheme so the
// dashboard's anchor doesn't resolve relative to our own site.
import { describe, it, expect } from 'vitest';
import { normalizeProductLink, normalizeProductLinks } from '../../utils/productLinks.js';

describe('normalizeProductLink', () => {
  it('keeps a full URL as typed', () => {
    expect(normalizeProductLink('https://onelink.shein.com/49/5zw9b7?shc=2_Rw'))
      .toBe('https://onelink.shein.com/49/5zw9b7?shc=2_Rw');
  });

  it('gives a bare domain a scheme, so the anchor is not relative', () => {
    expect(normalizeProductLink('m.shein.com/Lenovo-p-12345.html'))
      .toBe('https://m.shein.com/Lenovo-p-12345.html');
    expect(normalizeProductLink('www.amazon.co.uk/dp/B01')).toBe('https://www.amazon.co.uk/dp/B01');
  });

  it('strips whitespace, including a link pasted across lines', () => {
    expect(normalizeProductLink('  https://a.com/x\n/y  ')).toBe('https://a.com/x/y');
  });

  it.each([
    ['blue dress size 8', 'a note'],
    ['', 'an empty string'],
    ['   ', 'blanks'],
    ['KSh 4,500', 'a price'],
    [42, 'a number'],
    [null, 'null'],
  ])('refuses %j (%s)', (input) => {
    expect(normalizeProductLink(input)).toBeNull();
  });
});

describe('normalizeProductLinks', () => {
  it('trims, adds schemes and de-duplicates case-insensitively', () => {
    const { links, error } = normalizeProductLinks([
      ' https://a.com/x ', 'm.shein.com/y', 'HTTPS://A.COM/X',
    ]);
    expect(error).toBeNull();
    expect(links).toEqual(['https://a.com/x', 'https://m.shein.com/y']);
  });

  it('treats an empty row as a deletion, not a mistake', () => {
    const { links, error } = normalizeProductLinks(['https://a.com/x', '', '   ']);
    expect(error).toBeNull();
    expect(links).toEqual(['https://a.com/x']);
  });

  it('accepts an empty list — an order may legitimately have no links yet', () => {
    expect(normalizeProductLinks([])).toEqual({ links: [], error: null });
  });

  it('names the offending entry rather than silently dropping it', () => {
    const { error } = normalizeProductLinks(['https://a.com/x', 'blue dress size 8']);
    expect(error).toMatch(/blue dress size 8/);
    expect(error).toMatch(/not a usable product link/i);
  });

  it('rejects a non-array', () => {
    expect(normalizeProductLinks('https://a.com/x').error).toMatch(/must be an array/);
    expect(normalizeProductLinks(undefined).error).toMatch(/must be an array/);
  });

  it('caps the list at 20', () => {
    const many = Array.from({ length: 21 }, (_, i) => `https://a.com/${i}`);
    expect(normalizeProductLinks(many).error).toMatch(/at most 20/);
    expect(normalizeProductLinks(many.slice(0, 20)).error).toBeNull();
  });

  it('refuses an over-long URL', () => {
    expect(normalizeProductLinks([`https://a.com/${'x'.repeat(2100)}`]).error)
      .toMatch(/not a usable product link/i);
  });
});
