// utils/waAi.js
//
// Gemini-backed conversational layer for the WhatsApp flow (Google AI
// Studio API key). Deliberately scoped to the two places language
// understanding helps and nothing else:
//
//   1. AI-first onboarding (onboardingTurn) — from the customer's very
//      first message, the model runs the conversation: welcomes,
//      explains the service, answers questions, and gathers the three
//      profile fields in whatever order the chat flows. The state
//      machine keeps validation, state, and Customer Code minting.
//   2. Fall-through chat (chatReply) — active-contact messages the state
//      machine has nothing for (general questions) get an answer from
//      the operator-maintained knowledge base instead of sitting
//      unanswered in the inbox.
//
// Hard guardrails, enforced by prompt AND by where this is called from:
// the model never quotes prices, never confirms orders or payments, and
// never advances the pipeline — those paths run before the AI is ever
// consulted. When a person is needed it returns HANDOFF, and when the
// message has nothing to do with this business it returns OFF_TOPIC —
// two different outcomes, because paging an operator for every wrong
// number is as bad as answering one. Every failure mode degrades to
// HANDOFF, which is the pre-AI behavior.
//
// Config: GEMINI_API_KEY (Google AI Studio). GEMINI_MODEL optionally
// pins a model; when unset the model is DISCOVERED from the API (see
// resolveModel) rather than hardcoded — Google retires model names on a
// rolling basis and a stale default takes the assistant down with
// "model is no longer available to new users" (this happened in
// production with gemini-2.5-flash). The on/off switch + knowledge base
// live in wa_settings so operators control them from /ops/settings.

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 15_000;
const MODEL_CACHE_MS = 6 * 60 * 60 * 1000; // re-discover a few times a day

// Sentinels the model returns instead of prose. They mean different
// things and must not be conflated: HANDOFF is "a person is needed
// here", OFF_TOPIC is "this has nothing to do with us". Escalating the
// second would page an operator for every wrong number and joke.
export const HANDOFF = 'HANDOFF';
export const OFF_TOPIC = 'OFF_TOPIC';

/**
 * Classify raw model output into a reply or one of the sentinels.
 * Callers get a tagged object rather than a bare string so a sentinel
 * can never be mistaken for a message and sent to a customer.
 *
 * @param {string|null} text
 * @returns {{kind: 'reply'|'handoff'|'off_topic', text: string|null}}
 */
export function classifyReply(text) {
  if (!text) return { kind: 'handoff', text: null };
  const upper = text.toUpperCase();
  if (upper.includes(OFF_TOPIC)) return { kind: 'off_topic', text: null };
  if (upper.includes(HANDOFF)) return { kind: 'handoff', text: null };
  return { kind: 'reply', text: text.slice(0, 1200) };
}

export function aiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

let _model = null;      // { name, at }

/**
 * Rank the models the key can actually use. Prefers, in order: the
 * "flash" tier (fast + cheap, ample for short WhatsApp replies), higher
 * version numbers, and stable releases over preview/experimental builds.
 */
