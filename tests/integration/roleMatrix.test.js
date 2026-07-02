import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import app from '../../server.js';
import { initializeDatabase, getPool } from '../../database/init.js';

// Role-enforcement matrix (audit H-1, plan W3.3).
//
// For each role-gated route in the matrix, hit it with every role's
// signed token and assert:
//   - wrong roles: 403
//   - admin: never 403 (admin bypass in requireRole)
//   - the listed role(s): not 403 (the gate let them through)
//
// We intentionally don't assert the exact non-403 status. Some routes
// 500 on our throwaway DB because their downstream queries hit empty
// tables — that's fine for this suite, the role gate already did its
// job by NOT returning 403.
//
// Gated on TEST_DATABASE_URL — the middleware/auth.js checkAuthStatus
// query needs a real users row to confirm is_active and revocation.

const SKIP = !process.env.TEST_DATABASE_URL;

const ROLES = ['customer', 'operator', 'rider', 'clearing_agent', 'admin'];

// Routes we exercise. Keep small + representative — one or two per gate.
// `allow` is the set of roles the route's middleware permits; admin is
// always implicitly added by requireRole's bypass.
const ROUTE_MATRIX = [
  { method: 'get', path: '/api/admin/stats',         allow: ['admin'] },
  { method: 'get', path: '/api/admin/users',         allow: ['admin'] },
  { method: 'get', path: '/api/admin/error-logs',    allow: ['admin'] },
  { method: 'get', path: '/api/agent-invoices/mine', allow: ['clearing_agent', 'admin'] },
  { method: 'get', path: '/api/admin/aml-flags',     allow: ['admin'] },
];

// Per-role test users created in beforeAll.
const USERS = {}; // role → { id, email, token }

function mintToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      warehouse_id: user.warehouse_id,
    },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

beforeAll(async () => {
  if (SKIP) return;
  await initializeDatabase();
  const pool = getPool();

  // Insert one user per role, all with the same hashed password (we don't
  // log them in via /auth/login — we mint JWTs directly so the test is
  // about the role gate, not bcrypt). Unique warehouse_ids to satisfy the
  // schema's UNIQUE constraint.
  const password = bcrypt.hashSync('vitest-role-matrix', 10);
  for (const role of ROLES) {
    const id = uuidv4();
    const email = `vitest-role-${role}-${uuidv4()}@test.thapsus.uk`;
    const warehouse_id = `TC-VT-${role.toUpperCase().slice(0, 3)}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await pool.query(
      `INSERT INTO users
         (id, email, password_hash, name, phone, role, warehouse_id,
          language_pref, referral_code, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id, email, password, `Vitest ${role}`, '+254700000000',
        role, warehouse_id, 'en', `VTROLE${Date.now()}${role.slice(0,3).toUpperCase()}`, true,
      ]
    );
    const user = { id, email, role, warehouse_id };
    USERS[role] = { ...user, token: mintToken(user) };
  }
});

afterAll(async () => {
  if (SKIP) return;
  const pool = getPool();
  const ids = Object.values(USERS).map((u) => u.id);
  if (ids.length) {
    // users.id is TEXT (uuid-shaped strings), not a uuid column.
    await pool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [ids]);
  }
  await pool.end();
});

describe.skipIf(SKIP)('role enforcement matrix', () => {
  for (const entry of ROUTE_MATRIX) {
    describe(`${entry.method.toUpperCase()} ${entry.path} — allow=[${entry.allow.join(',')}]`, () => {
      for (const role of ROLES) {
        const isAllowed = role === 'admin' || entry.allow.includes(role);

        it(`${role}: ${isAllowed ? 'gate lets through (≠ 403)' : '403 forbidden'}`, async () => {
          const r = await request(app)
            [entry.method](entry.path)
            .set('Authorization', `Bearer ${USERS[role].token}`);

          if (isAllowed) {
            // The gate must NOT have returned 403. Anything else is
            // domain-specific (200, 4xx for missing query params, 5xx
            // for empty downstream tables) and out of scope here.
            expect(r.status).not.toBe(403);
          } else {
            expect(r.status).toBe(403);
            expect(r.body?.success).toBe(false);
            expect(r.body?.message).toMatch(/access|admin|role/i);
          }
        });
      }
    });
  }
});

describe.skipIf(SKIP)('role enforcement — no token / bad token', () => {
  it('rejects requests with no Authorization header (401)', async () => {
    const r = await request(app).get('/api/admin/stats');
    expect(r.status).toBe(401);
  });

  it('rejects requests with a syntactically invalid token (401)', async () => {
    const r = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', 'Bearer not.a.real.jwt');
    expect(r.status).toBe(401);
  });

  it('rejects tokens signed with the wrong secret (401)', async () => {
    const fake = jwt.sign(
      { id: USERS.admin.id, email: USERS.admin.email, role: 'admin' },
      'definitely-not-the-real-secret',
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    const r = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${fake}`);
    expect(r.status).toBe(401);
  });
});
