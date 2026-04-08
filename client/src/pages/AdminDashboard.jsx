import React, { useState, useEffect, useCallback } from 'react'
import {
  Users, Package, DollarSign, BarChart3, MessageSquare, Activity,
  Lock, RefreshCw, Trash2, XCircle, Plus, CreditCard, Search,
  UserPlus, Bell, Mail, Eye, ArrowLeft, Key, Send, AlertTriangle,
  ChevronLeft, ChevronRight, Filter, ChevronDown, Globe, TrendingUp,
  CheckCircle, X, Box, Pencil, Weight, Ruler, ShoppingCart, Zap,
  ArrowUpRight, Clock
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { adminApi, authApi, supportApi } from '../api'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid
} from 'recharts'
import toast from 'react-hot-toast'
import { ShippingRatesPanel } from '../components/ShippingRatesPanel'

// --- CUSTOM STYLES & GLASS COMPONENTS ---
const DashboardStyles = () => (
  <style>{`
    @keyframes morph {
      0% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: translate(0, 0) scale(1); }
      33% { transform: translate(30px, -50px) scale(1.05); }
      66% { transform: translate(-20px, 20px) scale(0.95); }
      100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: translate(0, 0) scale(1); }
    }
    .animate-morph { animation: morph 15s ease-in-out infinite; }
    
    @keyframes sheen {
      0% { transform: translateX(-100%) skewX(-15deg); }
      100% { transform: translateX(200%) skewX(-15deg); }
    }
    .glass-sheen { position: relative; overflow: hidden; }
    .glass-sheen::after {
      content: ''; position: absolute; top: 0; left: 0; width: 50%; height: 100%;
      background: linear-gradient(to right, transparent, rgba(255,255,255,0.3), transparent);
      animation: sheen 4s infinite;
    }

    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `}</style>
);

const LiquidBlob = ({ className, color }) => (
  <div className={`absolute blur-[100px] md:blur-[120px] rounded-full mix-blend-multiply opacity-60 animate-morph pointer-events-none ${className} ${color}`} />
);