export function scoreModel(m) {
  const name = String(m?.name || '').replace(/^models\//, '');
  const methods = m?.supportedGenerationMethods || m?.supported_generation_methods || [];
  if (!name.startsWith('gemini')) return -1;
  if (!methods.includes('generateContent')) return -1;
  // Non-chat / specialist endpoints.
  if (/embedding|aqa|imagen|veo|tts|audio|image-generation|native-audio|live/.test(name)) return -1;

  const version = parseFloat((name.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || '0');
  let score = version * 100;
  if (/flash/.test(name)) score += 50;          // right tier for this workload
  if (/lite/.test(name)) score -= 10;           // cheaper still, slightly weaker
  if (/pro/.test(name)) score += 10;            // usable, pricier
  if (/preview|exp|experimental/.test(name)) score -= 40;
  if (/\d{2}-\d{2}$/.test(name)) score -= 5;    // dated snapshot; prefer the rolling alias
  return score;
}

/** @returns {Promise<string>} a model name this API key can call today. */
async function resolveModel({ force = false } = {}) {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  if (!force && _model && Date.now() - _model.at < MODEL_CACHE_MS) return _model.name;

  const res = await fetch(`${BASE}/models?key=${process.env.GEMINI_API_KEY}&pageSize=200`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini ListModels HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const ranked = (data?.models || [])
    .map((m) => ({ name: String(m.name || '').replace(/^models\//, ''), score: scoreModel(m) }))
    .filter((m) => m.score >= 0)
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) throw new Error('Gemini ListModels returned no usable chat model');

  _model = { name: ranked[0].name, at: Date.now() };
  console.info(`[waAi] using Gemini model "${_model.name}" (${ranked.length} candidates)`);
  return _model.name;
}

async function callModel(model, body) {
  const res = await fetch(`${BASE}/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function generate({ system, contents, json = false, schema = null }) {
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

  let data;
  try {
    data = await callModel(await resolveModel(), body);
  } catch (e) {
    // A retired/unknown model 404s — re-discover once and retry, so a
    // Google model retirement self-heals instead of paging anyone.
    if (e.status !== 404 || process.env.GEMINI_MODEL) throw e;
    console.warn('[waAi] model 404 — re-resolving:', e.message);
    data = await callModel(await resolveModel({ force: true }), body);
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error('Gemini returned no text');
  return text.trim();
}

/**
 * Diagnostics for /ops/settings: which model resolved, and does a real
 * round-trip succeed? Never throws.
 */
export async function aiSelfTest() {
  if (!aiConfigured()) return { ok: false, configured: false, error: 'GEMINI_API_KEY is not set on the server' };
  try {
    const model = await resolveModel({ force: true });
    const text = await generate({
      system: 'You are a health check. Reply with the single word OK.',
      contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
    });
    return { ok: true, configured: true, model, sample: text.slice(0, 60) };
  } catch (e) {
    return { ok: false, configured: true, model: _model?.name || null, error: e.message };
  }
}

const GUARDRAILS = `
STRICT RULES you must never break:
- NEVER state, estimate, or negotiate prices, quotes, exchange rates, or fees. If asked about cost, explain that they should send the product link and the team will reply with an exact KES quote.
- NEVER confirm orders, confirm payments, promise delivery dates, or claim an action was taken.
- NEVER ask for card numbers, PINs, or passwords.
- Only state facts found in the KNOWLEDGE BASE or in THIS CUSTOMER'S ORDERS.
- You MAY tell the customer the status, tracking code, dates and agreed total of the orders listed under THIS CUSTOMER'S ORDERS — that is live data from our system. NEVER invent an order, code, date or status.
- Reply with exactly ${HANDOFF} — nothing else — when a PERSON is needed: the customer asks for a human, is upset, is complaining, wants a refund or a cancellation, or asks something about our service or their order that you cannot answer from the knowledge base or the order list above. This reaches an operator, so use it whenever their question is genuinely ours to answer.
- Reply with exactly ${OFF_TOPIC} — nothing else — when the message has NOTHING to do with Thapsus Cargo, shopping, shipping or their orders: general-knowledge questions, news, sport, politics, medical or legal advice, maths, requests to write or translate something, jokes, chit-chat past a greeting, or an obvious wrong number. Do NOT answer these and do NOT escalate them — ${OFF_TOPIC} is not a failure, it is the correct answer.
- When you are torn between the two, choose ${HANDOFF}: a person can always redirect someone, but nobody sees an ${OFF_TOPIC}.
- Keep replies short (1–3 sentences), warm, and clear. A little Swahili (karibu, asante) is welcome. Plain text only — no markdown, no lists with newlines.
- NEVER use emojis. Thapsus Cargo writes plainly and professionally.`;

/**
 * Answer a general customer message from the knowledge base.
 * @param {object} p
 * @param {string} p.knowledgeBase  operator-maintained facts
 * @param {Array<{direction: 'in'|'out', body: string}>} p.history  recent transcript, oldest first
 * @param {string} p.message  the new inbound text
 * @param {string} [p.orderContext]  pre-formatted summary of this customer's
 *   orders (statuses, codes, dates) so "where is my parcel?" can be answered
 *   without an exact tracking code
 * @returns {Promise<{kind: 'reply'|'handoff'|'off_topic', text: string|null}>}
 */
export async function chatReply({ knowledgeBase, history, message, orderContext, profile, summary }) {
  const system =
    `You are the WhatsApp assistant for Thapsus Cargo, a Kenyan service that buys items ` +
    `from online stores abroad and delivers them to customers' doors in Kenya. Customers ` +
    `send product links, receive a KES quote from the team, pay via M-Pesa, and track ` +
    `parcels by texting their tracking code.\n\n` +
    `WHO YOU ARE TALKING TO:\n${profile || '(unknown)'}\n\n` +
    `WHAT YOU KNOW ABOUT THEM FROM EARLIER CONVERSATIONS:\n${summary || '(nothing recorded yet)'}\n\n` +
    `THIS CUSTOMER'S ORDERS (live from our system):\n${orderContext || '(none on file)'}\n\n` +
    `KNOWLEDGE BASE:\n${knowledgeBase || '(empty)'}\n${GUARDRAILS}`;

  const contents = [
    ...history.slice(-10).map((m) => ({
      role: m.direction === 'in' ? 'user' : 'model',
      parts: [{ text: String(m.body || '').slice(0, 1000) }],
    })),
    { role: 'user', parts: [{ text: String(message).slice(0, 2000) }] },
  ];

  return classifyReply(await generate({ system, contents }));
}

/**
 * Drive a whole onboarding turn conversationally (AI-first mode): the
 * model greets, explains the service, answers questions from the
 * knowledge base, and gathers the three profile fields in whatever order
 * the conversation flows — extracting any it finds in this message.
 * The caller stays in charge of validation, state, and code minting.
 *
 * @param {object} p
 * @param {string} p.knowledgeBase
 * @param {Array<{direction: 'in'|'out', body: string}>} p.history  oldest first
 * @param {string} p.message      the new inbound text
 * @param {{full_name: string|null, delivery_address: string|null, mpesa_number: string|null}} p.profile
 * @returns {Promise<{kind: 'reply'|'handoff'|'off_topic', reply: string|null, full_name: string|null, delivery_address: string|null, mpesa_number: string|null}>}
 */
export async function onboardingTurn({ knowledgeBase, history, message, profile, orderContext }) {
  const missing = [];
  if (!profile.full_name) missing.push('full name (as written on parcels)');
  if (!profile.delivery_address) missing.push('delivery address in Kenya (estate/building, street, town)');
  if (!profile.mpesa_number) missing.push('M-Pesa phone number they will pay with');

  const system =
    `You are the WhatsApp assistant for Thapsus Cargo, a Kenyan service that buys items ` +
    `from online stores abroad and delivers them to customers' doors in Kenya. Customers ` +
    `send product links, get a KES quote from the team, pay via M-Pesa, and track parcels ` +
    `by texting their tracking code.\n\n` +
    `You are onboarding a NEW customer. Still needed from them: ${missing.join('; ') || 'nothing'}.\n` +
    `- If this is the conversation's start, welcome them warmly and briefly explain how the ` +
    `service works before asking for the first missing detail.\n` +
    `- Ask for ONE missing detail at a time, but extract EVERY detail their message contains ` +
    `(people often give several at once).\n` +
    `- Answer any question they ask (using the knowledge base) before steering back to the ` +
    `next missing detail.\n` +
    `- Put extracted details in the JSON fields (null when this message doesn't contain ` +
    `them); "reply" is your next message to the customer.\n\n` +
    `THIS CUSTOMER'S ORDERS (live from our system):\n${orderContext || '(none on file)'}\n\n` +
    `KNOWLEDGE BASE:\n${knowledgeBase || '(empty)'}\n${GUARDRAILS}`;

  const contents = [
    ...history.slice(-10).map((m) => ({
      role: m.direction === 'in' ? 'user' : 'model',
      parts: [{ text: String(m.body || '').slice(0, 1000) }],
    })),
    { role: 'user', parts: [{ text: String(message).slice(0, 2000) }] },
  ];

  const text = await generate({
    system,
    contents,
    json: true,
    schema: {
      type: 'object',
      properties: {
        reply: { type: 'string' },
        full_name: { type: 'string', nullable: true },
        delivery_address: { type: 'string', nullable: true },
        mpesa_number: { type: 'string', nullable: true },
      },
      required: ['reply'],
    },
  });

  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('Gemini returned invalid JSON'); }
  const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  // Fields the model extracted stand even when the reply itself is a
  // sentinel — someone can give their name and ask an off-topic question
  // in the same breath.
  const { kind, text: reply } = classifyReply(str(parsed?.reply, 1200));
  return {
    kind,
    reply,
    full_name: str(parsed?.full_name, 120),
    delivery_address: str(parsed?.delivery_address, 400),
    mpesa_number: str(parsed?.mpesa_number, 40),
  };
}

/**
 * Distil a conversation into durable memory — the facts worth carrying
 * once the verbatim transcript scrolls out of the prompt window. Called
 * in the background after a reply, never in the customer's critical path.
 *
 * @param {object} p
 * @param {string} [p.previous]  the existing summary to build on
 * @param {Array<{direction: 'in'|'out', body: string}>} p.history  oldest first
 * @returns {Promise<string>} a compact précis (a few lines)
 */
export async function summarizeConversation({ previous, history }) {
  const system =
    `You maintain a short memory note about a Thapsus Cargo customer, for a support ` +
    `assistant that will read it before replying to them in future.\n` +
    `Merge the EXISTING NOTE with anything new in the transcript. Keep only durable, ` +
    `useful facts: what they buy, preferences (delivery method, sizes, stores), ` +
    `constraints, promises we made, complaints raised and whether they were resolved, ` +
    `and anything they asked us to remember.\n` +
    `Do NOT record prices, order statuses or tracking codes — the assistant already ` +
    `receives those live from the system, and stale copies would mislead it.\n` +
    `Reply with the note only: at most 8 short lines, no preamble.\n\n` +
    `EXISTING NOTE:\n${previous || '(none)'}`;

  const transcript = history
    .map((m) => `${m.direction === 'in' ? 'Customer' : 'Us'}: ${String(m.body || '').slice(0, 500)}`)
    .join('\n')
    .slice(0, 12000);

  const text = await generate({
    system,
    contents: [{ role: 'user', parts: [{ text: `TRANSCRIPT:\n${transcript}` }] }],
  });
  return text.slice(0, 2000);
}
