# SwiftCargo Client - React Frontend

Complete React 18 frontend for SwiftCargo shipping and forwarding web application.

## Project Structure

```
client/
├── public/              # Static files
│   ├── manifest.json   # PWA manifest
│   └── sw.js          # Service worker
├── src/
│   ├── components/    # Reusable React components
│   │   ├── Navbar.jsx
│   │   ├── Footer.jsx
│   │   └── ProtectedRoute.jsx
│   ├── context/       # React Context for state management
│   │   ├── AuthContext.jsx       # Authentication state
│   │   └── LanguageContext.jsx   # Multi-language support (EN/SW)
│   ├── pages/         # Page components (routes)
│   │   ├── Home.jsx              # Landing page
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Orders.jsx
│   │   ├── NewOrder.jsx
│   │   ├── TrackPackage.jsx
│   │   ├── ExchangeRate.jsx
│   │   ├── PricingCalculator.jsx
│   │   ├── Wallet.jsx
│   │   ├── Consolidation.jsx
│   │   ├── ProhibitedItems.jsx
│   │   ├── Support.jsx
│   │   ├── Referral.jsx
│   │   ├── WarehouseAddresses.jsx
│   │   └── AdminDashboard.jsx
│   ├── api.js         # Axios API client and all API calls
│   ├── App.jsx        # Main router and layout
│   ├── main.jsx       # React 18 entry point
│   └── index.css      # Global styles + Tailwind directives
├── index.html         # HTML entry point
├── package.json       # Dependencies and scripts
├── vite.config.js     # Vite configuration
├── tailwind.config.js # Tailwind CSS configuration
├── postcss.config.js  # PostCSS configuration
└── README.md          # This file
```

## Dependencies

### Production
- **react**: 18.2.0 - UI library
- **react-dom**: 18.2.0 - DOM rendering
- **react-router-dom**: 6.20.0 - Client-side routing
- **axios**: 1.6.2 - HTTP client for API calls
- **lucide-react**: 0.344.0 - Icon library
- **react-hot-toast**: 2.4.1 - Toast notifications
- **recharts**: 2.10.3 - Charts and visualizations

### Development
- **@vitejs/plugin-react**: 4.2.1 - Vite React plugin
- **vite**: 5.0.8 - Build tool
- **tailwindcss**: 3.3.6 - Utility-first CSS framework
- **postcss**: 8.4.32 - CSS transformation
- **autoprefixer**: 10.4.16 - CSS vendor prefixes
- **@tailwindcss/forms**: 0.5.7 - Form styling

## Setup Instructions

### 1. Install Dependencies
```bash
cd client
npm install
```

### 2. Configure Environment
Create a `.env` file in the client directory (optional):
```
VITE_API_URL=http://localhost:5000
VITE_APP_NAME=SwiftCargo
```

### 3. Run Development Server
```bash
npm run dev
```
The app will be available at `http://localhost:5173`

### 4. Build for Production
```bash
npm run build
```

### 5. Preview Production Build
```bash
npm run preview
```

## Key Features

### Authentication & Security
- JWT token-based authentication
- Protected routes with automatic redirect
- Auto-login on token presence
- Secure token storage in localStorage
- Admin role-based access control

### Multi-Language Support
- English and Swahili translations
- Language switcher in navbar
- Persistent language preference
- Comprehensive translation object with 200+ keys

### Responsive Design
- Mobile-first approach
- Tailwind CSS utilities
- Responsive grid layouts
- Mobile hamburger menu
- Touch-friendly buttons

### User Features
- **Dashboard**: User overview with stats and recent orders
- **Orders**: Create, track, and manage orders
- **Wallet**: Deposit funds via M-Pesa, Card, or PayPal
- **Pricing**: Real-time shipping cost calculator
- **Exchange Rates**: USD/GBP to KES conversion
- **Warehouse Addresses**: Unique addresses per market
- **Consolidation**: Combine packages to save on shipping
- **Referral Program**: Share and earn rewards
- **Support Tickets**: Create and track support issues
- **Prohibited Items**: Check if items are allowed

