import React, { useState, useEffect } from 'react'
import {
  Users, Package, DollarSign, BarChart3, MessageSquare, Activity,
  Lock, RefreshCw, Trash2, XCircle, Plus, CreditCard, Search,
  UserPlus, Bell, Mail
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { adminApi, authApi } from '../api'
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import toast from 'react-hot-toast'

export const AdminDashboard = () => {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [orders, setOrders] = useState([])
  const [tickets, setTickets] = useState([])
  const [selectedOrders, setSelectedOrders] = useState([])
  const [newStatus, setNewStatus] = useState('')

  // Admin order management
  const [showCreateOrderForm, setShowCreateOrderForm] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [createOrderForm, setCreateOrderForm] = useState({
    retailer: '', market: 'UK', description: '',
    weight_kg: '',
    dimensions: { length: '', width: '', height: '' },
    shipping_speed: 'economy',
    insurance: false, declared_value: ''
  })
  const [creatingOrder, setCreatingOrder] = useState(false)

  // Payment request modal
  const [paymentModal, setPaymentModal] = useState(null) // { orderId, trackingNumber }
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')

  // Cancel order modal
  const [cancelModal, setCancelModal] = useState(null) // { orderId, trackingNumber }
  const [cancelReason, setCancelReason] = useState('')

  // Password change state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '', newPassword: '', confirmPassword: '',
  })
  const [changingPassword, setChangingPassword] = useState(false)

  // Exchange rate state
  const [exchangeRates, setExchangeRates] = useState({
    USD_KES: '', GBP_KES: '', EUR_KES: '', CNY_KES: '',
  })
  const [savingRates, setSavingRates] = useState(false)
  const [ratesLastUpdated, setRatesLastUpdated] = useState(null)

  // Create user/admin account state
  const [showCreateUserForm, setShowCreateUserForm] = useState(false)
  const [createUserForm, setCreateUserForm] = useState({
    name: '', email: '', phone: '', role: 'customer'
  })
  const [creatingUser, setCreatingUser] = useState(false)

  // Payment reminder modal
  const [reminderModal, setReminderModal] = useState(null) // { orderId, trackingNumber }
  const [reminderAmount, setReminderAmount] = useState('')
  const [reminderNotes, setReminderNotes] = useState('')

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const results = await Promise.allSettled([
        adminApi.getDashboardStats(),
        adminApi.listUsers(),
        adminApi.listOrders(),
        adminApi.getExchangeRates(),
      ])

      if (results[0].status === 'fulfilled') setStats(results[0].value.data?.stats || null)
      if (results[1].status === 'fulfilled') setUsers(results[1].value.data?.users || [])
      if (results[2].status === 'fulfilled') setOrders(results[2].value.data?.orders || [])
      if (results[3].status === 'fulfilled') {
        const ratesData = results[3].value.data
        if (ratesData?.rates) {
          setExchangeRates({
            USD_KES: ratesData.rates.USD_KES || '',
            GBP_KES: ratesData.rates.GBP_KES || '',
            EUR_KES: ratesData.rates.EUR_KES || '',
            CNY_KES: ratesData.rates.CNY_KES || '',
          })
          setRatesLastUpdated(ratesData.updated_at || null)
        }
      }
    } catch (err) {
      toast.error('Failed to load admin data')
    } finally {
      setLoading(false)
    }
  }

  // ── Password change ──────────────────────────────────────────────────
  const handlePasswordChange = async (e) => {
    e.preventDefault()
    const { currentPassword, newPassword, confirmPassword } = passwordForm
    if (!currentPassword || !newPassword || !confirmPassword) { toast.error('Please fill in all password fields'); return }
    if (newPassword.length < 6) { toast.error('New password must be at least 6 characters'); return }
    if (newPassword !== confirmPassword) { toast.error('New passwords do not match'); return }
    try {
      setChangingPassword(true)
      await authApi.changePassword(currentPassword, newPassword)
      toast.success('Password changed successfully')
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      toast.error(err.message || 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  // ── Exchange rates ────────────────────────────────────────────────────
  const handleRateChange = (pair, value) => setExchangeRates((prev) => ({ ...prev, [pair]: value }))

  const handleSaveRates = async (e) => {
    e.preventDefault()
    const rates = {}
    for (const [pair, val] of Object.entries(exchangeRates)) {
      const num = parseFloat(val)
      if (!val || isNaN(num) || num <= 0) { toast.error(`Invalid rate for ${pair.replace('_', '/')}`); return }
      rates[pair] = num
    }
    try {
      setSavingRates(true)
      await adminApi.setExchangeRates(rates)
      toast.success('Exchange rates updated successfully')
      setRatesLastUpdated(new Date().toISOString())
    } catch (err) {
      toast.error(err.message || 'Failed to update exchange rates')
    } finally {
      setSavingRates(false)
    }
  }

  // ── Order bulk update ─────────────────────────────────────────────────
  const handleToggleOrderSelection = (orderId) => {
    setSelectedOrders((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    )
  }

  const handleBulkUpdateOrders = async () => {
    if (!newStatus || selectedOrders.length === 0) { toast.error('Please select orders and a new status'); return }
    try {
      await adminApi.bulkUpdateOrders(selectedOrders, newStatus)
      toast.success('Orders updated successfully')
      setSelectedOrders([])
      setNewStatus('')
      const ordersRes = await adminApi.listOrders()
      setOrders(ordersRes.data?.orders || [])
    } catch (err) {
      toast.error('Failed to update orders')
    }
  }

  // ── Delete order ──────────────────────────────────────────────────────
  const handleDeleteOrder = async (orderId, trackingNumber) => {
    if (!window.confirm(`Permanently delete order ${trackingNumber}? This cannot be undone.`)) return
    try {
      await adminApi.deleteOrder(orderId)
      toast.success(`Order ${trackingNumber} deleted`)
      setOrders((prev) => prev.filter((o) => o.id !== orderId))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete order')
    }
  }

  // ── Cancel order ──────────────────────────────────────────────────────
  const handleCancelOrder = async () => {
    if (!cancelModal) return
    try {
      await adminApi.cancelOrder(cancelModal.orderId, cancelReason)
      toast.success(`Order ${cancelModal.trackingNumber} cancelled`)
      setOrders((prev) =>
        prev.map((o) => o.id === cancelModal.orderId ? { ...o, status: 'cancelled' } : o)
      )
      setCancelModal(null)
      setCancelReason('')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel order')
    }
  }

  // ── Request payment ───────────────────────────────────────────────────
  const handleRequestPayment = async () => {
    if (!paymentModal) return
    const amount = parseFloat(paymentAmount)
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return }
    try {
      await adminApi.requestPayment(paymentModal.orderId, amount, paymentNotes)
      toast.success('Payment request sent to customer')
      setPaymentModal(null)
      setPaymentAmount('')
      setPaymentNotes('')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send payment request')
    }
  }

  // ── Create user/admin account ──────────────────────────────────────────
  const handleCreateUser = async (e) => {
    e.preventDefault()
    const { name, email, phone, role } = createUserForm
    if (!name || !email || !phone) { toast.error('Please fill in all required fields'); return }
    try {
      setCreatingUser(true)
      await adminApi.createUser({ name, email, phone, role })
      toast.success(`${role === 'admin' ? 'Admin' : 'User'} account created. Welcome email sent to ${email}.`)
      setShowCreateUserForm(false)
      setCreateUserForm({ name: '', email: '', phone: '', role: 'customer' })
      const usersRes = await adminApi.listUsers()
      setUsers(usersRes.data?.users || [])
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to create account')
    } finally {
      setCreatingUser(false)
    }
  }

  // ── Send payment reminder ─────────────────────────────────────────────
  const handleSendReminder = async () => {
    if (!reminderModal) return
    const amount = parseFloat(reminderAmount)
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return }
    try {
      await adminApi.sendPaymentReminder(reminderModal.orderId, amount, reminderNotes)
      toast.success('Payment reminder sent to customer')
      setReminderModal(null)
      setReminderAmount('')
      setReminderNotes('')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send payment reminder')
    }
  }

  // ── Customer search (for create order form) ───────────────────────────
  const handleSearchCustomers = async (query) => {
    setCustomerSearch(query)
    if (query.length < 2) { setCustomerResults([]); return }
    try {
      const res = await adminApi.searchCustomers(query)
      setCustomerResults(res.data?.customers || [])
    } catch { setCustomerResults([]) }
  }

  // ── Create order for client ────────────────────────────────────────────
  const handleCreateOrderForClient = async (e) => {
    e.preventDefault()
    if (!selectedCustomer) { toast.error('Please search and select a customer'); return }
    try {
      setCreatingOrder(true)
      const { dimensions, ...rest } = createOrderForm
      const hasDimensions = dimensions.length || dimensions.width || dimensions.height
      await adminApi.createOrderForClient({
        customer_email: selectedCustomer.email,
        ...rest,
        weight_kg: parseFloat(rest.weight_kg) || 0,
        declared_value: parseFloat(rest.declared_value) || 0,
        dimensions: hasDimensions ? {
          length: parseFloat(dimensions.length) || 0,
          width: parseFloat(dimensions.width) || 0,
          height: parseFloat(dimensions.height) || 0,
        } : null,
      })
      toast.success('Order created successfully')
      setShowCreateOrderForm(false)
      setSelectedCustomer(null)
      setCustomerSearch('')
      setCustomerResults([])
      setCreateOrderForm({ retailer: '', market: 'UK', description: '', weight_kg: '', dimensions: { length: '', width: '', height: '' }, shipping_speed: 'economy', insurance: false, declared_value: '' })
      const ordersRes = await adminApi.listOrders()
      setOrders(ordersRes.data?.orders || [])
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create order')
    } finally {
      setCreatingOrder(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  const COLORS = ['#1e3a5f', '#f97316', '#10b981', '#6366f1']
  const userStats = stats?.users || {}
  const orderStats = stats?.orders || {}
  const marketStats = stats?.markets || []
  const revenueStats = stats?.revenue || {}
  const marketChartData = marketStats.map((m) => ({ name: m.market, value: parseInt(m.count) || 0, revenue: parseFloat(m.value) || 0 }))

  const statusBadge = (status) => {
    const cls = {
      delivered: 'bg-green-100 text-green-800',
      in_transit: 'bg-blue-100 text-blue-800',
      pending: 'bg-yellow-100 text-yellow-800',
      cancelled: 'bg-red-100 text-red-800',
    }
    return cls[status] || 'bg-purple-100 text-purple-800'
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-2">{t('admin.title')}</h1>
          <p className="text-gray-600">Platform analytics and management</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-1">
          {['overview', 'users', 'orders', 'revenue', 'tickets', 'exchange', 'settings'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap transition-colors ${
                activeTab === tab ? 'bg-[#1e3a5f] text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {tab === 'exchange' ? 'Exchange Rates' : tab === 'settings' ? 'Settings' : t(`admin.${tab}`)}
            </button>
          ))}
        </div>

        {/* ═══ Overview ═══ */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-600 text-sm mb-1">{t('admin.totalUsers')}</p>
                    <h3 className="text-4xl font-bold text-[#1e3a5f]">{userStats.total || 0}</h3>
                    <p className="text-xs text-gray-500 mt-1">{userStats.customers || 0} customers, {userStats.admins || 0} admins</p>
                  </div>
                  <Users className="text-blue-500" size={32} />
                </div>
              </div>
              <div className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-600 text-sm mb-1">{t('admin.activeOrders')}</p>
                    <h3 className="text-4xl font-bold text-[#1e3a5f]">{orderStats.total_orders || 0}</h3>
                    <p className="text-xs text-gray-500 mt-1">{orderStats.pending || 0} pending, {orderStats.in_transit || 0} in transit</p>
                  </div>
                  <Package className="text-orange-500" size={32} />
                </div>
              </div>
              <div className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-600 text-sm mb-1">Delivered Orders</p>
                    <h3 className="text-4xl font-bold text-[#1e3a5f]">{orderStats.delivered || 0}</h3>
                  </div>
                  <Activity className="text-green-500" size={32} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card">
                <p className="text-gray-600 text-sm mb-1">Total Revenue (Completed)</p>
                <h3 className="text-3xl font-bold text-green-600">KES {(revenueStats.total_revenue || 0).toLocaleString()}</h3>
                <p className="text-xs text-gray-500 mt-1">{revenueStats.total_transactions || 0} transactions</p>
              </div>
              <div className="card">
                <p className="text-gray-600 text-sm mb-1">Estimated Order Value</p>
                <h3 className="text-3xl font-bold text-blue-600">KES {(orderStats.total_estimated_value || 0).toLocaleString()}</h3>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card">
                <h2 className="text-xl font-bold text-[#1e3a5f] mb-4">Orders by Status</h2>
                {stats?.order_statuses?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={stats.order_statuses.map((s) => ({ name: s.status?.replace(/_/g, ' '), value: parseInt(s.count) || 0 }))} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} outerRadius={80} fill="#8884d8" dataKey="value">
                        {stats.order_statuses.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-center text-gray-500 py-8">No order data available</p>}
              </div>
              <div className="card">
                <h2 className="text-xl font-bold text-[#1e3a5f] mb-4">{t('admin.ordersByMarket')}</h2>
                {marketChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={marketChartData} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} outerRadius={80} fill="#8884d8" dataKey="value">
                        {marketChartData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-center text-gray-500 py-8">No market data available</p>}
              </div>
            </div>
            {/* Sales by Market (Revenue Breakdown) */}
            {marketStats.length > 0 && (
              <div className="card">
                <h2 className="text-xl font-bold text-[#1e3a5f] mb-4">Sales by Market (Revenue)</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  {marketStats.map((m, i) => (
                    <div key={m.market} className="rounded-lg p-4" style={{ backgroundColor: `${COLORS[i % COLORS.length]}10` }}>
                      <p className="text-sm text-gray-600 mb-1">{m.market}</p>
                      <p className="text-2xl font-bold" style={{ color: COLORS[i % COLORS.length] }}>KES {(parseFloat(m.value) || 0).toLocaleString()}</p>
                      <p className="text-xs text-gray-500 mt-1">{parseInt(m.count) || 0} order(s)</p>
                    </div>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={marketChartData.map((m) => ({ name: m.name, value: m.revenue }))} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: KES ${value.toLocaleString()}`} outerRadius={80} fill="#8884d8" dataKey="value">
                      {marketChartData.map((_, index) => <Cell key={`rev-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value) => `KES ${value.toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* ═══ Users ═══ */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* Create User Button */}
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-[#1e3a5f]">{t('admin.userManagement')}</h2>
              <button
                onClick={() => setShowCreateUserForm((v) => !v)}
                className="flex items-center gap-2 bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-4 py-2 rounded-lg font-bold transition-colors"
              >
                <UserPlus size={16} />
                Create Account
              </button>
            </div>

            {/* Create User/Admin Form */}
            {showCreateUserForm && (
              <div className="card border-2 border-[#1e3a5f]">
                <h3 className="text-lg font-bold text-[#1e3a5f] mb-4">Create New Account</h3>
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                      <input
                        type="text"
                        value={createUserForm.name}
                        onChange={(e) => setCreateUserForm((p) => ({ ...p, name: e.target.value }))}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                        placeholder="e.g. John Doe"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                      <input
                        type="email"
                        value={createUserForm.email}
                        onChange={(e) => setCreateUserForm((p) => ({ ...p, email: e.target.value }))}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                        placeholder="e.g. john@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                      <input
                        type="text"
                        value={createUserForm.phone}
                        onChange={(e) => setCreateUserForm((p) => ({ ...p, phone: e.target.value }))}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                        placeholder="e.g. +254712345678"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Account Type *</label>
                      <select
                        value={createUserForm.role}
                        onChange={(e) => setCreateUserForm((p) => ({ ...p, role: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                      >
                        <option value="customer">Customer</option>
                        <option value="admin">Admin (Full Access)</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500">
                    The user will receive a welcome email with a link to set up their password.
                    {createUserForm.role === 'admin' && (
                      <span className="text-orange-600 font-medium"> This admin will have the same permission levels as your account.</span>
                    )}
                  </p>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={creatingUser}
                      className="bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-6 py-2 rounded-lg font-bold disabled:opacity-50"
                    >
                      {creatingUser ? 'Creating...' : `Create ${createUserForm.role === 'admin' ? 'Admin' : 'Customer'} Account`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateUserForm(false)}
                      className="border border-gray-300 px-6 py-2 rounded-lg font-bold text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#1e3a5f]">All Users</h3>
              <span className="text-sm text-gray-500">{users.length} user(s)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Phone</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Warehouse ID</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Role</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Balance</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Joined</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.length === 0 ? (
                    <tr><td colSpan="9" className="px-6 py-8 text-center text-gray-500">No users found</td></tr>
                  ) : users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{u.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{u.email}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{u.phone}</td>
                      <td className="px-6 py-4 text-sm font-mono text-gray-600">{u.warehouse_id}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>{u.role}</span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{u.is_active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">KES {(u.wallet_balance || 0).toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                      <td className="px-6 py-4">
                        {u.id !== user?.id && (
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Permanently delete user ${u.name} (${u.email})? This will remove ALL their orders, transactions, and data. This cannot be undone.`)) return
                              try {
                                await adminApi.deleteUser(u.id)
                                toast.success(`User ${u.name} deleted successfully`)
                                setUsers((prev) => prev.filter((usr) => usr.id !== u.id))
                              } catch (err) {
                                toast.error(err.response?.data?.message || err.message || 'Failed to delete user')
                              }
                            }}
                            title="Delete User"
                            className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        )}

        {/* ═══ Orders ═══ */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            {/* Create Order Button */}
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-[#1e3a5f]">Order Management</h2>
              <button
                onClick={() => setShowCreateOrderForm((v) => !v)}
                className="flex items-center gap-2 bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-4 py-2 rounded-lg font-bold transition-colors"
              >
                <Plus size={16} />
                Create Order for Client
              </button>
            </div>

            {/* Create Order Form */}
            {showCreateOrderForm && (
              <div className="card border-2 border-[#1e3a5f]">
                <h3 className="text-lg font-bold text-[#1e3a5f] mb-4">Create Order for Client</h3>
                <form onSubmit={handleCreateOrderForClient} className="space-y-4">
                  {/* Customer search */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Search Customer *</label>
                    <div className="relative">
                      <div className="flex items-center gap-2">
                        <Search size={16} className="text-gray-400 absolute left-3" />
                        <input
                          type="text"
                          value={customerSearch}
                          onChange={(e) => handleSearchCustomers(e.target.value)}
                          placeholder="Search by name or email..."
                          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                        />
                      </div>
                      {customerResults.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                          {customerResults.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => { setSelectedCustomer(c); setCustomerSearch(c.name); setCustomerResults([]) }}
                              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                            >
                              <p className="font-medium text-sm text-gray-900">{c.name}</p>
                              <p className="text-xs text-gray-500">{c.email} · {c.warehouse_id}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedCustomer && (
                      <p className="mt-1 text-xs text-green-600 font-medium">✓ Selected: {selectedCustomer.name} ({selectedCustomer.email})</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Retailer *</label>
                      <input type="text" value={createOrderForm.retailer} onChange={(e) => setCreateOrderForm((p) => ({ ...p, retailer: e.target.value }))} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" placeholder="e.g. Amazon" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Market *</label>
                      <select value={createOrderForm.market} onChange={(e) => setCreateOrderForm((p) => ({ ...p, market: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]">
                        <option value="UK">United Kingdom</option>
                        <option value="USA">United States</option>
                        <option value="China">China</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Actual Weight (kg)</label>
                      <input type="number" step="0.1" min="0" value={createOrderForm.weight_kg} onChange={(e) => setCreateOrderForm((p) => ({ ...p, weight_kg: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" placeholder="0.0" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Speed</label>
                      <select value={createOrderForm.shipping_speed} onChange={(e) => setCreateOrderForm((p) => ({ ...p, shipping_speed: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]">
                        <option value="economy">Economy (7–14 days)</option>
                        <option value="express">Express (3–5 days)</option>
                      </select>
                    </div>
                  </div>

                  {/* Dimensions */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dimensions (cm) <span className="text-gray-400 font-normal">— optional</span></label>
                    <div className="grid grid-cols-3 gap-2">
                      <input type="number" step="0.1" min="0" value={createOrderForm.dimensions.length} onChange={(e) => setCreateOrderForm((p) => ({ ...p, dimensions: { ...p.dimensions, length: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" placeholder="L (cm)" />
                      <input type="number" step="0.1" min="0" value={createOrderForm.dimensions.width} onChange={(e) => setCreateOrderForm((p) => ({ ...p, dimensions: { ...p.dimensions, width: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" placeholder="W (cm)" />
                      <input type="number" step="0.1" min="0" value={createOrderForm.dimensions.height} onChange={(e) => setCreateOrderForm((p) => ({ ...p, dimensions: { ...p.dimensions, height: e.target.value } }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" placeholder="H (cm)" />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Length × Width × Height. Used for volumetric weight calculation if heavier than actual weight.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                    <textarea value={createOrderForm.description} onChange={(e) => setCreateOrderForm((p) => ({ ...p, description: e.target.value }))} required rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" placeholder="Brief description of items" />
                  </div>
                  <div className="flex gap-4 items-center">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={createOrderForm.insurance} onChange={(e) => setCreateOrderForm((p) => ({ ...p, insurance: e.target.checked }))} className="w-4 h-4" />
                      <span className="text-sm text-gray-700">Insurance</span>
                    </label>
                    {createOrderForm.insurance && (
                      <input type="number" min="0" value={createOrderForm.declared_value} onChange={(e) => setCreateOrderForm((p) => ({ ...p, declared_value: e.target.value }))} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" placeholder="Declared value (KES)" />
                    )}
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="submit" disabled={creatingOrder} className="bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-6 py-2 rounded-lg font-bold disabled:opacity-50">
                      {creatingOrder ? 'Creating...' : 'Create Order'}
                    </button>
                    <button type="button" onClick={() => setShowCreateOrderForm(false)} className="border border-gray-300 px-6 py-2 rounded-lg font-bold text-gray-700 hover:bg-gray-50">
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Bulk Update */}
            {selectedOrders.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-blue-900 font-bold">{selectedOrders.length} order(s) selected</span>
                  <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="px-4 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">{t('admin.selectStatus')}</option>
                    <option value="pending">Pending</option>
                    <option value="received_at_warehouse">Received at Warehouse</option>
                    <option value="consolidating">Consolidating</option>
                    <option value="in_transit">In Transit</option>
                    <option value="customs">Customs</option>
                    <option value="out_for_delivery">Out for Delivery</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <button onClick={handleBulkUpdateOrders} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold">
                    {t('admin.updateSelected')}
                  </button>
                </div>
              </div>
            )}

            {/* Orders Table */}
            <div className="card">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                        <input type="checkbox" onChange={(e) => {
                          if (e.target.checked) setSelectedOrders(orders.map((o) => o.id))
                          else setSelectedOrders([])
                        }} className="w-4 h-4" />
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Tracking #</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Customer</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Retailer</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Market</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Est. Cost</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {orders.length === 0 ? (
                      <tr><td colSpan="9" className="px-6 py-8 text-center text-gray-500">No orders found</td></tr>
                    ) : orders.map((order) => (
                      <tr key={order.id} className={`hover:bg-gray-50 ${order.status === 'cancelled' ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-4">
                          <input type="checkbox" checked={selectedOrders.includes(order.id)} onChange={() => handleToggleOrderSelection(order.id)} className="w-4 h-4" disabled={order.status === 'cancelled'} />
                        </td>
                        <td className="px-4 py-4 text-sm font-mono text-gray-900">{order.tracking_number}</td>
                        <td className="px-4 py-4 text-sm text-gray-600">{order.name || order.email || '—'}</td>
                        <td className="px-4 py-4 text-sm text-gray-600">{order.retailer || '—'}</td>
                        <td className="px-4 py-4 text-sm">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusBadge(order.status)}`}>
                            {order.status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">{order.market}</td>
                        <td className="px-4 py-4 text-sm font-semibold text-gray-900">
                          KES {(order.estimated_cost || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">
                          {order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {/* Request Payment */}
                            {order.status !== 'cancelled' && order.status !== 'delivered' && (
                              <button
                                onClick={() => { setPaymentModal({ orderId: order.id, trackingNumber: order.tracking_number }); setPaymentAmount(String(order.estimated_cost || '')) }}
                                title="Request Payment"
                                className="p-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 transition-colors"
                              >
                                <CreditCard size={15} />
                              </button>
                            )}
                            {/* Payment Reminder */}
                            {order.status !== 'cancelled' && order.status !== 'delivered' && (
                              <button
                                onClick={() => { setReminderModal({ orderId: order.id, trackingNumber: order.tracking_number }); setReminderAmount(String(order.estimated_cost || '')); setReminderNotes('') }}
                                title="Send Payment Reminder"
                                className="p-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 transition-colors"
                              >
                                <Bell size={15} />
                              </button>
                            )}
                            {/* Cancel */}
                            {order.status !== 'cancelled' && order.status !== 'delivered' && (
                              <button
                                onClick={() => { setCancelModal({ orderId: order.id, trackingNumber: order.tracking_number }); setCancelReason('') }}
                                title="Cancel Order"
                                className="p-1.5 rounded-lg bg-yellow-50 hover:bg-yellow-100 text-yellow-700 transition-colors"
                              >
                                <XCircle size={15} />
                              </button>
                            )}
                            {/* Delete */}
                            <button
                              onClick={() => handleDeleteOrder(order.id, order.tracking_number)}
                              title="Delete Order"
                              className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 transition-colors"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Revenue ═══ */}
        {activeTab === 'revenue' && (
          <div className="card">
            <h2 className="text-2xl font-bold text-[#1e3a5f] mb-4">{t('admin.revenueReport')}</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Total Deposits</p>
                  <p className="text-2xl font-bold text-green-700">KES {(revenueStats.deposits || 0).toLocaleString()}</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Total Payments</p>
                  <p className="text-2xl font-bold text-blue-700">KES {(revenueStats.payments || 0).toLocaleString()}</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
                  <p className="text-2xl font-bold text-orange-700">KES {(revenueStats.total_revenue || 0).toLocaleString()}</p>
                </div>
              </div>
              <button onClick={async () => {
                try {
                  const res = await adminApi.exportRevenue()
                  const url = window.URL.createObjectURL(new Blob([res.data]))
                  const link = document.createElement('a')
                  link.href = url
                  link.setAttribute('download', 'revenue-export.csv')
                  document.body.appendChild(link)
                  link.click()
                  link.remove()
                  toast.success('Revenue exported')
                } catch { toast.error('Failed to export revenue') }
              }} className="bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-6 py-2 rounded-lg font-bold">
                {t('admin.export')}
              </button>
            </div>
          </div>
        )}

        {/* ═══ Tickets ═══ */}
        {activeTab === 'tickets' && (
          <div className="card">
            <h2 className="text-2xl font-bold text-[#1e3a5f] mb-4">{t('admin.tickets')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Ticket ID</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Subject</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Priority</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {tickets.length === 0 ? (
                    <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500">No tickets found</td></tr>
                  ) : tickets.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-mono text-gray-900">{ticket.id?.slice(0, 8).toUpperCase()}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{ticket.subject}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${ticket.priority === 'high' ? 'bg-red-100 text-red-800' : ticket.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>{ticket.priority}</span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${ticket.status === 'closed' ? 'bg-green-100 text-green-800' : ticket.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>{ticket.status}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ Exchange Rates ═══ */}
        {activeTab === 'exchange' && (
          <div className="card max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
              <RefreshCw className="text-[#1e3a5f]" size={28} />
              <div>
                <h2 className="text-2xl font-bold text-[#1e3a5f]">Exchange Rate Management</h2>
                <p className="text-sm text-gray-500">Set today's rates used across the platform for pricing and conversions.</p>
              </div>
            </div>
            {ratesLastUpdated && (
              <p className="text-sm text-gray-500 mb-4">Last updated: {new Date(ratesLastUpdated).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}</p>
            )}
            <form onSubmit={handleSaveRates} className="space-y-4">
              {[
                { pair: 'USD_KES', label: 'USD to KES', flag: '$' },
                { pair: 'GBP_KES', label: 'GBP to KES', flag: '£' },
                { pair: 'EUR_KES', label: 'EUR to KES', flag: '€' },
                { pair: 'CNY_KES', label: 'CNY to KES', flag: '¥' },
              ].map(({ pair, label, flag }) => (
                <div key={pair}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-500 w-6">{flag}</span>
                    <span className="text-gray-500">1 =</span>
                    <input type="number" step="0.01" min="0" value={exchangeRates[pair]} onChange={(e) => handleRateChange(pair, e.target.value)} placeholder="0.00" className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" />
                    <span className="text-sm font-medium text-gray-500">KES</span>
                  </div>
                </div>
              ))}
              <button type="submit" disabled={savingRates} className="w-full bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-6 py-3 rounded-lg font-bold disabled:opacity-50 transition-colors">
                {savingRates ? 'Saving...' : 'Save Exchange Rates'}
              </button>
            </form>
          </div>
        )}

        {/* ═══ Settings ═══ */}
        {activeTab === 'settings' && (
          <div className="space-y-6 max-w-lg">
            {/* Password Change */}
            <div className="card">
              <div className="flex items-center gap-3 mb-6">
                <Lock className="text-[#1e3a5f]" size={28} />
                <div>
                  <h2 className="text-2xl font-bold text-[#1e3a5f]">Change Admin Password</h2>
                  <p className="text-sm text-gray-500">Logged in as {user?.email}</p>
                </div>
              </div>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                  <input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" placeholder="Enter current password" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                  <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" placeholder="Enter new password (min 6 characters)" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                  <input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" placeholder="Re-enter new password" />
                </div>
                <button type="submit" disabled={changingPassword} className="w-full bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-6 py-3 rounded-lg font-bold disabled:opacity-50 transition-colors">
                  {changingPassword ? 'Changing Password...' : 'Change Password'}
                </button>
              </form>
            </div>

            {/* Email Test */}
            <div className="card">
              <div className="flex items-center gap-3 mb-6">
                <Mail className="text-[#1e3a5f]" size={28} />
                <div>
                  <h2 className="text-2xl font-bold text-[#1e3a5f]">Email Configuration</h2>
                  <p className="text-sm text-gray-500">Test your Resend email setup</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Send a test email to verify that the Resend email configuration is working. If emails are not being delivered,
                this will show you the exact error. The test sends a password reset email to the address you specify.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Send test email to</label>
                  <input
                    type="email"
                    id="testEmailTo"
                    defaultValue={user?.email || ''}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                    placeholder="admin@swiftcargo.co.ke"
                  />
                </div>
                <button
                  onClick={async () => {
                    const toEmail = document.getElementById('testEmailTo')?.value || user?.email
                    try {
                      toast.loading('Sending test email...', { id: 'test-email' })
                      const res = await adminApi.testEmail(toEmail)
                      toast.success(res.data?.message || 'Test email sent!', { id: 'test-email' })
                    } catch (err) {
                      const data = err.response?.data
                      const msg = data?.message || err.message || 'Email test failed'
                      const help = data?.help || ''
                      toast.error(`${msg}${help ? '\n' + help : ''}`, { id: 'test-email', duration: 8000 })
                      if (data?.email_config) {
                        console.log('Email Config:', data.email_config)
                        console.log('Help:', data.help)
                      }
                    }
                  }}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-bold transition-colors"
                >
                  Send Test Email
                </button>
              </div>
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-bold text-gray-600 mb-2">Required Railway environment variables:</p>
                <ul className="text-xs text-gray-500 space-y-1">
                  <li><code className="bg-gray-200 px-1 rounded">RESEND_API_KEY</code> — your API key from resend.com/api-keys</li>
                  <li><code className="bg-gray-200 px-1 rounded">EMAIL_FROM</code> — verified sender, e.g. "SwiftCargo &lt;noreply@swiftcargo.co.ke&gt;"</li>
                </ul>
                <p className="text-xs text-gray-400 mt-2">
                  Sign up free at <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-orange-500 underline">resend.com</a> (100 emails/day free).
                  For testing, use <code className="bg-gray-200 px-1 rounded">onboarding@resend.dev</code> as the sender.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Cancel Modal ── */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-[#1e3a5f] mb-2">Cancel Order</h3>
            <p className="text-sm text-gray-600 mb-4">
              Cancel <span className="font-mono font-bold">{cancelModal.trackingNumber}</span>? The customer will be notified.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation (optional)"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] mb-4"
            />
            <div className="flex gap-3">
              <button onClick={handleCancelOrder} className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white py-2 rounded-lg font-bold">Confirm Cancel</button>
              <button onClick={() => setCancelModal(null)} className="flex-1 border border-gray-300 py-2 rounded-lg font-bold text-gray-700 hover:bg-gray-50">Back</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Reminder Modal ── */}
      {reminderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-[#1e3a5f] mb-2">Send Payment Reminder</h3>
            <p className="text-sm text-gray-600 mb-4">
              Send a payment reminder for order <span className="font-mono font-bold">{reminderModal.trackingNumber}</span>.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES) *</label>
                <input
                  type="number" min="1" value={reminderAmount}
                  onChange={(e) => setReminderAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  placeholder="Enter amount in KES"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={reminderNotes} onChange={(e) => setReminderNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  placeholder="Any notes for the customer"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={handleSendReminder} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2 rounded-lg font-bold">Send Reminder</button>
              <button onClick={() => setReminderModal(null)} className="flex-1 border border-gray-300 py-2 rounded-lg font-bold text-gray-700 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Request Modal ── */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-[#1e3a5f] mb-2">Request Payment</h3>
            <p className="text-sm text-gray-600 mb-4">
              Send a payment request for order <span className="font-mono font-bold">{paymentModal.trackingNumber}</span>.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES) *</label>
                <input
                  type="number" min="1" value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  placeholder="Enter amount in KES"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  placeholder="Any notes for the customer"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={handleRequestPayment} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold">Send Request</button>
              <button onClick={() => setPaymentModal(null)} className="flex-1 border border-gray-300 py-2 rounded-lg font-bold text-gray-700 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
