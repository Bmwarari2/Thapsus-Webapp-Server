import { describe, it, expect } from 'vitest';
import { classifyReply, claimsQuoteInFlight, renderFacts, HANDOFF, OFF_TOPIC } from '../../utils/waAi.js';

// classifyReply is the boundary that stops a control sentinel reaching a
// customer's phone. It runs on every AI reply, so it gets its own tests.
describe('classifyReply', () => {
  it('passes ordinary prose through as a reply', () => {
    expect(classifyReply('Delivery takes 10-14 days. Asante!'))
      .toEqual({ kind: 'reply', text: 'Delivery takes 10-14 days. Asante!' });
  });

  it('recognises each sentinel and never leaks it as text', () => {
    for (const [raw, kind] of [[HANDOFF, 'handoff'], [OFF_TOPIC, 'off_topic']]) {
      // Bare, quoted, and with the model's usual trailing punctuation.
      for (const variant of [raw, `"${raw}"`, `${raw}.`, `  ${raw}  `, raw.toLowerCase()]) {
        const out = classifyReply(variant);
        expect(out.kind).toBe(kind);
        expect(out.text).toBeNull();
      }
    }
  });

  it('treats an empty or missing generation as a handoff, not silence', () => {
    for (const empty of [null, undefined, '']) {
      expect(classifyReply(empty)).toEqual({ kind: 'handoff', text: null });
    }
  });

  it('prefers off-topic when the model emits both', () => {
    // Shouldn't happen, but the customer must not receive either word.
    expect(classifyReply(`${HANDOFF} ${OFF_TOPIC}`).kind).toBe('off_topic');
  });

  it('caps a runaway generation', () => {
    expect(classifyReply('x'.repeat(5000)).text).toHaveLength(1200);
  });
});

// +447428777090 opened with "Hi", asked how long delivery takes, then
// asked "How do I pay?" — no link sent, no order on file — and was
// answered "your quote is being worked out now and will come through
// here shortly". Nothing was being worked out. They were left waiting
// for a message nobody would send, and the question they did ask (which
// the knowledge base answers in full) went unanswered.
describe('claimsQuoteInFlight', () => {
  it('catches the reply that started this', () => {
    expect(claimsQuoteInFlight(
      "Of course — your quote is being worked out now and will come through here shortly. "
      + "There's nothing to pay or decide until you've seen it."
    )).toBe(true);
  });

  it.each([
    'Your total is on the way.',
    'The team is pricing it now.',
    'We are getting your quote ready.',
    'Your quote will come through shortly.',
    'Asante! Your quotation is being prepared.',
    "I'm working on your price now.",
  ])('catches "%s"', (text) => {
    expect(claimsQuoteInFlight(text)).toBe(true);
  });

  // The whole selling motion is an invitation to send a link, and every
  // one of these is true whether or not an order exists. Flagging them
  // would gag the assistant on the reply we most want it to send.
  it.each([
    'Share your cart or product link now and the team will get your KES quote ready.',
    'Send us the link and we will quote you in KES within the hour.',
    'We take payment by M-Pesa once you have accepted your quote.',
    'Once you send a cart link, a quote follows and nothing is due until you have seen it.',
    'Every order takes 2 to 3 weeks to arrive in Kenya, regardless of weight.',
    'A quote costs nothing and commits you to nothing.',
    '',
    null,
  ])('leaves "%s" alone', (text) => {
    expect(claimsQuoteInFlight(text)).toBe(false);
  });
});

// The facts block is what stops the model inferring an order from how
// far along a chat feels. Its wording is load-bearing: the guard in
// waAi.js reads the "NO quote is being prepared" line back out of it.
describe('renderFacts', () => {
  it('states plainly that nothing is in flight for a cold contact', () => {
    const facts = renderFacts({ linkReceived: false, orderCount: 0, quoteInFlight: false, inboundCount: 3 });
    expect(facts).toMatch(/link received from them: NO/);
    expect(facts).toMatch(/Orders on file: NONE/);
    expect(facts).toMatch(/^- NO quote is being prepared\./m);
    expect(facts).toMatch(/product or cart link/);
  });

  it('permits the claim once a link is in and a quote is open', () => {
    const facts = renderFacts({ linkReceived: true, orderCount: 1, quoteInFlight: true, inboundCount: 6 });
    expect(facts).toMatch(/link received from them: YES/);
    expect(facts).toMatch(/quote IS genuinely being prepared/);
    expect(facts).not.toMatch(/^- NO quote is being prepared\./m);
  });

  it('names the first message as such, and lists what is missing', () => {
    const facts = renderFacts({ inboundCount: 1, missing: ['full name'] });
    expect(facts).toMatch(/FIRST message they have ever sent/);
    expect(facts).toMatch(/Still missing from their profile: full name/);
  });
});