### Admin Features
- **Dashboard**: Real-time stats and charts
- **User Management**: View and manage users
- **Order Management**: Bulk status updates
- **Revenue Reports**: Revenue analytics by market
- **Support Tickets**: Manage customer tickets
- **Charts**: Interactive visualizations (Recharts)

### Design System
- **Brand Colors**: Navy (#1e3a5f), Orange (#f97316)
- **High Contrast**: Dark buttons with white text
- **Status Badges**: Color-coded statuses
- **Cards**: Consistent shadow and rounded corners
- **Spacing**: Consistent padding and gaps

## API Integration

All API calls are handled through `/src/api.js` using Axios:

```javascript
// Example API call
import { ordersApi } from './api'

const orders = await ordersApi.list(filters)
const order = await ordersApi.create(orderData)
const tracked = await ordersApi.track(trackingNumber)
```

API routes are prefixed with `/api` and proxied to `http://localhost:5000` in development.

## Component Patterns

### Page Components
Each page follows a consistent pattern:
1. Header with title
2. Loading state
3. Error handling
4. Form or content
5. Action buttons

### Forms
All forms include:
- Input validation
- Error messages
- Loading states
- Success/error toasts
- Accessibility labels

### Tables
All tables include:
- Responsive overflow
- Pagination
- Sorting/filtering
- Status badges
- Action buttons

## State Management

### Authentication Context
```javascript
const { user, token, isAuthenticated, isAdmin, login, logout } = useAuth()
```

### Language Context
```javascript
const { language, t, changeLanguage } = useLanguage()
```

### Local State
- React hooks (useState) for component state
- Form data management
- UI state (modals, dropdowns)

## Styling

### Tailwind Classes
- `bg-[#1e3a5f]` - Navy primary color
- `bg-orange-500` - Orange accent color
- `.card` - Consistent card styling
- `.status-badge` - Status indicators
- `.input-field` - Form inputs

### Custom Styles
Custom CSS classes in `index.css`:
- `.btn-primary` - Navy button
- `.btn-cta` - Orange call-to-action button
- `.status-*` - Status-specific colors
- `.slide-in` - Slide animation
- Custom scrollbar styling

## PWA Features

### Service Worker
- Offline support
- Request caching strategy
- Background sync
- Push notifications

### Manifest
- App icon
- Theme colors
- App shortcuts
- Display settings

## Performance Optimizations

- Lazy loading with React Router
- Image optimization
- CSS minification (production)
- JavaScript bundling
- Code splitting

## Security Best Practices

- HTTPS in production
- Secure token storage
- CSRF protection (via API)
- Input validation
- XSS prevention (React escaping)
- SQL injection protection (backend)

## Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- iOS Safari: Latest 2 versions
- Mobile browsers with ES6+ support

## Development Workflow

1. **Start Dev Server**: `npm run dev`
2. **Create Components**: Follow existing patterns
3. **Test Locally**: `http://localhost:5173`
4. **Build**: `npm run build`
5. **Deploy**: Push to production server

## Troubleshooting

### API Connection Issues
- Verify backend is running on `localhost:5000`
- Check CORS headers in backend
- Verify token in localStorage

### Styling Issues
- Clear browser cache
- Restart dev server
- Check Tailwind config paths

### Login Issues
- Check token expiration
- Verify API endpoint
- Clear localStorage and try again

## Deployment

### Production Build
```bash
npm run build
```

### Deploy to Server
1. Copy `dist/` folder to web server
2. Configure server to handle SPA routing
3. Point to correct API endpoint
4. Set up HTTPS and security headers

## Code Quality

### ESLint
Project is configured for React best practices.

### Formatting
Use Prettier for consistent formatting:
```bash
npx prettier --write src/
```

## Support

For issues or questions about the frontend:
1. Check existing components for patterns
2. Review React Router documentation
3. Check Tailwind CSS docs
4. Review Axios documentation

## License

Proprietary - SwiftCargo 2024
