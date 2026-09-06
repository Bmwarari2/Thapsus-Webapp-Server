import { describe, it, expect } from 'vitest';
import { classifyReply, claimsQuoteInFlight, renderFacts, unbackedFigures, HANDOFF, OFF_TOPIC } from '../../utils/waAi.js';

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

  // Exact match, not substring. "Our HANDOFF process takes a minute." is
  // a legitimate sentence and used to be discarded, handing the customer
  // to a person instead of answering them.
  it('treats a sentinel as a sentinel only when it IS the whole reply', () => {
    expect(classifyReply('HANDOFF').kind).toBe('handoff');
    expect(classifyReply('  "HANDOFF" ').kind).toBe('handoff');
    expect(classifyReply('OFF_TOPIC.').kind).toBe('off_topic');
    expect(classifyReply('Our HANDOFF process takes a minute.').kind).toBe('reply');
    expect(classifyReply('That is OFF_TOPIC for us but here is the answer').kind).toBe('reply');
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
  // One line about the quote, never a YES and a NO about the same thing.
  // The first version rendered "link received: YES" directly above "NO
  // quote is being prepared" and told the model to ask for the link the
  // customer had just sent.
  it('says plainly that nothing is being priced for a cold contact', () => {
    const facts = renderFacts({ linkReceived: false, orderCount: 0, quoteInFlight: false, inboundCount: 3 });
    expect(facts).toMatch(/never sent us a product or cart link/);
    expect(facts).toMatch(/do NOT say a quote is coming/);
    expect(facts).not.toMatch(/quote IS genuinely being prepared/);
  });

  it('permits the claim once a link is in and nothing has been quoted since', () => {
    const facts = renderFacts({ linkReceived: true, orderCount: 0, quoteInFlight: true, inboundCount: 6 });
    expect(facts).toMatch(/quote IS genuinely being prepared/);
    expect(facts).toMatch(/Do NOT ask for a link again/);
    expect(facts).not.toMatch(/never sent us a product or cart link/);
  });

  it('says a past link is spent once it has been quoted', () => {
    const facts = renderFacts({ linkReceived: true, orderCount: 1, quoteInFlight: false, inboundCount: 9 });
    expect(facts).toMatch(/already been quoted or is too old/);
    expect(facts).not.toMatch(/quote IS genuinely being prepared/);
  });

  it('names the first message as such, and lists what is missing', () => {
    const facts = renderFacts({ inboundCount: 1, missing: ['full name'] });
    expect(facts).toMatch(/FIRST message they have ever sent/);
    expect(facts).toMatch(/Still missing from their profile: full name/);
  });

  // The fourth state, and the one that cost eighteen hours. "A quote is
  // being prepared" had no time bound at all, so it stayed true for as
  // long as nobody priced the link — and the assistant went on telling
  // +254790325255 the quote was coming "shortly" from 21:02 on 5
  // September until 15:22 the next day, four times, until she wrote "No
  // you're not getting my question, I'm still waiting on the quote so
  // that I pay".
  it('says a quote is LATE once the wait has outrun the promise', () => {
    const facts = renderFacts({
      linkReceived: true, orderCount: 0,
      quoteInFlight: false, quoteOverdue: true, quoteWaitedLabel: '18 hours ago',
      inboundCount: 7,
    });
    expect(facts).toMatch(/18 hours ago/);
    expect(facts).toMatch(/This is LATE/);
    expect(facts).toMatch(/A person has been paged/);
    // And it must not read as permission to keep promising: the guard
    // decides what a reply may claim by reading this line back out.
    expect(facts).not.toMatch(/quote IS genuinely being prepared/);
    expect(facts).not.toMatch(/already been quoted or is too old/);
  });

  it('the overdue line withdraws the guard\'s permission to promise a quote', async () => {
    // quoteInFlightAllowed() greps the facts for the in-flight sentence.
    // The two must agree, or the assistant is either gagged while a quote
    // really is coming or free to promise one that is eighteen hours late.
    const { falseClaimIn } = await import('../../utils/waAi.js');
    const overdue = renderFacts({
      linkReceived: true, quoteOverdue: true, quoteWaitedLabel: '18 hours ago', inboundCount: 7,
    });
    const inFlight = renderFacts({ linkReceived: true, quoteInFlight: true, inboundCount: 7 });
    const reply = 'Our team is pricing your cart now and your KES quote is coming shortly.';
    expect(falseClaimIn(reply, overdue, '')).toMatch(/on its way/);
    expect(falseClaimIn(reply, inFlight, '')).toBe(null);
  });
});

