import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATE_SLOTS, toPositionalParams, requiredFields, renderTemplateBody } from '../../utils/waTemplateVars.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// These mappings decide which of our values lands in which approved
// template slot. Getting one wrong puts a customer's name where the money
// should be and the message still sends, so the order is pinned here
// against the approved body text.
describe('approved template slots', () => {
  it('fills quote_ready in body order', () => {
    expect(toPositionalParams('quote', {
      full_name: 'Martha', order_ref: 'TRK-8823', total_kes: '6,486',
    })).toEqual({ var_1: 'Martha', var_2: 'TRK-8823', var_3: '6,486' });
  });

  it('fills payment_received: name, then AMOUNT, then order', () => {
    // Note the order — amount is var_2 here but var_3 in quote_ready.
    expect(toPositionalParams('payment_received', {
      full_name: 'Martha', total_kes: '6,486', order_ref: 'TRK-8823',
    })).toEqual({ var_1: 'Martha', var_2: '6,486', var_3: 'TRK-8823' });
  });

  it('fills delivered: ORDER first, then name', () => {
    // "Order {{1}} has been delivered ... with us, {{2}}" — reversed
    // relative to every other template.
    expect(toPositionalParams('delivered', {
      order_ref: 'TRK-8823', full_name: 'Martha',
    })).toEqual({ var_1: 'TRK-8823', var_2: 'Martha' });
  });

  it('fills order_purchased', () => {
    expect(toPositionalParams('purchased', { full_name: 'Martha', order_ref: 'TRK-8823' }))
      .toEqual({ var_1: 'Martha', var_2: 'TRK-8823' });
  });

  it('fills the arrival templates from the tracking code', () => {
    expect(toPositionalParams('arrived_waived', { tracking_code: 'TRK-8829' }))
      .toEqual({ var_1: 'TRK-8829' });
    expect(toPositionalParams('dispatched', { tracking_code: 'TRK-8829' }))
      .toEqual({ var_1: 'TRK-8829' });
  });

  it('puts the fee after the code, not before it', () => {
    expect(toPositionalParams('arrived_fee', { tracking_code: 'TRK-8829', fee_kes: '300' }))
      .toEqual({ var_1: 'TRK-8829', var_2: '300' });
  });

  it('gives the receipt template the bare token, not a URL', () => {
    // The approved body writes "…ready at thapsus.uk/r/{{2}}" itself,
    // because Meta will not approve a body that ends in a variable.
    // Passing the full URL here would render thapsus.uk/r/https://…
    const out = toPositionalParams('receipt', {
      tracking_code: 'TRK-8829', receipt_token: 'TRK-8829.vtDo2gQ',
    });
    expect(out).toEqual({ var_1: 'TRK-8829', var_2: 'TRK-8829.vtDo2gQ' });
    expect(out.var_2).not.toMatch(/^https?:\/\//);
  });

  it('never leaves a slot blank — WhatsApp rejects the send', () => {
    const out = toPositionalParams('quote', {});
    expect(Object.values(out).every((v) => v && v.length)).toBe(true);
    expect(out).toEqual({ var_1: 'there', var_2: 'your order', var_3: '0' });
  });

  it('numbers every slot the body declares, with no gaps', () => {
    for (const [key, slot] of Object.entries(TEMPLATE_SLOTS)) {
      const declared = [...slot.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      expect(declared, `${key} body`).toEqual(slot.vars.map((_, i) => i + 1));
      const filled = Object.keys(toPositionalParams(key, {}));
      expect(filled, `${key} params`).toEqual(slot.vars.map((_, i) => `var_${i + 1}`));
    }
  });

  it('passes unmapped keys straight through', () => {
    expect(toPositionalParams('welcome', { anything: 'x' })).toEqual({ anything: 'x' });
    expect(requiredFields('welcome')).toEqual([]);
  });
});

// The JSON manifest is what gets pasted into the sent.dm console, and it
// is not read by any code — so nothing caught it drifting away from the
// slots above. It carried named {{placeholders}} where the approved
// templates take positional ones, and a welcome body still asking for the
// customer's name after the info-first rewrite had removed that question.
// Registering from a stale sheet gets the wrong copy approved, and a
// WhatsApp template cannot be edited after approval — only replaced.
describe('sentdm-templates.json stays in step with the slots', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'sentdm-templates.json'), 'utf8'));
  const byKey = Object.fromEntries(manifest.templates.map((t) => [t.key, t]));

  it('lists exactly the slots, no more and no fewer', () => {
    expect(Object.keys(byKey).sort()).toEqual(Object.keys(TEMPLATE_SLOTS).sort());
  });

  it('carries each approved body verbatim', () => {
    for (const [key, slot] of Object.entries(TEMPLATE_SLOTS)) {
      expect(byKey[key].body.template, `${key} body drifted`).toBe(slot.body);
    }
  });

  it('gives one sample per variable', () => {
    for (const [key, slot] of Object.entries(TEMPLATE_SLOTS)) {
      expect(byKey[key].body.samples, `${key} samples`).toHaveLength(slot.vars.length);
    }
  });

  it('never ends a body on a variable — Meta rejects that', () => {
    // Learned the hard way on the receipt template, which originally
    // finished with the URL variable and could not be approved.
    for (const [key, slot] of Object.entries(TEMPLATE_SLOTS)) {
      expect(slot.body.trimEnd().endsWith('}}'), `${key} ends on a variable`).toBe(false);
    }
  });

  it('numbers the placeholders 1..N in body order', () => {
    for (const [key, slot] of Object.entries(TEMPLATE_SLOTS)) {
      const found = [...slot.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      expect(found, `${key} placeholders`).toEqual(slot.vars.map((_, i) => i + 1));
    }
  });
});

