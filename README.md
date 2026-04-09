# Thapsus Cargo — Shipping & Forwarding Platform

**Live at → [www.thapsus.uk](https://www.thapsus.uk)**

Thapsus Cargo is a full-stack web application for shipping and forwarding packages from the UK and China to Kenya. It features user authentication, real-time order tracking via SSE, an M-Pesa payment flow, an admin dashboard, wallet & referral systems, and an automated email notification layer.

**Stack**: React + Vite (frontend) · Express.js (backend) · PostgreSQL via Supabase · Deployed on Railway · Domain via Cloudflare

---

## Quick Start (Local Development)

```bash
# 1. Install backend dependencies
npm install

# 2. Install frontend dependencies
cd client && npm install && cd ..

# 3. Create environment file
cp .env.example .env
# Fill in DATABASE_URL, JWT_SECRET, GMAIL_* keys, etc.

# 4. Build the frontend
cd client && npm run build && cd ..

# 5. Start the server
npm start
```

- API: http://localhost:5000
- Frontend served statically at http://localhost:5000 (after build)

For hot-reload during frontend development:
```bash
# Terminal 1 — Backend
npm start

# Terminal 2 — Vite dev server (proxied to backend)
cd client && npm run dev
```

### Default Admin Login

| Role  | Email                  | Password  |
|-------|------------------------|-----------|
| Admin | admin@thapsus.uk       | admin123  |

> Change the admin password immediately on first deployment via Settings → Admin Password.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    CLIENT (React 18 + Vite)                       │
│  Pages: Home, Dashboard, Orders, Pricing, Admin, Wallet, …       │
│  Design: Glassmorphic UI — liquid blobs, crystal borders, sheen  │
│  State: AuthContext, LanguageContext (EN/SW)                      │
│  API: Axios + /api/* (proxied in dev, same-origin in prod)       │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTP + SSE (/api/events)
┌──────────────────────────────▼───────────────────────────────────┐
│                    SERVER (Express.js on Railway)                  │
│  Middleware: Helmet · CORS · Rate-limit · JWT auth · Compression  │
│  Routes: auth · orders · admin · pricing · payment · wallet       │
│          referral · tickets · tracking · consolidation            │
│  Utils: email (Gmail API) · notifications · pricing calculator    │
└──────────────────────────────┬───────────────────────────────────┘
                               │ pg (node-postgres)
┌──────────────────────────────▼───────────────────────────────────┐
│                    DATABASE (PostgreSQL — Supabase)                │
│  Tables: users · orders · packages · transactions · wallet        │
│          referrals · tickets · ticket_messages · notifications    │
│          admin_logs · email_logs · error_logs · shipping_rates    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
Swiftcargo-main/
├── server.js                 # Express entry point
├── package.json
├── railway.toml              # Railway deploy config
├── .env.example              # Environment variable template
│
├── database/
│   ├── init.js               # PostgreSQL pool + schema bootstrap
│   └── schema.sql            # Full table definitions
│
├── middleware/
│   └── auth.js               # JWT auth + isAdmin guard
│
├── routes/
│   ├── auth.js               # Register, login, profile, password reset
│   ├── orders.js             # Customer order CRUD
│   ├── tracking.js           # Package tracking (public + private)
│   ├── admin.js              # Admin dashboard, users, orders, stats
│   │                         # shipping-rates, revenue, payments
│   ├── pricing.js            # Shipping cost calculator + rates CRUD
│   ├── payment.js            # M-Pesa public payment confirmation
│   ├── wallet.js             # Wallet balance, deposits, M-Pesa confirm
│   ├── referral.js           # Referral program
│   ├── tickets.js            # Support tickets
│   ├── consolidation.js      # Package consolidation requests
│   ├── exchange.js           # Exchange rates
│   ├── prohibited.js         # Prohibited items checker
│   ├── events.js             # SSE real-time event push
│   ├── backup.js             # Admin data backup
│   └── sitemap.js            # Dynamic sitemap + robots.txt
│
├── utils/
│   ├── email.js              # Gmail API transactional email sender
│   ├── pricing.js            # Shipping cost logic + default rates
│   ├── notifications.js      # In-app notification helpers
│   ├── prohibited.js         # Prohibited items database
│   ├── translations.js       # EN / SW string map
│   └── errorLogger.js        # DB-backed error logging
│
└── client/                   # React frontend (Vite)
    ├── src/
    │   ├── App.jsx            # Router
    │   ├── api/index.js       # All API call functions
    │   ├── context/           # AuthContext, LanguageContext
    │   ├── components/        # Navbar, Footer, ShippingRatesPanel, …
    │   └── pages/             # 20+ pages
    └── vite.config.js         # Dev proxy → localhost:5000
```

---

## Key Features

### Customer
- Register / Google OAuth login, unique TC-XXXX warehouse ID
- Ship from **UK** and **China** (Amazon, ASOS, AliExpress, Shein, Temu, …)
- Shipping cost calculator with volumetric weight, electronics handling, insurance
- Real-time order status updates (SSE)
- M-Pesa payment submission and receipt
- Wallet balance + referral earnings
- Package consolidation
- Support tickets with photo attachments
- WhatsApp quick-contact button

### Admin
- Dashboard stats: orders, revenue (excluding referral credits), active shipments
- User management: create, view, deactivate, reset password, delete
- Order management: create for client, edit, bulk status update, cancel
- Shipping rates management (per-kg rates for UK / China)
- M-Pesa payment verification queue with full SMS messages visible
- Revenue reporting with date filters + CSV export
- Support ticket management with reply
- Error log viewer
- Email log per user
- Exchange rate management

---

## Environment Variables

| Variable              | Description                                      | Required      |
|-----------------------|--------------------------------------------------|---------------|
| `DATABASE_URL`        | Supabase PostgreSQL connection string            | Yes           |
| `JWT_SECRET`          | Secret key for JWT tokens (use 64-char random)   | Yes           |
| `PORT`                | Server port (Railway sets this automatically)    | No            |
| `FRONTEND_URL`        | Your public URL, e.g. `https://www.thapsus.uk`  | Yes           |
| `CORS_ORIGIN`         | Allowed origin(s), comma-separated or `*`        | Yes           |
| `GMAIL_CLIENT_ID`     | Google OAuth2 client ID for Gmail API            | For emails    |
| `GMAIL_CLIENT_SECRET` | Google OAuth2 client secret                      | For emails    |
| `GMAIL_REFRESH_TOKEN` | OAuth2 refresh token from OAuth Playground       | For emails    |
| `GMAIL_SENDER_EMAIL`  | The Gmail address used to send emails            | For emails    |
| `ADMIN_EMAIL`         | Email for auto-provisioned admin account         | No (default)  |
| `ADMIN_PASSWORD`      | Password for auto-provisioned admin account      | No (default)  |

---

## Deployment on Railway

The app is deployed as a single Railway service that:
1. Runs `npm install` for the backend
2. Runs `cd client && npm install && npm run build` for the frontend
3. Starts `node server.js` which serves the built React app as static files

Railway environment variables are set in the Railway project dashboard under **Variables**.

```toml
# railway.toml (already configured)
[build]
  buildCommand = "npm install && cd client && npm install && npm run build"

[deploy]
  startCommand = "node server.js"
```

---

## DNS & Domain Setup (Cloudflare → Railway)

### Make `www.thapsus.uk` point to the live app

Follow these steps in your **Cloudflare dashboard** (dash.cloudflare.com):

#### Step 1 — Get your Railway service domain

1. Open your [Railway project](https://railway.app)
2. Click your service → **Settings** → **Networking**
3. Copy the generated domain, e.g. `thapsus-cargo-production.up.railway.app`

#### Step 2 — Add DNS records in Cloudflare

Go to **DNS** → **Records** in your Cloudflare domain panel for `thapsus.uk`:

| Type  | Name | Target / Content                                   | Proxy      |
|-------|------|----------------------------------------------------|------------|
| CNAME | www  | `thapsus-cargo-production.up.railway.app`          | ✅ Proxied  |
| CNAME | @    | `thapsus-cargo-production.up.railway.app`          | ✅ Proxied  |

> Replace the Railway URL with your actual service domain.  
> The **@** record makes the apex (`thapsus.uk`) also work.  
> Keep Cloudflare's **orange cloud (proxy) ON** — this enables SSL and DDoS protection.

#### Step 3 — Add your custom domain in Railway

1. Railway → your service → **Settings** → **Networking** → **Custom Domains**
2. Click **+ Add Domain**
3. Enter `www.thapsus.uk` and press Enter
4. Repeat for `thapsus.uk`

Railway will validate the DNS and issue an SSL certificate automatically.

#### Step 4 — Set `FRONTEND_URL` in Railway

In Railway → **Variables**, set:
```
FRONTEND_URL=https://www.thapsus.uk
```

This ensures password-reset and order links in emails point to your live domain.

#### Step 5 — Force HTTPS redirect in Cloudflare (optional but recommended)

In Cloudflare → **SSL/TLS** → **Edge Certificates**:
- Enable **Always Use HTTPS**
- Enable **Automatic HTTPS Rewrites**

#### Verification

After a few minutes, visit `https://www.thapsus.uk` — you should see the Thapsus Cargo homepage. If DNS hasn't propagated yet, wait up to 5 minutes or use `dig www.thapsus.uk` to check.

---

## Production Checklist

- [ ] Set strong `JWT_SECRET` (`openssl rand -base64 64`)
- [ ] Set `FRONTEND_URL` to `https://www.thapsus.uk`
- [ ] Configure Gmail API credentials for transactional email
- [ ] Add custom domain in Railway + Cloudflare DNS records (see above)
- [ ] Enable **Always Use HTTPS** in Cloudflare
- [ ] Change default admin password immediately after first login
- [ ] Update the WhatsApp number in `Home.jsx` and `ShipInstructions.jsx` (search for `wa.me/254700000000`)
- [ ] Update M-Pesa paybill in `routes/payment.js` (`mpesa_info.paybill`)
- [ ] Set up monitoring (UptimeRobot or Railway's built-in health checks at `/health`)
- [ ] Review CORS_ORIGIN — set to `https://www.thapsus.uk` in production

---

## Extending the Platform

- **Add a new API route**: Create a file in `routes/`, import and mount it in `server.js`
- **Add a new page**: Create in `client/src/pages/`, register in `client/src/App.jsx`
- **Add a new language**: Extend `utils/translations.js` and `LanguageContext.jsx`
- **Add a new shipping market**: Add to `DEFAULT_RATES_GBP` in `utils/pricing.js` and update the market validation lists in `routes/pricing.js` and `routes/admin.js`

---

## License

Proprietary — Thapsus Cargo Ltd. All rights reserved.
