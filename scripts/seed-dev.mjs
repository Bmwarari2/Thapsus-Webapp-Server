#!/usr/bin/env node
// scripts/seed-dev.mjs — seed a LOCAL/dev database with demo data.
//
// The legacy database/seed.js targets the old better-sqlite3 API (db.exec, a
// `wallet` table that no longer exists) and does not run against the current
// Postgres backend. This script is the Postgres-native replacement: it seeds a
// verified admin, two verified customers, and a couple of sample orders so a
// freshly-migrated local DB is immediately usable for the API / end-to-end
// checks. Idempotent (ON CONFLICT), and refuses to run against a non-local DB
// unless ALLOW_REMOTE_SEED=true so it can never clobber production by accident.
//
//   DATABASE_URL=postgres://postgres@127.0.0.1:5433/thapsus_test node scripts/seed-dev.mjs

import pg from 'pg';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) { console.error('✗ DATABASE_URL is not set'); process.exit(1); }

const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) || /sslmode=disable/.test(url);
if (!isLocal && process.env.ALLOW_REMOTE_SEED !== 'true') {
  console.error('✗ Refusing to seed a non-local database. Set ALLOW_REMOTE_SEED=true to override.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false }, max: 3 });

async function upsertUser(db, { email, name, password, role, phone, refCode }) {
  const hash = bcrypt.hashSync(password, 10);
  // warehouse_id carries a UNIQUE constraint (each user's personal suite id),
  // so it must be distinct per user and is never overwritten on conflict.
  const warehouseId = `TC-${uuidv4().slice(0, 8).toUpperCase()}`;
  const { rows } = await db.query(
    `INSERT INTO users (id, email, password_hash, name, phone, role, warehouse_id, referral_code,
                        is_active, email_verified_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,NOW(),NOW(),NOW())
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name,
           role = EXCLUDED.role, email_verified_at = NOW(), updated_at = NOW()
     RETURNING id, email, role`,
    [uuidv4(), email.toLowerCase(), hash, name, phone, role, warehouseId, refCode]
  );
  return rows[0];
}

async function main() {
  const db = await pool.connect();
  try {
    const admin = await upsertUser(db, {
      email: process.env.ADMIN_EMAIL || 'admin@thapsus.uk',
      name: 'Dev Admin', password: process.env.ADMIN_PASSWORD || 'AdminPass123!',
      role: 'admin', phone: '+254700000001', refCode: 'REFADMIN',
    });
    const jane = await upsertUser(db, {
      email: 'jane@example.com', name: 'Jane Doe', password: 'Passw0rd!',
      role: 'customer', phone: '+254712345678', refCode: 'REFJANE1',
    });
    const john = await upsertUser(db, {
      email: 'john@example.com', name: 'John Smith', password: 'Passw0rd!',
      role: 'customer', phone: '+254712345679', refCode: 'REFJOHN1',
    });

    // A couple of sample orders for Jane so list/detail endpoints have data.
    for (const [retailer, desc, wt] of [['Amazon UK', 'Books', 2], ['eBay', 'Phone case', 0.3]]) {
      const oid = uuidv4();
      const tn = `TC-DEV-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      await db.query(
        `INSERT INTO orders (id, user_id, tracking_number, retailer, status, description,
                             weight_kg, shipping_speed, declared_value, estimated_cost, hs_tier)
         VALUES ($1,$2,$3,$4,'pending',$5,$6,'economy',50,0,'general')
         ON CONFLICT (tracking_number) DO NOTHING`,
        [oid, jane.id, tn, retailer, desc, wt]
      );
      await db.query(
        `INSERT INTO packages (id, order_id, user_id, description, weight_kg, status)
         VALUES ($1,$2,$3,$4,$5,'pre_registered') ON CONFLICT DO NOTHING`,
        [uuidv4(), oid, jane.id, desc, wt]
      );
    }

    console.log(`✓ Seeded: admin=${admin.email}, customers=[${jane.email}, ${john.email}], + 2 sample orders`);
    console.log('  Customer login: jane@example.com / Passw0rd!');
  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((e) => { console.error('✗ seed failed:', e.message); process.exit(1); });
