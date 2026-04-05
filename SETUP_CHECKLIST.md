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
| `CORS_ORIGIN` | Same as APP_URL (or `*` to allow all) | Recommended |

Leave all other variables unset until you're ready to configure email, M-Pesa, etc.
See `.env.example` for the full list of optional variables.

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
Log in at your app URL with those credentials.

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
