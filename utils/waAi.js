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
// consulted. When unsure (or the customer wants a human) it returns
// HANDOFF and the message just lands in the operator inbox, which is
// exactly the pre-AI behavior. Every failure mode degrades to that.
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

export const HANDOFF = 'HANDOFF';

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
 * @returns {Promise<{reply: string|null, full_name: string|null, delivery_address: string|null, mpesa_number: string|null}>}
 */
export async function onboardingTurn({ knowledgeBase, history, message, profile }) {
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
    `them); "reply" is your next message to the customer.\n` +
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
  const reply = str(parsed?.reply, 1200);
  return {
    reply: reply && !reply.toUpperCase().includes(HANDOFF) ? reply : null,
    full_name: str(parsed?.full_name, 120),
    delivery_address: str(parsed?.delivery_address, 400),
    mpesa_number: str(parsed?.mpesa_number, 40),
  };
}
