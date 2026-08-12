import React, { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ScrollToTop } from './components/ScrollToTop'
import { GoogleAnalytics } from './components/GoogleAnalytics'
import { CookieConsent } from './components/CookieConsent'
import { useIdleTagManager } from './hooks/useIdleTagManager'

// Google Tag Manager ID is read from a Vite env var at build time, falling
// back to the existing literal ID so prod keeps working without an
// immediate env-var rollout. Override per-environment with VITE_GTM_ID.
const GTM_ID = import.meta.env.VITE_GTM_ID || 'G-09M01VBWF0'

// ── Eagerly loaded: Home is the landing page, always in the initial bundle ──
import { Home } from './pages/Home'

// ── Lazy-loaded pages: split into separate chunks, fetched on demand ────────
const Login          = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })))
const TrackPackage   = lazy(() => import('./pages/TrackPackage').then(m => ({ default: m.TrackPackage })))
const ResetPassword  = lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ResetPassword })))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword').then(m => ({ default: m.ForgotPassword })))
const PrivacyPolicy  = lazy(() => import('./pages/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })))
const TermsOfService = lazy(() => import('./pages/TermsOfService').then(m => ({ default: m.TermsOfService })))
const FAQ            = lazy(() => import('./pages/FAQ').then(m => ({ default: m.FAQ })))
const Articles       = lazy(() => import('./pages/Articles').then(m => ({ default: m.Articles })))
const Article        = lazy(() => import('./pages/Article').then(m => ({ default: m.Article })))

// ── Operator / admin pages ──────────────────────────────────────────────────
const OpsConsole     = lazy(() => import('./pages/OpsConsole').then(m => ({ default: m.OpsConsole })))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })))

// ── Minimal loading spinner (shown briefly while lazy chunks load) ──────────
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
  </div>
)

function App() {
  // Defer GTM injection until the user actually interacts (or 3.5s
  // elapse), keeping the initial main-thread budget free for hydration.
  useIdleTagManager(GTM_ID)

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
        <CookieConsent />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/track" element={<TrackPackage />} />
            {/* Universal links (iOS) and customer-shared URLs land here.
                Same component pre-fills the tracking input from the path
                param — without this, /track/<TN> returned 404 (audit A2). */}
            <Route path="/track/:tn" element={<TrackPackage />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/articles" element={<Articles />} />
            <Route path="/articles/:slug" element={<Article />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms"   element={<TermsOfService />} />

            {/* Operator console (operator + admin) */}
            <Route path="/ops" element={<ProtectedRoute roles={['operator']}><OpsConsole /></ProtectedRoute>} />

            {/* Admin */}
            <Route path="/admin" element={<ProtectedRoute adminOnly={true}><AdminDashboard /></ProtectedRoute>} />

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
      </main>

      <Footer />
    </div>
  )
}

export default App
