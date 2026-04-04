import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Footer } from './components/Footer'
import { ProtectedRoute } from './components/ProtectedRoute'

// Pages
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Dashboard } from './pages/Dashboard'
import { TrackPackage } from './pages/TrackPackage'
import { ExchangeRate } from './pages/ExchangeRate'
import { PricingCalculator } from './pages/PricingCalculator'
import { Orders } from './pages/Orders'
import { Wallet } from './pages/Wallet'
import { Consolidation } from './pages/Consolidation'
import { ProhibitedItems } from './pages/ProhibitedItems'
import { Support } from './pages/Support'
import { Referral } from './pages/Referral'
import { WarehouseAddresses } from './pages/WarehouseAddresses'
import { AdminDashboard } from './pages/AdminDashboard'

function App() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      <main className="flex-grow">
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/track" element={<TrackPackage />} />
          <Route path="/pricing" element={<PricingCalculator />} />
          <Route path="/exchange" element={<ExchangeRate />} />
          <Route path="/prohibited" element={<ProhibitedItems />} />

          {/* Protected Routes */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
          <Route path="/wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
          <Route path="/consolidation" element={<ProtectedRoute><Consolidation /></ProtectedRoute>} />
          <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
          <Route path="/referral" element={<ProtectedRoute><Referral /></ProtectedRoute>} />
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
      </main>

      <Footer />
    </div>
  )
}

export default App
