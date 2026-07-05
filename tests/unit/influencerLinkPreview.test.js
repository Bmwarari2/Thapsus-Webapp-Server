import { describe, it, expect } from 'vitest';
import { renderInfluencerPreviewHtml } from '../../utils/influencerLinkPreview.js';

// The influencer link (/i/<CODE>) preview is rendered server-side because
// WhatsApp/iMessage/etc. crawlers don't run JS. This locks in that the shell's
// title/description/OG/Twitter tags get the influencer's name — and that a
// hostile name can't break out of the HTML attributes.

const SHELL = `<!doctype html><html><head>
<title>Thapsus Cargo — Affordable Shipping from UK &amp; China to Kenya</title>
<meta name="description" content="Generic site description." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://thapsus.uk/" />
<meta property="og:title" content="Thapsus Cargo — Ship from UK &amp; China to Kenya" />
<meta property="og:description" content="Generic og description." />
<meta property="og:image" content="https://thapsus.uk/og-image.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:url" content="https://thapsus.uk/" />
<meta name="twitter:title" content="Thapsus Cargo — Ship from UK &amp; China to Kenya" />
<meta name="twitter:description" content="Generic og description." />
<meta name="twitter:image" content="https://thapsus.uk/og-image.png" />
</head><body><div id="root"></div></body></html>`;

describe('renderInfluencerPreviewHtml', () => {
  it('puts the influencer name into the title, description and OG/Twitter tags', () => {
    const out = renderInfluencerPreviewHtml(SHELL, { name: 'Aisha K.', code: 'INFAB2CD', appUrl: 'https://www.thapsus.uk' });

    expect(out).toContain('<title>Aisha K. invited you to Thapsus Cargo</title>');
    expect(out).toMatch(/<meta property="og:title" content="Aisha K\. invited you to Thapsus Cargo"/);
    expect(out).toMatch(/<meta name="twitter:title" content="Aisha K\. invited you to Thapsus Cargo"/);
    expect(out).toMatch(/og:description" content="Aisha K\. invited you to Thapsus Cargo — affordable shipping from the UK to Kenya/);
    expect(out).toContain('<meta property="og:url" content="https://www.thapsus.uk/i/INFAB2CD" />');
    expect(out).toContain('<meta name="twitter:url" content="https://www.thapsus.uk/i/INFAB2CD" />');
  });

  it('points og:image and twitter:image at the per-influencer PNG with dimensions', () => {
    const out = renderInfluencerPreviewHtml(SHELL, { name: 'Bee', code: 'INFXYZ12', appUrl: 'https://www.thapsus.uk' });
    expect(out).toContain('<meta property="og:image" content="https://www.thapsus.uk/i/INFXYZ12/og.png" />');
    expect(out).toContain('<meta name="twitter:image" content="https://www.thapsus.uk/i/INFXYZ12/og.png"');
    expect(out).toContain('<meta property="og:image:width" content="1200" />');
    expect(out).toContain('<meta property="og:image:height" content="630" />');
    // the old generic image must be gone
    expect(out).not.toContain('og-image.png" />\n<meta name="twitter:card"');
  });

  it('HTML-escapes a hostile name so it cannot break out of the attribute', () => {
    const evil = 'X" /><script>alert(1)</script>';
    const out = renderInfluencerPreviewHtml(SHELL, { name: evil, code: 'INFEVIL1', appUrl: 'https://www.thapsus.uk' });
    // No raw script tag or unescaped quote injected into the head.
    expect(out).not.toContain('<script>alert(1)</script>');
    expect(out).toContain('&quot;');
    expect(out).toContain('&lt;script&gt;');
  });

  it('normalises a trailing slash on appUrl', () => {
    const out = renderInfluencerPreviewHtml(SHELL, { name: 'Bee', code: 'INFXYZ12', appUrl: 'https://www.thapsus.uk/' });
    expect(out).toContain('content="https://www.thapsus.uk/i/INFXYZ12"');
  });

  it('does not touch a $ in the name (function-based replacement)', () => {
    const out = renderInfluencerPreviewHtml(SHELL, { name: 'Cash$Money', code: 'INFCASH1', appUrl: 'https://www.thapsus.uk' });
    expect(out).toContain('<title>Cash$Money invited you to Thapsus Cargo</title>');
  });
});
