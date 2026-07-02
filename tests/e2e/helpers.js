import pg from 'pg';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

// Shared helpers for the browser e2e suite. The specs need a handful of
// DB reads/writes that production performs out-of-band (clicking the link
// in a real email, an owner granting the finance flag in the DB console).

const DB = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL;
let pool;
export function db() {
  if (!pool) pool = new pg.Pool({ connectionString: DB, max: 2 });
  return pool;
}

// All spec files share one worker process, so an afterAll that ends the
// pool would poison the next file ("Cannot use a pool after calling end").
// closeDb() nulls the handle so the next db() call mints a fresh pool.
export async function closeDb() {
  const p = pool;
  pool = null;
  if (p) await p.end();
}

// Tokens are hash-at-rest only (migration 0001) — the plaintext exists
// solely in the email. Stand in for the mailbox by minting a token whose
// hash we insert ourselves; /verify-email consumes every pending token for
// the user, so the register-issued row is cleaned up alongside ours.
export async function verificationTokenFor(email) {
  const plaintext = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(plaintext).digest();
  const { rows } = await db().query(`SELECT id FROM users WHERE email = $1`, [email.toLowerCase()]);
  if (!rows[0]) return null;
  await db().query(
    `INSERT INTO email_verification_tokens (id, user_id, token_sha256, expires_at)
     VALUES ($1, $2, $3, NOW() + interval '1 hour')`,
    [randomUUID(), rows[0].id, hash]
  );
  return plaintext;
}

export async function grantFinance(email) {
  await db().query(`UPDATE users SET can_manage_finances = true WHERE email = $1`, [email.toLowerCase()]);
}

export async function deleteUser(email) {
  await db().query(`DELETE FROM users WHERE email = $1`, [email.toLowerCase()]);
}

export async function login(page, email, password) {
  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}