// The default template_map is what a fresh install sends with. A name
// that does not exist in sent.dm, or a key that is not a real slot, means
// the send falls back to free text — which is refused outside the 24-hour
// window, exactly when these templates are the only thing that works.
describe('the default template map', () => {
  it('only maps keys that are real slots', async () => {
    const { DEFAULTS } = await import('../../utils/waSettings.js');
    for (const key of Object.keys(DEFAULTS.template_map)) {
      expect(TEMPLATE_SLOTS[key], `${key} is mapped but has no slot`).toBeTruthy();
    }
  });

  it('names a template for every slot, with none left unmapped', async () => {
    // An unmapped slot sends free text, which is refused outside the
    // 24-hour window — silently, and precisely for the messages that
    // arrive weeks after a customer last wrote in.
    //
    // quote_reminder is the one deliberate exception: it is declared
    // ahead of approval (mapping an UNapproved name would make every
    // quote nudge fail at the provider), and its caller
    // (utils/waNudges.js) already restricts itself to the open window
    // until the template is approved and mapped in Settings.
    const AWAITING_APPROVAL = ['quote_reminder'];
    const { DEFAULTS } = await import('../../utils/waSettings.js');
    expect(Object.keys(DEFAULTS.template_map).sort())
      .toEqual(Object.keys(TEMPLATE_SLOTS)
        .filter((k) => !AWAITING_APPROVAL.includes(k)).sort());
  });
});

// Production held {"quote":"quote_ready", …} — four keys written before
// most templates were approved. A wholesale replace meant the other
// seven resolved to nothing, so those sends went out as free text and
// were refused outside the 24-hour window. Eunice Ngasura's arrival
// notice failed that way ten days after she last wrote in, with no
// reason recorded, because sent.dm simply will not accept free text
// into a closed window.
describe('a stored template map layers over the defaults', () => {
  let mergeSettings;
  beforeAll(async () => {
    const mod = await import('../../utils/waSettings.js');
    // Exercised through getWaSettings' merge helper via a fake db row.
    mergeSettings = async (stored) => {
      const db = { query: async () => ({
        rows: stored === undefined ? [] : [{ key: 'template_map', value: JSON.stringify(stored) }],
      }) };
      mod.invalidateWaSettings();
      return (await mod.getWaSettings(db)).template_map;
    };
  });

  it('keeps approved defaults for keys the stored map never mentions', async () => {
    const map = await mergeSettings({ quote: 'quote_ready' });
    expect(map.quote).toBe('quote_ready');          // the override wins
    expect(map.arrived_fee).toBe('tc_arrived_fee');  // and the rest survive
    expect(map.receipt).toBe('tc_receipt');
    expect(map.dispatched).toBe('tc_dispatched');
  });

  it('lets an empty string switch one off deliberately', async () => {
    const map = await mergeSettings({ receipt: '' });
    expect(map.receipt).toBeUndefined();
    expect(map.quote).toBe('Quote_Ready');
  });

  it('ignores junk rather than dropping the whole map', async () => {
    expect((await mergeSettings([])).quote).toBe('Quote_Ready');
    expect((await mergeSettings(null)).quote).toBe('Quote_Ready');
    expect((await mergeSettings({ quote: 42 })).quote).toBe('Quote_Ready');
  });
});

// ── renderTemplateBody — the transcript copy for template sends ──────────────
// wa_messages.body used to store the free-text fallback even when a
// template was sent, so the inbox showed staff a message the customer
// never received.
describe('renderTemplateBody', () => {
  it('fills the approved body with the named params, in slot order', () => {
    const body = renderTemplateBody('payment_prompt', {
      full_name: 'Jane', order_ref: 'TRK-8821', total_kes: '17,094',
    });
    expect(body).toContain('Hi Jane');
    expect(body).toContain('TRK-8821');
    expect(body).toContain('KES 17,094');
    expect(body).toContain('expires soon'); // missing expires_at → fallback
    expect(body).not.toMatch(/\{\{\d+\}\}/);
  });

  it('returns null for an unknown key so the caller keeps its free text', () => {
    expect(renderTemplateBody('payment_verifying', { reference: 'X' })).toBeNull();
  });
});
