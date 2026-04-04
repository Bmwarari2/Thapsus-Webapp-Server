import React, { useState, useEffect } from 'react'
import {
  Users, Package, DollarSign, BarChart3, MessageSquare, Activity,
  Lock, RefreshCw, Trash2, XCircle, Plus, CreditCard, Search,
  UserPlus, Bell, Mail, Eye, ArrowLeft, Key, Send, AlertTriangle,
  ChevronLeft, ChevronRight, Filter
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

  // User detail panel
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedUserData, setSelectedUserData] = useState(null)
  const [loadingUser, setLoadingUser] = useState(false)

  // User detail - create order for this specific user
  const [showUserOrderForm, setShowUserOrderForm] = useState(false)
  const [userOrderForm, setUserOrderForm] = useState({
    retailer: '', market: 'UK', description: '',
    weight_kg: '', shipping_speed: 'economy',
    dimensions: { length: '', width: '', height: '' },
    insurance: false, declared_value: ''
  })
  const [creatingUserOrder, setCreatingUserOrder] = useState(false)

  // Pending payments
  const [pendingPayments, setPendingPayments] = useState([])
  const [approvingPayment, setApprovingPayment] = useState(null)

  // Email logs (for user detail panel)
  const [emailLogs, setEmailLogs] = useState([])

  // Error logs (developer tools)
  const [errorLogs, setErrorLogs] = useState([])
  const [errorLogStats, setErrorLogStats] = useState(null)
  const [errorLogPage, setErrorLogPage] = useState(1)
  const [errorLogTotal, setErrorLogTotal] = useState(0)
  const [errorLogTotalPages, setErrorLogTotalPages] = useState(0)
  const [errorLogFilter, setErrorLogFilter] = useState({ level: '', source: '', search: '' })
  const [loadingErrorLogs, setLoadingErrorLogs] = useState(false)
  const [expandedError, setExpandedError] = useState(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const results = await Promise.allSettled([
        adminApi.getDashboardStats(),
        adminApi.listUsers(),
        adminApi.listOrders(),
        adminApi.getExchangeRates(),
        adminApi.getPendingPayments(),
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
      if (results[4].status === 'fulfilled') setPendingPayments(results[4].value.data?.transactions || [])

      // Also fetch error log stats for the badge
      try {
        const statsRes = await adminApi.getErrorLogStats()
        if (statsRes.data?.stats) setErrorLogStats(statsRes.data.stats)
      } catch (_) { /* non-critical */ }
    } catch (err) {
      toast.error('Failed to load admin data')
    } finally {
      setLoading(false)
    }
  }

  // ── Error logs fetcher ──────────────────────────────────────────────
  const fetchErrorLogs = async (page = 1, filters = errorLogFilter) => {
    try {
      setLoadingErrorLogs(true)
      const params = { page, limit: 25 }
      if (filters.level)  params.level  = filters.level
      if (filters.source) params.source = filters.source
      if (filters.search) params.search = filters.search
      const res = await adminApi.getErrorLogs(params)
      if (res.data?.error_logs) {
        setErrorLogs(res.data.error_logs)
        setErrorLogPage(res.data.pagination.page)
        setErrorLogTotal(res.data.pagination.total)
        setErrorLogTotalPages(res.data.pagination.totalPages)
      }
    } catch (err) {
      toast.error('Failed to load error logs')
    } finally {
      setLoadingErrorLogs(false)
    }
  }

  const handleClearErrorLogs = async (keepDays) => {
    if (!window.confirm(`Delete error logs older than ${keepDays} days?`)) return
    try {
      const res = await adminApi.clearErrorLogs(keepDays)
      toast.success(res.data?.message || 'Logs cleared')
      fetchErrorLogs(1, errorLogFilter)
      const statsRes = await adminApi.getErrorLogStats()
      if (statsRes.data?.stats) setErrorLogStats(statsRes.data.stats)
    } catch (err) {
      toast.error('Failed to clear logs')
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

  // ── Open user detail panel ──────────────────────────────────────────────
  const handleOpenUserDetail = async (u) => {
    setSelectedUser(u)
    setSelectedUserData(null)
    setEmailLogs([])
    setLoadingUser(true)
    setShowUserOrderForm(false)
    try {
      const [userRes, emailRes] = await Promise.all([
        adminApi.getUser(u.id),
        adminApi.getUserEmails(u.id),
      ])
      setSelectedUserData(userRes.data)
      setEmailLogs(emailRes.data?.email_logs || [])
    } catch (err) {
      toast.error('Failed to load user details')
    } finally {
      setLoadingUser(false)
    }
  }

  const handleCloseUserDetail = () => {
    setSelectedUser(null)
    setSelectedUserData(null)
    setShowUserOrderForm(false)
  }

  // ── Payment approval handlers ───────────────────────────────────────────
  const handleApprovePayment = async (paymentId) => {
    try {
      setApprovingPayment(paymentId)
      await adminApi.approvePayment(paymentId)
      toast.success('Payment approved successfully')
      setPendingPayments(pendingPayments.filter((p) => p.id !== paymentId))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve payment')
    } finally {
      setApprovingPayment(null)
    }
  }

  const handleRejectPayment = async (paymentId) => {
    const reason = window.prompt('Reason for rejection (optional):')
    if (reason === null) return
    try {
      setApprovingPayment(paymentId)
      await adminApi.rejectPayment(paymentId, reason || '')
      toast.success('Payment rejected')
      setPendingPayments(pendingPayments.filter((p) => p.id !== paymentId))
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject payment')
    } finally {
      setApprovingPayment(null)
    }
  }

  // ── Admin reset user password ─────────────────────────────────────────
  const handleResetUserPassword = async (userId, userName, userEmail) => {
    if (!window.confirm(`Send password reset email to ${userName} (${userEmail})?`)) return
    try {
      await adminApi.resetUserPassword(userId)
      toast.success(`Password reset email sent to ${userEmail}`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send password reset')
    }
  }

  // ── Create order for selected user from detail panel ──────────────────
  const handleCreateOrderForSelectedUser = async (e) => {
    e.preventDefault()
    if (!selectedUser) return
    try {
      setCreatingUserOrder(true)
      const { dimensions, ...rest } = userOrderForm
      const hasDimensions = dimensions.length || dimensions.width || dimensions.height
      await adminApi.createOrderForClient({
        customer_email: selectedUser.email,
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
      setShowUserOrderForm(false)
      setUserOrderForm({ retailer: '', market: 'UK', description: '', weight_kg: '', shipping_speed: 'economy', dimensions: { length: '', width: '', height: '' }, insurance: false, declared_value: '' })
      // Refresh user detail
      handleOpenUserDetail(selectedUser)
      // Refresh orders list too
      const ordersRes = await adminApi.listOrders()
      setOrders(ordersRes.data?.orders || [])
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create order')
    } finally {
      setCreatingUserOrder(false)
    }
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
          {['overview', 'users', 'orders', 'payments', 'revenue', 'tickets', 'exchange', 'settings', 'errorLogs'].map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); if (tab === 'errorLogs') fetchErrorLogs(1, errorLogFilter); }}
              className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap transition-colors relative ${
                activeTab === tab ? 'bg-[#1e3a5f] text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {tab === 'exchange' ? 'Exchange Rates' : tab === 'settings' ? 'Settings' : tab === 'payments' ? 'Payments' : tab === 'errorLogs' ? 'Error Logs' : t(`admin.${tab}`)}
              {tab === 'errorLogs' && errorLogStats && parseInt(errorLogStats.last_24h) > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {parseInt(errorLogStats.last_24h) > 99 ? '99+' : errorLogStats.last_24h}
                </span>
              )}
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
                          <div className="flex items-center gap-1">
                            {/* View user detail */}
                            <button
                              onClick={() => handleOpenUserDetail(u)}
                              title="View User Details"
                              className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
                            >
                              <Eye size={15} />
                            </button>
                        {u.id !== user?.id && (
                          <>
                            {/* Deactivate / Reactivate toggle */}
                            <button
                              onClick={async () => {
                                const action = u.is_active ? 'deactivate' : 'reactivate'
                                if (!window.confirm(`${action === 'deactivate' ? 'Deactivate' : 'Reactivate'} ${u.name} (${u.email})? ${action === 'deactivate' ? 'They will not be able to log in.' : 'They will be able to log in again.'}`)) return
                                try {
                                  await adminApi.updateUser(u.id, { is_active: !u.is_active })
                                  toast.success(`User ${u.name} ${action === 'deactivate' ? 'deactivated' : 'reactivated'} successfully`)
                                  setUsers((prev) => prev.map((usr) => usr.id === u.id ? { ...usr, is_active: !u.is_active } : usr))
                                } catch (err) {
                                  toast.error(err.response?.data?.message || err.message || `Failed to ${action} user`)
                                }
                              }}
                              title={u.is_active ? 'Deactivate Account' : 'Reactivate Account'}
                              className={`p-1.5 rounded-lg transition-colors ${u.is_active ? 'bg-yellow-50 hover:bg-yellow-100 text-yellow-700' : 'bg-green-50 hover:bg-green-100 text-green-700'}`}
                            >
                              {u.is_active ? <XCircle size={15} /> : <RefreshCw size={15} />}
                            </button>
                            {/* Delete permanently */}
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
                              title="Permanently Delete User"
                              className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 transition-colors"
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
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

        {/* ═══ User Detail Panel (slide-over) ═══ */}
        {selectedUser && (
          <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onClick={handleCloseUserDetail}>
            <div className="bg-white w-full max-w-3xl h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <button onClick={handleCloseUserDetail} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
                    <ArrowLeft size={20} />
                  </button>
                  <h2 className="text-xl font-bold text-[#1e3a5f]">{selectedUser.name}</h2>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${selectedUser.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {selectedUser.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {loadingUser ? (
                <div className="flex items-center justify-center py-20">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500"></div>
                </div>
              ) : selectedUserData ? (
                <div className="px-6 py-6 space-y-6">
                  {/* User Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Email</p>
                      <p className="font-medium text-gray-900">{selectedUserData.user?.email}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Phone</p>
                      <p className="font-medium text-gray-900">{selectedUserData.user?.phone}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Warehouse ID</p>
                      <p className="font-medium font-mono text-gray-900">{selectedUserData.user?.warehouse_id}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Role</p>
                      <p className="font-medium text-gray-900 capitalize">{selectedUserData.user?.role}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Wallet Balance</p>
                      <p className="font-bold text-green-700">KES {(selectedUserData.user?.wallet_balance || 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Joined</p>
                      <p className="font-medium text-gray-900">{selectedUserData.user?.created_at ? new Date(selectedUserData.user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</p>
                    </div>
                  </div>

                  {/* Referral Stats */}
                  {selectedUserData.referralStats && (
                    <div className="bg-orange-50 rounded-lg p-4">
                      <h3 className="text-sm font-bold text-[#1e3a5f] mb-2">Referral Stats</h3>
                      <div className="flex gap-6 text-sm">
                        <span>Total: <strong>{selectedUserData.referralStats.total_referrals || 0}</strong></span>
                        <span>Completed: <strong>{selectedUserData.referralStats.completed_referrals || 0}</strong></span>
                        <span>Earned: <strong>KES {(selectedUserData.referralStats.total_earned || 0).toLocaleString()}</strong></span>
                      </div>
                    </div>
                  )}

                  {/* Quick Actions */}
                  <div>
                    <h3 className="text-sm font-bold text-[#1e3a5f] mb-3 uppercase tracking-wide">Actions</h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleResetUserPassword(selectedUser.id, selectedUser.name, selectedUser.email)}
                        className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        <Key size={14} />
                        Reset Password
                      </button>
                      <button
                        onClick={() => setShowUserOrderForm((v) => !v)}
                        className="flex items-center gap-2 bg-green-50 hover:bg-green-100 text-green-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        <Plus size={14} />
                        Create Order
                      </button>
                      {selectedUser.id !== user?.id && (
                        <button
                          onClick={async () => {
                            const action = selectedUser.is_active ? 'deactivate' : 'reactivate'
                            if (!window.confirm(`${action === 'deactivate' ? 'Deactivate' : 'Reactivate'} ${selectedUser.name}?`)) return
                            try {
                              await adminApi.updateUser(selectedUser.id, { is_active: !selectedUser.is_active })
                              toast.success(`User ${action}d successfully`)
                              setSelectedUser((prev) => ({ ...prev, is_active: !prev.is_active }))
                              setUsers((prev) => prev.map((usr) => usr.id === selectedUser.id ? { ...usr, is_active: !selectedUser.is_active } : usr))
                            } catch (err) {
                              toast.error(err.response?.data?.message || `Failed to ${action} user`)
                            }
                          }}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedUser.is_active ? 'bg-yellow-50 hover:bg-yellow-100 text-yellow-700' : 'bg-green-50 hover:bg-green-100 text-green-700'}`}
                        >
                          {selectedUser.is_active ? <XCircle size={14} /> : <RefreshCw size={14} />}
                          {selectedUser.is_active ? 'Deactivate Account' : 'Reactivate Account'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Create Order for this User */}
                  {showUserOrderForm && (
                    <div className="border-2 border-green-200 rounded-xl p-4">
                      <h3 className="text-sm font-bold text-[#1e3a5f] mb-3">New Order for {selectedUser.name}</h3>
                      <form onSubmit={handleCreateOrderForSelectedUser} className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Retailer *</label>
                            <input type="text" value={userOrderForm.retailer} onChange={(e) => setUserOrderForm((p) => ({ ...p, retailer: e.target.value }))} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" placeholder="e.g. Amazon" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Market *</label>
                            <select value={userOrderForm.market} onChange={(e) => setUserOrderForm((p) => ({ ...p, market: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]">
                              <option value="UK">United Kingdom</option>
                              <option value="USA">United States</option>
                              <option value="China">China</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Description *</label>
                          <textarea value={userOrderForm.description} onChange={(e) => setUserOrderForm((p) => ({ ...p, description: e.target.value }))} required rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" placeholder="Brief description of items" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Weight (kg)</label>
                            <input type="number" step="0.1" min="0" value={userOrderForm.weight_kg} onChange={(e) => setUserOrderForm((p) => ({ ...p, weight_kg: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]" placeholder="0.0" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Shipping Speed</label>
                            <select value={userOrderForm.shipping_speed} onChange={(e) => setUserOrderForm((p) => ({ ...p, shipping_speed: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]">
                              <option value="economy">Economy</option>
                              <option value="express">Express</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button type="submit" disabled={creatingUserOrder} className="bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50">
                            {creatingUserOrder ? 'Creating...' : 'Create Order'}
                          </button>
                          <button type="button" onClick={() => setShowUserOrderForm(false)} className="border border-gray-300 px-4 py-2 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50">
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* User's Orders */}
                  <div>
                    <h3 className="text-sm font-bold text-[#1e3a5f] mb-3 uppercase tracking-wide">
                      Orders ({selectedUserData.user?.orders?.length || 0})
                    </h3>
                    {selectedUserData.user?.orders?.length > 0 ? (
                      <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Tracking #</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Retailer</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Market</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Status</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Cost</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Date</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {selectedUserData.user.orders.map((o) => (
                              <tr key={o.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-xs font-mono">{o.tracking_number}</td>
                                <td className="px-3 py-2 text-xs text-gray-600">{o.retailer}</td>
                                <td className="px-3 py-2 text-xs text-gray-600">{o.market}</td>
                                <td className="px-3 py-2 text-xs">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(o.status)}`}>
                                    {o.status?.replace(/_/g, ' ')}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-xs font-semibold">KES {(o.actual_cost || o.estimated_cost || 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-xs text-gray-500">{o.created_at ? new Date(o.created_at).toLocaleDateString() : '—'}</td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1">
                                    {o.status !== 'cancelled' && o.status !== 'delivered' && (
                                      <>
                                        <button
                                          onClick={() => { setPaymentModal({ orderId: o.id, trackingNumber: o.tracking_number }); setPaymentAmount(String(o.estimated_cost || '')) }}
                                          title="Request Payment"
                                          className="p-1 rounded bg-green-50 hover:bg-green-100 text-green-700"
                                        >
                                          <CreditCard size={12} />
                                        </button>
                                        <button
                                          onClick={() => { setReminderModal({ orderId: o.id, trackingNumber: o.tracking_number }); setReminderAmount(String(o.estimated_cost || '')); setReminderNotes('') }}
                                          title="Send Reminder"
                                          className="p-1 rounded bg-orange-50 hover:bg-orange-100 text-orange-700"
                                        >
                                          <Bell size={12} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No orders yet</p>
                    )}
                  </div>

                  {/* Recent Transactions */}
                  <div>
                    <h3 className="text-sm font-bold text-[#1e3a5f] mb-3 uppercase tracking-wide">
                      Recent Transactions
                    </h3>
                    {selectedUserData.recentTransactions?.length > 0 ? (
                      <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Type</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Amount</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Method</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Status</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {selectedUserData.recentTransactions.map((tx) => (
                              <tr key={tx.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-xs">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tx.type === 'deposit' ? 'bg-green-100 text-green-700' : tx.type === 'payment' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                                    {tx.type?.replace(/_/g, ' ')}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-xs font-semibold">
                                  <span className={tx.type === 'payment' ? 'text-red-600' : 'text-green-600'}>
                                    {tx.type === 'payment' ? '-' : '+'} KES {Math.abs(tx.amount).toLocaleString()}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-600">{tx.payment_method || '—'}</td>
                                <td className="px-3 py-2 text-xs">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tx.status === 'completed' ? 'bg-green-100 text-green-800' : tx.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                    {tx.status}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500">{tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No transactions</p>
                    )}
                  </div>

                  {/* Emails Sent */}
                  <div>
                    <h3 className="text-sm font-bold text-[#1e3a5f] mb-3 uppercase tracking-wide">
                      Emails Sent
                    </h3>
                    {emailLogs && emailLogs.length > 0 ? (
                      <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Type</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Subject</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Status</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {emailLogs.map((log) => (
                              <tr key={log.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-xs">
                                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                    {log.email_type?.replace(/_/g, ' ')}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-700 truncate max-w-xs">{log.subject}</td>
                                <td className="px-3 py-2 text-xs">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${log.status === 'sent' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {log.status}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500">{log.created_at ? new Date(log.created_at).toLocaleDateString() : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No email logs found</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="px-6 py-20 text-center text-gray-500">Failed to load user data</div>
              )}
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

        {/* ═══ Payments ═══ */}
        {activeTab === 'payments' && (
          <div className="card">
            <h2 className="text-2xl font-bold text-[#1e3a5f] mb-4">Pending M-Pesa Payments</h2>
            {pendingPayments.length === 0 ? (
              <p className="text-gray-600 text-center py-8">No pending payments</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Customer Name</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Amount (KES)</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Reference</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Submitted</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {pendingPayments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{payment.name}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{payment.email}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-[#1e3a5f]">KES {payment.amount.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm font-mono text-gray-900">{payment.payment_reference}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{new Date(payment.created_at).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-sm space-x-2">
                          <button
                            onClick={() => handleApprovePayment(payment.id)}
                            disabled={approvingPayment === payment.id}
                            className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-xs font-bold disabled:opacity-50"
                          >
                            {approvingPayment === payment.id ? 'Processing...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleRejectPayment(payment.id)}
                            disabled={approvingPayment === payment.id}
                            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs font-bold disabled:opacity-50"
                          >
                            {approvingPayment === payment.id ? 'Processing...' : 'Reject'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                  <p className="text-sm text-gray-500">Test your Gmail API email setup</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Send a test email to verify that the Gmail API configuration is working. If emails are not being delivered,
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
                    placeholder="admin@thapsus.uk"
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
                  <li><code className="bg-gray-200 px-1 rounded">GMAIL_CLIENT_ID</code> — OAuth 2.0 client ID from Google Cloud Console</li>
                  <li><code className="bg-gray-200 px-1 rounded">GMAIL_CLIENT_SECRET</code> — OAuth 2.0 client secret</li>
                  <li><code className="bg-gray-200 px-1 rounded">GMAIL_REFRESH_TOKEN</code> — from OAuth Playground with gmail scope</li>
                  <li><code className="bg-gray-200 px-1 rounded">GMAIL_SENDER_EMAIL</code> — e.g. "noreply@thapsus.uk"</li>
                </ul>
                <p className="text-xs text-gray-400 mt-2">
                  Set up at <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-orange-500 underline">Google Cloud Console</a>.
                  Use <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener noreferrer" className="text-orange-500 underline">OAuth Playground</a> to generate the refresh token.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Error Logs ═══ */}
        {activeTab === 'errorLogs' && (
          <div className="space-y-6">
            {/* Stats bar */}
            {errorLogStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card text-center">
                  <p className="text-2xl font-bold text-red-600">{errorLogStats.last_24h || 0}</p>
                  <p className="text-xs text-gray-500">Last 24 hours</p>
                </div>
                <div className="card text-center">
                  <p className="text-2xl font-bold text-orange-600">{errorLogStats.last_7d || 0}</p>
                  <p className="text-xs text-gray-500">Last 7 days</p>
                </div>
                <div className="card text-center">
                  <p className="text-2xl font-bold text-purple-600">{errorLogStats.fatal_24h || 0}</p>
                  <p className="text-xs text-gray-500">Fatal (24h)</p>
                </div>
                <div className="card text-center">
                  <p className="text-2xl font-bold text-gray-600">{errorLogStats.total || 0}</p>
                  <p className="text-xs text-gray-500">Total</p>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="card">
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Level</label>
                  <select
                    value={errorLogFilter.level}
                    onChange={(e) => setErrorLogFilter(prev => ({ ...prev, level: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  >
                    <option value="">All</option>
                    <option value="error">Error</option>
                    <option value="warn">Warning</option>
                    <option value="fatal">Fatal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
                  <select
                    value={errorLogFilter.source}
                    onChange={(e) => setErrorLogFilter(prev => ({ ...prev, source: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  >
                    <option value="">All</option>
                    <option value="api">API</option>
                    <option value="database">Database</option>
                    <option value="email">Email</option>
                    <option value="middleware">Middleware</option>
                    <option value="unhandled">Unhandled</option>
                  </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Search</label>
                  <input
                    type="text"
                    value={errorLogFilter.search}
                    onChange={(e) => setErrorLogFilter(prev => ({ ...prev, search: e.target.value }))}
                    placeholder="Search error messages or paths..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
                  />
                </div>
                <button
                  onClick={() => fetchErrorLogs(1, errorLogFilter)}
                  className="px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-bold hover:bg-[#152d4a] transition-colors"
                >
                  <Filter size={14} className="inline mr-1" /> Filter
                </button>
                <button
                  onClick={() => { setErrorLogFilter({ level: '', source: '', search: '' }); fetchErrorLogs(1, { level: '', source: '', search: '' }); }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Clear
                </button>
                <div className="ml-auto flex gap-2">
                  <button onClick={() => handleClearErrorLogs(30)} className="px-3 py-2 bg-orange-500 text-white rounded-lg text-xs font-bold hover:bg-orange-600">Clear 30d+</button>
                  <button onClick={() => handleClearErrorLogs(7)} className="px-3 py-2 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600">Clear 7d+</button>
                </div>
              </div>
            </div>

            {/* Error log table */}
            <div className="card overflow-x-auto">
              {loadingErrorLogs ? (
                <div className="text-center py-8 text-gray-500">Loading error logs...</div>
              ) : errorLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <AlertTriangle size={32} className="mx-auto mb-2 text-gray-300" />
                  <p>No error logs found</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-gray-200">
                      <th className="pb-3 font-bold text-gray-600">Level</th>
                      <th className="pb-3 font-bold text-gray-600">Source</th>
                      <th className="pb-3 font-bold text-gray-600">Method</th>
                      <th className="pb-3 font-bold text-gray-600">Path</th>
                      <th className="pb-3 font-bold text-gray-600">Message</th>
                      <th className="pb-3 font-bold text-gray-600">Status</th>
                      <th className="pb-3 font-bold text-gray-600">Time</th>
                      <th className="pb-3 font-bold text-gray-600"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorLogs.map((log) => (
                      <React.Fragment key={log.id}>
                        <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedError(expandedError === log.id ? null : log.id)}>
                          <td className="py-3 pr-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              log.level === 'fatal' ? 'bg-red-100 text-red-800' :
                              log.level === 'error' ? 'bg-orange-100 text-orange-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {log.level}
                            </span>
                          </td>
                          <td className="py-3 pr-2 text-gray-600">{log.source}</td>
                          <td className="py-3 pr-2">
                            {log.method && <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{log.method}</span>}
                          </td>
                          <td className="py-3 pr-2 font-mono text-xs text-gray-700 max-w-[200px] truncate">{log.path || '-'}</td>
                          <td className="py-3 pr-2 max-w-[300px] truncate text-gray-800">{log.message}</td>
                          <td className="py-3 pr-2">
                            {log.status_code && <span className={`font-mono text-xs font-bold ${log.status_code >= 500 ? 'text-red-600' : 'text-orange-600'}`}>{log.status_code}</span>}
                          </td>
                          <td className="py-3 pr-2 text-gray-500 whitespace-nowrap text-xs">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="py-3">
                            <Eye size={14} className="text-gray-400" />
                          </td>
                        </tr>
                        {expandedError === log.id && (
                          <tr>
                            <td colSpan={8} className="bg-gray-50 px-4 py-4">
                              <div className="space-y-3">
                                <div>
                                  <p className="text-xs font-bold text-gray-500 mb-1">Full Message</p>
                                  <p className="text-sm text-gray-800">{log.message}</p>
                                </div>
                                {log.stack && (
                                  <div>
                                    <p className="text-xs font-bold text-gray-500 mb-1">Stack Trace</p>
                                    <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap">{log.stack}</pre>
                                  </div>
                                )}
                                {log.user_id && (
                                  <div>
                                    <p className="text-xs font-bold text-gray-500 mb-1">User ID</p>
                                    <p className="text-sm font-mono text-gray-700">{log.user_id}</p>
                                  </div>
                                )}
                                {log.meta && (
                                  <div>
                                    <p className="text-xs font-bold text-gray-500 mb-1">Metadata</p>
                                    <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">{JSON.stringify(JSON.parse(log.meta), null, 2)}</pre>
                                  </div>
                                )}
                                <p className="text-xs text-gray-400">ID: {log.id}</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Pagination */}
              {errorLogTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-500">
                    Page {errorLogPage} of {errorLogTotalPages} ({errorLogTotal} total)
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetchErrorLogs(errorLogPage - 1, errorLogFilter)}
                      disabled={errorLogPage <= 1}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
                    >
                      <ChevronLeft size={14} className="inline" /> Prev
                    </button>
                    <button
                      onClick={() => fetchErrorLogs(errorLogPage + 1, errorLogFilter)}
                      disabled={errorLogPage >= errorLogTotalPages}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
                    >
                      Next <ChevronRight size={14} className="inline" />
                    </button>
                  </div>
                </div>
              )}
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
