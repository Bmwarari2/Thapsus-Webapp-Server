// utils/waAi.js
//
// Gemini-backed conversational layer for the WhatsApp flow (Google AI
// Studio API key). Deliberately scoped to the two places language
// understanding helps and nothing else:
//
//   1. Onboarding extraction — interpret the customer's reply when we
//      asked for name / address / M-Pesa number, so "hi" or "how does
//      this work?" gets a sensible answer instead of being stored as
//      their name.
//   2. Fall-through chat — messages the state machine has nothing for
//      (general questions) get an answer from the operator-maintained
//      knowledge base instead of sitting unanswered in the inbox.
//
// Hard guardrails, enforced by prompt AND by where this is called from:
// the model never quotes prices, never confirms orders or payments, and
// never advances the pipeline — those paths run before the AI is ever
// consulted. When unsure (or the customer wants a human) it returns
// HANDOFF and the message just lands in the operator inbox, which is
// exactly the pre-AI behavior. Every failure mode degrades to that.
//
// Config: GEMINI_API_KEY (Google AI Studio), optional GEMINI_MODEL
// (default gemini-2.5-flash). The on/off switch + knowledge base live in
// wa_settings so operators control them from /ops/settings at runtime.

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 15_000;

export const HANDOFF = 'HANDOFF';

export function aiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function modelName() {
  return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
}

async function generate({ system, contents, json = false, schema = null }) {
  const url = `${BASE}/models/${modelName()}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
      ...(json ? { responseMimeType: 'application/json' } : {}),
      ...(json && schema ? { responseSchema: schema } : {}),
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error('Gemini returned no text');
  return text.trim();
}

const GUARDRAILS = `
STRICT RULES you must never break:
- NEVER state, estimate, or negotiate prices, quotes, exchange rates, or fees. If asked about cost, explain that they should send the product link and the team will reply with an exact KES quote.
- NEVER confirm orders, confirm payments, promise delivery dates, or claim an action was taken.
- NEVER ask for card numbers, PINs, or passwords.
- Only state facts found in the KNOWLEDGE BASE. If the answer is not there, or you are unsure, or the customer asks for a human, is upset, or has a complaint — respond with exactly: ${HANDOFF}
- Keep replies short (1–3 sentences), warm, and clear. A little Swahili (karibu, asante) is welcome. Plain text only — no markdown, no lists with newlines.`;

/**
 * Answer a general customer message from the knowledge base.
 * @param {object} p
 * @param {string} p.knowledgeBase  operator-maintained facts
 * @param {Array<{direction: 'in'|'out', body: string}>} p.history  recent transcript, oldest first
 * @param {string} p.message  the new inbound text
 * @returns {Promise<string|null>} reply text, or null when the model handed off
 */
export async function chatReply({ knowledgeBase, history, message }) {
  const system =
    `You are the WhatsApp assistant for Thapsus Cargo, a Kenyan service that buys items ` +
    `from online stores abroad and delivers them to customers' doors in Kenya. Customers ` +
    `send product links, receive a KES quote from the team, pay via M-Pesa, and track ` +
    `parcels by texting their tracking code.\n\nKNOWLEDGE BASE:\n${knowledgeBase || '(empty)'}\n${GUARDRAILS}`;

  const contents = [
    ...history.slice(-10).map((m) => ({
      role: m.direction === 'in' ? 'user' : 'model',
      parts: [{ text: String(m.body || '').slice(0, 1000) }],
    })),
    { role: 'user', parts: [{ text: String(message).slice(0, 2000) }] },
  ];

  const text = await generate({ system, contents });
  if (!text || text.toUpperCase().includes(HANDOFF)) return null;
  return text.slice(0, 1200);
}

const FIELD_PROMPTS = {
  full_name: 'their FULL NAME (as it should be written on parcels)',
  delivery_address: 'their DELIVERY ADDRESS in Kenya (estate/building, street, town)',
  mpesa_number: 'the M-PESA PHONE NUMBER they will pay with (a Kenyan mobile number)',
};

/**
 * Interpret an onboarding reply: did the customer answer the question we
 * asked, or say something else?
 *
 * @returns {Promise<{value: string|null, reply: string|null}>}
 *   value — the extracted field when the message contains it, else null
 *   reply — when value is null, a short response to send (answers their
 *           question from the knowledge base, then re-asks for the field)
 */
export async function extractOnboardingField({ field, message, knowledgeBase }) {
  const what = FIELD_PROMPTS[field] || field;
  const system =
    `You are the WhatsApp onboarding assistant for Thapsus Cargo (a Kenyan buy-and-ship ` +
    `service). We just asked the customer for ${what}.\n` +
    `Decide whether their message provides it.\n` +
    `- If YES: set "value" to the cleanly extracted answer (nothing else) and "reply" to null.\n` +
    `- If NO (greeting, question, anything else): set "value" to null and write a short ` +
    `"reply" that responds helpfully (using the knowledge base below when relevant) and ` +
    `ends by asking again for ${what}. One newline-free sentence or two.\n` +
    `KNOWLEDGE BASE:\n${knowledgeBase || '(empty)'}\n${GUARDRAILS}`;

  const text = await generate({
    system,
    json: true,
    schema: {
      type: 'object',
      properties: {
        value: { type: 'string', nullable: true },
        reply: { type: 'string', nullable: true },
      },
    },
    contents: [{ role: 'user', parts: [{ text: String(message).slice(0, 1000) }] }],
  });

  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('Gemini returned invalid JSON'); }
  const value = typeof parsed?.value === 'string' && parsed.value.trim() ? parsed.value.trim() : null;
  const reply = typeof parsed?.reply === 'string' && parsed.reply.trim()
    ? parsed.reply.trim().slice(0, 600) : null;
  return { value, reply };
}
