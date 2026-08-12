import pg from 'pg';

// Shared helpers for the browser e2e suite: a pool for the specs that
// need to read or plant rows, and the sign-in most of them start with.

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

export async function login(page, email, password) {
  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}
