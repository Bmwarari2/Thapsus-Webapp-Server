import React, { useState, useEffect } from 'react'
import {
  Users, Package, DollarSign, BarChart3, MessageSquare, Activity,
  Lock, RefreshCw, Trash2, XCircle, Plus, CreditCard, Search,
  UserPlus, Bell, Mail, Eye, ArrowLeft, Key, Send, AlertTriangle,
  ChevronLeft, ChevronRight, Filter, ChevronDown, Zap, Sparkles, Box
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { adminApi, authApi, supportApi } from '../api'
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import toast from 'react-hot-toast'

/**
 * LIQUID GLASS COMPONENTS
 */
const LiquidBlob = ({ className, color }) => (
  <div className={`absolute blur-[120px] rounded-full mix-blend-multiply opacity-50 animate-morph ${className} ${color}`} />
);

const GlassCard = ({ children, className = "" }) => (
  <div className={`relative overflow-hidden rounded-[2rem] bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.05)] ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
    {children}
  </div>
);

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

  // Cost breakdown expansion state
  const [expandedAdminOrderCost, setExpandedAdminOrderCost] = useState(null)

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
    insurance: false, declared_value: '',
    electronics_item: '',
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

  // Exchange rate state
  const [exchangeRates, setExchangeRates] = useState({
    USD_KES: '', GBP_KES: '', EUR_KES: '', CNY_KES: '',
  })
  const [savingRates, setSavingRates] = useState(false)
  const [ratesLastUpdated, setRatesLastUpdated] = useState(null)

  // Shipping rates state
  const [shippingRates, setShippingRates] = useState({ UK: '', USA: '', China: '' })
  const [savingShippingRates, setSavingShippingRates] = useState(false)
  const [shippingRatesLastUpdated, setShippingRatesLastUpdated] = useState(null)

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
    insurance: false, declared_value: '',
    electronics_item: '',
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
        adminApi.getShippingRates(),
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

      if (results[6].status === 'fulfilled') {
        const srData = results[6].value.data
        if (srData?.rates) {
          setShippingRates({
            UK: srData.rates.UK || '',
            USA: srData.rates.USA || '',
            China: srData.rates.China || '',
          })
          setShippingRatesLastUpdated(srData.updated_at || null)
        }
      }

      try {
        const statsRes = await adminApi.getErrorLogStats()
        if (statsRes.data?.stats) setErrorLogStats(statsRes.data.stats)
      } catch (_) {}
    } catch (err) {
      toast.error('Failed to load admin data')
    } finally {
      setLoading(false)
    }
  }

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

  const handleShippingRateChange = (market, value) =>
    setShippingRates((prev) => ({ ...prev, [market]: value }))

  const handleSaveShippingRates = async (e) => {
    e.preventDefault()
    const rates = {}
    for (const [market, val] of Object.entries(shippingRates)) {
      const num = parseFloat(val)
      if (isNaN(num) || num <= 0) {
        toast.error(`Enter a valid rate for ${market}`)
        return
      }
      rates[market] = num
    }
    try {
      setSavingShippingRates(true)
      await adminApi.setShippingRates(rates)
      toast.success('Shipping rates updated successfully')
      setShippingRatesLastUpdated(new Date().toISOString())
    } catch (err) {
      toast.error(err.message || 'Failed to update shipping rates')
    } finally {
      setSavingShippingRates(false)
    }
  }

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

  const handleSearchCustomers = async (query) => {
    setCustomerSearch(query)
    if (query.length < 2) { setCustomerResults([]); return }
    try {
      const res = await adminApi.searchCustomers(query)
      setCustomerResults(res.data?.customers || [])
    } catch { setCustomerResults([]) }
  }

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

  const handleResetUserPassword = async (userId, userName, userEmail) => {
    if (!window.confirm(`Send password reset email to ${userName} (${userEmail})?`)) return
    try {
      await adminApi.resetUserPassword(userId)
      toast.success(`Password reset email sent to ${userEmail}`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send password reset')
    }
  }

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
      setUserOrderForm({ retailer: '', market: 'UK', description: '', weight_kg: '', shipping_speed: 'economy', dimensions: { length: '', width: '', height: '' }, insurance: false, declared_value: '', electronics_item: '' })
      handleOpenUserDetail(selectedUser)
      const ordersRes = await adminApi.listOrders()
      setOrders(ordersRes.data?.orders || [])
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create order')
    } finally {
      setCreatingUserOrder(false)
    }
  }

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
      setCreateOrderForm({ retailer: '', market: 'UK', description: '', weight_kg: '', dimensions: { length: '', width: '', height: '' }, shipping_speed: 'economy', insurance: false, declared_value: '', electronics_item: '' })
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
      <div className="flex items-center justify-center h-screen bg-[#f8fafc]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  const COLORS = ['#0f172a', '#f97316', '#10b981', '#6366f1']
  const userStats = stats?.users || {}
  const orderStats = stats?.orders || {}
  const marketStats = stats?.markets || []
  const revenueStats = stats?.revenue || {}
  const marketChartData = marketStats.map((m) => ({ name: m.market, value: parseInt(m.count) || 0, revenue: parseFloat(m.value) || 0 }))

  const statusBadge = (status) => {
    const cls = {
      delivered: 'bg-green-100/80 text-green-800 backdrop-blur-sm border border-green-200/50',
      in_transit: 'bg-blue-100/80 text-blue-800 backdrop-blur-sm border border-blue-200/50',
      pending: 'bg-yellow-100/80 text-yellow-800 backdrop-blur-sm border border-yellow-200/50',
      cancelled: 'bg-red-100/80 text-red-800 backdrop-blur-sm border border-red-200/50',
    }
    return cls[status] || 'bg-slate-100/80 text-slate-800 backdrop-blur-sm border border-slate-200/50'
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-x-hidden relative">
      <style>{`
        @keyframes morph {
          0% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0, 0) scale(1); }
        }
        @keyframes sheen {
          0% { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(200%) skewX(-15deg); }
        }
        .animate-morph { animation: morph 12s ease-in-out infinite; }
        .glass-sheen { position: relative; overflow: hidden; }
        .glass-sheen::after {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 50%; height: 100%;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.3), transparent);
          animation: sheen 4s infinite;
        }
      `}</style>

      {/* Background Liquid Elements */}
      <LiquidBlob className="top-[-5%] left-[-5%] w-[500px] h-[500px]" color="bg-blue-100" />
      <LiquidBlob className="bottom-[10%] right-[-5%] w-[600px] h-[600px]" color="bg-orange-100" />
      <div className="absolute inset-0 bg-white/20 backdrop-blur-[2px]" />

      <div className="max-w-7xl mx-auto px-6 py-12 relative z-10">
        {/* Header */}
        <div className="mb-12 space-y-2">
           <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/60 backdrop-blur-md border border-white/50 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
            <Zap size={10} className="text-orange-500" /> Admin Control Center
          </div>
          <h1 className="text-5xl lg:text-7xl font-black text-[#0f172a] tracking-tighter uppercase leading-none">{t('admin.title')}</h1>
          <p className="text-slate-500 font-medium">Global platform analytics and logistics management</p>
        </div>

        {/* Navigation Tabs - Liquid Pill Style */}
        <div className="flex gap-2 mb-12 overflow-x-auto pb-4 no-scrollbar">
          {[
            { id: 'overview', icon: BarChart3 },
            { id: 'users', icon: Users },
            { id: 'orders', icon: Box },
            { id: 'payments', icon: CreditCard },
            { id: 'tickets', icon: MessageSquare },
            { id: 'exchange', icon: RefreshCw },
            { id: 'shippingRates', icon: Package },
            { id: 'settings', icon: Lock },
            { id: 'errorLogs', icon: AlertTriangle }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); if (tab.id === 'errorLogs') fetchErrorLogs(1, errorLogFilter); }}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black uppercase text-[11px] tracking-widest whitespace-nowrap transition-all relative ${
                activeTab === tab.id 
                  ? 'bg-[#0f172a] text-white shadow-2xl shadow-slate-200' 
                  : 'bg-white/60 backdrop-blur-xl text-slate-400 border border-white/50 hover:bg-white hover:text-slate-600'
              }`}
            >
              <tab.icon size={14} />
              {tab.id === 'shippingRates' ? 'Rates' : tab.id === 'exchange' ? 'Currency' : tab.id === 'errorLogs' ? 'Logs' : t(`admin.${tab.id}`)}
              
              {tab.id === 'errorLogs' && errorLogStats && parseInt(errorLogStats.last_24h) > 0 && (
                <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[8px] rounded-full w-4 h-4 flex items-center justify-center border-2 border-white">
                  !
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ═══ Overview ═══ */}
        {activeTab === 'overview' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Bento Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <GlassCard className="p-8">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('admin.totalUsers')}</p>
                    <h3 className="text-4xl font-black text-[#0f172a] leading-none">{userStats.total || 0}</h3>
                    <div className="pt-2 flex gap-4">
                       <span className="text-[10px] font-bold text-blue-500">{userStats.customers || 0} CUSTOMERS</span>
                       <span className="text-[10px] font-bold text-orange-500">{userStats.admins || 0} ADMINS</span>
                    </div>
                  </div>
                  <div className="p-4 bg-blue-50 text-blue-500 rounded-2xl"><Users size={24} /></div>
                </div>
              </GlassCard>

              <GlassCard className="p-8">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('admin.activeOrders')}</p>
                    <h3 className="text-4xl font-black text-[#0f172a] leading-none">{orderStats.total_orders || 0}</h3>
                    <div className="pt-2 flex gap-4">
                       <span className="text-[10px] font-bold text-yellow-600">{orderStats.pending || 0} PENDING</span>
                       <span className="text-[10px] font-bold text-green-600">{orderStats.in_transit || 0} TRANSIT</span>
                    </div>
                  </div>
                  <div className="p-4 bg-orange-50 text-orange-500 rounded-2xl"><Box size={24} /></div>
                </div>
              </GlassCard>

              <GlassCard className="p-8">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Net Revenue</p>
                    <h3 className="text-4xl font-black text-green-600 leading-none">{(revenueStats.total_revenue || 0).toLocaleString()}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pt-2">KES Total Completed</p>
                  </div>
                  <div className="p-4 bg-green-50 text-green-500 rounded-2xl"><DollarSign size={24} /></div>
                </div>
              </GlassCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <GlassCard className="p-10">
                <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400 mb-8 flex items-center gap-2">
                   <Activity size={14} /> Orders by Current Status
                </h2>
                {stats?.order_statuses?.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={stats.order_statuses.map((s) => ({ name: s.status?.replace(/_/g, ' '), value: parseInt(s.count) || 0 }))} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                          {stats.order_statuses.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={4} />)}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="text-center text-slate-400 font-medium py-12 italic">Insufficient data points</p>}
              </GlassCard>

              <GlassCard className="p-10">
                <h2 className="text-xs font-black uppercase tracking-[0.3em] text-slate-400 mb-8 flex items-center gap-2">
                   <Globe size={14} /> Active Market Share
                </h2>
                {marketChartData.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={marketChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                          {marketChartData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={4} />)}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="text-center text-slate-400 font-medium py-12 italic">No market distribution yet</p>}
              </GlassCard>
            </div>
          </div>
        )}

        {/* ═══ Users ═══ */}
        {activeTab === 'users' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-[0.4em] text-slate-400">{t('admin.userManagement')}</h2>
              <button
                onClick={() => setShowCreateUserForm((v) => !v)}
                className="glass-sheen flex items-center gap-2 bg-[#0f172a] text-white px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl"
              >
                <UserPlus size={14} /> Create Account
              </button>
            </div>

            {showCreateUserForm && (
              <GlassCard className="p-10 border-2 border-[#0f172a]/20">
                <h3 className="text-2xl font-black text-[#0f172a] uppercase tracking-tighter mb-8">Provision New Account</h3>
                <form onSubmit={handleCreateUser} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Full Name</label>
                      <input type="text" value={createUserForm.name} onChange={(e) => setCreateUserForm((p) => ({ ...p, name: e.target.value }))} required className="w-full px-5 py-4 bg-white/60 backdrop-blur-xl border border-white/50 rounded-2xl focus:bg-white outline-none transition-all font-bold" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email Address</label>
                      <input type="email" value={createUserForm.email} onChange={(e) => setCreateUserForm((p) => ({ ...p, email: e.target.value }))} required className="w-full px-5 py-4 bg-white/60 backdrop-blur-xl border border-white/50 rounded-2xl focus:bg-white outline-none transition-all font-bold" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Phone</label>
                        <input type="text" value={createUserForm.phone} onChange={(e) => setCreateUserForm((p) => ({ ...p, phone: e.target.value }))} required className="w-full px-5 py-4 bg-white/60 backdrop-blur-xl border border-white/50 rounded-2xl focus:bg-white outline-none transition-all font-bold" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Account Role</label>
                        <select value={createUserForm.role} onChange={(e) => setCreateUserForm((p) => ({ ...p, role: e.target.value }))} className="w-full px-5 py-4 bg-white/60 backdrop-blur-xl border border-white/50 rounded-2xl focus:bg-white outline-none transition-all font-bold">
                          <option value="customer">Customer</option>
                          <option value="admin">Platform Admin</option>
                        </select>
                      </div>
                  </div>
                  <div className="flex gap-4 pt-4">
                    <button type="submit" disabled={creatingUser} className="glass-sheen bg-[#0f172a] text-white px-10 py-4 rounded-2xl font-black uppercase text-[11px] tracking-widest">
                      {creatingUser ? 'Processing...' : 'Deploy Account'}
                    </button>
                    <button type="button" onClick={() => setShowCreateUserForm(false)} className="px-10 py-4 bg-white/50 border border-slate-200 rounded-2xl font-black uppercase text-[11px] tracking-widest text-slate-500">Cancel</button>
                  </div>
                </form>
              </GlassCard>
            )}

            <GlassCard className="overflow-hidden">
               <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="bg-slate-900/5 border-b border-slate-100">
                    <tr>
                      <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Identity</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Warehouse ID</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Access Role</th>
                      <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Account Balance</th>
                      <th className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Operations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/50">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-white/40 transition-colors group">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-[#0f172a]">{u.name.charAt(0)}</div>
                            <div>
                               <p className="font-black text-slate-900 text-sm tracking-tight leading-none mb-1">{u.name}</p>
                               <p className="text-[10px] font-bold text-slate-400">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-xs font-black font-mono text-slate-500 uppercase tracking-widest">{u.warehouse_id}</td>
                        <td className="px-8 py-5 text-sm font-medium">
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${u.role === 'admin' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>{u.role}</span>
                        </td>
                        <td className="px-8 py-5 font-black text-slate-900">KES {(u.wallet_balance || 0).toLocaleString()}</td>
                        <td className="px-8 py-5">
                           <div className="flex items-center justify-end gap-2">
                              <button onClick={() => handleOpenUserDetail(u)} className="p-2.5 rounded-xl bg-white border border-slate-100 text-slate-400 hover:text-orange-500 transition-colors shadow-sm"><Eye size={16} /></button>
                              {u.id !== user?.id && (
                                <>
                                  <button onClick={() => handleDeleteOrder(u.id)} className="p-2.5 rounded-xl bg-white border border-slate-100 text-slate-400 hover:text-red-500 transition-colors shadow-sm"><Trash2 size={16} /></button>
                                </>
                              )}
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
               </div>
            </GlassCard>
          </div>
        )}

        {/* ═══ Exchange Rates ═══ */}
        {activeTab === 'exchange' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <GlassCard className="max-w-2xl p-10">
              <div className="flex items-center gap-4 mb-10">
                <div className="p-4 bg-orange-50 text-orange-500 rounded-2xl"><RefreshCw size={24} /></div>
                <div>
                  <h2 className="text-2xl font-black text-[#0f172a] uppercase tracking-tighter">Currency Rates</h2>
                  <p className="text-xs font-bold text-slate-400 tracking-wide">Adjust global conversion values for all logistics calculations</p>
                </div>
              </div>
              
              <form onSubmit={handleSaveRates} className="space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  {[
                    { pair: 'USD_KES', label: 'USD → KES', symbol: '$' },
                    { pair: 'GBP_KES', label: 'GBP → KES', symbol: '£' },
                    { pair: 'EUR_KES', label: 'EUR → KES', symbol: '€' },
                    { pair: 'CNY_KES', label: 'CNY → KES', symbol: '¥' },
                  ].map(({ pair, label, symbol }) => (
                    <div key={pair} className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</label>
                       <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-300">{symbol}</span>
                          <input type="number" step="0.01" value={exchangeRates[pair]} onChange={(e) => handleRateChange(pair, e.target.value)} className="w-full pl-10 pr-5 py-4 bg-white/60 backdrop-blur-xl border border-white/50 rounded-2xl outline-none font-black text-slate-900" />
                       </div>
                    </div>
                  ))}
                </div>
                <button type="submit" disabled={savingRates} className="glass-sheen w-full bg-[#0f172a] text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest">
                   {savingRates ? 'Synchronizing...' : 'Update Global Rates'}
                </button>
              </form>
            </GlassCard>
          </div>
        )}

        {/* ═══ Error Logs ═══ */}
        {activeTab === 'errorLogs' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-black uppercase tracking-[0.4em] text-slate-400">System Integrity Logs</h2>
                  <p className="text-sm font-bold text-slate-600 mt-1">Real-time unhandled exceptions and performance warnings</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleClearErrorLogs(7)} className="px-4 py-2 bg-red-100 text-red-600 rounded-xl font-black uppercase text-[9px] tracking-widest border border-red-200">Purge Logs</button>
                  <button onClick={() => fetchErrorLogs(1, errorLogFilter)} className="px-4 py-2 bg-white/60 border border-slate-200 text-slate-500 rounded-xl font-black uppercase text-[9px] tracking-widest"><RefreshCw size={12}/></button>
                </div>
             </div>

             <GlassCard className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-900/5">
                      <tr>
                        <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Priority</th>
                        <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Origin</th>
                        <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Exception Message</th>
                        <th className="px-8 py-5 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Timestamp</th>
                        <th className="px-8 py-5 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/50">
                      {errorLogs.map((log) => (
                        <React.Fragment key={log.id}>
                          <tr className="hover:bg-white/40 cursor-pointer" onClick={() => setExpandedError(expandedError === log.id ? null : log.id)}>
                            <td className="px-8 py-5">
                               <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${log.level === 'fatal' ? 'bg-red-500 text-white' : 'bg-orange-100 text-orange-700'}`}>{log.level}</span>
                            </td>
                            <td className="px-8 py-5 text-xs font-black text-slate-500 uppercase tracking-widest">{log.source}</td>
                            <td className="px-8 py-5 max-w-md"><p className="text-sm font-bold text-slate-900 truncate">{log.message}</p></td>
                            <td className="px-8 py-5 text-[10px] font-bold text-slate-400 whitespace-nowrap uppercase tracking-wider">{new Date(log.created_at).toLocaleString()}</td>
                            <td className="px-8 py-5 text-right"><ChevronDown size={14} className={`text-slate-300 transition-transform ${expandedError === log.id ? 'rotate-180' : ''}`} /></td>
                          </tr>
                          {expandedError === log.id && (
                            <tr className="bg-slate-900/[0.02]">
                              <td colSpan={5} className="px-12 py-8">
                                <div className="space-y-6">
                                   <div>
                                      <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Stack Trace</p>
                                      <pre className="p-6 bg-slate-900 text-slate-300 rounded-3xl text-xs font-mono overflow-x-auto whitespace-pre-wrap border border-slate-800 leading-relaxed">{log.stack}</pre>
                                   </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
             </GlassCard>
          </div>
        )}
      </div>

      {/* ─── Generic Modal Backdrop Wrapper ─── */}
      {(cancelModal || paymentModal || reminderModal) && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-6">
           <GlassCard className="max-w-md w-full p-10 animate-in zoom-in-95 duration-200">
              {/* Content dynamically renders based on state */}
              {cancelModal && (
                <div className="space-y-8">
                   <h3 className="text-3xl font-black text-[#0f172a] uppercase tracking-tighter">Kill Order</h3>
                   <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                      <p className="text-xs font-bold text-red-600 uppercase tracking-widest mb-1">Target ID</p>
                      <p className="font-mono font-black text-red-900">{cancelModal.trackingNumber}</p>
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Internal Reason</label>
                      <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} className="w-full p-4 bg-white/60 border border-slate-100 rounded-2xl outline-none text-sm font-medium" placeholder="Explain why..." />
                   </div>
                   <div className="flex gap-4">
                      <button onClick={handleCancelOrder} className="glass-sheen flex-1 py-4 bg-red-500 text-white rounded-2xl font-black uppercase text-[11px] tracking-widest">Execute Cancel</button>
                      <button onClick={() => setCancelModal(null)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[11px] tracking-widest">Abort</button>
                   </div>
                </div>
              )}
              {/* Similar logic for payment and reminder modals */}
           </GlassCard>
        </div>
      )}
    </div>
  )
}
