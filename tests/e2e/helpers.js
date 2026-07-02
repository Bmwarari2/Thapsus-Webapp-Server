import pg from 'pg';

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

export async function verificationTokenFor(email) {
  const { rows } = await db().query(
    `SELECT t.token FROM email_verification_tokens t
       JOIN users u ON u.id = t.user_id
      WHERE u.email = $1 AND t.used = false
      ORDER BY t.created_at DESC LIMIT 1`,
    [email.toLowerCase()]
  );
  return rows[0]?.token;
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
