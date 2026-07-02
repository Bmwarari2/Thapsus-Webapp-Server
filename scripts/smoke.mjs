#!/usr/bin/env node
// scripts/smoke.mjs — deployed-environment smoke test for the credentialed
// surfaces that local/CI testing can only verify "fails gracefully":
// Gmail sending, Supabase Storage signed uploads, Supabase realtime tokens,
// Web Push (VAPID), Stripe, M-Pesa method flags, and the account-deletion
// export pipeline (SUPABASE_SERVICE_KEY).
//
// The 2026-07 functionality audit proved every route group works against a
// prod-mirror database; this script closes the remaining gap by exercising
// the external integrations on a REAL deployment (staging preferred).
//
// Usage:
//   SMOKE_BASE_URL=https://staging.thapsus.uk \
//   SMOKE_ADMIN_EMAIL=... SMOKE_ADMIN_PASSWORD=... \
//   [SMOKE_CUSTOMER_EMAIL=... SMOKE_CUSTOMER_PASSWORD=...] \
//   [SMOKE_EMAIL_TO=inbox-you-can-check@example.com] \
//   [SMOKE_ALLOW_WRITES=true] \
//   node scripts/smoke.mjs
//
// Modes:
//   read-only (default) — logins + configuration probes only. Safe anywhere.
//   SMOKE_ALLOW_WRITES=true — additionally: sends a real test email, mints
//     signed upload URLs and PUTs a probe byte to storage, subscribes/
//     unsubscribes a dummy push endpoint, and (customer creds required)
//     runs the account-deletion export + immediate cancel. Creates real
//     rows/objects — run against STAGING, or accept the noise on prod.
//
// Never pass server-side secrets (Gmail/Stripe/Supabase keys) to this
// script — they live on the deployment; this script only proves they work.

const BASE = process.env.SMOKE_BASE_URL?.replace(/\/$/, '');
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;
const CUSTOMER_EMAIL = process.env.SMOKE_CUSTOMER_EMAIL;
const CUSTOMER_PASSWORD = process.env.SMOKE_CUSTOMER_PASSWORD;
const EMAIL_TO = process.env.SMOKE_EMAIL_TO || ADMIN_EMAIL;
const ALLOW_WRITES = process.env.SMOKE_ALLOW_WRITES === 'true';

if (!BASE) { console.error('✗ SMOKE_BASE_URL is required'); process.exit(2); }

