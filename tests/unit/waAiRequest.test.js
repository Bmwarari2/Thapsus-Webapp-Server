// What actually goes on the wire.
//
// Every other AI test stubs chatReply and onboardingTurn, so the prompt
// was never once built during a test run — and three bugs walked through
// that hole in a single change:
//
//   * the whole GUARDRAILS block was deleted by a careless slice, so
//     every reply threw ReferenceError,
//   * HISTORY_TURNS went with it,
//   * and buildMessages/generate each converted the turns, so the second
//     pass filtered every message out and the request was empty.
//
// 616 tests passed through all three. This file runs the real functions
// against a stub transport, so prompt construction is exercised.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';

let server;
let sent;
// When set, the stub answers the way the real API does once thinking has
// eaten the whole ceiling: a thinking block (empty, because display
// defaults to omitted on this model), no text, stop_reason max_tokens.
let spendsCeilingThinking = false;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      sent.push(parsed);
      if (spendsCeilingThinking) {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({
          id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5',
          content: [{ type: 'thinking', thinking: '', signature: 'sig' }],
          stop_reason: 'max_tokens',
          usage: {
            input_tokens: 1200,
            output_tokens: parsed.max_tokens,
            output_tokens_details: { thinking_tokens: parsed.max_tokens },
          },
        }));
      }
      const wantsJson = Boolean(parsed.output_config?.format);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5',
        content: [{ type: 'text', text: wantsJson
          ? JSON.stringify({ reply: 'Karibu! What name should the parcel carry?',
              full_name: null, delivery_address: null, delivery_preference: null })
          : 'Yes, we deliver to Nakuru. Delivery is KSh 300, or free collection at our CBD office.' }],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10, output_tokens: 90,
          output_tokens_details: { thinking_tokens: 64 },
        },
      }));
    });
  });
  await new Promise((r) => server.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key';
});

afterAll(() => server?.close());
beforeEach(() => { sent = []; spendsCeilingThinking = false; });

const KB = 'Last-mile delivery is KSh 300.';
const ORDERS = '- Tracking TRK-8837; status: Paid; agreed total KSh 12,495';
// Our own welcome first (must be dropped), then a caption-less image
// (empty body, must be dropped) — both real shapes from production.
const HISTORY = [
  { direction: 'out', body: 'Karibu Thapsus Cargo.' },
  { direction: 'in', body: 'Heey' },
  { direction: 'in', body: '' },
  { direction: 'out', body: 'How can we help?' },
];

async function facts() {
  const { renderFacts } = await import('../../utils/waAi.js');
  return renderFacts({ linkReceived: false, orderCount: 1, quoteInFlight: false, inboundCount: 4 });
}

describe('the request chatReply builds', () => {
  it('completes end to end and returns the reply', async () => {
    const { chatReply } = await import('../../utils/waAi.js');
    const answer = await chatReply({
      knowledgeBase: KB, history: HISTORY, message: 'Do you deliver to Nakuru?',
      orderContext: ORDERS, facts: await facts(),
      profile: 'Marion (TC-1060)', summary: 'Shops from SHEIN',
    });
    expect(answer.kind).toBe('reply');
    expect(answer.text).toMatch(/Nakuru/);
  });

  it('sends the model, ceiling and effort this workload is tuned for', async () => {
    const { chatReply } = await import('../../utils/waAi.js');
    await chatReply({ knowledgeBase: KB, history: HISTORY, message: 'hi', orderContext: ORDERS, facts: await facts() });
    expect(sent[0].model).toBe('claude-opus-5');
    expect(sent[0].output_config.effort).toBe('low');
    // The ceiling covers thinking as well as the reply, where the Gemini
    // number it inherited (1024) bought output only. No production
    // failure was ever traced to it — the outage was the schema below —
    // but a reply is capped at 1200 characters downstream, so anything at
    // this ceiling is thinking, and headroom is not billed.
    expect(sent[0].max_tokens).toBeGreaterThanOrEqual(4096);
    // Thinking is asked for rather than inherited: it is on by default on
    // claude-opus-5 and off by default on claude-opus-4-8, and MODEL is
    // an environment variable.
    expect(sent[0].thinking).toEqual({ type: 'adaptive' });
  });

  // The system prompt is the whole point of this module. An empty one
  // means a rule block went missing.
  it('carries the guardrails, the knowledge base and the facts', async () => {
    const { chatReply } = await import('../../utils/waAi.js');
    await chatReply({
      knowledgeBase: KB, history: HISTORY, message: 'hi',
      orderContext: ORDERS, facts: await facts(), summary: 'Shops from SHEIN',
    });
    const system = sent[0].system;
    expect(system.length).toBeGreaterThan(3000);
    expect(system).toMatch(/STRICT RULES|THE RULES/);      // the guardrail block
    expect(system).toMatch(/HOW TO SELL/);
    expect(system).toContain(KB);
    expect(system).toContain(ORDERS);
    expect(system).toMatch(/TODAY IS/);
    // the memory note is below the rules and labelled
    expect(system.indexOf('UNVERIFIED RECOLLECTION')).toBeGreaterThan(system.indexOf('HOW TO SELL'));
  });

  it('opens on the customer and sends no empty message', async () => {
    const { chatReply } = await import('../../utils/waAi.js');
    await chatReply({ knowledgeBase: KB, history: HISTORY, message: 'Do you deliver to Nakuru?', orderContext: ORDERS, facts: await facts() });
    const messages = sent[0].messages;
    expect(messages[0].role).toBe('user');
    expect(messages.every((m) => m.content.trim().length > 0)).toBe(true);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });
});