// "Never price a specific item" was in the prompt three times and in code
// zero times — while the assistant had already sent a customer "Please
// proceed with payment of KSh 4,980", a sentence that is nowhere in this
// codebase. It was right, and nothing checked it.
describe('unbackedFigures', () => {
  const backing = 'Last-mile delivery is KSh 300. UK is £9 per kilogram plus £3. '
    + 'Minimum order $25. - Tracking TRK-8834; agreed total KSh 4,980';

  it('catches a total the model worked out itself', () => {
    expect(unbackedFigures('Your 5 items come to about KSh 8,400 including delivery.', backing))
      .toEqual(['KSh 8,400']);
  });

  it('passes a figure that is genuinely in this turn\'s context', () => {
    expect(unbackedFigures('Your agreed total is KSh 4,980 and delivery was KSh 300.', backing)).toEqual([]);
  });

  it('ignores rate-card language, which is always from the knowledge base', () => {
    expect(unbackedFigures('UK is £9 per kilogram plus a £3 handling fee, minimum $25.', backing)).toEqual([]);
  });

  it('is not fooled by thousands separators or trailing zeros', () => {
    expect(unbackedFigures('That is KSh 4980 in total.', backing)).toEqual([]);
    expect(unbackedFigures('KSh 4,980.00 please.', backing)).toEqual([]);
  });

  it('catches every unbacked figure, not just the first', () => {
    expect(unbackedFigures('Roughly KSh 7,200 for the tops and KSh 3,100 for the shoes.', backing))
      .toEqual(['KSh 7,200', 'KSh 3,100']);
  });
});

// The guard is the last line of defence for the incident it is named
// after, and it must not gag the sales line the funnel depends on.
describe('claimsQuoteInFlight — the shape of the claim, not a phrase list', () => {
  it.each([
    'Your quote is being worked out now.',
    'The team is pricing it now.',
    'I have shared your cart with the team and they will send your total here soon.',
    'We are looking at your cart right now and will come back with the KES figure.',
    'Your cart is with our pricing team.',
    'Give us a few minutes and we will send the amount.',
    'Noted, the team will revert with the price shortly.',
  ])('catches %s', (t) => expect(claimsQuoteInFlight(t)).toBe(true));

  // Marion said "Heey" holding an open quote at KSh 17,746. The
  // assistant told her it was ready — true, and the right nudge for
  // someone one word from paying — and this guard matched `ready`,
  // matched again on the retry, and handed her to a colleague. A quote
  // that already exists is a fact from the order context, not a promise
  // of work we have not started. Present tense and future tense are not
  // the same claim.
  it.each([
    'Karibu Marion! Your quote of KSh 17,746 is ready and we are holding it for you.',
    'Hi Marion, your quote is ready — reply YES to confirm.',
    'Your quote is still available at KSh 17,746.',
    'Your quote is ready, shall I send the payment details?',
    'Your total is KSh 17,746 — reply YES and we will send the M-Pesa details.',
  ])('does not block a quote that already exists: %s', (t) =>
    expect(claimsQuoteInFlight(t)).toBe(false));

  it.each([
    'Your quote will be ready shortly.',
    'Your quote is on the way.',
    'Your quote will be sent to you soon.',
  ])('still blocks the future-tense form: %s', (t) =>
    expect(claimsQuoteInFlight(t)).toBe(true));

  // Judged per sentence, so an invitation sitting next to anything else
  // is still an invitation.
  it.each([
    'Share your cart or product link now and the team will get your KES quote ready.',
    'Send us the link and we will quote you in KES within the hour.',
    'Once you send a cart link, a quote follows within the hour.',
    'A quote costs nothing and commits you to nothing.',
    'Yes, we deliver to Nakuru. Delivery is KSh 300. Share your cart link and we will send your total.',
  ])('leaves the invitation alone: %s', (t) => expect(claimsQuoteInFlight(t)).toBe(false));
});

// The provider swap kept every prompt byte-identical, so the message
// plumbing is the only thing that could have changed behaviour — and it
// is the part with two rules the previous provider did not have.
describe('what gets sent to the model', () => {
  it('drops our own opening line so the first message is the customer', async () => {
    // A transcript routinely starts with the scripted welcome. Anthropic
    // rejects a conversation that opens on the assistant.
    const { buildMessages } = await import('../../utils/waAi.js');
    const messages = buildMessages([
      { direction: 'out', body: 'Karibu Thapsus Cargo.' },
      { direction: 'in', body: 'Hi' },
      { direction: 'out', body: 'How can we help?' },
    ], 'How do I pay?');
    expect(messages[0]).toEqual({ role: 'user', content: 'Hi' });
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'How do I pay?' });
  });

  // Marion sent an image with no caption; it is in wa_messages with an
  // empty body, and an empty content string is a 400.
  it('drops empty bodies rather than sending a blank turn', async () => {
    const { buildMessages } = await import('../../utils/waAi.js');
    const messages = buildMessages([
      { direction: 'in', body: 'So i checked this link' },
      { direction: 'in', body: '' },
      { direction: 'in', body: '   ' },
      { direction: 'out', body: null },
    ], 'Ama sijaiona vizuri');
    expect(messages.map((t) => t.content)).toEqual(['So i checked this link', 'Ama sijaiona vizuri']);
  });

  it('maps our side to assistant and theirs to user', async () => {
    const { buildMessages } = await import('../../utils/waAi.js');
    const messages = buildMessages([
      { direction: 'in', body: 'Heey' },
      { direction: 'out', body: 'Karibu!' },
    ], 'Send me the till');
    expect(messages.map((t) => t.role)).toEqual(['user', 'assistant', 'user']);
  });
});