const results = [];
function record(status, name, detail = '') {
  results.push({ status, name, detail });
  const icon = { PASS: '✓', FAIL: '✗', SKIP: '·', WARN: '⚠' }[status];
  console.log(`${icon} ${status.padEnd(4)} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(method, path, { token, body, raw } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* xml/csv/html fine */ }
  return { status: res.status, json, text: raw ? text : undefined };
}

async function login(email, password, label) {
  const r = await call('POST', '/api/auth/login', { body: { email, password } });
  if (r.status === 200 && r.json?.token) { record('PASS', `${label} login`); return r.json.token; }
  record('FAIL', `${label} login`, `HTTP ${r.status}: ${r.json?.message || ''}`);
  return null;
}

// PUT a probe byte to a Supabase signed upload URL. createSignedUploadUrl
// URLs accept a plain PUT with the object bytes.
async function putToSignedUrl(signedUrl) {
  const res = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' },
    body: new Uint8Array([0x73, 0x6d, 0x6f, 0x6b, 0x65]), // "smoke"
  });
  return res.status;
}

async function main() {
  console.log(`Smoke test → ${BASE}  (${ALLOW_WRITES ? 'WRITES ENABLED' : 'read-only'})\n`);

  // ── Public configuration probes ───────────────────────────────────────────
  {
    const r = await call('GET', '/api/app-config');
    record(r.status === 200 ? 'PASS' : 'FAIL', 'app-config reachable', `HTTP ${r.status}`);
  }
  {
    const r = await call('GET', '/api/exchange/rates');
    const ok = r.status === 200 && (r.json?.rates || r.json?.success);
    record(ok ? 'PASS' : 'FAIL', 'exchange rates served', `HTTP ${r.status}`);
  }
  {
    const r = await call('GET', '/api/payments/methods');
    const m = r.json?.methods || r.json || {};
    const stripeOn = m.stripe?.enabled, mpesaOn = m.mpesa?.enabled;
    record(r.status === 200 ? 'PASS' : 'FAIL', 'payment method matrix',
      `stripe=${stripeOn ?? '?'} mpesa=${mpesaOn ?? '?'}`);
    if (stripeOn === false) record('WARN', 'stripe disabled by flags/config');
    if (mpesaOn === false) record('WARN', 'mpesa disabled by flags/config');
  }
  {
    const r = await call('GET', '/api/payments/config/stripe');
    const key = r.json?.publishable_key || r.json?.publishableKey;
    record(key ? 'PASS' : 'WARN', 'stripe publishable key exposed', key ? key.slice(0, 12) + '…' : `HTTP ${r.status} — card payments unavailable`);
  }
  {
    const r = await call('GET', '/api/push/public-key');
    const key = r.json?.publicKey;
    record(key && r.json?.enabled !== false ? 'PASS' : 'WARN', 'web push VAPID key',
      key ? 'configured' : `HTTP ${r.status} — push disabled`);
  }
  for (const p of ['/sitemap.xml', '/robots.txt']) {
    const r = await call('GET', p, { raw: true });
    record(r.status === 200 ? 'PASS' : 'FAIL', `public ${p}`, `HTTP ${r.status}`);
  }

  // ── Admin-token checks ────────────────────────────────────────────────────
  let admin = null;
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD, 'admin');
  } else {
    record('SKIP', 'admin checks', 'SMOKE_ADMIN_EMAIL/PASSWORD not set');
  }

  if (admin) {
    {
      const r = await call('GET', '/api/admin/email-config', { token: admin });
      const cfg = r.json || {};
      record(cfg.configured ? 'PASS' : 'FAIL', 'Gmail env configured on server',
        cfg.configured ? `sender: ${cfg.sender_email}` :
        `has_client_id=${cfg.has_client_id} has_client_secret=${cfg.has_client_secret} has_refresh_token=${cfg.has_refresh_token}`);
    }
    {
      const r = await call('POST', '/api/auth/supabase-token', { token: admin });
      record(r.status === 200 ? 'PASS' : r.status === 503 ? 'FAIL' : 'FAIL',
        'Supabase realtime token mint (SUPABASE_JWT_SECRET)', `HTTP ${r.status}`);
    }

    if (ALLOW_WRITES) {
      {
        const r = await call('POST', '/api/admin/test-email', { token: admin, body: { to: EMAIL_TO } });
        record(r.status === 200 ? 'PASS' : 'FAIL', `Gmail SEND (test email → ${EMAIL_TO})`,
          r.json?.message || `HTTP ${r.status}`);
      }
      // One signed-upload mint + real PUT per bucket. requireRole has an
      // admin bypass, so the admin token can mint all four kinds.
      const uploadKinds = [
        ['ticket attachments', 'POST', '/api/tickets/attachments/upload-url', { filename: 'smoke.bin' }],
        ['parcel intake photos', 'POST', '/api/parcels/upload-url', { filename: 'smoke.jpg', content_type: 'image/jpeg' }],
        ['POD photos', 'POST', '/api/last-mile/pod/upload-url', { filename: 'smoke.jpg', content_type: 'image/jpeg', kind: 'photo' }],
        ['agent invoices', 'POST', '/api/agent-invoices/upload-url', { filename: 'smoke.pdf', content_type: 'application/pdf' }],
      ];
      for (const [label, method, path, body] of uploadKinds) {
        const r = await call(method, path, { token: admin, body });
        const signed = r.json?.signed_url || r.json?.signedUrl || r.json?.upload_url;
        if (!signed) {
          record('FAIL', `storage upload-url: ${label}`, `HTTP ${r.status}: ${r.json?.message || ''}`);
          continue;
        }
        const putStatus = await putToSignedUrl(signed);
        record(putStatus < 300 ? 'PASS' : 'FAIL', `storage PUT: ${label}`, `PUT HTTP ${putStatus}`);
      }
    } else {
      record('SKIP', 'Gmail send + storage uploads', 'set SMOKE_ALLOW_WRITES=true');
    }
  }

  // ── Customer-token checks ─────────────────────────────────────────────────
  let customer = null;
  if (CUSTOMER_EMAIL && CUSTOMER_PASSWORD) {
    customer = await login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD, 'customer');
  } else {
    record('SKIP', 'customer checks', 'SMOKE_CUSTOMER_EMAIL/PASSWORD not set');
  }

  if (customer) {
    {
      const r = await call('GET', '/api/auth/me', { token: customer });
      record(r.status === 200 ? 'PASS' : 'FAIL', 'customer /me', `HTTP ${r.status}`);
    }
    if (ALLOW_WRITES) {
      {
        const ep = `https://smoke.invalid/${Date.now()}`;
        const sub = await call('POST', '/api/push/subscribe', {
          token: customer, body: { endpoint: ep, keys: { p256dh: 'smoke', auth: 'smoke' } },
        });
        const unsub = await call('POST', '/api/push/unsubscribe', { token: customer, body: { endpoint: ep } });
        record(sub.status < 300 && unsub.status < 300 ? 'PASS' : 'FAIL',
          'push subscribe/unsubscribe roundtrip', `sub ${sub.status} / unsub ${unsub.status}`);
      }
      {
        // Account-deletion export exercises SUPABASE_SERVICE_KEY (data export
        // to storage + signed URL) end-to-end. Cancelled immediately — the
        // deletion is scheduled days out, so cancel is safe; the export
        // object remains in storage (staging noise).
        const create = await call('POST', '/api/account/deletion-request', {
          token: customer, body: { reason: 'smoke test — cancelled immediately' },
        });
        if (create.status === 201 || create.status === 202 || create.status === 200) {
          const cancel = await call('DELETE', '/api/account/deletion-request', { token: customer });
          record(cancel.status === 200 ? 'PASS' : 'WARN',
            'account-deletion export pipeline (SUPABASE_SERVICE_KEY)',
            `create ${create.status} / cancel ${cancel.status}`);
        } else {
          record('FAIL', 'account-deletion export pipeline (SUPABASE_SERVICE_KEY)',
            `HTTP ${create.status}: ${create.json?.message || ''}`);
        }
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const fails = results.filter((r) => r.status === 'FAIL');
  const warns = results.filter((r) => r.status === 'WARN');
  console.log(`\n${results.length} checks: ${results.filter((r) => r.status === 'PASS').length} pass, ${fails.length} fail, ${warns.length} warn, ${results.filter((r) => r.status === 'SKIP').length} skipped`);
  if (fails.length) process.exitCode = 1;
}

main().catch((e) => { console.error('SMOKE CRASH:', e); process.exit(2); });