describe('the request onboardingTurn builds', () => {
  it('completes end to end and parses the structured reply', async () => {
    const { onboardingTurn } = await import('../../utils/waAi.js');
    const turn = await onboardingTurn({
      knowledgeBase: KB, history: HISTORY, message: 'Hi', facts: await facts(),
      profile: { full_name: null, delivery_address: null }, orderContext: '(none on file)',
    });
    expect(turn.kind).toBe('reply');
    expect(turn.reply).toMatch(/Karibu/);
  });

  it('constrains the output to the schema the caller then parses', async () => {
    const { onboardingTurn } = await import('../../utils/waAi.js');
    await onboardingTurn({
      knowledgeBase: KB, history: HISTORY, message: 'Hi', facts: await facts(),
      profile: { full_name: null, delivery_address: null }, orderContext: '(none on file)',
    });
    const format = sent[0].output_config.format;
    expect(format.type).toBe('json_schema');
    expect(format.schema.required).toEqual(
      ['reply', 'full_name', 'delivery_address', 'delivery_preference']);
    // nullable: true was a Gemini extension; the standard spelling is a union
    expect(format.schema.properties.full_name.type).toEqual(['string', 'null']);
    expect(format.schema.additionalProperties).toBe(false);
  });

  // The schema this test used to pin was the one the API rejected. It
  // asserted the shape we happened to send rather than the shape
  // structured outputs accepts, so it passed for as long as the feature
  // was broken — a stub transport validates nothing, which is exactly
  // the gap unsupportedSchemaBits() exists to close.
  it('sends a schema structured outputs will actually accept', async () => {
    const { onboardingTurn, unsupportedSchemaBits } = await import('../../utils/waAi.js');
    await onboardingTurn({
      knowledgeBase: KB, history: HISTORY, message: 'Hi', facts: await facts(),
      profile: { full_name: null, delivery_address: null }, orderContext: '(none on file)',
    });
    expect(unsupportedSchemaBits(sent[0].output_config.format.schema)).toEqual([]);
  });

  // "Enum value 'delivery' does not match declared type '['string',
  // 'null']'" — a 400 on every onboarding turn from the Claude swap
  // until it was read out of the deploy logs.
  it('spells the optional enum as anyOf, not a union type carrying an enum', async () => {
    const { onboardingTurn } = await import('../../utils/waAi.js');
    await onboardingTurn({
      knowledgeBase: KB, history: HISTORY, message: 'Hi', facts: await facts(),
      profile: { full_name: null, delivery_address: null }, orderContext: '(none on file)',
    });
    const pref = sent[0].output_config.format.schema.properties.delivery_preference;
    expect(pref.enum).toBeUndefined();
    expect(pref.anyOf).toEqual([
      { type: 'string', enum: ['delivery', 'collection'] },
      { type: 'null' },
    ]);
  });
});

describe('the schema check that the stub transport cannot do', () => {
  it('catches the exact construct the API rejected', async () => {
    const { unsupportedSchemaBits } = await import('../../utils/waAi.js');
    const problems = unsupportedSchemaBits({
      type: 'object',
      additionalProperties: false,
      properties: {
        delivery_preference: { type: ['string', 'null'], enum: ['delivery', 'collection', null] },
      },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/delivery_preference.*enum cannot sit beside a union type/);
  });

  it('passes a schema that only uses the supported subset', async () => {
    const { unsupportedSchemaBits } = await import('../../utils/waAi.js');
    expect(unsupportedSchemaBits({
      type: 'object',
      additionalProperties: false,
      properties: {
        reply: { type: 'string' },
        full_name: { type: ['string', 'null'] },
        pref: { anyOf: [{ type: 'string', enum: ['a', 'b'] }, { type: 'null' }] },
      },
    })).toEqual([]);
  });

  it('does not let a bad schema reach the API at all', async () => {
    const { onboardingTurn } = await import('../../utils/waAi.js');
    // Sanity: a turn with a valid schema still goes out, so the guard is
    // not simply refusing everything.
    await onboardingTurn({
      knowledgeBase: KB, history: HISTORY, message: 'Hi', facts: await facts(),
      profile: { full_name: null, delivery_address: null }, orderContext: '(none on file)',
    });
    expect(sent).toHaveLength(1);
  });
});

// The outage the ceiling caused, and the diagnosis of it.
//
// Nothing here asserts the assistant recovers — it cannot, the model
// really did send no words. What it asserts is that the failure says what
// it was, because from the caller's side every version of this looked
// like one indistinguishable "AI onboarding failed" line in the logs
// while the scripted questionnaire talked to customers for a day.
describe('when thinking spends the whole ceiling', () => {
  it('says so, rather than reporting an unexplained empty reply', async () => {
    const { chatReply } = await import('../../utils/waAi.js');
    spendsCeilingThinking = true;
    await expect(chatReply({
      knowledgeBase: KB, history: HISTORY, message: 'Is there an offer?',
      orderContext: ORDERS, facts: await facts(),
    })).rejects.toThrow(/tokens before writing a reply.*thinking/s);
  });

  it('reports the spend from the self-test instead of a bare green tick', async () => {
    const { aiSelfTest } = await import('../../utils/waAi.js');
    // A one-word health check passes at any ceiling — it barely thinks —
    // which is exactly why it stayed green through the outage. The
    // numbers are what makes the headroom visible to an operator.
    const health = await aiSelfTest();
    expect(health.ok).toBe(true);
    expect(health.maxTokens).toBeGreaterThanOrEqual(4096);
    expect(health.thinkingTokens).toBeTypeOf('number');
  });
});

describe('the summariser', () => {
  it('completes end to end', async () => {
    const { summarizeConversation } = await import('../../utils/waAi.js');
    const note = await summarizeConversation({ previous: null, history: HISTORY });
    expect(typeof note).toBe('string');
    expect(sent[0].messages[0].role).toBe('user');
  });
});
