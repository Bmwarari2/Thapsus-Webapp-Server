# Thapsus Cargo — Railway Deployment Checklist

Follow every step in order. The app **will not load data** until all required variables are set.

---

## Step 1 — Resume Supabase (if paused)

Free-tier Supabase projects auto-pause after 7 days of inactivity.

1. Go to [supabase.com](https://supabase.com) and log in
2. Open your project
3. If it shows "Project paused", click **Resume project** and wait ~30 seconds

---

## Step 2 — Get the DATABASE_URL

1. In your Supabase project → **Settings** → **Database**
2. Scroll to **Connection string**
3. Click the **URI** tab
4. Copy the connection string — it looks like:
   ```
   postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with your real database password
   - ⚠️ If your password contains special characters (`@`, `#`, `$`, `&`, `%`),
     URL-encode them: `@` → `%40`, `#` → `%23`, `$` → `%24`, `&` → `%26`

> **Note:** The startup diagnostics in `database/init.js` will auto-detect whether your
> connection is read-only (pooler) or writable (direct) and guide you accordingly in the
> Railway deploy logs.

---

## Step 3 — Set environment variables in Railway

In your Railway service → **Variables** tab, add these (at minimum):

| Variable | Value | Required? |
|---|---|---|
| `DATABASE_URL` | Your Supabase connection URI (step 2) | ✅ Required |
| `JWT_SECRET` | A long random string (32+ chars) | ✅ Required |
| `NODE_ENV` | `production` | ✅ Required |
| `ADMIN_EMAIL` | Your admin login email | ✅ Required |
| `ADMIN_PASSWORD` | Your admin login password | ✅ Required |
| `APP_URL` | Your Railway public URL or custom domain | Recommended |
| `FRONTEND_URL` | Same as APP_URL | Recommended |
| `CORS_ORIGIN` | Comma-separated allowlist of origins (`*` is rejected outside development) | Recommended |
| `RUN_MIGRATIONS_ON_BOOT` | `true` — each deploy applies anything missing from the `_migrations` ledger before serving | ✅ Required |

The app boots without the rest, but WhatsApp is the whole product, so
these are what make it do anything:

| Variable | Value | Needed for |
|---|---|---|
| `SENTDM_API_KEY` | `sk_live_…` from the sent.dm console | Sending any WhatsApp message |
| `SENTDM_WEBHOOK_SECRET` | `whsec_…` printed by the webhook registrar | Receiving inbound messages |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | From Supabase → Settings → API | Receipt PDFs and inbox attachments |
| `SITE_URL` | The **apex** domain (`https://thapsus.uk`) | `/r/` receipt and `/m/` media links are built from it |
| `MPESA_PROVIDER` | `manual` | Buy Goods payments with admin approval |
| `MPESA_TILL_NUMBER` | Your till | The payment instructions sent to customers |
| `ANTHROPIC_API_KEY` | Anthropic API key | The assistant. `ANTHROPIC_MODEL` is an optional pin; the default is `claude-opus-5` |
| `GMAIL_*` | OAuth2 client + refresh token | Operator password-reset email only |

Without `SENTDM_*` the app runs and records sends as `failed` in the
inbox rather than crashing, so you can deploy first and set them after.

See `.env.example` for the full list, and [`SETUP.md`](./SETUP.md) for
what each integration actually does.

---

## Step 4 — Trigger a redeploy

After setting variables, Railway will automatically redeploy. If it doesn't:
- Go to your service → **Deployments** → click **Deploy** (or push a commit)

---

## Step 5 — Verify the connection

Once deployed, visit:
```
https://your-service.up.railway.app/health
```

You should see:
```json
{
  "status": "ok",
  "database": "connected",
  ...
}
```

If `database` shows `error: ...`, re-check your `DATABASE_URL` (step 2).

Also check the **Railway deploy logs** — `database/init.js` prints detailed diagnostics
on every startup including RLS status, missing tables, and connection role.

---

## Step 6 — Log in

The first startup auto-creates an admin account using `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
Log in at your app URL with those credentials. There is no customer-facing
sign-up — customers exist only as WhatsApp contacts. Add further staff
from `/ops/team`; each gets a temporary password shown once on screen, and
no email is sent.

---

## Step 7 — Storage buckets

In Supabase → Storage, create two **private** buckets:

| Bucket | Holds |
|---|---|
| `receipts` | PDF receipts, served through `GET /r/:token` |
| `wa-media` | Inbox attachments both directions, served through `GET /m/:token` |

Leave both private. The links re-sign a short-lived Supabase URL on every
click, so nothing expires and nothing needs public read.

---

## Step 8 — Register the WhatsApp webhook

Once the deploy is live:

```bash
SENTDM_API_KEY=sk_live_… node scripts/register-sentdm-webhook.mjs --url https://<apex-host>/api/wa/webhook
```

It prints the signing secret once — set it as `SENTDM_WEBHOOK_SECRET` and
let Railway redeploy. Use the **apex** host: a `www.` endpoint is not
served and the registration sits in `RETRYING` with a null status code.
`/ops/settings` has a webhook doctor that shows the live registration and
recent delivery attempts.

Then map the WhatsApp templates in `/ops/settings` → "sent.dm template
map". All eleven slots ship mapped by default; see
[`CUTOVER.md`](./CUTOVER.md) §5 for the list and why an unmapped slot
means the customer is never told their parcel arrived.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| App shows blank page | `client/dist` not built | Check Railway build logs for Vite errors |
| `/health` returns `database: error` | Wrong or missing `DATABASE_URL` | Redo step 2 |
| 500 errors on all API calls | Server crashed on startup | Check Railway deploy logs |
| Login returns 401 immediately | Wrong `ADMIN_EMAIL`/`ADMIN_PASSWORD` | Check the Railway variables |
| "Project paused" message in logs | Free-tier inactivity | Resume in Supabase dashboard |
| Tables exist but no data returns | RLS blocking reads | Follow RLS instructions printed in deploy logs |
| No inbound WhatsApp messages | Webhook registered against `www.` or disabled | `/ops/settings` → webhook doctor, or re-run the registrar against the apex host |
| Outbound messages show `failed` in the inbox | `SENTDM_API_KEY` unset or wrong | Set it on Railway and redeploy |
| Arrival/dispatch messages never arrive | Outside the 24-hour window with no approved template | Check the template map in `/ops/settings`; error `132001` means the named template doesn't exist |
| Receipt or media link 404s | `SITE_URL` is `www.` or a Railway URL | Set it to the apex domain the app actually serves |
