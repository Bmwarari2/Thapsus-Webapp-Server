import React, { useState, useEffect } from 'react'
import {
  Users, Package, DollarSign, BarChart3, MessageSquare, Activity,
  Lock, RefreshCw, Trash2, XCircle, Plus, CreditCard, Search,
  UserPlus, Bell, Mail, Eye, ArrowLeft, Key, Send, AlertTriangle,
  ChevronLeft, ChevronRight, Filter, CheckCircle,
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { adminApi, authApi, supportApi } from '../api'
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import toast from 'react-hot-toast'
import { ShippingRatesPanel } from '../components/ShippingRatesPanel'

// Imported Structural Components for the missing tabs
import OrdersTab from '../components/admin/OrdersTab'
import PaymentsTab from '../components/admin/PaymentsTab'
import RevenueTab from '../components/admin/RevenueTab'
import TicketsTab from '../components/admin/TicketsTab'
import ExchangeRatesTab from '../components/admin/ExchangeRatesTab'
import ErrorLogsTab from '../components/admin/ErrorLogsTab'

export const AdminDashboard = () => {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [orders, setOrders] = useState([])
  const [tickets, setTickets] = useState([])
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [ticketMessages, setTicketMessages] = useState([])
  const [adminReply, setAdminReply] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
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
  const [paymentModal, setPaymentModal] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')

  // Cancel order modal
  const [cancelModal, setCancelModal] = useState(null)
  const [cancelReason, setCancelReason] = useState('')

  // Password change state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '', newPassword: '', confirmPassword: '',
  })
  const [changingPassword, setChangingPassword] = useState(false)

  // Test Email state
  const [testEmail, setTestEmail] = useState('')
  const [sendingTestEmail, setSendingTestEmail] = useState(false)

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
  const [reminderModal, setReminderModal] = useState(null)
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
  const [expandedProof, setExpandedProof] = useState(null)

  // Email logs
  const [emailLogs, setEmailLogs] = useState([])

  // Error logs
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
        adminApi.listTickets({ page: 1, limit: 20 }),
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
      if (results[5].status === 'fulfilled') setTickets(results[5].value.data?.tickets || [])

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

  // ── Send Test Email ──────────────────────────────────────────────────
  const handleSendTestEmail = async (e) => {
    e.preventDefault()
    if (!testEmail) { toast.error('Please enter an email address'); return }
    try {
      setSendingTestEmail(true)
      await adminApi.sendTestEmail(testEmail)
      toast.success(`Test email sent to ${testEmail}`)
      setTestEmail('')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send test email')
    } finally {
      setSendingTestEmail(false)
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

  // ── Admin ticket chat handlers ─────────────────────────────────────────
  const openTicket = async (ticket) => {
    try {
      const res = await supportApi.getTicket(ticket.id)
      const { ticket: fullTicket, messages } = res.data
      setSelectedTicket({
        ...fullTicket,
        customer_name: ticket.customer_name,
        customer_email: ticket.customer_email,
      })
      setTicketMessages(messages || [])
    } catch (err) {
      toast.error('Failed to load ticket')
    }
  }

  const sendAdminReply = async (e) => {
    e.preventDefault()
    if (!adminReply.trim() || !selectedTicket) return
    try {
      setSendingReply(true)
      await supportApi.replyToTicket(selectedTicket.id, adminReply)
      const res = await supportApi.getTicket(selectedTicket.id)
      const { ticket: fullTicket, messages } = res.data
      setSelectedTicket((prev) => ({
        ...fullTicket,
        customer_name: prev?.customer_name,
        customer_email: prev?.customer_email,
      }))
      setTicketMessages(messages || [])
      setAdminReply('')
    } catch (err) {
      toast.error('Failed to send reply')
    } finally {
      setSendingReply(false)
    }
  }

  const handleCloseTicket = async () => {
    if (!selectedTicket || selectedTicket.status === 'closed') return
    if (!window.confirm(`Mark ticket ${selectedTicket.id?.slice(0, 8).toUpperCase()} as closed?`)) return
    try {
      setSendingReply(true)
      const res = await adminApi.updateTicketStatus(selectedTicket.id, 'closed')
      const updated = res.data?.ticket || { ...selectedTicket, status: 'closed' }
      setSelectedTicket((prev) => (prev ? { ...prev, status: updated.status } : prev))
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? { ...t, status: updated.status } : t)))
      toast.success('Ticket closed')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to close ticket')
    } finally {
      setSendingReply(false)
    }
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
      handleOpenUserDetail(selectedUser)
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

  // ── Render Helpers to keep main return clean ─────────────────────────────────────────

  const renderOverviewTab = () => (
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
  )

  const renderUsersTab = () => (
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
                        <button
                          onClick={() => handleOpenUserDetail(u)}
                          title="View User Details"
                          className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
                        >
                          <Eye size={15} />
                        </button>
                    {u.id !== user?.id && (
                      <>
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
  )

  const renderSettingsTab = () => (
    <div className="space-y-8">
      {/* Shipping Rates Adjustment Panel */}
      <div className="card">
        <ShippingRatesPanel />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Password Change */}
        <div className="card">
          <h3 className="text-lg font-bold text-[#1e3a5f] mb-4 flex items-center gap-2">
            <Lock size={20} /> Change Password
          </h3>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
              />
            </div>
            <button
              type="submit"
              disabled={changingPassword}
              className="bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-6 py-2 rounded-lg font-bold disabled:opacity-50"
            >
              {changingPassword ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </div>

        {/* Test Email Utility */}
        <div className="card">
          <h3 className="text-lg font-bold text-[#1e3a5f] mb-4 flex items-center gap-2">
            <Mail size={20} /> Test Email
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Verify your SMTP configuration by sending a test email to an address of your choice.
          </p>
          <form onSubmit={handleSendTestEmail} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Destination Email</label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="e.g. admin@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]"
              />
            </div>
            <button
              type="submit"
              disabled={sendingTestEmail}
              className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg font-bold disabled:opacity-50 flex items-center gap-2"
            >
              <Send size={16} />
              {sendingTestEmail ? 'Sending...' : 'Send Test Email'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )

  // ── Corrected Rendering Logic ───────────────────────────────────────────
  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverviewTab();
      case 'users':
        return renderUsersTab();
      case 'orders':
        return (
          <OrdersTab 
            orders={orders}
            selectedOrders={selectedOrders}
            handleToggleOrderSelection={handleToggleOrderSelection}
            newStatus={newStatus}
            setNewStatus={setNewStatus}
            handleBulkUpdateOrders={handleBulkUpdateOrders}
            showCreateOrderForm={showCreateOrderForm}
            setShowCreateOrderForm={setShowCreateOrderForm}
            customerSearch={customerSearch}
            handleSearchCustomers={handleSearchCustomers}
            customerResults={customerResults}
            selectedCustomer={selectedCustomer}
            setSelectedCustomer={setSelectedCustomer}
            createOrderForm={createOrderForm}
            setCreateOrderForm={setCreateOrderForm}
            handleCreateOrderForClient={handleCreateOrderForClient}
            creatingOrder={creatingOrder}
            setCancelModal={setCancelModal}
            setPaymentModal={setPaymentModal}
            handleDeleteOrder={handleDeleteOrder}
            handleCancelOrder={handleCancelOrder}
            cancelModal={cancelModal}
            cancelReason={cancelReason}
            setCancelReason={setCancelReason}
          />
        );
      case 'payments':
        return (
          <PaymentsTab 
            pendingPayments={pendingPayments}
            handleApprovePayment={handleApprovePayment}
            handleRejectPayment={handleRejectPayment}
            approvingPayment={approvingPayment}
            expandedProof={expandedProof}
            setExpandedProof={setExpandedProof}
          />
        );
      case 'revenue':
        return <RevenueTab stats={stats} marketChartData={marketChartData} marketStats={marketStats} revenueStats={revenueStats} />;
      case 'tickets':
        return (
          <TicketsTab 
            tickets={tickets} 
            openTicket={openTicket} 
            selectedTicket={selectedTicket} 
            ticketMessages={ticketMessages}
            adminReply={adminReply}
            setAdminReply={setAdminReply}
            sendAdminReply={sendAdminReply}
            sendingReply={sendingReply}
            handleCloseTicket={handleCloseTicket}
          />
        );
      case 'exchange':
        return (
          <ExchangeRatesTab 
            exchangeRates={exchangeRates} 
            handleRateChange={handleRateChange} 
            handleSaveRates={handleSaveRates} 
            savingRates={savingRates}
            ratesLastUpdated={ratesLastUpdated}
          />
        );
      case 'errorLogs':
        return (
          <ErrorLogsTab 
            errorLogs={errorLogs} 
            errorLogPage={errorLogPage}
            errorLogTotal={errorLogTotal}
            errorLogTotalPages={errorLogTotalPages}
            errorLogFilter={errorLogFilter}
            setErrorLogFilter={setErrorLogFilter}
            fetchErrorLogs={fetchErrorLogs}
            handleClearErrorLogs={handleClearErrorLogs}
            loadingErrorLogs={loadingErrorLogs}
            expandedError={expandedError}
            setExpandedError={setExpandedError}
          />
        );
      case 'settings':
        return renderSettingsTab();
      default:
        return (
          <div className="flex items-center justify-center h-full text-gray-500 py-20">
            Please select a valid tab from the navigation menu.
          </div>
        );
    }
  };

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

        {/* Dynamic Content Renderer */}
        {renderContent()}

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
      </div>
    </div>
  )
}
