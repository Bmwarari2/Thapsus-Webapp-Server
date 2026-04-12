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
│   ├── init.js               # PostgreSQL pool + schema bootstrap + column migrations
│   └── schema.sql            # Full table definitions
│
├── middleware/
│   └── auth.js               # JWT auth + isAdmin guard
│
├── routes/
│   ├── auth.js               # Register, login, profile, password reset
│   ├── orders.js             # Customer order CRUD + live cost breakdown
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
│   │                         # Includes: order-created, order-updated, password-reset, …
│   ├── pricing.js            # Shipping cost logic + default rates
│   │                         # Electronics handling: phone £75, laptop/TV £65 (1 kg min)
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
- **Order list rows are fully clickable** — tap anywhere on a row to open the order (mobile-friendly)
- **Order detail page with two tabs** — *Tracking* (transit timeline) and *Details & Charges* (specs, itemised costs, packages)
- **Itemised cost breakdown** — base shipping, electronics handling fee (with badge), handling fee, insurance, customs estimate, and total shown clearly per order
- M-Pesa payment submission and receipt; payment page shows tracking number and amount due only (compact layout)
- Wallet balance + referral earnings
- Package consolidation
- Support tickets with photo attachments
- WhatsApp quick-contact button

### Admin

- Dashboard stats: orders, revenue (excluding referral credits), active shipments
- **User management**: create, view, deactivate, reset password, delete
  - View a user's **warehouse address** prominently in the user detail panel
  - Set a **Kenya delivery address** per user (stored in `users.delivery_address`)
  - Add **admin notes** per user (stored in `users.admin_notes`)
- **Order management**: create for client, edit, bulk status update, cancel
  - Order-created email now includes a **full cost breakdown** (shipping, handling, insurance, customs, total)
  - Editing an order triggers an **"Order Updated" email** to the customer with new pricing
  - Edit modal shows an **electronics handling badge** when the order contains a special-handling item (phone, laptop, TV/monitor)
  - Add **order-level notes** in the edit modal (stored in `orders.order_notes`); notes appear as an amber callout in the Shipment History cards
  - Admin user panel shows **cost breakdown grid** per order in the Shipment History section
- Shipping rates management (per-kg rates for UK / China)
- M-Pesa payment verification queue with full SMS messages visible
- Revenue reporting with date filters + CSV export
- Support ticket management with reply
- Error log viewer
- Email log per user
- Exchange rate management

---

## Email Notifications

Transactional emails are sent via the **Gmail API** (OAuth2) with retry logic and DB logging (`email_logs`).

| Trigger | Function | Recipients |
|---|---|---|
| Customer registers | `sendWelcomeEmail` | Customer |
| Admin creates order for client | `sendOrderCreatedEmail` | Customer |
| Admin edits an order | `sendOrderUpdatedEmail` | Customer |
| Order status changes | `sendStatusUpdateEmail` | Customer |
| Password reset requested | `sendPasswordResetEmail` | Customer |

Both the order-created and order-updated emails include a **cost breakdown table** with line items for shipping rate, electronics handling (if applicable), handling fee, insurance, and customs estimate.

---

## Database Schema Notes

Column migrations are applied automatically at startup via `database/init.js`. Recent additions:

| Table | Column | Type | Purpose |
|---|---|---|---|
| `users` | `delivery_address` | TEXT | Kenya delivery address set by admin |
| `users` | `admin_notes` | TEXT | Internal notes on the user set by admin |
| `orders` | `order_notes` | TEXT | Per-order notes visible in admin Shipment History |

All migrations use `ALTER TABLE … ADD COLUMN IF NOT EXISTS` so they are safe to run on an existing database.

---

## API Reference (Key Endpoints)

### Orders

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/orders` | Customer | List own orders (paginated, filterable by status/market) |
| POST | `/api/orders` | Customer | Create a new order |
| GET | `/api/orders/:id` | Customer / Admin | Get order detail including live **cost breakdown** |
| PUT | `/api/orders/:id/status` | Admin | Update status (+ optional `actual_cost`, `customs_duty`) |

`GET /api/orders/:id` returns a `cost_breakdown` object computed live from `calculateShippingCost()`:

```json
{
  "cost_breakdown": {
    "total": 85.50,
    "breakdown": {
      "base_shipping":       { "label": "Shipping Rate",          "amount": 60.00 },
      "electronics_handling":{ "label": "Electronics Handling",   "amount": 75.00 },
      "handling_fee":        { "label": "Handling Fee",           "amount": 5.00  },
      "insurance":           { "label": "Insurance",              "amount": 8.50  },
      "customs_estimate":    { "label": "Customs Estimate",       "amount": 0     }
    }
  }
}
```

### Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/users` | Admin | List all users |
| GET | `/api/admin/users/:id` | Admin | User detail with orders + live cost breakdowns |
| PUT | `/api/admin/users/:id` | Admin | Update user — accepts `delivery_address`, `admin_notes` |
| POST | `/api/admin/orders/create-for-client` | Admin | Create order on behalf of a customer |
| GET | `/api/admin/orders` | Admin | List all orders with `electronics_item` included |
| PUT | `/api/admin/orders/:id/edit` | Admin | Edit order — accepts `order_notes`; sends update email |

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
- **Add a new DB column**: Add a migration entry to the `columnMigrations` array in `database/init.js` using `ALTER TABLE … ADD COLUMN IF NOT EXISTS` — it runs automatically on next deploy

---

## Changelog

### April 2026

**Order emails now include full cost breakdown**
When an admin creates an order on behalf of a customer, the confirmation email includes a line-by-line cost table: base shipping rate, electronics handling fee (if applicable), handling fee, insurance, customs estimate, and total. Previously only the total was shown.

**Order-updated email on admin edits**
When an admin edits an order (weight, dimensions, speed, insurance, etc.), the system automatically sends the customer an "Your Order Has Been Updated" email with the revised cost breakdown.

**Itemised cost breakdown on Order Detail page**
The *Details & Charges* tab on the customer order detail page now shows each cost component individually, pulled from a live `cost_breakdown` object returned by `GET /api/orders/:id`. An orange badge with a ⚡ icon highlights any electronics handling fee.

**Order detail page tabbed layout**
The customer order detail page is split into two tabs — *Tracking* (transit timeline) and *Details & Charges* (manifest, specs, itemised costs, packages) — reducing scrolling on mobile.

**Mobile-friendly order list**
Order rows in the customer orders list are now fully clickable. Tapping anywhere on a row navigates to the order detail page; the cost toggle and View button still work independently with `stopPropagation`.

**Electronics handling badge in admin edit modal**
The admin order-edit modal correctly shows the electronics handling badge (phone, laptop, TV/monitor) now that `electronics_item` is included in the `GET /api/admin/orders` query.

**Admin user panel — warehouse address & delivery details**
The admin user detail panel now prominently displays the customer's Thapsus warehouse address. A new "Delivery & Notes" section lets admins save a Kenya delivery address and internal admin notes per user, backed by the new `users.delivery_address` and `users.admin_notes` columns.

**Order-level notes**
Admins can add notes to individual orders via the edit modal. Notes are stored in `orders.order_notes` and displayed as an amber callout in the Shipment History cards in the admin user panel.

**Payment page simplified**
The public payment confirmation page now shows only the tracking number and amount due — customer name and status cards have been removed for a cleaner, more focused layout.

---

## License

Proprietary — Thapsus Cargo Ltd. All rights reserved.
