import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The client must listen for every event the server can send.
//
// EventSource has no wildcard. A named event with no addEventListener is
// delivered to the browser and dropped in silence — no error, no warning,
// nothing in the console. That is exactly what happened to the WhatsApp
// rebuild: the server pushed wa_inbox_update, wa_pipeline_update and
// wa_new_customer from day one, the hooks subscribed to them correctly,
// and the bridge between the two was never built. The operator inbox sat
// there needing a manual refresh for weeks.
//
// Reading the source rather than importing it keeps this a plain string
// check with no JSX/browser globals to stand up.

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Event names the server broadcasts, from every pushTo* call site. */
function serverEvents() {
  const found = new Set();
  for (const dir of ['routes', 'utils']) {
    for (const file of fs.readdirSync(path.join(ROOT, dir))) {
      if (!file.endsWith('.js')) continue;
      const src = fs.readFileSync(path.join(ROOT, dir, file), 'utf8');
      for (const m of src.matchAll(/push(?:ToStaff|ToUser|ToAdmins|ToAll)\(\s*'([a-z_]+)'/g)) {
        found.add(m[1]);
      }
    }
  }
  return found;
}

/** Event names the client registers a listener for. */
function clientEvents() {
  const src = fs.readFileSync(
    path.join(ROOT, 'client', 'src', 'hooks', 'useRealtimeUpdates.js'), 'utf8');
  const block = /export const SSE_EVENTS = \[([\s\S]*?)\];/.exec(src);
  expect(block, 'SSE_EVENTS not found in useRealtimeUpdates.js').toBeTruthy();
  return new Set([...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
}

describe('SSE event coverage', () => {
  it('the client listens for every event the server sends', () => {
    const missing = [...serverEvents()].filter((e) => !clientEvents().has(e));
    expect(missing, `server sends these but the client ignores them: ${missing.join(', ')}`)
      .toEqual([]);
  });

  it('covers the WhatsApp dashboard events by name', () => {
    // Named explicitly so a refactor that stops the grep from matching
    // cannot quietly turn the check above into a no-op.
    const client = clientEvents();
    for (const e of ['wa_inbox_update', 'wa_pipeline_update', 'wa_new_customer']) {
      expect(client.has(e), `${e} is not registered on the client`).toBe(true);
    }
  });

  it('finds the server call sites at all', () => {
    // Guards the grep itself: if pushToStaff is renamed, the first test
    // would pass against an empty set and prove nothing.
    expect(serverEvents().size).toBeGreaterThanOrEqual(3);
  });
});
