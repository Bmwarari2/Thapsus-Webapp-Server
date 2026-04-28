# `routes/auth.js` — patch instructions

Three small additions. The file already lives in `Swiftcargo-main/routes/auth.js`.

## 1. Top of file — add the import

Find the existing imports block (`const jwt = require('jsonwebtoken')`, etc.) and add:

```js
const { mintSupabaseToken } = require('../utils/supabaseJwt')
```

## 2. `POST /login` handler — return a Supabase token alongside `sc_token`

Find the line that builds the success response. It currently looks roughly like:

```js
return res.json({
  success: true,
  message: 'Login successful',
  token,
  user: { id: user.id, email: user.email, name: user.name, role: user.role,
          warehouse_id: user.warehouse_id, referral_code: user.referral_code,
          language_pref: user.language_pref, wallet_balance: user.wallet_balance }
})
```

Replace with:

```js
const supabase = (() => {
  try { return mintSupabaseToken(user) } catch (e) {
    console.error('[auth/login] supabase token mint failed:', e.message)
    return null
  }
})()

return res.json({
  success: true,
  message: 'Login successful',
  token,
  supabase_token: supabase?.token || null,
  supabase_token_expires_at: supabase?.expiresAt || null,
  user: { id: user.id, email: user.email, name: user.name, role: user.role,
          warehouse_id: user.warehouse_id, referral_code: user.referral_code,
          language_pref: user.language_pref, wallet_balance: user.wallet_balance }
})
```

If supabase token mint fails (e.g. env var missing), login still succeeds — only iOS realtime is degraded.

## 3. Same change in `POST /register`

Mirror the same `supabase` block + `supabase_token` field in the 201 response.

## 4. Add a refresh endpoint at the bottom of the file (before `module.exports`)

```js
/**
 * POST /api/auth/supabase-token
 * Exchanges a valid sc_token (Bearer) for a fresh Supabase JWT.
 * Called by mobile clients before the previous Supabase JWT expires.
 */
router.post('/supabase-token', authMiddleware, async (req, res) => {
  try {
    // authMiddleware has already verified sc_token and put the payload on req.user
    const { id, email, role } = req.user
    const supabase = mintSupabaseToken({ id, email, role })
    return res.json({
      success: true,
      supabase_token: supabase.token,
      supabase_token_expires_at: supabase.expiresAt
    })
  } catch (e) {
    console.error('[auth/supabase-token]', e)
    return res.status(500).json({ success: false, message: 'Could not mint supabase token' })
  }
})
```

If `authMiddleware` is imported under a different name in your file, swap the name accordingly.