const GlassCard = ({ children, className = "" }) => (
  <div className={`relative overflow-hidden rounded-[2.5rem] bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />
    <div className="relative z-10">{children}</div>
  </div>
);

export const AdminDashboard = () => {
  const { t } = useLanguage()
  const { user: currentUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  
  // Data States
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [orders, setOrders] = useState([])
  const [tickets, setTickets] = useState([])
  const [pendingPayments, setPendingPayments] = useState([])
  const [errorLogs, setErrorLogs] = useState([])
  const [errorLogStats, setErrorLogStats] = useState(null)

  // Interaction States
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [ticketMessages, setTicketMessages] = useState([])
  const [adminReply, setAdminReply] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [selectedOrders, setSelectedOrders] = useState([])
  const [newStatus, setNewStatus] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  // Form & Modal States
  const [showCreateOrderForm, setShowCreateOrderForm] = useState(false)
  const [createOrderForm, setCreateOrderForm] = useState({ retailer: '', market: 'UK', description: '', weight_kg: '', dimensions: { length: '', width: '', height: '' }, shipping_speed: 'economy', insurance: false, declared_value: '', electronics_item: '' })
  const [creatingOrder, setCreatingOrder] = useState(false)
  const [paymentModal, setPaymentModal] = useState(null) 
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [cancelModal, setCancelModal] = useState(null) 
  const [cancelReason, setCancelReason] = useState('')
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [changingPassword, setChangingPassword] = useState(false)
  const [exchangeRates, setExchangeRates] = useState({ USD_KES: '', GBP_KES: '', EUR_KES: '', CNY_KES: '' })
  const [savingRates, setSavingRates] = useState(false)
  const [showCreateUserForm, setShowCreateUserForm] = useState(false)
  const [createUserForm, setCreateUserForm] = useState({ name: '', email: '', phone: '', role: 'customer' })
  const [creatingUser, setCreatingUser] = useState(false)
  const [reminderModal, setReminderModal] = useState(null)
  const [reminderAmount, setReminderAmount] = useState('')
  const [reminderNotes, setReminderNotes] = useState('')
  const [editOrderModal, setEditOrderModal] = useState(null)
  const [editOrderForm, setEditOrderForm] = useState({ weight_kg: '', length: '', width: '', height: '', actual_cost: '', customs_duty: '', status: '', description: '' })
  const [savingOrder, setSavingOrder] = useState(false)
  const [testEmail, setTestEmail] = useState(currentUser?.email || '')
  
  // User Panel States
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedUserData, setSelectedUserData] = useState(null)
  const [loadingUser, setLoadingUser] = useState(false)
  const [showUserOrderForm, setShowUserOrderForm] = useState(false)
  const [emailLogs, setEmailLogs] = useState([])
  const [approvingPayment, setApprovingPayment] = useState(null)
  const [expandedProof, setExpandedProof] = useState(null)

  // Error Log Pagination
  const [errorLogPage, setErrorLogPage] = useState(1)
  const [errorLogTotalPages, setErrorLogTotalPages] = useState(0)
  const [errorLogFilter, setErrorLogFilter] = useState({ level: '', source: '', search: '' })
  const [loadingErrorLogs, setLoadingErrorLogs] = useState(false)
  const [expandedError, setExpandedError] = useState(null)

  const fetchData = useCallback(async () => {
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
        if (ratesData?.rates) setExchangeRates(ratesData.rates)
      }
      if (results[4].status === 'fulfilled') setPendingPayments(results[4].value.data?.transactions || [])
      if (results[5].status === 'fulfilled') setTickets(results[5].value.data?.tickets || [])

      try {
        const statsRes = await adminApi.getErrorLogStats()
        if (statsRes.data?.stats) setErrorLogStats(statsRes.data.stats)
      } catch (_) {}
    } catch (err) {
      toast.error('Failed to load admin data')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // --- Handlers ---
  const fetchErrorLogs = async (page = 1, filters = errorLogFilter) => {
    try {
      setLoadingErrorLogs(true)
      const params = { page, limit: 25 }
      if (filters.level) params.level = filters.level
      if (filters.source) params.source = filters.source
      if (filters.search) params.search = filters.search
      const res = await adminApi.getErrorLogs(params)
      if (res.data?.error_logs) {
        setErrorLogs(res.data.error_logs)
        setErrorLogPage(res.data.pagination.page)
        setErrorLogTotalPages(res.data.pagination.totalPages)
      }
    } catch (err) { toast.error('Failed to load error logs') } finally { setLoadingErrorLogs(false) }
  }

  const handleClearErrorLogs = async (keepDays) => {
    if (!window.confirm(`Delete error logs older than ${keepDays} days?`)) return
    try {
      await adminApi.clearErrorLogs(keepDays)
      toast.success('Logs cleared')
      fetchErrorLogs(1, errorLogFilter)
      const statsRes = await adminApi.getErrorLogStats()
      if (statsRes.data?.stats) setErrorLogStats(statsRes.data.stats)
    } catch (err) { toast.error('Failed to clear logs') }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    const { currentPassword, newPassword, confirmPassword } = passwordForm
    if (!currentPassword || !newPassword || !confirmPassword) return toast.error('Please fill all fields')
    if (newPassword.length < 6) return toast.error('Password must be at least 6 characters')
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match')
    try {
      setChangingPassword(true)
      await authApi.changePassword(currentPassword, newPassword)
      toast.success('Password changed successfully')
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) { toast.error(err.message || 'Failed to change password') } finally { setChangingPassword(false) }
  }

  const handleSaveRates = async (e) => {
    e.preventDefault()
    const rates = {}
    for (const [pair, val] of Object.entries(exchangeRates)) {
      const num = parseFloat(val)
      if (!val || isNaN(num) || num <= 0) return toast.error(`Invalid rate for ${pair}`)
      rates[pair] = num
    }
    try {
      setSavingRates(true)
      await adminApi.setExchangeRates(rates)
      toast.success('Exchange rates updated successfully')
    } catch (err) { toast.error(err.message || 'Update failed') } finally { setSavingRates(false) }
  }

  const handleToggleOrderSelection = (id) => {
    setSelectedOrders(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleBulkUpdateOrders = async () => {
    if (!newStatus || selectedOrders.length === 0) return toast.error('Select orders and status')
    try {
      await adminApi.bulkUpdateOrders(selectedOrders, newStatus)
      toast.success('Orders updated successfully')
      setSelectedOrders([])
      setNewStatus('')
      const res = await adminApi.listOrders()
      setOrders(res.data?.orders || [])
    } catch (err) { toast.error('Failed to update orders') }
  }

  const handleDeleteOrder = async (id, trackingNumber) => {
    if (!window.confirm(`Permanently delete order ${trackingNumber}?`)) return
    try {
      await adminApi.deleteOrder(id)
      toast.success(`Order ${trackingNumber} deleted`)
      setOrders(prev => prev.filter(o => o.id !== id))
    } catch (err) { toast.error('Failed to delete order') }
  }

  const handleCancelOrder = async () => {
    if (!cancelModal) return
    try {
      await adminApi.cancelOrder(cancelModal.orderId, cancelReason)
      toast.success(`Order ${cancelModal.trackingNumber} cancelled`)
      setOrders(prev => prev.map(o => o.id === cancelModal.orderId ? { ...o, status: 'cancelled' } : o))
      setCancelModal(null)
      setCancelReason('')
    } catch (err) { toast.error('Cancellation failed') }
  }

  const handleRequestPayment = async () => {
    if (!paymentModal) return
    const amount = parseFloat(paymentAmount)
    if (!amount || amount <= 0) return toast.error('Enter a valid amount')
    try {
      await adminApi.requestPayment(paymentModal.orderId, amount, paymentNotes)
      toast.success('Payment request sent')
      setPaymentModal(null)
      setPaymentAmount(''); setPaymentNotes('')
    } catch (err) { toast.error('Failed to send request') }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    const { name, email, phone, role } = createUserForm
    if (!name || !email || !phone || !role) return toast.error('Fill required fields')
    try {
      setCreatingUser(true)
      await adminApi.createUser({ name, email, phone, role })
      toast.success('Account created')
      setShowCreateUserForm(false)
      setCreateUserForm({ name: '', email: '', phone: '', role: 'customer' })
      fetchData()
    } catch (err) { toast.error('Failed to create account') } finally { setCreatingUser(false) }
  }

  const handleSendReminder = async () => {
    if (!reminderModal) return
    const amount = parseFloat(reminderAmount)
    if (!amount || amount <= 0) return toast.error('Valid amount required')
    try {
      await adminApi.sendPaymentReminder(reminderModal.orderId, amount, reminderNotes)
      toast.success('Reminder sent')
      setReminderModal(null); setReminderAmount(''); setReminderNotes('')
    } catch (err) { toast.error('Failed to send reminder') }
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
      setSelectedTicket({ ...res.data.ticket, customer_name: ticket.customer_name, customer_email: ticket.customer_email })
      setTicketMessages(res.data.messages || [])
    } catch (err) { toast.error('Failed to load ticket') }
  }

  const sendAdminReply = async (e) => {
    e.preventDefault()
    if (!adminReply.trim() || !selectedTicket) return
    try {
      setSendingReply(true)
      await supportApi.replyToTicket(selectedTicket.id, adminReply)
      const res = await supportApi.getTicket(selectedTicket.id)
      setTicketMessages(res.data.messages || [])
      setAdminReply('')
    } catch (err) { toast.error('Failed to send reply') } finally { setSendingReply(false) }
  }

  const handleOpenUserDetail = async (u) => {
    setSelectedUser(u); setSelectedUserData(null); setEmailLogs([]); setLoadingUser(true); setShowUserOrderForm(false);
    try {
      const [userRes, emailRes] = await Promise.all([adminApi.getUser(u.id), adminApi.getUserEmails(u.id)])
      setSelectedUserData(userRes.data); setEmailLogs(emailRes.data?.email_logs || [])
    } catch (err) { toast.error('Failed to load details') } finally { setLoadingUser(false) }
  }

  const handleToggleUserActive = async (u) => {
    const action = u.is_active ? 'deactivate' : 'reactivate'
    if (!window.confirm(`${action === 'deactivate' ? 'Deactivate' : 'Reactivate'} user ${u.name}?`)) return
    try {
      await adminApi.updateUser(u.id, { is_active: !u.is_active })
      toast.success(`User ${action}d`)
      setSelectedUser(prev => ({...prev, is_active: !u.is_active}))
      fetchData()
    } catch (err) { toast.error(`Failed to ${action} user`) }
  }

  const handleDeleteUser = async (u) => {
    if (!window.confirm(`Permanently delete user ${u.name}? This will remove ALL their orders and data. This cannot be undone.`)) return
    try {
      await adminApi.deleteUser(u.id)
      toast.success('User deleted successfully')
      setSelectedUser(null)
      fetchData()
    } catch (err) { toast.error('Failed to delete user') }
  }

  const handleApprovePayment = async (paymentId) => {
    try {
      setApprovingPayment(paymentId)
      await adminApi.approvePayment(paymentId)
      toast.success('Payment approved')
      setPendingPayments(pendingPayments.filter(p => p.id !== paymentId))
    } catch (err) { toast.error('Approval failed') } finally { setApprovingPayment(null) }
  }

  const handleRejectPayment = async (paymentId) => {
    const reason = window.prompt('Reason for rejection:')
    if (reason === null) return
    try {
      setApprovingPayment(paymentId)
      await adminApi.rejectPayment(paymentId, reason || '')
      toast.success('Payment rejected')
      setPendingPayments(pendingPayments.filter(p => p.id !== paymentId))
    } catch (err) { toast.error('Rejection failed') } finally { setApprovingPayment(null) }
  }

  const handleResetUserPassword = async (userId, userName, userEmail) => {
    if (!window.confirm(`Send password reset email to ${userName}?`)) return
    try {
      await adminApi.resetUserPassword(userId)
      toast.success(`Reset email sent`)
    } catch (err) { toast.error('Failed to send reset') }
  }

  const handleCreateOrderForClient = async (e) => {
    e.preventDefault()
    if (!selectedCustomer) return toast.error('Select a customer')
    try {
      setCreatingOrder(true)
      const { dimensions, ...rest } = createOrderForm
      const hasDimensions = dimensions.length || dimensions.width || dimensions.height
      await adminApi.createOrderForClient({
        customer_email: selectedCustomer.email,
        ...rest, weight_kg: parseFloat(rest.weight_kg) || 0, declared_value: parseFloat(rest.declared_value) || 0,
        dimensions: hasDimensions ? { length: parseFloat(dimensions.length)||0, width: parseFloat(dimensions.width)||0, height: parseFloat(dimensions.height)||0 } : null
      })
      toast.success('Order created')
      setShowCreateOrderForm(false); setSelectedCustomer(null); setCustomerSearch(''); setCustomerResults([])
      setCreateOrderForm({ retailer:'', market:'UK', description:'', weight_kg:'', dimensions:{length:'',width:'',height:''}, shipping_speed:'economy', insurance:false, declared_value:'', electronics_item:'' })
      fetchData()
    } catch (err) { toast.error('Failed to create order') } finally { setCreatingOrder(false) }
  }

  const handleOpenEditOrder = (order) => {
    const dims = order.dimensions_json || {}
    setEditOrderForm({
      weight_kg: order.weight_kg || '',
      length: dims.length || '',
      width: dims.width || '',
      height: dims.height || '',
      actual_cost: order.actual_cost || '',
      customs_duty: order.customs_duty || '',
      status: order.status || 'pending',
      description: order.description || ''
    })
    setEditOrderModal(order)
  }

  const handleSaveEditOrder = async (e) => {
    e.preventDefault()
    if (!editOrderModal) return
    try {
      setSavingOrder(true)
      const data = {}
      if (editOrderForm.weight_kg !== '' && editOrderForm.weight_kg !== null) data.weight_kg = parseFloat(editOrderForm.weight_kg)
      const hasDims = editOrderForm.length || editOrderForm.width || editOrderForm.height
      if (hasDims) data.dimensions = { length: parseFloat(editOrderForm.length)||0, width: parseFloat(editOrderForm.width)||0, height: parseFloat(editOrderForm.height)||0 }
      if (editOrderForm.actual_cost !== '' && editOrderForm.actual_cost !== null) data.actual_cost = parseFloat(editOrderForm.actual_cost)
      if (editOrderForm.customs_duty !== '' && editOrderForm.customs_duty !== null) data.customs_duty = parseFloat(editOrderForm.customs_duty)
      if (editOrderForm.status) data.status = editOrderForm.status
      if (editOrderForm.description) data.description = editOrderForm.description

      const res = await adminApi.editOrder(editOrderModal.id, data)
      toast.success('Order updated successfully')
      setOrders(prev => prev.map(o => o.id === editOrderModal.id ? { ...o, ...res.data.order } : o))
      setEditOrderModal(null)
    } catch (err) { toast.error(err.message || 'Failed to update order') } finally { setSavingOrder(false) }
  }

  // --- UI Styles & Helpers ---
  const COLORS = ['#1e3a5f', '#f97316', '#10b981', '#6366f1']
  const tableWrapper = "bg-white/40 backdrop-blur-2xl border border-white/40 rounded-[2.5rem] shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] overflow-hidden overflow-x-auto"
  const inputClass = "w-full px-5 py-3.5 bg-white/50 border border-gray-200/80 rounded-2xl focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 transition-all outline-none font-bold text-slate-800 placeholder-slate-400 shadow-sm"
  const thClass = "px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500"
  const tdClass = "px-6 py-5 text-sm"
  const btnPrimary = "glass-sheen bg-[#0f172a] text-white px-6 py-3 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-50 hover:-translate-y-1"
  const btnOutline = "bg-white/60 backdrop-blur-md border border-white/50 text-[#0f172a] px-6 py-3 rounded-[1.5rem] font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/90 transition-all disabled:opacity-50 shadow-sm hover:-translate-y-1"

  const statusBadge = (status) => {
    const cls = {
      delivered: 'bg-green-50 text-green-700 border-green-200',
      in_transit: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      pending: 'bg-amber-50 text-amber-700 border-amber-200',
      cancelled: 'bg-red-50 text-red-700 border-red-200',
    }
    return <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm ${cls[status] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>{status?.replace(/_/g, ' ')}</span>
  }

  if (loading && !stats) return <div className="flex items-center justify-center h-screen bg-[#f8fafc]"><div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div></div>

  const marketChartData = (stats?.markets || []).map(m => ({ name: m.market, value: parseInt(m.count) || 0, revenue: parseFloat(m.value) || 0 }))

  return (
    <div className="min-h-screen bg-[#f8fafc] relative font-sans text-slate-900 pb-20 overflow-x-hidden">
      <DashboardStyles />
      
      {/* --- LIQUID BACKGROUNDS --- */}
      <LiquidBlob className="top-[-5%] left-[-10%] w-[400px] h-[400px] md:w-[600px] md:h-[600px]" color="bg-blue-200" />
      <LiquidBlob className="bottom-[10%] right-[-5%] w-[350px] h-[350px] md:w-[500px] md:h-[500px]" color="bg-orange-200" />
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px] pointer-events-none" />
      
      <div className="max-w-[1600px] mx-auto px-6 py-12 relative z-10 space-y-10">
        {/* Header Navigation */}
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-white/60 backdrop-blur-md border border-white/50 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 shadow-sm mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Auth: {currentUser?.name}
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-[#0f172a] tracking-tighter uppercase leading-none mb-2">{t('admin.title')}</h1>
            <p className="text-slate-500 font-bold text-sm tracking-wide uppercase">Global Terminal • System Live</p>
          </div>
          <div className="flex bg-white/60 backdrop-blur-2xl p-2 rounded-[2rem] border border-white/50 shadow-sm overflow-x-auto no-scrollbar">
            {['overview', 'users', 'orders', 'payments', 'revenue', 'tickets', 'exchange', 'settings', 'errorLogs'].map((tab) => (
              <button key={tab} onClick={() => { setActiveTab(tab); if(tab === 'errorLogs') fetchErrorLogs(); }}
                className={`relative px-6 py-3 rounded-[1.5rem] font-black text-xs uppercase tracking-widest whitespace-nowrap transition-all ${activeTab === tab ? 'bg-[#0f172a] text-white shadow-xl glass-sheen' : 'text-slate-500 hover:text-[#0f172a] hover:bg-white/50'}`}>
                {tab.replace(/([A-Z])/g, ' $1')}
                {tab === 'errorLogs' && errorLogStats && parseInt(errorLogStats.last_24h) > 0 && (
                  <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-pulse border-2 border-white"></span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* --- OVERVIEW --- */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Top Row: Revenue + Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Revenue Card — Large Dark Glass */}
              <div className="relative group overflow-hidden rounded-[2.5rem] bg-[#0f172a] p-10 text-white shadow-2xl flex flex-col justify-between transition-all hover:scale-[1.01] transform lg:rotate-1 hover:rotate-0 duration-700 md:col-span-2 md:row-span-2 glass-sheen min-h-[320px]">
                <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-orange-500/20 blur-[80px] -z-0 pointer-events-none animate-morph" />
                <div className="relative z-10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Global Revenue (Completed)</span>
                  <h3 className="text-5xl lg:text-7xl font-black tracking-tighter mt-2 leading-none">KES {(stats?.revenue?.total_revenue || 0).toLocaleString()}</h3>
                  <p className="text-xs mt-3 font-bold text-orange-400 uppercase tracking-widest">{stats?.revenue?.total_transactions || 0} secure transactions</p>
                </div>
                <div className="h-40 w-full mt-4 relative z-10">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats?.daily_orders || []}>
                      <defs>
                        <linearGradient id="colorDailyRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} formatter={(val) => [`KES ${Number(val).toLocaleString()}`, 'Revenue']} labelFormatter={(label) => new Date(label).toLocaleDateString()} />
                      <Area type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorDailyRev)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* New Users Today */}
              <GlassCard className="flex flex-col justify-center p-8 group hover:-translate-y-2 transition-all duration-500">
                <div className="flex items-center justify-between mb-4">
                  <UserPlus className="text-emerald-500" size={32}/>
                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full text-[9px] font-black uppercase tracking-widest">Today</span>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">New Users</span>
                <h3 className="text-4xl font-black text-[#0f172a] tracking-tighter">{stats?.users?.new_today || 0}</h3>
                <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-wider">{stats?.users?.total || 0} total users</p>
              </GlassCard>

              {/* New Orders Today */}
              <GlassCard className="flex flex-col justify-center p-8 border-orange-200/50 bg-orange-50/30 group hover:-translate-y-2 transition-all duration-500">
                <div className="flex items-center justify-between mb-4">
                  <ShoppingCart className="text-orange-500" size={32}/>
                  <span className="px-2.5 py-1 bg-orange-50 text-orange-600 border border-orange-200 rounded-full text-[9px] font-black uppercase tracking-widest">Today</span>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-orange-600/60 mb-1">New Orders</span>
                <h3 className="text-4xl font-black text-[#0f172a] tracking-tighter">{stats?.orders?.new_today || 0}</h3>
                <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-wider">{stats?.orders?.total_orders || 0} total orders</p>
              </GlassCard>

              {/* Active Orders */}
              <GlassCard className="flex flex-col justify-center p-8 group hover:-translate-y-2 transition-all duration-500">
                <div className="flex items-center justify-between mb-4">
                  <Zap className="text-blue-500" size={32}/>
                  <span className="px-2.5 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-full text-[9px] font-black uppercase tracking-widest animate-pulse">Live</span>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Active Orders</span>
                <h3 className="text-4xl font-black text-[#0f172a] tracking-tighter">{stats?.orders?.active_orders || 0}</h3>
                <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-wider">In pipeline now</p>
              </GlassCard>

              {/* Total Users */}
              <GlassCard className="flex flex-col justify-center p-8 group hover:-translate-y-2 transition-all duration-500">
                <Users className="text-indigo-500 mb-4" size={32}/>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Users</span>
                <h3 className="text-4xl font-black text-[#0f172a] tracking-tighter">{stats?.users?.total || 0}</h3>
                <div className="flex gap-3 mt-2">
                  <span className="text-[9px] font-black text-slate-400 uppercase">{stats?.users?.customers || 0} customers</span>
                  <span className="text-[9px] font-black text-orange-500 uppercase">{stats?.users?.admins || 0} admins</span>
                </div>
              </GlassCard>
            </div>

            {/* Middle Row: Order Status Breakdown + Market Pie */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Order Status Breakdown */}
              <GlassCard className="md:col-span-2 p-8">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2"><BarChart3 size={14} className="text-orange-500" /> Orders by Status</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {(stats?.order_statuses || []).map(s => {
                    const statusColors = {
                      pending: { bg: 'bg-amber-50/80', text: 'text-amber-700', border: 'border-amber-200/50', icon: <Clock size={18} className="text-amber-500" /> },
                      received_at_warehouse: { bg: 'bg-blue-50/80', text: 'text-blue-700', border: 'border-blue-200/50', icon: <Box size={18} className="text-blue-500" /> },
                      consolidating: { bg: 'bg-purple-50/80', text: 'text-purple-700', border: 'border-purple-200/50', icon: <Package size={18} className="text-purple-500" /> },
                      in_transit: { bg: 'bg-indigo-50/80', text: 'text-indigo-700', border: 'border-indigo-200/50', icon: <ArrowUpRight size={18} className="text-indigo-500" /> },
                      customs: { bg: 'bg-yellow-50/80', text: 'text-yellow-700', border: 'border-yellow-200/50', icon: <Globe size={18} className="text-yellow-600" /> },
                      out_for_delivery: { bg: 'bg-teal-50/80', text: 'text-teal-700', border: 'border-teal-200/50', icon: <TrendingUp size={18} className="text-teal-500" /> },
                      delivered: { bg: 'bg-emerald-50/80', text: 'text-emerald-700', border: 'border-emerald-200/50', icon: <CheckCircle size={18} className="text-emerald-500" /> },
                      cancelled: { bg: 'bg-red-50/80', text: 'text-red-700', border: 'border-red-200/50', icon: <XCircle size={18} className="text-red-500" /> },
                    }
                    const c = statusColors[s.status] || { bg: 'bg-slate-50/80', text: 'text-slate-700', border: 'border-slate-200/50', icon: <Package size={18} className="text-slate-400" /> }
                    return (
                      <div key={s.status} className={`relative overflow-hidden rounded-2xl ${c.bg} backdrop-blur-md border ${c.border} p-4 hover:scale-[1.02] transition-all duration-300 group/card`}>
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent pointer-events-none" />
                        <div className="relative z-10">
                          <div className="flex items-center justify-between mb-2">{c.icon}<span className={`text-2xl font-black ${c.text} tracking-tighter`}>{parseInt(s.count) || 0}</span></div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{s.status?.replace(/_/g, ' ')}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </GlassCard>

              {/* Market Volume Pie Chart */}
              <GlassCard className="flex flex-col p-8">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2"><Globe size={14} className="text-blue-500" /> Volume by Market</h4>
                <div className="flex-1 min-h-[200px] flex items-center justify-center">
                  {marketChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={marketChartData} innerRadius={55} outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                          {marketChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">No Market Data</p>}
                </div>
              </GlassCard>
            </div>

            {/* Bottom Row: Daily Orders Chart + Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Daily Orders Trend */}
              <GlassCard className="md:col-span-2 p-8">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2"><TrendingUp size={14} className="text-green-500" /> Orders Trend (14 Days)</h4>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats?.daily_orders || []}>
                      <defs>
                        <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1e3a5f" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#1e3a5f" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                      <Tooltip contentStyle={{ borderRadius: '1rem', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} formatter={(val) => [val, 'Orders']} labelFormatter={(label) => new Date(label).toLocaleDateString()} />
                      <Area type="monotone" dataKey="count" stroke="#1e3a5f" strokeWidth={3} fillOpacity={1} fill="url(#colorOrders)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>

              {/* Quick Stats Stack */}
              <div className="space-y-4">
                <GlassCard className="p-6 flex items-center gap-4 group hover:-translate-y-1 transition-all duration-300">
                  <div className="p-3 bg-green-50/80 rounded-2xl border border-green-200/50"><DollarSign size={20} className="text-green-600" /></div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Deposits</p>
                    <p className="text-xl font-black text-[#0f172a] tracking-tighter">KES {(parseFloat(stats?.revenue?.deposits) || 0).toLocaleString()}</p>
                  </div>
                </GlassCard>
                <GlassCard className="p-6 flex items-center gap-4 group hover:-translate-y-1 transition-all duration-300">
                  <div className="p-3 bg-blue-50/80 rounded-2xl border border-blue-200/50"><CreditCard size={20} className="text-blue-600" /></div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Payments</p>
                    <p className="text-xl font-black text-[#0f172a] tracking-tighter">KES {(parseFloat(stats?.revenue?.payments) || 0).toLocaleString()}</p>
                  </div>
                </GlassCard>
                <GlassCard className="p-6 flex items-center gap-4 group hover:-translate-y-1 transition-all duration-300">
                  <div className="p-3 bg-purple-50/80 rounded-2xl border border-purple-200/50"><Users size={20} className="text-purple-600" /></div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Referrals</p>
                    <p className="text-xl font-black text-[#0f172a] tracking-tighter">{parseInt(stats?.referrals?.completed_referrals) || 0} / {parseInt(stats?.referrals?.total_referrals) || 0}</p>
                    <p className="text-[9px] font-bold text-orange-500">KES {(parseFloat(stats?.referrals?.total_rewards_paid) || 0).toLocaleString()} paid</p>
                  </div>
                </GlassCard>
                <GlassCard className="p-6 flex items-center gap-4 group hover:-translate-y-1 transition-all duration-300">
                  <div className="p-3 bg-amber-50/80 rounded-2xl border border-amber-200/50"><Package size={20} className="text-amber-600" /></div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Pending Orders</p>
                    <p className="text-xl font-black text-[#0f172a] tracking-tighter">{parseInt(stats?.orders?.pending) || 0}</p>
                  </div>
                </GlassCard>
              </div>
            </div>
          </div>
        )}

        {/* --- USERS --- */}
        {activeTab === 'users' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-3xl font-black text-[#0f172a] uppercase tracking-tighter leading-none">User Directory</h2>
              <button onClick={() => setShowCreateUserForm(true)} className={btnPrimary}><UserPlus size={16}/> Provision Account</button>
            </div>
            <div className={tableWrapper}>
              <table className="w-full text-left">
                <thead className="bg-[#0f172a]/5">
                  <tr>
                    <th className={thClass}>User Entity</th>
                    <th className={thClass}>Credentials</th>
                    <th className={thClass}>Wallet</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass + " text-right"}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/50">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-white/40 transition-colors">
                      <td className={tdClass}><p className="font-black text-[#0f172a]">{u.name}</p><p className="text-[10px] font-mono text-orange-500 font-bold mt-1">{u.warehouse_id}</p></td>
                      <td className={tdClass}><p className="font-bold text-slate-700">{u.email}</p><p className="text-xs text-slate-400 font-medium mt-1">{u.phone}</p></td>
                      <td className={tdClass}><p className="font-black text-green-600">KES {(u.wallet_balance||0).toLocaleString()}</p></td>
                      <td className={tdClass}><span className={`inline-flex px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm border ${u.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{u.is_active ? 'Active' : 'Disabled'}</span></td>
                      <td className={tdClass + " text-right"}>
                        <button onClick={() => handleOpenUserDetail(u)} className="p-2 hover:bg-blue-100 text-blue-600 bg-white rounded-xl transition-all inline-flex shadow-sm"><Eye size={16}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- ORDERS --- */}
        {activeTab === 'orders' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-3xl font-black text-[#0f172a] uppercase tracking-tighter leading-none">Shipment Terminal</h2>
              <div className="flex gap-3">
                <button onClick={() => setShowCreateOrderForm(true)} className={btnPrimary}><Plus size={16}/> Create Order</button>
              </div>
            </div>

            {selectedOrders.length > 0 && (
              <GlassCard className="!p-4 flex flex-col md:flex-row items-center gap-4 bg-blue-50/40 border-blue-200/50">
                <span className="font-black text-blue-800 text-sm tracking-wide uppercase">{selectedOrders.length} Selected</span>
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className={inputClass + " !w-auto !py-3 !text-sm"}>
                  <option value="">Update Status…</option>
                  <option value="pending">Pending</option>
                  <option value="received_at_warehouse">Received</option>
                  <option value="consolidating">Consolidating</option>
                  <option value="in_transit">In Transit</option>
                  <option value="customs">Customs</option>
                  <option value="out_for_delivery">Out for Delivery</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button onClick={handleBulkUpdateOrders} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-colors shadow-lg">Apply Update</button>
              </GlassCard>
            )}

            <div className={tableWrapper}>
              <table className="w-full text-left">
                <thead className="bg-[#0f172a]/5">
                  <tr>
                    <th className={thClass}><input type="checkbox" onChange={e => e.target.checked ? setSelectedOrders(orders.map(o=>o.id)) : setSelectedOrders([])} className="w-4 h-4 rounded accent-[#0f172a]" /></th>
                    <th className={thClass}>Dispatch ID</th>
                    <th className={thClass}>Client / Item</th>
                    <th className={thClass}>Weight / Dims</th>
                    <th className={thClass}>Stage</th>
                    <th className={thClass + " text-right"}>Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/50">
                  {orders.map(o => {
                    const dims = o.dimensions_json
                    return (
                    <tr key={o.id} className="hover:bg-white/40 transition-colors group">
                      <td className={tdClass}><input type="checkbox" checked={selectedOrders.includes(o.id)} onChange={() => handleToggleOrderSelection(o.id)} className="w-4 h-4 rounded accent-[#0f172a]" /></td>
                      <td className={tdClass}><p className="font-black text-[#0f172a]">{o.tracking_number}</p><p className="text-[10px] text-slate-400 font-black uppercase mt-1 tracking-widest">{o.market}</p></td>
                      <td className={tdClass}><p className="font-bold text-slate-800">{o.name || o.email}</p><p className="text-xs text-slate-500 font-medium max-w-[200px] truncate mt-1">{o.retailer}: {o.description}</p></td>
                      <td className={tdClass}>
                        {o.weight_kg ? (
                          <div>
                            <p className="font-black text-[#0f172a]">{o.weight_kg} kg</p>
                            {dims && <p className="text-[10px] text-slate-400 font-bold mt-1">{dims.length}×{dims.width}×{dims.height} cm</p>}
                          </div>
                        ) : (
                          <span className="px-2 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded-full text-[9px] font-black uppercase tracking-widest">Pending</span>
                        )}
                      </td>
                      <td className={tdClass}>{statusBadge(o.status)}</td>
                      <td className={tdClass + " text-right"}>
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleOpenEditOrder(o)} className="p-2 bg-white hover:bg-blue-100 text-blue-600 border border-blue-100 rounded-xl shadow-sm transition-colors" title="Edit Order"><Pencil size={16}/></button>
                          <button onClick={() => { setPaymentModal({orderId: o.id, trackingNumber: o.tracking_number}); setPaymentAmount(String(o.estimated_cost||'')) }} className="p-2 bg-white hover:bg-green-100 text-green-600 border border-green-100 rounded-xl shadow-sm transition-colors" title="Request Payment"><DollarSign size={16}/></button>
                          <button onClick={() => { setReminderModal({orderId: o.id, trackingNumber: o.tracking_number}); setReminderAmount(String(o.estimated_cost||'')) }} className="p-2 bg-white hover:bg-orange-100 text-orange-500 border border-orange-100 rounded-xl shadow-sm transition-colors" title="Payment Reminder"><Bell size={16}/></button>
                          <button onClick={() => { setCancelModal({orderId: o.id, trackingNumber: o.tracking_number}) }} className="p-2 bg-white hover:bg-amber-100 text-amber-600 border border-amber-100 rounded-xl shadow-sm transition-colors" title="Cancel"><XCircle size={16}/></button>
                          <button onClick={() => handleDeleteOrder(o.id, o.tracking_number)} className="p-2 bg-white hover:bg-red-100 text-red-600 border border-red-100 rounded-xl shadow-sm transition-colors" title="Delete"><Trash2 size={16}/></button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- PAYMENTS --- */}
        {activeTab === 'payments' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <h2 className="text-3xl font-black text-[#0f172a] uppercase tracking-tighter leading-none">M-Pesa Verification Queue</h2>
            <div className="grid gap-6">
              {pendingPayments.length === 0 ? (
                <GlassCard className="text-center py-24 flex flex-col items-center justify-center">
                  <CreditCard className="text-slate-300 mb-6" size={56} />
                  <p className="font-black text-slate-400 uppercase text-xs tracking-widest">No pending transactions</p>
                </GlassCard>
              ) : pendingPayments.map(p => (
                <GlassCard key={p.id} className="flex flex-col gap-6 p-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                      <div className="flex items-center gap-4 mb-2">
                        <span className="font-black text-3xl text-green-600 tracking-tighter">KES {p.amount.toLocaleString()}</span>
                        <span className="px-3 py-1.5 bg-orange-50 text-orange-600 border border-orange-200 rounded-full font-mono text-[10px] font-black uppercase tracking-widest shadow-sm">{p.payment_reference}</span>
                      </div>
                      <p className="text-sm text-slate-500 font-bold">{p.name || p.email} • {new Date(p.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => handleApprovePayment(p.id)} disabled={approvingPayment===p.id} className="glass-sheen bg-green-500 text-white px-8 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-green-600 shadow-xl transition-all hover:-translate-y-1"><CheckCircle size={16}/> Verify</button>
                      <button onClick={() => handleRejectPayment(p.id)} disabled={approvingPayment===p.id} className="bg-red-50 text-red-600 border border-red-200 px-8 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:bg-red-100 transition-colors shadow-sm">Reject</button>
                    </div>
                  </div>

                  {/* Full M-Pesa Message — Always Visible */}
                  <div className="relative overflow-hidden rounded-2xl bg-slate-900/5 backdrop-blur-md border border-white/50 p-6 shadow-inner">
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-3">
                        <MessageSquare size={14} className="text-blue-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Full M-Pesa SMS</span>
                      </div>
                      <div className="font-mono text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-white/40 p-4 rounded-xl border border-white/50">
                        {p.mpesa_message || 'No message logged. Check admin logs for transaction proof.'}
                      </div>
                    </div>
                  </div>

                  {/* Payer details if available */}
                  {(p.payer_name || p.payer_phone) && (
                    <div className="flex flex-wrap gap-3">
                      {p.payer_name && <span className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-500">Payer: {p.payer_name}</span>}
                      {p.payer_phone && <span className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-500">Phone: {p.payer_phone}</span>}
                    </div>
                  )}
                </GlassCard>
              ))}
            </div>
          </div>
        )}

        {/* --- REVENUE (Border Gradient Bento) --- */}
        {activeTab === 'revenue' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="p-1 bg-gradient-to-br from-orange-400 via-orange-300 to-blue-400 rounded-[3rem] shadow-2xl group transition-all hover:scale-[1.01]">
              <div className="h-full w-full bg-white/95 backdrop-blur-3xl rounded-[2.9rem] p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8">
                <div>
                  <h2 className="text-3xl md:text-4xl font-black text-[#0f172a] uppercase tracking-tighter leading-none mb-2">Revenue Reporting</h2>
                  <p className="text-sm font-bold text-slate-500">Extract and analyze financial throughput.</p>
                </div>
                <button onClick={async () => {
                  try {
                    const res = await adminApi.exportRevenue(); const url = window.URL.createObjectURL(new Blob([res.data])); const link = document.createElement('a'); link.href = url; link.setAttribute('download', 'revenue.csv'); document.body.appendChild(link); link.click(); link.remove(); toast.success('Exported');
                  } catch { toast.error('Export failed') }
                }} className={btnPrimary + " w-full md:w-auto !px-10 !py-5"}>Export CSV Report</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <GlassCard className="p-8 border-green-200/50 bg-green-50/30">
                <p className="text-[10px] font-black uppercase tracking-widest text-green-700/60 mb-3">Total Deposits</p>
                <h3 className="text-4xl md:text-5xl font-black text-green-700 tracking-tighter">KES {(stats?.revenue?.deposits||0).toLocaleString()}</h3>
              </GlassCard>
              <GlassCard className="p-8 border-blue-200/50 bg-blue-50/30">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-700/60 mb-3">Total Payments</p>
                <h3 className="text-4xl md:text-5xl font-black text-blue-700 tracking-tighter">KES {(stats?.revenue?.payments||0).toLocaleString()}</h3>
              </GlassCard>
              <GlassCard className="p-8 border-orange-200/50 bg-orange-50/30">
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-700/60 mb-3">Net Revenue</p>
                <h3 className="text-4xl md:text-5xl font-black text-orange-600 tracking-tighter">KES {(stats?.revenue?.total_revenue||0).toLocaleString()}</h3>
              </GlassCard>
            </div>
          </div>
        )}

        {/* --- TICKETS --- */}
        {activeTab === 'tickets' && (
          <div className="space-y-6 animate-in fade-in duration-500">
             <h2 className="text-3xl font-black text-[#0f172a] uppercase tracking-tighter leading-none">Support & Comms</h2>
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[700px]">
               {/* List */}
               <GlassCard className="flex flex-col overflow-hidden !p-0">
                 <div className="p-6 border-b border-white/50 bg-white/30 backdrop-blur-md">
                   <h3 className="font-black text-xs uppercase tracking-widest text-slate-500">Active Threads</h3>
                 </div>
                 <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
                   {tickets.map(t => (
                     <div key={t.id} onClick={() => openTicket(t)} className={`p-5 rounded-3xl cursor-pointer transition-all border ${selectedTicket?.id === t.id ? 'bg-white border-orange-300 shadow-xl' : 'bg-white/40 border-white/50 hover:bg-white/60'}`}>
                       <h4 className="font-black text-sm text-[#0f172a] mb-2 truncate">{t.subject}</h4>
                       <div className="flex justify-between items-center">
                         <span className="text-[10px] font-bold text-slate-500 truncate max-w-[120px]">{t.email}</span>
                         <span className={`text-[9px] font-black uppercase tracking-widest ${t.status === 'open' ? 'text-red-500' : 'text-green-500'}`}>{t.status}</span>
                       </div>
                     </div>
                   ))}
                 </div>
               </GlassCard>
               {/* Chat Panel */}
               <GlassCard className="lg:col-span-2 flex flex-col !p-0 overflow-hidden">
                  {selectedTicket ? (
                    <>
                      <div className="p-8 border-b border-white/50 bg-white/30 backdrop-blur-md">
                        <h3 className="text-2xl font-black text-[#0f172a] uppercase tracking-tighter mb-1">{selectedTicket.subject}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ticket ID: {selectedTicket.id}</p>
                      </div>
                      <div className="flex-1 overflow-y-auto p-8 space-y-6 no-scrollbar bg-slate-900/5">
                        {ticketMessages.map((m, i) => (
                          <div key={m.id || i} className={`flex ${m.role === 'admin' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] p-5 rounded-[2rem] shadow-sm ${m.role === 'admin' ? 'bg-[#0f172a] text-white rounded-br-sm' : 'bg-white border border-white/50 text-slate-800 rounded-bl-sm'}`}>
                              <p className="text-sm font-medium leading-relaxed">{m.message}</p>
                              <p className="text-[9px] opacity-60 mt-3 font-black uppercase tracking-widest">{new Date(m.created_at).toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <form onSubmit={sendAdminReply} className="p-6 border-t border-white/50 bg-white/30 backdrop-blur-md flex gap-4">
                        <input value={adminReply} onChange={e => setAdminReply(e.target.value)} placeholder="Type resolution..." className={inputClass + " !rounded-full !py-4"} />
                        <button disabled={sendingReply || !adminReply.trim()} className="glass-sheen bg-orange-500 hover:bg-orange-600 text-white w-14 h-14 rounded-full flex items-center justify-center shrink-0 disabled:opacity-50 transition-transform hover:-translate-y-1 shadow-lg"><Send size={20}/></button>
                      </form>
                    </>
                  ) : <div className="flex-1 flex flex-col items-center justify-center text-slate-300"><MessageSquare size={56} className="mb-6 opacity-50"/><p className="font-black uppercase tracking-widest text-[10px]">Select a thread to view</p></div>}
               </GlassCard>
             </div>
          </div>
        )}

        {/* --- EXCHANGE --- */}
        {activeTab === 'exchange' && (
          <div className="max-w-2xl mx-auto animate-in fade-in duration-500">
            {/* Border Gradient Wrap */}
            <div className="p-1 bg-gradient-to-br from-orange-400 via-orange-300 to-blue-400 rounded-[3rem] shadow-2xl group transition-all hover:scale-[1.01]">
              <div className="h-full w-full bg-white/95 backdrop-blur-3xl rounded-[2.9rem] p-10 md:p-14 space-y-10">
                <div className="flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
                  <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                    <Globe size={32} className="text-orange-500" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-black text-[#0f172a] tracking-tighter uppercase leading-none mb-2">Currency Engine</h3>
                    <p className="text-sm font-bold text-slate-500">Set platform-wide conversion rates globally.</p>
                  </div>
                </div>
                <form onSubmit={handleSaveRates} className="space-y-6">
                  {Object.keys(exchangeRates).map(pair => (
                    <div key={pair} className="relative group/input">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-2 block">{pair.replace('_', ' to ')}</label>
                      <input type="number" step="0.01" value={exchangeRates[pair]} onChange={(e) => setExchangeRates({...exchangeRates, [pair]: e.target.value})} className={inputClass}/>
                    </div>
                  ))}
                  <button type="submit" disabled={savingRates} className="glass-sheen bg-[#0f172a] hover:bg-slate-800 text-white w-full py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-xl transition-all hover:-translate-y-1 disabled:opacity-50 mt-4">
                    {savingRates ? 'Updating Engine...' : 'Sync Global Rates'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* --- SETTINGS --- */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-500">
            <GlassCard className="p-10">
               <h3 className="text-2xl font-black text-[#0f172a] uppercase tracking-tighter mb-8 flex items-center gap-4">
                 <div className="p-3 bg-blue-100 text-blue-600 rounded-xl"><Lock size={20}/></div>
                 Admin Security
               </h3>
               <form onSubmit={handlePasswordChange} className="space-y-5">
                 <input type="password" placeholder="Current Password" value={passwordForm.currentPassword} onChange={e=>setPasswordForm(p=>({...p,currentPassword:e.target.value}))} className={inputClass} />
                 <input type="password" placeholder="New Password" value={passwordForm.newPassword} onChange={e=>setPasswordForm(p=>({...p,newPassword:e.target.value}))} className={inputClass} />
                 <input type="password" placeholder="Confirm Password" value={passwordForm.confirmPassword} onChange={e=>setPasswordForm(p=>({...p,confirmPassword:e.target.value}))} className={inputClass} />
                 <button type="submit" disabled={changingPassword} className={btnPrimary + " w-full !py-5 mt-4"}>Update Credentials</button>
               </form>
            </GlassCard>
            <GlassCard className="p-10">
               <h3 className="text-2xl font-black text-[#0f172a] uppercase tracking-tighter mb-6 flex items-center gap-4">
                 <div className="p-3 bg-orange-100 text-orange-500 rounded-xl"><Mail size={20}/></div>
                 SMTP Diagnostics
               </h3>
               <p className="text-sm text-slate-500 font-bold mb-8 leading-relaxed">Test the Gmail OAuth2 integration to ensure automated receipts and reset links are dispatched correctly.</p>
               <div className="space-y-5">
                 <input type="email" placeholder="Recipient Email" value={testEmail} onChange={e => setTestEmail(e.target.value)} className={inputClass} />
                 <button onClick={async () => {
                   try { toast.loading('Dispatching test...', {id:'em'}); await adminApi.testEmail(testEmail || currentUser?.email); toast.success('Test email delivered', {id:'em'}) }
                   catch (err) { toast.error(err.response?.data?.message || 'Delivery failed', {id:'em'}) }
                 }} className={btnOutline + " w-full !py-5"}>Fire Test Email</button>
               </div>
            </GlassCard>
            
            {/* ADDED SHIPPING RATES PANEL HERE */}
            <GlassCard className="p-10 md:col-span-2">
               <h3 className="text-2xl font-black text-[#0f172a] uppercase tracking-tighter mb-6 flex items-center gap-4">
                 <div className="p-3 bg-green-100 text-green-600 rounded-xl"><Package size={20}/></div>
                 Global Shipping Rates
               </h3>
               <ShippingRatesPanel />
            </GlassCard>
          </div>
        )}

        {/* --- ERROR LOGS --- */}
        {activeTab === 'errorLogs' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <h2 className="text-3xl font-black text-[#0f172a] uppercase tracking-tighter leading-none">System Diagnostics</h2>
              <button onClick={() => handleClearErrorLogs(30)} className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-6 py-3 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest transition-colors shadow-sm">
                Clear 30d+
              </button>
            </div>
            
            <GlassCard className="!p-6 flex flex-col md:flex-row gap-4 bg-white/30">
              <select value={errorLogFilter.level} onChange={e=>setErrorLogFilter(p=>({...p,level:e.target.value}))} className={inputClass + " md:max-w-[200px]"}>
                <option value="">All Levels</option><option value="error">Error</option><option value="warn">Warn</option><option value="fatal">Fatal</option>
              </select>
              <button onClick={()=>fetchErrorLogs(1, errorLogFilter)} className="bg-[#0f172a] hover:bg-slate-800 text-white px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-md">Apply Filter</button>
            </GlassCard>

            <div className={tableWrapper}>
              <table className="w-full text-left">
                <thead className="bg-[#0f172a]/5">
                  <tr>
                    <th className={thClass}>Level</th>
                    <th className={thClass}>Source</th>
                    <th className={thClass}>Message</th>
                    <th className={thClass}>Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/50">
                  {errorLogs.map(log => (
                    <React.Fragment key={log.id}>
                      <tr onClick={() => setExpandedError(expandedError === log.id ? null : log.id)} className="hover:bg-red-50/40 cursor-pointer transition-colors">
                        <td className={tdClass}><span className={`inline-flex px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm border ${log.level==='fatal' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{log.level}</span></td>
                        <td className={tdClass + " font-mono text-[10px] font-bold"}>{log.source}</td>
                        <td className={tdClass + " font-bold text-slate-800 truncate max-w-xs"}>{log.message}</td>
                        <td className={tdClass + " text-[10px] font-black uppercase tracking-widest text-slate-400"}>{new Date(log.created_at).toLocaleString()}</td>
                      </tr>
                      {expandedError === log.id && (
                        <tr>
                          <td colSpan="4" className="bg-[#0f172a] text-green-400 p-8 font-mono text-[10px] sm:text-xs whitespace-pre-wrap shadow-inner border-y border-white/20">
                            {log.stack || log.message}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              <div className="p-6 flex gap-3 justify-end bg-white/30 backdrop-blur-md border-t border-white/50">
                <button onClick={()=>fetchErrorLogs(errorLogPage-1)} disabled={errorLogPage<=1} className={btnOutline + " !py-2.5 !px-5"}>Prev</button>
                <button onClick={()=>fetchErrorLogs(errorLogPage+1)} disabled={errorLogPage>=errorLogTotalPages} className={btnOutline + " !py-2.5 !px-5"}>Next</button>
              </div>
            </div>
          </div>
        )}

        {/* --- GLOBAL MODALS --- */}
        
        {/* Create Order for Client Modal */}
        {showCreateOrderForm && (
          <div className="fixed inset-0 bg-[#0f172a]/80 backdrop-blur-sm z-[100] flex justify-end">
            <div className="bg-white/80 backdrop-blur-3xl w-full max-w-2xl h-full overflow-y-auto shadow-2xl relative p-10 md:p-14 animate-fade-in border-l border-white/50">
               <button onClick={() => setShowCreateOrderForm(false)} aria-label="Close" className="absolute top-10 right-10 w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-500 hover:text-red-500 shadow-sm transition-colors"><X size={20}/></button>
               
               <div className="mb-10">
                 <h3 className="text-3xl md:text-4xl font-black text-[#0f172a] uppercase tracking-tighter leading-none mb-2">Dispatch Order</h3>
                 <p className="text-slate-500 font-bold text-sm">Create a secure manifest on behalf of a client.</p>
               </div>
               
               <form onSubmit={handleCreateOrderForClient} className="space-y-8">
                 <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 mb-2 block">Locate Client</label>
                   <input type="text" value={customerSearch} onChange={e=>handleSearchCustomers(e.target.value)} placeholder="Search by name/email" className={inputClass}/>
                   {customerResults.length > 0 && (
                     <div className="mt-2 bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
                       {customerResults.map(c => (
                         <div key={c.id} onClick={()=>{setSelectedCustomer(c); setCustomerSearch(c.email); setCustomerResults([])}} className="p-4 hover:bg-orange-50 cursor-pointer border-b last:border-0 transition-colors flex justify-between items-center">
                           <span className="font-black text-slate-800 text-sm">{c.name}</span>
                           <span className="text-xs font-bold text-slate-500">{c.email}</span>
                         </div>
                       ))}
                     </div>
                   )}
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 mb-2 block">Retailer</label>
                     <input placeholder="e.g. Amazon" className={inputClass} value={createOrderForm.retailer} onChange={e=>setCreateOrderForm(p=>({...p,retailer:e.target.value}))} required />
                   </div>
                   <div>
                     <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 mb-2 block">Market</label>
                     <select className={inputClass} value={createOrderForm.market} onChange={e=>setCreateOrderForm(p=>({...p,market:e.target.value}))}><option value="UK">UK</option><option value="China">China</option></select>
                   </div>
                 </div>
                 <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 mb-2 block">Manifest Description</label>
                   <textarea placeholder="Item details..." className={inputClass + " resize-none"} rows={3} value={createOrderForm.description} onChange={e=>setCreateOrderForm(p=>({...p,description:e.target.value}))} required />
                 </div>
                 
                 <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 mb-2 block">Electronics Handling</label>
                   <select className={inputClass} value={createOrderForm.electronics_item} onChange={e=>setCreateOrderForm(p=>({...p,electronics_item:e.target.value}))}>
                     <option value="">No electronics (Standard)</option>
                     <option value="phone">Phone (+£75 handling)</option>
                     <option value="laptop">Laptop / Accessories (+£65 handling)</option>
                     <option value="tv_monitor">TV / Screen / Monitor (+£65 handling)</option>
                   </select>
                 </div>
                 
                 <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2 mb-2 block">Dead Weight (KG)</label>
                   <input type="number" step="0.1" placeholder="0.0" className={inputClass} value={createOrderForm.weight_kg} onChange={e=>setCreateOrderForm(p=>({...p,weight_kg:e.target.value}))} required />
                 </div>
                 
                 <button type="submit" disabled={creatingOrder} className={btnPrimary + " w-full !py-5"}>Finalize Dispatch</button>
               </form>
            </div>
          </div>
        )}

        {/* User Details Side Panel */}
        {selectedUser && selectedUserData && (
          <div className="fixed inset-0 bg-[#0f172a]/80 backdrop-blur-sm z-[100] flex justify-end">
            <div className="bg-white/80 backdrop-blur-3xl w-full max-w-3xl h-full overflow-y-auto shadow-2xl relative p-10 md:p-14 animate-fade-in border-l border-white/50">
              <button onClick={() => setSelectedUser(null)} aria-label="Close" className="absolute top-10 right-10 w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-500 hover:text-red-500 shadow-sm transition-colors"><X size={20}/></button>
              
              <div className="mb-12">
                <h3 className="text-4xl md:text-5xl font-black text-[#0f172a] tracking-tighter uppercase leading-none mb-3">{selectedUser.name}</h3>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1.5 bg-orange-100 text-orange-600 rounded-lg font-mono text-[10px] font-black uppercase tracking-widest shadow-sm">{selectedUser.warehouse_id}</span>
                  <span className="text-sm font-bold text-slate-500">{selectedUser.email}</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-6 mb-12">
                <GlassCard className="p-8 border-green-200/50 bg-green-50/50 shadow-none">
                  <p className="text-[10px] font-black uppercase tracking-widest text-green-700/60 mb-2">Wallet Funds</p>
                  <p className="text-3xl md:text-4xl font-black text-green-700 tracking-tighter">KES {(selectedUserData.user?.wallet_balance||0).toLocaleString()}</p>
                </GlassCard>
                <GlassCard className="p-8 border-blue-200/50 bg-blue-50/50 shadow-none">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-700/60 mb-2">Active Orders</p>
                  <p className="text-3xl md:text-4xl font-black text-blue-700 tracking-tighter">{selectedUserData.user?.orders?.length || 0}</p>
                </GlassCard>
              </div>
              
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Administrative Protocols</h4>
              <div className="flex flex-wrap gap-4 mb-12">
                <button onClick={() => handleResetUserPassword(selectedUser.id, selectedUser.name, selectedUser.email)} className={btnOutline + " !bg-white"}><Key size={16}/> Push Reset Link</button>
                <button onClick={() => setShowUserOrderForm(!showUserOrderForm)} className={btnPrimary}><Package size={16}/> Drop Order</button>
                
                {selectedUser.id !== currentUser?.id && (
                  <>
                    <button onClick={() => handleToggleUserActive(selectedUser)} className={btnOutline + (selectedUser.is_active ? " !border-amber-500 !text-amber-600 hover:!bg-amber-50 bg-white" : " !border-green-500 !text-green-600 hover:!bg-green-50 bg-white")}>
                      <RefreshCw size={16}/> {selectedUser.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    <button onClick={() => handleDeleteUser(selectedUser)} className={btnOutline + " !border-red-500 !text-red-600 hover:!bg-red-50 bg-white"}>
                      <Trash2 size={16}/> Delete Account
                    </button>
                  </>
                )}
              </div>

              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Shipment History</h4>
              <div className="space-y-3 mb-12">
                {selectedUserData.user?.orders?.length === 0 ? <p className="text-sm font-bold text-slate-400">No shipments found.</p> : null}
                {selectedUserData.user?.orders?.map(o => (
                  <div key={o.id} className="p-5 bg-white border border-slate-100 rounded-2xl flex justify-between items-center shadow-sm">
                    <div>
                      <p className="font-black text-[#0f172a] text-sm">{o.tracking_number}</p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{o.market} • KES {o.estimated_cost}</p>
                    </div>
                    {statusBadge(o.status)}
                  </div>
                ))}
              </div>

              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Email Communications</h4>
              <div className="space-y-3">
                {emailLogs.length === 0 ? (
                  <p className="text-sm text-slate-400 font-bold">No email logs found</p>
                ) : (
                  emailLogs.map(log => (
                    <div key={log.id} className="p-5 bg-white border border-slate-100 rounded-2xl flex justify-between items-center shadow-sm">
                      <div>
                        <p className="font-black text-sm text-[#0f172a]">{log.subject}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{log.email_type?.replace(/_/g, ' ')} • {new Date(log.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className={`inline-flex px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm ${log.status === 'sent' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {log.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Small Action Modals */}
        {paymentModal && (
          <div className="fixed inset-0 bg-[#0f172a]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <GlassCard className="w-full max-w-lg p-10 relative">
              <button onClick={() => setPaymentModal(null)} aria-label="Close" className="absolute top-6 right-6 w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-500 hover:text-red-500 transition-colors shadow-sm"><X size={16} /></button>
              <h3 className="text-3xl font-black text-[#0f172a] uppercase tracking-tighter leading-none mb-8">Request Funds</h3>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2 mb-2 block">Amount (KES)</label>
                  <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className={inputClass} placeholder="0.00" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2 mb-2 block">Notes to Client</label>
                  <textarea value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} className={inputClass + " resize-none"} placeholder="Optional..." rows={3} />
                </div>
                <button onClick={handleRequestPayment} className={btnPrimary + " w-full !py-5"}>Dispatch Invoice</button>
              </div>
            </GlassCard>
          </div>
        )}

        {reminderModal && (
          <div className="fixed inset-0 bg-[#0f172a]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <GlassCard className="w-full max-w-lg p-10 relative">
              <button onClick={() => setReminderModal(null)} aria-label="Close" className="absolute top-6 right-6 w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-500 hover:text-red-500 transition-colors shadow-sm"><X size={16} /></button>
              <h3 className="text-3xl font-black text-[#0f172a] uppercase tracking-tighter leading-none mb-8">Payment Reminder</h3>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2 mb-2 block">Amount (KES)</label>
                  <input type="number" value={reminderAmount} onChange={(e) => setReminderAmount(e.target.value)} className={inputClass} placeholder="0.00" />
                </div>
                <button onClick={handleSendReminder} className="glass-sheen w-full bg-orange-500 hover:bg-orange-600 text-white py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-xs transition-all shadow-xl hover:-translate-y-1">Send Notice</button>
              </div>
            </GlassCard>
          </div>
        )}

        {cancelModal && (
          <div className="fixed inset-0 bg-[#0f172a]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <GlassCard className="w-full max-w-lg p-10 relative bg-red-50/80 border-red-200/50">
              <button onClick={() => setCancelModal(null)} aria-label="Close" className="absolute top-6 right-6 w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-500 hover:text-red-500 transition-colors shadow-sm"><X size={16} /></button>
              <h3 className="text-3xl font-black text-red-600 uppercase tracking-tighter leading-none mb-8">Halt Shipment</h3>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-red-800 ml-2 mb-2 block">Reason for Cancellation</label>
                  <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className={inputClass + " !border-red-200 focus:!ring-red-500/20 focus:!border-red-500 resize-none"} placeholder="Will be visible to client..." rows={3} />
                </div>
                <button onClick={handleCancelOrder} className="glass-sheen w-full bg-red-600 hover:bg-red-700 text-white py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-xs transition-all shadow-xl hover:-translate-y-1">Terminate Order</button>
              </div>
            </GlassCard>
          </div>
        )}
        
        {showCreateUserForm && (
          <div className="fixed inset-0 bg-[#0f172a]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <GlassCard className="w-full max-w-lg p-10 relative">
              <button onClick={() => setShowCreateUserForm(false)} aria-label="Close" className="absolute top-6 right-6 w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-500 hover:text-red-500 transition-colors shadow-sm"><X size={16} /></button>
              <div className="mb-10">
                 <h3 className="text-3xl font-black text-[#0f172a] uppercase tracking-tighter leading-none mb-2">New Account</h3>
                 <p className="text-slate-500 font-bold text-sm">Provision a new entity on the system.</p>
              </div>
              <form onSubmit={handleCreateUser} className="space-y-5">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2 mb-2 block">Full Name</label>
                  <input className={inputClass} value={createUserForm.name} onChange={e => setCreateUserForm({...createUserForm, name: e.target.value})} required />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2 mb-2 block">Email Address</label>
                  <input type="email" className={inputClass} value={createUserForm.email} onChange={e => setCreateUserForm({...createUserForm, email: e.target.value})} required />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2 mb-2 block">Phone (+254...)</label>
                  <input className={inputClass} value={createUserForm.phone} onChange={e => setCreateUserForm({...createUserForm, phone: e.target.value})} required />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2 mb-2 block">Account Role</label>
                  <select className={inputClass} value={createUserForm.role} onChange={e => setCreateUserForm({...createUserForm, role: e.target.value})}>
                    <option value="customer">Customer</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <button type="submit" disabled={creatingUser} className={btnPrimary + " w-full !py-5 mt-4"}>{creatingUser ? 'Provisioning...' : 'Deploy Account'}</button>
              </form>
            </GlassCard>
          </div>
        )}

        {/* --- EDIT ORDER MODAL --- */}
        {editOrderModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200" onClick={() => setEditOrderModal(null)}>
            <div onClick={e => e.stopPropagation()} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <GlassCard className="!bg-white/90 backdrop-blur-3xl p-8 md:p-10 shadow-2xl">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-2xl font-black text-[#0f172a] uppercase tracking-tighter">Edit Order</h3>
                    <p className="text-sm font-bold text-orange-500 mt-1">{editOrderModal.tracking_number}</p>
                  </div>
                  <button onClick={() => setEditOrderModal(null)} className="p-2 hover:bg-red-100 text-red-500 rounded-xl transition-colors"><X size={20}/></button>
                </div>

                <form onSubmit={handleSaveEditOrder} className="space-y-6">
                  {/* Weight & Dimensions Section */}
                  <div className="relative overflow-hidden rounded-2xl bg-blue-50/60 backdrop-blur-md border border-blue-200/40 p-5">
                    <div className="absolute inset-0 bg-gradient-to-tr from-blue-100/20 to-transparent pointer-events-none" />
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-4 relative z-10 flex items-center gap-2"><Weight size={14}/> Weight & Dimensions</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Weight (kg)</label>
                        <input type="number" step="0.01" min="0" className={inputClass} placeholder="0.00" value={editOrderForm.weight_kg} onChange={e => setEditOrderForm({...editOrderForm, weight_kg: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Length (cm)</label>
                        <input type="number" step="0.1" min="0" className={inputClass} placeholder="0" value={editOrderForm.length} onChange={e => setEditOrderForm({...editOrderForm, length: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Width (cm)</label>
                        <input type="number" step="0.1" min="0" className={inputClass} placeholder="0" value={editOrderForm.width} onChange={e => setEditOrderForm({...editOrderForm, width: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Height (cm)</label>
                        <input type="number" step="0.1" min="0" className={inputClass} placeholder="0" value={editOrderForm.height} onChange={e => setEditOrderForm({...editOrderForm, height: e.target.value})} />
                      </div>
                    </div>
                  </div>

                  {/* Status & Costs */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Status</label>
                      <select className={inputClass} value={editOrderForm.status} onChange={e => setEditOrderForm({...editOrderForm, status: e.target.value})}>
                        <option value="pending">Pending</option>
                        <option value="received_at_warehouse">Received at Warehouse</option>
                        <option value="consolidating">Consolidating</option>
                        <option value="in_transit">In Transit</option>
                        <option value="customs">Customs</option>
                        <option value="out_for_delivery">Out for Delivery</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Actual Cost (KES)</label>
                      <input type="number" step="0.01" min="0" className={inputClass} placeholder="0.00" value={editOrderForm.actual_cost} onChange={e => setEditOrderForm({...editOrderForm, actual_cost: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Customs Duty (KES)</label>
                      <input type="number" step="0.01" min="0" className={inputClass} placeholder="0.00" value={editOrderForm.customs_duty} onChange={e => setEditOrderForm({...editOrderForm, customs_duty: e.target.value})} />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Description</label>
                    <textarea className={inputClass + " resize-none"} rows="3" value={editOrderForm.description} onChange={e => setEditOrderForm({...editOrderForm, description: e.target.value})} />
                  </div>

                  {/* Current Info Display */}
                  <div className="flex flex-wrap gap-3 text-[10px] font-black uppercase tracking-widest">
                    <span className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-slate-500">Est. Cost: KES {(editOrderModal.estimated_cost || 0).toLocaleString()}</span>
                    <span className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-slate-500">Market: {editOrderModal.market}</span>
                    <span className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-slate-500">Speed: {editOrderModal.shipping_speed}</span>
                  </div>

                  <div className="flex gap-4 pt-2">
                    <button type="submit" disabled={savingOrder} className={btnPrimary + " flex-1 !py-5"}>{savingOrder ? 'Saving...' : 'Save Changes'}</button>
                    <button type="button" onClick={() => setEditOrderModal(null)} className={btnOutline + " flex-1 !py-5"}>Cancel</button>
                  </div>
                </form>
              </GlassCard>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
