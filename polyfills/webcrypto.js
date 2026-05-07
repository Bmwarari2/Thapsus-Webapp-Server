// polyfills/webcrypto.js
//
// Ensure `globalThis.crypto` is the Web Crypto API on every Node version
// the deploy can land on. Node 19+ exposes it as a real global; on Node
// 18 it lives behind `--experimental-global-webcrypto`, and on Node <18
// it's absent entirely. Several libraries we depend on read the bare
// `crypto` identifier (which resolves through `globalThis`) without
// falling back:
//
//   • `uuid@14`'s `v4()` calls `crypto.randomUUID()` — the source of the
//     `Create order error: ReferenceError: crypto is not defined` line
//     in Railway logs after the supabase-js bump.
//   • `@supabase/realtime-js` and parts of `@supabase/supabase-js`
//     similarly assume the Web Crypto global.
//   • `errorLogger.js` writes log ids via `crypto.randomUUID()`.
//
// We pin Node 22 in `engines.node` (PR #105) but Railway sometimes
// caches build images, contributors run older Node locally, and
// container-runtime drift has bitten us once already with the
// supabase-js / ws regression. This polyfill is the runtime safety
// net so a cold deploy on Node 18/20 stops being a customer-visible
// outage on order creation, sign-in, etc.
//
// Loaded as the FIRST import in `server.js` so any subsequent module
// reading `globalThis.crypto` at top-level finds it populated. The
// `node:crypto.webcrypto` export has been available since Node 15, so
// this works on every realistic deploy target.
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  // Don't `Object.defineProperty` with `writable: false` — Node may
  // promote its own implementation later in the boot sequence (e.g.
  // when a worker thread starts), and a frozen global would throw on
  // re-assignment. Plain assignment is enough; once Node populates the
  // global natively it's idempotent.
  globalThis.crypto = webcrypto;
}
