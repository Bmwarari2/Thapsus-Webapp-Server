# Server-side patches for `Swiftcargo-main`

These files belong in your existing Express repo (`Swiftcargo-main`), not the iOS repo.
Copy them across as follows.

## 1. New file → `utils/supabaseJwt.js`

`server-patches/utils/supabaseJwt.js` → `Swiftcargo-main/utils/supabaseJwt.js`

## 2. Patch existing → `routes/auth.js`

Apply the three small changes documented in `server-patches/routes/auth.patch.md`.
- import `mintSupabaseToken`
- add `supabase_token` field to `/login` and `/register` responses
- add new endpoint `POST /api/auth/supabase-token`

## 3. New migration → run in Supabase SQL editor

`server-patches/database/migrations/002_rls_for_mobile_reads.sql`

Run via Supabase Dashboard → SQL Editor (paste + Run), or:
```
psql "$DATABASE_URL" -f database/migrations/002_rls_for_mobile_reads.sql
```

The migration is idempotent (drops/recreates policies). It enables RLS only for
the SELECT path — Express continues to bypass RLS on writes via the unrestricted
`pg` Pool connection.

## 4. Env vars (already done locally per your confirmation)

`.env` (local) and Railway → Variables (prod):
```
SUPABASE_JWT_SECRET=<your rotated secret>
SUPABASE_JWT_TTL_SECONDS=3600         # optional; defaults to 1 hour
```

## Smoke test

After deploying, hit:
```bash
curl -s -X POST https://your-app.up.railway.app/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}' | jq .supabase_token
```
You should get back a non-null JWT. Decode at jwt.io — claims should be:
```
{ sub, role: "authenticated", aud: "authenticated", exp, ... }
```
