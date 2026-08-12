#!/usr/bin/env node
// scripts/register-sentdm-webhook.mjs
//
// One-shot: register (or list) the sent.dm webhook that feeds
// POST /api/wa/webhook. Prints the signing secret — set it as
// SENTDM_WEBHOOK_SECRET on Railway (it is shown ONLY at create/rotate).
//
// Usage:
//   SENTDM_API_KEY=sk_live_… node scripts/register-sentdm-webhook.mjs https://www.thapsus.uk
//   SENTDM_API_KEY=sk_live_… node scripts/register-sentdm-webhook.mjs --list

const API = process.env.SENTDM_BASE_URL?.replace(/\/+$/, '') || 'https://api.sent.dm';
const KEY = process.env.SENTDM_API_KEY;

if (!KEY) {
  console.error('Set SENTDM_API_KEY (sk_live_* / sk_test_*) in the environment.');
  process.exit(1);
}

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'x-api-key': KEY,
      'Accept': 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) {
    console.error(`sent.dm ${method} ${path} → HTTP ${res.status}`);
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }
  return json?.data ?? json;
}

const arg = process.argv[2];

if (arg === '--list') {
  const data = await call('GET', '/v3/webhooks?page=1&page_size=20');
  for (const w of data?.webhooks ?? []) {
    console.log(`${w.id}  active=${w.is_active}  ${w.endpoint_url}  events=${(w.event_types || []).join(',')}`);
  }
  if (!(data?.webhooks ?? []).length) console.log('(no webhooks registered)');
  process.exit(0);
}

const base = (arg || '').replace(/\/+$/, '');
if (!/^https:\/\//.test(base)) {
  console.error('Usage: node scripts/register-sentdm-webhook.mjs https://<your-domain>   (or --list)');
  process.exit(1);
}

const endpoint = `${base}/api/wa/webhook`;
console.log(`Registering sent.dm webhook → ${endpoint}`);
const created = await call('POST', '/v3/webhooks', {
  display_name: 'Thapsus Cargo — WhatsApp flow',
  endpoint_url: endpoint,
  event_types: ['message'],
});
console.log(`\nWebhook id: ${created?.id}`);
if (created?.signing_secret) {
  console.log(`\nSigning secret (set as SENTDM_WEBHOOK_SECRET on Railway — shown only once):\n\n  ${created.signing_secret}\n`);
} else {
  console.log('\nNo signing_secret in the response — rotate it to obtain one:');
  console.log(`  POST ${API}/v3/webhooks/${created?.id}/rotate-secret`);
}
