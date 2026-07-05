/**
 * utils/influencerLinkPreview.js
 *
 * Rewrites the SPA shell's <head> so that when an influencer link (/i/<CODE>)
 * is shared on WhatsApp, iMessage, Telegram, Facebook, X, etc., the unfurled
 * preview shows the INFLUENCER'S name + the invite copy instead of the generic
 * site card.
 *
 * Why server-side: link-preview crawlers fetch the URL and read the static
 * <meta> tags — they do NOT execute the React app, so anything the page sets
 * client-side is invisible to them. The Express /i/:code handler calls this to
 * inject per-code tags before serving the shell.
 *
 * Only the text tags change; the brand og:image is kept. Real users get the
 * same shell (React boots and renders the landing page as normal).
 */

/** Escape a value for safe interpolation into an HTML attribute / text node. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {string} baseHtml - the built client/dist/index.html
 * @param {{ name: string, code: string, appUrl: string }} opts
 * @returns {string} HTML with influencer-specific title/description/OG tags
 */
export function renderInfluencerPreviewHtml(baseHtml, { name, code, appUrl }) {
  const cleanName = escapeHtml(name);
  const base = String(appUrl || 'https://www.thapsus.uk').replace(/\/+$/, '');
  const url = escapeHtml(`${base}/i/${code}`);
  const imageUrl = escapeHtml(`${base}/i/${code}/og.png`);

  const title = `${cleanName} invited you to Thapsus Cargo`;
  const description =
    `${cleanName} invited you to Thapsus Cargo — affordable shipping from the UK to Kenya. ` +
    `Create your account and send us the link to whatever you want us to ship.`;

  // Use function replacements (not "$1" strings) so a name containing `$`
  // can't corrupt the output. Each pattern captures the attribute prefix and
  // the closing quote so we only swap the content value.
  const swap = (html, pattern) => html.replace(pattern, (_m, pre, post) => pre + title + post);
  const swapDesc = (html, pattern) => html.replace(pattern, (_m, pre, post) => pre + description + post);
  const swapUrl = (html, pattern) => html.replace(pattern, (_m, pre, post) => pre + url + post);

  let html = baseHtml;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
  html = html.replace(/(<meta name="description" content=")[^"]*(")/, (_m, pre, post) => pre + description + post);

  html = swap(html, /(<meta property="og:title" content=")[^"]*(")/);
  html = swapDesc(html, /(<meta property="og:description" content=")[^"]*(")/);
  html = swapUrl(html, /(<meta property="og:url" content=")[^"]*(")/);

  html = swap(html, /(<meta name="twitter:title" content=")[^"]*(")/);
  html = swapDesc(html, /(<meta name="twitter:description" content=")[^"]*(")/);
  html = swapUrl(html, /(<meta name="twitter:url" content=")[^"]*(")/);

  // Point the preview image at the per-influencer PNG (rendered by
  // /i/<code>/og.png). Replace the og:image value and append the dimension
  // hints crawlers use to lay the card out; swap the twitter:image too.
  html = html.replace(
    /<meta property="og:image" content="[^"]*"\s*\/?>/,
    `<meta property="og:image" content="${imageUrl}" />\n` +
    `    <meta property="og:image:secure_url" content="${imageUrl}" />\n` +
    `    <meta property="og:image:type" content="image/png" />\n` +
    `    <meta property="og:image:width" content="1200" />\n` +
    `    <meta property="og:image:height" content="630" />\n` +
    `    <meta property="og:image:alt" content="${title}" />`
  );
  html = html.replace(/(<meta name="twitter:image" content=")[^"]*(")/, (_m, pre, post) => pre + imageUrl + post);

  return html;
}

export default renderInfluencerPreviewHtml;
