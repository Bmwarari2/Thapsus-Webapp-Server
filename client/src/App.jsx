import React, { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { ProtectedRoute } from './components/ProtectedRoute'
import { SupportChatWidget } from './components/SupportChatWidget'
import { NotificationBanner } from './components/NotificationBanner'
import { ScrollToTop } from './components/ScrollToTop'
import { GoogleAnalytics } from './components/GoogleAnalytics'
import { MetaPixel } from './components/MetaPixel'
import { CookieConsent } from './components/CookieConsent'
import { useIdleTagManager } from './hooks/useIdleTagManager'

// Marketing IDs are read from Vite env vars at build time. Falls back to
// the existing literal IDs so the prod deployment keeps working without
// requiring an immediate env-var rollout. To override per-environment,
// set VITE_GTM_ID and/or VITE_FB_PIXEL_ID in `.env` or the host's env.
const GTM_ID       = import.meta.env.VITE_GTM_ID       || 'G-09M01VBWF0'
const FB_PIXEL_ID  = import.meta.env.VITE_FB_PIXEL_ID  || '1556063629186873'

// ── Eagerly loaded: Home is the landing page, always in the initial bundle ──
import { Home } from './pages/Home'

// ── Lazy-loaded pages: split into separate chunks, fetched on demand ────────
// This reduces the initial JS bundle by ~180 KiB (PageSpeed "Reduce unused JS")
const Login             = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })))
const Register          = lazy(() => import('./pages/Register').then(m => ({ default: m.Register })))
const CheckInbox        = lazy(() => import('./pages/CheckInbox').then(m => ({ default: m.CheckInbox })))
const VerifyEmail       = lazy(() => import('./pages/VerifyEmail').then(m => ({ default: m.VerifyEmail })))
const Dashboard         = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const TrackPackage      = lazy(() => import('./pages/TrackPackage').then(m => ({ default: m.TrackPackage })))
const PricingCalculator = lazy(() => import('./pages/PricingCalculator').then(m => ({ default: m.PricingCalculator })))
const Orders            = lazy(() => import('./pages/Orders').then(m => ({ default: m.Orders })))
const CreditCenter      = lazy(() => import('./pages/CreditCenter').then(m => ({ default: m.CreditCenter })))
const Transactions      = lazy(() => import('./pages/Transactions').then(m => ({ default: m.Transactions })))
const ProhibitedItems   = lazy(() => import('./pages/ProhibitedItems').then(m => ({ default: m.ProhibitedItems })))
const Support           = lazy(() => import('./pages/Support').then(m => ({ default: m.Support })))
const TicketConversation = lazy(() => import('./pages/TicketConversation').then(m => ({ default: m.TicketConversation })))
const UkStores          = lazy(() => import('./pages/UkStores').then(m => ({ default: m.UkStores })))
const Notifications     = lazy(() => import('./pages/Notifications').then(m => ({ default: m.Notifications })))
const WarehouseAddresses = lazy(() => import('./pages/WarehouseAddresses').then(m => ({ default: m.WarehouseAddresses })))
const AdminDashboard    = lazy(() => import('./pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })))
const AdminCustomerConsolidations = lazy(() => import('./pages/AdminCustomerConsolidations').then(m => ({ default: m.AdminCustomerConsolidations })))
const AdminIssueInvoice = lazy(() => import('./pages/AdminIssueInvoice').then(m => ({ default: m.AdminIssueInvoice })))
const AdminCreateBuyForMe = lazy(() => import('./pages/AdminCreateBuyForMe').then(m => ({ default: m.AdminCreateBuyForMe })))
const AdminDsarQueue    = lazy(() => import('./pages/AdminDsarQueue').then(m => ({ default: m.AdminDsarQueue })))
const AdminFinance      = lazy(() => import('./pages/AdminFinance').then(m => ({ default: m.AdminFinance })))
const ResetPassword     = lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ResetPassword })))
const ForgotPassword    = lazy(() => import('./pages/ForgotPassword').then(m => ({ default: m.ForgotPassword })))
const OrderDetail       = lazy(() => import('./pages/OrderDetail').then(m => ({ default: m.OrderDetail })))
const PublicPayment     = lazy(() => import('./pages/PublicPayment').then(m => ({ default: m.PublicPayment })))
const NewOrder          = lazy(() => import('./pages/NewOrder').then(m => ({ default: m.NewOrder })))
const OrderConfirmation = lazy(() => import('./pages/OrderConfirmation').then(m => ({ default: m.OrderConfirmation })))
const PrivacyPolicy     = lazy(() => import('./pages/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })))
const TermsOfService    = lazy(() => import('./pages/TermsOfService').then(m => ({ default: m.TermsOfService })))
const ShipInstructions  = lazy(() => import('./pages/ShipInstructions').then(m => ({ default: m.ShipInstructions })))
const FAQ               = lazy(() => import('./pages/FAQ').then(m => ({ default: m.FAQ })))
const Articles          = lazy(() => import('./pages/Articles').then(m => ({ default: m.Articles })))
const Article           = lazy(() => import('./pages/Article').then(m => ({ default: m.Article })))

// ── Framework v2 pages ─────────────────────────────────────────────────────
const OpsConsole          = lazy(() => import('./pages/OpsConsole').then(m => ({ default: m.OpsConsole })))
const OpsConsolidations   = lazy(() => import('./pages/OpsConsolidations').then(m => ({ default: m.OpsConsolidations })))
const OpsConsolidationDetail = lazy(() => import('./pages/OpsConsolidations').then(m => ({ default: m.OpsConsolidationDetail })))
const OpsDispatch         = lazy(() => import('./pages/OpsDispatch').then(m => ({ default: m.OpsDispatch })))
const OpsBuyForMe         = lazy(() => import('./pages/OpsBuyForMe').then(m => ({ default: m.OpsBuyForMe })))
const OpsSettings         = lazy(() => import('./pages/OpsSettings').then(m => ({ default: m.OpsSettings })))
const KpiDashboard        = lazy(() => import('./pages/KpiDashboard').then(m => ({ default: m.KpiDashboard })))
const DsarRequest         = lazy(() => import('./pages/DsarRequest').then(m => ({ default: m.DsarRequest })))
const BuyForMe            = lazy(() => import('./pages/BuyForMe').then(m => ({ default: m.BuyForMe })))
const AgentPortal         = lazy(() => import('./pages/partner/AgentPortal').then(m => ({ default: m.AgentPortal })))
const AgentInvoices       = lazy(() => import('./pages/partner/AgentPortal').then(m => ({ default: m.AgentInvoices })))
const RiderPwa            = lazy(() => import('./pages/partner/RiderPwa').then(m => ({ default: m.RiderPwa })))
const NpsLanding          = lazy(() => import('./pages/NpsLanding').then(m => ({ default: m.NpsLanding })))
const Referral            = lazy(() => import('./pages/Referral').then(m => ({ default: m.Referral })))
const InfluencerLanding   = lazy(() => import('./pages/InfluencerLanding').then(m => ({ default: m.InfluencerLanding })))
const AdminInfluencers    = lazy(() => import('./pages/AdminInfluencers').then(m => ({ default: m.AdminInfluencers })))
const AccountDeletion     = lazy(() => import('./pages/AccountDeletion').then(m => ({ default: m.AccountDeletion })))
const Activity            = lazy(() => import('./pages/Activity').then(m => ({ default: m.Activity })))
const Invoices            = lazy(() => import('./pages/Invoices').then(m => ({ default: m.Invoices })))
const Account             = lazy(() => import('./pages/Account').then(m => ({ default: m.Account })))

// ── Minimal loading spinner (shown briefly while lazy chunks load) ──────────
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
  </div>
)

function App() {
  // Defer GTM + Meta Pixel injection until the user actually interacts
  // (or 3.5s elapse), keeping the initial main-thread budget free for
  // hydration. Replaces the previous inline <script> blocks in index.html
  // that blocked LCP/TBT.
  useIdleTagManager(GTM_ID, FB_PIXEL_ID)

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />

      {/* Top spacer reserves layout space for the fixed h-16 top bar so page
          content doesn't sit underneath it (+ notch safe-area on mobile). */}
      <div
        aria-hidden="true"
        className="shrink-0 h-[calc(env(safe-area-inset-top,0px)+4rem)]"
      />

      <main className="relative flex-grow pb-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        <ScrollToTop />
        <GoogleAnalytics />
        <MetaPixel />
        <CookieConsent />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            {/* Influencer referral landing — public. Someone who received an
                influencer's link lands here, sees their name, and signs up +
                submits item links in one step. */}
            <Route path="/i/:code" element={<InfluencerLanding />} />
            <Route path="/check-inbox" element={<CheckInbox />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/track" element={<TrackPackage />} />
            {/* Universal links (iOS) and customer-shared URLs land here when
                the app isn't installed. Same component pre-fills the
                tracking input from the path param. Without this route,
                /track/<TN> returned 404 — audit A2. */}
            <Route path="/track/:tn" element={<TrackPackage />} />
            <Route path="/pricing" element={<PricingCalculator />} />
            <Route path="/prohibited" element={<ProhibitedItems />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/pay/:orderId" element={<PublicPayment />} />
            {/* /nps lands customers from the post-delivery survey email
                (utils/email.js::sendNpsInvitationEmail). The page bounces
                unauth visitors to /login?next=… then renders the survey. */}
            <Route path="/nps" element={<NpsLanding />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/articles" element={<Articles />} />
            <Route path="/articles/:slug" element={<Article />} />
            <Route path="/uk-stores" element={<UkStores />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms"   element={<TermsOfService />} />

            {/* Ship Instructions — protected so warehouse code is available */}
            <Route path="/ship-instructions" element={<ProtectedRoute><ShipInstructions /></ProtectedRoute>} />

            {/* Protected Routes */}
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
            <Route path="/orders/:id" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
            <Route path="/orders/new" element={<ProtectedRoute><NewOrder /></ProtectedRoute>} />
            {/* Friendly /new-order alias — top-level URL customers can type
                without remembering the /orders/ prefix. Same component. */}
            <Route path="/new-order" element={<ProtectedRoute><NewOrder /></ProtectedRoute>} />
            <Route path="/orders/confirmation" element={<ProtectedRoute><OrderConfirmation /></ProtectedRoute>} />
            <Route path="/credit" element={<ProtectedRoute><CreditCenter /></ProtectedRoute>} />
            <Route path="/referral" element={<ProtectedRoute><Referral /></ProtectedRoute>} />
            <Route path="/transactions" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
            <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
            <Route path="/support/:id" element={<ProtectedRoute><TicketConversation mode="customer" /></ProtectedRoute>} />
            <Route path="/warehouse" element={<ProtectedRoute><WarehouseAddresses /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="/activity" element={<ProtectedRoute><Activity /></ProtectedRoute>} />
            <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />

            {/* Customer-facing Framework v2 routes */}
            <Route path="/buy-for-me" element={<ProtectedRoute><BuyForMe /></ProtectedRoute>} />
            <Route path="/dsar"       element={<ProtectedRoute><DsarRequest /></ProtectedRoute>} />
            <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
            <Route path="/account/delete" element={<ProtectedRoute><AccountDeletion /></ProtectedRoute>} />

            {/* Operator console routes (operator + admin) */}
            <Route path="/ops"                          element={<ProtectedRoute roles={['operator']}><OpsConsole /></ProtectedRoute>} />
            <Route path="/ops/consolidations"           element={<ProtectedRoute roles={['operator']}><OpsConsolidations /></ProtectedRoute>} />
            <Route path="/ops/consolidations/:id"       element={<ProtectedRoute roles={['operator']}><OpsConsolidationDetail /></ProtectedRoute>} />
            <Route path="/ops/dispatch"                 element={<ProtectedRoute roles={['operator']}><OpsDispatch /></ProtectedRoute>} />
            <Route path="/ops/buy-for-me"               element={<ProtectedRoute roles={['operator']}><OpsBuyForMe /></ProtectedRoute>} />
            <Route path="/ops/settings"                 element={<ProtectedRoute adminOnly><OpsSettings /></ProtectedRoute>} />

            {/* Admin Routes */}
            <Route path="/admin" element={<ProtectedRoute adminOnly={true}><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/tickets/:id" element={<ProtectedRoute adminOnly={true}><TicketConversation mode="admin" /></ProtectedRoute>} />
            <Route path="/admin/customer-consolidations" element={<ProtectedRoute adminOnly={true}><AdminCustomerConsolidations /></ProtectedRoute>} />
            <Route path="/admin/issue-invoice" element={<ProtectedRoute adminOnly={true}><AdminIssueInvoice /></ProtectedRoute>} />
            <Route path="/admin/create-bfm" element={<ProtectedRoute adminOnly={true}><AdminCreateBuyForMe /></ProtectedRoute>} />
            <Route path="/admin/dsar" element={<ProtectedRoute adminOnly={true}><AdminDsarQueue /></ProtectedRoute>} />
            <Route path="/admin/influencers" element={<ProtectedRoute adminOnly={true}><AdminInfluencers /></ProtectedRoute>} />
            <Route path="/admin/finance" element={<ProtectedRoute financeOnly={true}><AdminFinance /></ProtectedRoute>} />
            <Route path="/kpi"   element={<ProtectedRoute adminOnly={true}><KpiDashboard /></ProtectedRoute>} />

            {/* Partner portals */}
            <Route path="/partner/agent"           element={<ProtectedRoute roles={['clearing_agent']}><AgentPortal /></ProtectedRoute>} />
            <Route path="/partner/agent/invoices"  element={<ProtectedRoute roles={['clearing_agent']}><AgentInvoices /></ProtectedRoute>} />
            <Route path="/partner/rider"           element={<ProtectedRoute roles={['rider']}><RiderPwa /></ProtectedRoute>} />

            {/* 404 */}
            <Route path="*" element={
              <div className="flex items-center justify-center min-h-[50vh]">
                <div className="text-center">
                  <h1 className="text-4xl font-bold text-[#1e3a5f] mb-4">404 - Page Not Found</h1>
                  <p className="text-gray-600 mb-8">The page you're looking for doesn't exist</p>
                  <a href="/" className="inline-block bg-orange-700 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-bold transition-colors">
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
