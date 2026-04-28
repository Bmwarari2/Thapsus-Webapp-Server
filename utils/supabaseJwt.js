// utils/supabaseJwt.js
// Mints Supabase-shaped JWTs that PostgREST/Realtime/Storage can verify.
// Signed with SUPABASE_JWT_SECRET (from Supabase Dashboard → Project Settings →
// API → JWT Settings). Different secret from JWT_SECRET, which Express uses to
// sign its own session tokens (sc_token).
//
// Why two tokens:
//   sc_token        → Express middleware /api/* (long-lived, app-controlled)
//   supabase_token  → PostgREST / Realtime over Supabase (short-lived, RLS)
//
// Claims match what supabase-js attaches by default:
//   { sub, role: 'authenticated', aud: 'authenticated', iat, exp }

const jwt = require('jsonwebtoken')

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET
const SUPABASE_JWT_TTL_SECONDS = parseInt(process.env.SUPABASE_JWT_TTL_SECONDS || '3600', 10)

if (!SUPABASE_JWT_SECRET) {
  // Don't throw at require time — that crashes the whole boot if someone
  // forgot the env var. Just warn loudly. Routes that mint tokens will 500.
  console.warn(
    '[supabaseJwt] SUPABASE_JWT_SECRET is not set. ' +
    'iOS realtime/RLS reads will fail until this is configured.'
  )
}

function mintSupabaseToken(user) {
  if (!SUPABASE_JWT_SECRET) {
    throw new Error('SUPABASE_JWT_SECRET not configured')
  }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: String(user.id),
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + SUPABASE_JWT_TTL_SECONDS,
    // Useful for debugging in PostgREST logs but not load-bearing for RLS.
    email: user.email || null,
    user_metadata: {
      app_role: user.role || 'customer'
    }
  }
  const token = jwt.sign(payload, SUPABASE_JWT_SECRET, { algorithm: 'HS256' })
  return { token, expiresAt: payload.exp }
}

module.exports = { mintSupabaseToken, SUPABASE_JWT_TTL_SECONDS }
