# SwiftCargo — Shipping & Forwarding Platform

Ship from UK, USA & China to Kenya. A full-stack web application for package forwarding with user authentication, real-time tracking, exchange rates, admin dashboard, wallet system, and more.

---

## Quick Start

```bash
# 1. Clone/copy the project
cd swiftcargo

# 2. Install backend dependencies
npm install

# 3. Install frontend dependencies
cd client && npm install && cd ..

# 4. Create environment file
cp .env.example .env
# Edit .env with your actual API keys

# 5. Seed the database with sample data
npm run seed

# 6. Start development servers (backend + frontend concurrently)
npm run dev
```

- Backend API: http://localhost:5000
- Frontend Dev: http://localhost:5173

### Default Login Credentials

| Role     | Email                     | Password  |
|----------|---------------------------|-----------|
| Admin    | admin@swiftcargo.co.ke    | admin123  |
| Customer | john.doe@example.com      | password123 |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (React + Vite)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │   Pages   │ │Components│ │  Context  │ │  API Lib  │          │
│  │ 15 pages  │ │ Navbar   │ │AuthContext│ │  Axios    │          │
│  │ Home,Dash │ │ Footer   │ │LangContext│ │ Intercept │          │
│  │ Admin,etc │ │ Protected│ │ EN / SW   │ │  /api/*   │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                          ▼ HTTP (port 5173 → proxy → 5000)      │
├─────────────────────────────────────────────────────────────────┤
│                     SERVER (Express.js)                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Middleware: CORS │ Helmet │ Compression │ Rate-Limit │ JWT │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │  Routes   │ │  Routes   │ │  Routes   │ │  Routes   │         │
│  │ auth      │ │ orders    │ │ admin     │ │ wallet    │         │
│  │ tracking  │ │ exchange  │ │ pricing   │ │ referral  │         │
│  │ tickets   │ │ consolid. │ │ prohibit  │ │           │         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│                          ▼                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Utilities: Notifications │ Prohibited Items │ Translations │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          ▼                                      │
├─────────────────────────────────────────────────────────────────┤
│                    DATABASE (SQLite via better-sqlite3)          │
│  Tables: users │ orders │ packages │ transactions │ wallet      │
│          referrals │ tickets │ ticket_messages │ notifications  │
│          admin_logs                                              │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer      | Technology                                          |
|------------|-----------------------------------------------------|
| Frontend   | React 18, React Router v6, Tailwind CSS, Recharts   |
| Backend    | Node.js, Express.js                                 |
| Database   | SQLite (better-sqlite3) — zero config, file-based   |
| Auth       | JWT (jsonwebtoken) + bcryptjs password hashing       |
| Build      | Vite (frontend), Nodemon (backend dev)               |
| PWA        | Service Worker + Web App Manifest                    |
| Icons      | Lucide React                                         |

---

## Project Structure

```
swiftcargo/
├── server.js                 # Express entry point
├── package.json              # Backend dependencies & scripts
├── .env.example              # Environment variable template
├── database/
│   ├── init.js               # SQLite schema & table creation
│   └── seed.js               # Sample data seeder
├── middleware/
│   └── auth.js               # JWT auth & role-based access
├── routes/
│   ├── auth.js               # Register, login, profile
│   ├── orders.js             # CRUD for shipping orders
│   ├── tracking.js           # Public & private package tracking
│   ├── admin.js              # Admin dashboard, bulk ops, reports
│   ├── wallet.js             # Wallet deposits, payments, history
│   ├── exchange.js           # USD/GBP to KES exchange rates
│   ├── referral.js           # Referral program (KES 50 reward)
│   ├── tickets.js            # Support tickets & messaging
│   ├── pricing.js            # Weight-based shipping calculator
│   ├── consolidation.js      # Package consolidation
│   └── prohibited.js         # Restricted items checker
├── utils/
│   ├── notifications.js      # SMS, Email, WhatsApp, In-App
│   ├── prohibited.js         # Prohibited items database
│   └── translations.js       # English & Swahili strings
├── public/
│   ├── manifest.json         # PWA manifest
│   └── sw.js                 # Service worker
└── client/                   # React frontend
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── main.jsx          # App entry point
        ├── App.jsx           # Router & routes
        ├── api.js            # Axios API client
        ├── index.css         # Tailwind + custom styles
        ├── context/
        │   ├── AuthContext.jsx
        │   └── LanguageContext.jsx
        ├── components/
        │   ├── Navbar.jsx
        │   ├── Footer.jsx
        │   └── ProtectedRoute.jsx
        └── pages/
            ├── Home.jsx              # Landing page
            ├── Login.jsx             # User login
            ├── Register.jsx          # User registration
            ├── Dashboard.jsx         # Customer dashboard
            ├── TrackPackage.jsx      # Package tracking
            ├── ExchangeRate.jsx      # Currency converter
            ├── PricingCalculator.jsx # Shipping cost calculator
            ├── NewOrder.jsx          # Create shipping order
            ├── Orders.jsx            # Order history
            ├── Wallet.jsx            # Wallet & payments
            ├── Consolidation.jsx     # Package consolidation
            ├── ProhibitedItems.jsx   # Restricted items checker
            ├── Support.jsx           # Support tickets
            ├── Referral.jsx          # Referral program
            ├── WarehouseAddresses.jsx # Warehouse addresses
            └── AdminDashboard.jsx    # Admin panel
```

---

## Features

### Customer Features
- **User Registration & Login** — JWT-based auth with secure password hashing
- **Unique Warehouse Address** — Each user gets a SC-XXXX code for receiving packages
- **Ship from 3 Markets** — UK, USA, and China with retailer support (Amazon, Shein, ASOS, Next, Superdrug, eBay, ZARA, H&M, and more)
- **Package Tracking** — Real-time status updates with visual timeline
- **Exchange Rate Calculator** — USD/GBP to KES conversion
- **Shipping Cost Calculator** — Weight-based pricing with volumetric weight, insurance, customs duty breakdown
- **Wallet System** — Preload funds via M-Pesa, Stripe, or PayPal for faster checkout
- **Package Consolidation** — Combine multiple packages to save on shipping
- **Referral Program** — Earn KES 50 for every friend who ships
- **Support Tickets** — Create tickets with photo uploads, threaded messages
- **Prohibited Items Checker** — Verify items before shipping
- **Multi-Language** — English and Swahili

### Admin Features
- **Dashboard** — Stats overview with charts (orders, revenue, users)
- **User Management** — Search, view, edit user profiles and roles
- **Order Management** — Filter, sort, bulk status updates
- **Revenue Reports** — Date-filtered reports with CSV export
- **Support Tickets** — Manage and respond to customer tickets
- **Activity Logs** — Track all admin actions
- **Communication Log** — Customer interaction history

### Technical Features
- **Progressive Web App** — Installable, works offline
- **Responsive Design** — Mobile-first, works on all devices
- **Rate Limiting** — Protects API from abuse
- **Security Headers** — Helmet.js for XSS, CSRF protection
- **Role-Based Access** — Customer and Admin roles

---

## API Endpoints (50+)

### Authentication
| Method | Endpoint              | Description           | Auth |
|--------|-----------------------|-----------------------|------|
| POST   | /api/auth/register    | Register new user     | No   |
| POST   | /api/auth/login       | Login                 | No   |
| GET    | /api/auth/me          | Get current user      | Yes  |
| PUT    | /api/auth/profile     | Update profile        | Yes  |
| PUT    | /api/auth/password    | Change password       | Yes  |

### Orders
| Method | Endpoint              | Description           | Auth  |
|--------|-----------------------|-----------------------|-------|
| GET    | /api/orders           | List user's orders    | Yes   |
| POST   | /api/orders           | Create new order      | Yes   |
| GET    | /api/orders/:id       | Get order details     | Yes   |
| PUT    | /api/orders/:id       | Update order          | Admin |

### Tracking
| Method | Endpoint                     | Description              | Auth |
|--------|------------------------------|--------------------------|------|
| GET    | /api/tracking/:trackingNumber | Public tracking          | No   |
| GET    | /api/tracking/user/packages   | User's packages          | Yes  |
| PUT    | /api/tracking/:id/status      | Update status            | Admin|

### Wallet & Payments
| Method | Endpoint                | Description             | Auth |
|--------|-------------------------|-------------------------|------|
| GET    | /api/wallet             | Get balance             | Yes  |
| POST   | /api/wallet/deposit     | Deposit funds           | Yes  |
| POST   | /api/wallet/pay         | Pay for order           | Yes  |
| GET    | /api/wallet/transactions| Transaction history     | Yes  |

### Exchange Rates
| Method | Endpoint               | Description              | Auth |
|--------|------------------------|--------------------------|------|
| GET    | /api/exchange/rates    | Get current rates        | No   |
| POST   | /api/exchange/convert  | Convert amount           | No   |

### Admin (all require Admin role)
| Method | Endpoint                      | Description              |
|--------|-------------------------------|--------------------------|
| GET    | /api/admin/stats              | Dashboard statistics     |
| GET    | /api/admin/users              | List all users           |
| GET    | /api/admin/orders             | List all orders          |
| PUT    | /api/admin/orders/bulk-update | Bulk status update       |
| GET    | /api/admin/revenue            | Revenue report           |
| GET    | /api/admin/revenue/export     | CSV export               |

(See API_REFERENCE.md for the complete list with request/response examples.)

---

## Deployment Guide

### Option 1: Railway (Recommended — Easiest)

Railway offers free tier hosting with automatic deployments.

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Initialize project
railway init

# 4. Build the frontend first
cd client && npm run build && cd ..

# 5. Set environment variables in Railway dashboard
# JWT_SECRET, PORT (Railway auto-sets), etc.

# 6. Deploy
railway up
```

Railway will auto-detect Node.js, run `npm install`, and start with `npm start`.

### Option 2: Render

```bash
# 1. Push code to GitHub
git init && git add -A && git commit -m "Initial commit"
gh repo create swiftcargo --private --push

# 2. Go to render.com, create a New Web Service
# 3. Connect your GitHub repo
# 4. Build Command: cd client && npm install && npm run build && cd .. && npm install
# 5. Start Command: npm start
# 6. Add environment variables in the dashboard
```

### Option 3: DigitalOcean App Platform

```bash
# 1. Push code to GitHub
# 2. Go to DigitalOcean App Platform
# 3. Create a new app from GitHub repo
# 4. Add build command: cd client && npm install && npm run build && cd .. && npm install
# 5. Add start command: node server.js
# 6. Add environment variables
```

### Option 4: VPS (Ubuntu — Full Control)

```bash
# SSH into your server
ssh user@your-server-ip

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2

# Clone your repo
git clone https://github.com/yourusername/swiftcargo.git
cd swiftcargo

# Install dependencies
npm install
cd client && npm install && npm run build && cd ..

# Set up environment
cp .env.example .env
nano .env   # Add your real API keys

# Seed database
npm run seed

# Start with PM2
pm2 start server.js --name swiftcargo
pm2 save
pm2 startup   # Auto-start on reboot

# Set up Nginx reverse proxy
sudo apt install nginx
sudo nano /etc/nginx/sites-available/swiftcargo
```

Nginx config:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/swiftcargo /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

# Add SSL with Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### Option 5: Vercel (Frontend) + Railway (Backend)

Split deployment for better scaling:

```bash
# Deploy backend to Railway
cd swiftcargo
railway up

# Deploy frontend to Vercel
cd client
vercel deploy --prod
```

Update `client/vite.config.js` to point API proxy to Railway URL.

---

## Production Checklist

Before going live, make sure to:

- [ ] Set strong JWT_SECRET (use `openssl rand -base64 64`)
- [ ] Set up real M-Pesa API keys (Safaricom Developer Portal)
- [ ] Set up Stripe account and API keys
- [ ] Set up SendGrid for email notifications
- [ ] Set up Africa's Talking for SMS
- [ ] Set up WhatsApp Business API
- [ ] Configure a custom domain
- [ ] Enable SSL/HTTPS
- [ ] Set up database backups (cron job to copy .db file)
- [ ] Set up monitoring (UptimeRobot, Better Uptime)
- [ ] Change default admin password
- [ ] Test all payment flows in sandbox mode first

---

## Upgrading & Extending

The codebase is designed for easy upgrades:

- **Add a new route**: Create a file in `routes/`, import in `server.js`
- **Add a new page**: Create in `client/src/pages/`, add route in `App.jsx`
- **Add a new language**: Extend `utils/translations.js` and `LanguageContext.jsx`
- **Switch database**: Replace `better-sqlite3` with PostgreSQL (pg) or MySQL. The SQL queries use standard syntax.
- **Add payment provider**: Add integration in `routes/wallet.js`

---

## Environment Variables

See `.env.example` for the complete list. Key variables:

| Variable           | Description                          | Required |
|--------------------|--------------------------------------|----------|
| PORT               | Server port (default: 5000)          | No       |
| JWT_SECRET         | Secret key for JWT tokens            | Yes      |
| MPESA_CONSUMER_KEY | Safaricom M-Pesa API key             | For payments |
| STRIPE_SECRET_KEY  | Stripe API secret key                | For payments |
| SENDGRID_API_KEY   | SendGrid email API key               | For emails |
| AT_API_KEY         | Africa's Talking SMS API key         | For SMS  |

---

## License

MIT License. Built for SwiftCargo Shipping & Forwarding.
