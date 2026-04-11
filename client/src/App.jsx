import React, { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Footer } from './components/Footer'
import { ProtectedRoute } from './components/ProtectedRoute'
import { SupportChatWidget } from './components/SupportChatWidget'
import { NotificationBanner } from './components/NotificationBanner'
import { ScrollToTop } from './components/ScrollToTop'
import { GoogleAnalytics } from './components/GoogleAnalytics'
import { MetaPixel } from './components/MetaPixel'

// ── Eagerly loaded: Home is the landing page, always in the initial bundle ──
import { Home } from './pages/Home'

// ── Lazy-loaded pages: split into separate chunks, fetched on demand ────────
// This reduces the initial JS bundle by ~180 KiB (PageSpeed "Reduce unused JS")
const Login             = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })))
const Register          = lazy(() => import('./pages/Register').then(m => ({ default: m.Register })))
const Dashboard         = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const TrackPackage      = lazy(() => import('./pages/TrackPackage').then(m => ({ default: m.TrackPackage })))
const ExchangeRate      = lazy(() => import('./pages/ExchangeRate').then(m => ({ default: m.ExchangeRate })))
const PricingCalculator = lazy(() => import('./pages/PricingCalculator').then(m => ({ default: m.PricingCalculator })))
const Orders            = lazy(() => import('./pages/Orders').then(m => ({ default: m.Orders })))
const Wallet            = lazy(() => import('./pages/Wallet').then(m => ({ default: m.Wallet })))
const Consolidation     = lazy(() => import('./pages/Consolidation').then(m => ({ default: m.Consolidation })))
const ProhibitedItems   = lazy(() => import('./pages/ProhibitedItems').then(m => ({ default: m.ProhibitedItems })))
const Support           = lazy(() => import('./pages/Support').then(m => ({ default: m.Support })))
const WarehouseAddresses = lazy(() => import('./pages/WarehouseAddresses').then(m => ({ default: m.WarehouseAddresses })))
const AdminDashboard    = lazy(() => import('./pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })))
const ResetPassword     = lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ResetPassword })))
const ForgotPassword    = lazy(() => import('./pages/ForgotPassword').then(m => ({ default: m.ForgotPassword })))
const OrderDetail       = lazy(() => import('./pages/OrderDetail').then(m => ({ default: m.OrderDetail })))
const PublicPayment     = lazy(() => import('./pages/PublicPayment').then(m => ({ default: m.PublicPayment })))
const NewOrder          = lazy(() => import('./pages/NewOrder').then(m => ({ default: m.NewOrder })))
const OrderConfirmation = lazy(() => import('./pages/OrderConfirmation').then(m => ({ default: m.OrderConfirmation })))
const PrivacyPolicy     = lazy(() => import('./pages/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })))
const TermsOfService    = lazy(() => import('./pages/TermsOfService').then(m => ({ default: m.TermsOfService })))
const ShipInstructions  = lazy(() => import('./pages/ShipInstructions').then(m => ({ default: m.ShipInstructions })))

// ── Minimal loading spinner (shown briefly while lazy chunks load) ──────────
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
  </div>
)

function App() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      <main className="relative flex-grow">
        <ScrollToTop />
        <GoogleAnalytics />
        <MetaPixel />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/track" element={<TrackPackage />} />
            <Route path="/pricing" element={<PricingCalculator />} />
            <Route path="/exchange" element={<ExchangeRate />} />
            <Route path="/prohibited" element={<ProhibitedItems />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/pay/:orderId" element={<PublicPayment />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms"   element={<TermsOfService />} />

            {/* Ship Instructions — protected so warehouse code is available */}
            <Route path="/ship-instructions" element={<ProtectedRoute><ShipInstructions /></ProtectedRoute>} />

            {/* Protected Routes */}
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
            <Route path="/orders/:id" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
            <Route path="/orders/new" element={<ProtectedRoute><NewOrder /></ProtectedRoute>} />
            <Route path="/orders/confirmation" element={<ProtectedRoute><OrderConfirmation /></ProtectedRoute>} />
            <Route path="/wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
            <Route path="/consolidation" element={<ProtectedRoute><Consolidation /></ProtectedRoute>} />
            <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
            <Route path="/warehouse" element={<ProtectedRoute><WarehouseAddresses /></ProtectedRoute>} />

            {/* Admin Routes */}
            <Route path="/admin" element={<ProtectedRoute adminOnly={true}><AdminDashboard /></ProtectedRoute>} />

            {/* 404 */}
            <Route path="*" element={
              <div className="flex items-center justify-center min-h-[50vh]">
                <div className="text-center">
                  <h1 className="text-4xl font-bold text-[#1e3a5f] mb-4">404 - Page Not Found</h1>
                  <p className="text-gray-600 mb-8">The page you're looking for doesn't exist</p>
                  <a href="/" className="inline-block bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-bold transition-colors">
                    Back to Home
                  </a>
                </div>
              </div>
            } />
          </Routes>
        </Suspense>

        <SupportChatWidget />
        <NotificationBanner />
      </main>

      <Footer />
    </div>
  )
}

export default App
