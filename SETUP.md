# SwiftCargo Backend - Setup Guide

## Quick Start

### 1. Installation

```bash
cd swiftcargo
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your actual configuration values:

```
PORT=5000
NODE_ENV=development
JWT_SECRET=your_secure_secret_key_here
DATABASE_PATH=./swiftcargo.db
CORS_ORIGIN=http://localhost:3000
ADMIN_PASSWORD=admin123
```

### 3. Initialize Database

The database will be automatically initialized on first server startup. However, you can manually run the seed script to populate with test data:

```bash
npm run seed
```

This will create:
- 1 admin user (admin@swiftcargo.co.ke / admin123)
- 5 sample customers with test credentials
- Sample orders, packages, and transactions

### 4. Start the Server

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

The server will start on `http://localhost:5000` (or your configured PORT).

## API Endpoints Overview

### Authentication
- `POST /api/auth/register` - Register new customer
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile
- `PUT /api/auth/password` - Change password

### Orders
- `GET /api/orders` - List user's orders
- `POST /api/orders` - Create new order
- `GET /api/orders/:id` - Get order details
- `PUT /api/orders/:id` - Update order (admin only)

### Tracking
- `GET /api/tracking/:trackingNumber` - Public tracking (no auth)
- `GET /api/tracking/user/packages` - User's packages
- `PUT /api/tracking/:id/status` - Update status (admin only)

### Wallet
- `GET /api/wallet` - Get wallet balance
- `POST /api/wallet/deposit` - Deposit funds
- `POST /api/wallet/pay` - Pay from wallet
- `GET /api/wallet/transactions` - Transaction history

### Referral
- `GET /api/referral` - Get referral info
- `POST /api/referral/apply` - Apply referral code
- `GET /api/referral/history` - Referral history

### Tickets
- `GET /api/tickets` - List tickets
- `POST /api/tickets` - Create ticket
- `GET /api/tickets/:id` - Get ticket details
- `POST /api/tickets/:id/message` - Add message
- `PUT /api/tickets/:id/status` - Update status (admin only)

### Pricing
- `POST /api/pricing/calculate` - Calculate shipping cost

### Exchange Rates
- `GET /api/exchange/rates` - Get current rates
- `POST /api/exchange/convert` - Convert currency

### Consolidation
- `GET /api/consolidation` - Get packages waiting
- `POST /api/consolidation/request` - Request consolidation
- `GET /api/consolidation/:id` - Get consolidation details

### Admin
- `GET /api/admin/users` - List all users
- `GET /api/admin/users/:id` - Get user details
- `PUT /api/admin/users/:id` - Update user
- `GET /api/admin/orders` - List all orders
- `PUT /api/admin/orders/bulk-update` - Bulk update orders
- `GET /api/admin/stats` - Dashboard statistics
- `GET /api/admin/revenue` - Revenue report
- `GET /api/admin/revenue/export` - Export CSV
- `GET /api/admin/logs` - Admin logs

### Prohibited Items
- `GET /api/prohibited/check?item=xxx` - Check if item is prohibited
- `GET /api/prohibited/categories` - Get all categories
- `GET /api/prohibited/categories/:category` - Get items in category

## Test Credentials

### Admin
- Email: `admin@swiftcargo.co.ke`
- Password: `admin123`

### Sample Customers
After running `npm run seed`:
1. `john.doe@example.com` / `password123`
2. `jane.smith@example.com` / `password123`
3. `david.mwangi@example.com` / `password123`
4. `sarah.omondi@example.com` / `password123`
5. `michael.kipchoge@example.com` / `password123`

## Project Structure

