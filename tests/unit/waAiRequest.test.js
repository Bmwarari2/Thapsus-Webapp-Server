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

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      sent.push(parsed);
      const wantsJson = Boolean(parsed.output_config?.format);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5',
        content: [{ type: 'text', text: wantsJson
          ? JSON.stringify({ reply: 'Karibu! What name should the parcel carry?',
              full_name: null, delivery_address: null, delivery_preference: null })
          : 'Yes, we deliver to Nakuru. Delivery is KSh 300, or free collection at our CBD office.' }],
        stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 },
      }));
    });
  });
  await new Promise((r) => server.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key';
});

afterAll(() => server?.close());
beforeEach(() => { sent = []; });

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
    expect(sent[0].max_tokens).toBe(1024);
    expect(sent[0].output_config.effort).toBe('low');
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
});

describe('the summariser', () => {
  it('completes end to end', async () => {
    const { summarizeConversation } = await import('../../utils/waAi.js');
    const note = await summarizeConversation({ previous: null, history: HISTORY });
    expect(typeof note).toBe('string');
    expect(sent[0].messages[0].role).toBe('user');
  });
});