```
swiftcargo/
├── database/
│   ├── init.js           # Database initialization
│   └── seed.js           # Seed sample data
├── middleware/
│   └── auth.js           # JWT authentication & authorization
├── routes/
│   ├── auth.js           # Authentication routes
│   ├── orders.js         # Order management
│   ├── tracking.js       # Package tracking
│   ├── admin.js          # Admin dashboard
│   ├── wallet.js         # Wallet management
│   ├── exchange.js       # Currency exchange
│   ├── referral.js       # Referral program
│   ├── tickets.js        # Support tickets
│   ├── pricing.js        # Pricing calculation
│   ├── consolidation.js  # Package consolidation
│   └── prohibited.js     # Prohibited items check
├── utils/
│   ├── notifications.js  # SMS, Email, WhatsApp, In-app
│   ├── prohibited.js     # Prohibited items database
│   └── translations.js   # i18n (English & Swahili)
├── uploads/              # File uploads directory
├── server.js             # Main Express server
├── package.json          # Dependencies
├── .env.example          # Environment template
└── .gitignore            # Git ignore rules
```

## Features Implemented

### Core Functionality
- User authentication with JWT
- Role-based access control (customer/admin)
- Order management and tracking
- Package consolidation
- Multi-currency support (USD, GBP, EUR, CNY to KES)

### Payment Systems (Placeholders)
- M-Pesa STK Push integration structure
- Stripe checkout integration structure
- PayPal integration structure
- Wallet system for internal payments

### Notifications
- SMS via Africa's Talking API
- WhatsApp Business API
- Email via SendGrid
- In-app notifications

### Admin Features
- User management
- Order management and bulk updates
- Revenue reporting and CSV export
- Admin activity logging
- Dashboard statistics

### Customer Features
- Virtual warehouse addresses
- Package consolidation requests
- Support ticket system
- Referral program (KES 50 reward)
- Real-time tracking
- Shipping cost calculator

### Multi-language Support
- English
- Swahili

## Database Schema

### Tables
- `users` - Customer and admin accounts
- `orders` - Shipping orders
- `packages` - Individual packages
- `transactions` - Payment transactions
- `wallet` - User wallet balances
- `referrals` - Referral program tracking
- `tickets` - Support tickets
- `ticket_messages` - Support ticket messages
- `notifications` - User notifications
- `admin_logs` - Admin activity logs

## Security Features

- Helmet.js for secure headers
- CORS protection
- Rate limiting (100 req/15min, stricter for auth)
- Password hashing with bcryptjs
- JWT token authentication
- SQL injection prevention (parameterized queries)
- Environment variable protection

## Development Tips

### Adding a New Route
1. Create file in `routes/` directory
2. Import and mount in `server.js`:
   ```js
   import myRoutes from './routes/my-routes.js';
   app.use('/api/my-endpoint', myRoutes);
   ```

### Database Operations
Always use parameterized queries to prevent SQL injection:
```js
const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
```

### Authentication
Import middleware in routes:
```js
import { authMiddleware, isAdmin } from '../middleware/auth.js';

router.get('/admin-only', authMiddleware, isAdmin, (req, res) => {
  // req.user contains JWT payload
});
```

### Error Handling
All routes should have try/catch blocks:
```js
try {
  // Your code
} catch (error) {
  console.error('Error:', error);
  res.status(500).json({
    success: false,
    message: 'Operation failed'
  });
}
```

## Integration Checklist

Before going to production, implement actual integrations:

- [ ] M-Pesa API (remove placeholders)
- [ ] Stripe API (remove placeholders)
- [ ] PayPal API (remove placeholders)
- [ ] SendGrid API (remove placeholders)
- [ ] Africa's Talking API (remove placeholders)
- [ ] WhatsApp Business API (remove placeholders)
- [ ] Production database (migrate from SQLite)
- [ ] Environment variables properly configured
- [ ] JWT_SECRET changed from default
- [ ] CORS_ORIGIN updated
- [ ] Rate limiting adjusted for production
- [ ] SSL/TLS certificates configured
- [ ] Database backups automated

## Troubleshooting

### Port Already in Use
```bash
# Change port in .env
PORT=5001
```

### Database Errors
```bash
# Delete corrupted database and reinitialize
rm swiftcargo.db*
npm run seed
```

### Missing Modules
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## Support

For issues, refer to:
- API logs in console
- Database queries in `database/init.js`
- Route handlers for specific endpoints
- Error handler in `server.js`

## License

MIT License - SwiftCargo Team
