import React, { useState, useEffect, useCallback } from 'react'
import {
  Users, Package, DollarSign, BarChart3, MessageSquare, Activity,
  Lock, RefreshCw, Trash2, XCircle, Plus, CreditCard, Search,
  UserPlus, Bell, Mail, Eye, ArrowLeft, Key, Send, AlertTriangle,
  ChevronLeft, ChevronRight, Filter, ChevronDown, Globe, TrendingUp,
  CheckCircle, X
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { adminApi, authApi, supportApi } from '../api'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid
} from 'recharts'
import toast from 'react-hot-toast'

const DashboardStyles = () => (
  <style>{`
    @keyframes morph {
      0% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
      50% { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
      100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
    }
    .animate-morph { animation: morph 8s ease-in-out infinite; }
    .glass-sheen { position: relative; overflow: hidden; }
    .glass-sheen::after {
      content: ''; position: absolute; top: -50%; left: -50%; width: 200%; height: 200%;
      background: linear-gradient(45deg, transparent, rgba(255,255,255,0.1), transparent);
      transform: rotate(45deg); transition: 0.5s;
    }
    .glass-sheen:hover::after { left: 120%; }
  `}</style>
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
  const [expandedAdminOrderCost, setExpandedAdminOrderCost] = useState(null)
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
  const [ratesLastUpdated, setRatesLastUpdated] = useState(null)
  const [showCreateUserForm, setShowCreateUserForm] = useState(false)
  const [createUserForm, setCreateUserForm] = useState({ name: '', email: '', phone: '', role: 'customer' })
  const [creatingUser, setCreatingUser] = useState(false)
  const [reminderModal, setReminderModal] = useState(null)
  const [reminderAmount, setReminderAmount] = useState('')
  const [reminderNotes, setReminderNotes] = useState('')
  const [testEmail, setTestEmail] = useState(currentUser?.email || '')
  
  // User Panel States
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedUserData, setSelectedUserData] = useState(null)
  const [loadingUser, setLoadingUser] = useState(false)
  const [showUserOrderForm, setShowUserOrderForm] = useState(false)
  const [userOrderForm, setUserOrderForm] = useState({ retailer: '', market: 'UK', description: '', weight_kg: '', shipping_speed: 'economy', dimensions: { length: '', width: '', height: '' }, insurance: false, declared_value: '', electronics_item: '' })
  const [creatingUserOrder, setCreatingUserOrder] = useState(false)
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
        if (ratesData?.rates) { setExchangeRates(ratesData.rates); setRatesLastUpdated(ratesData.updated_at || null) }
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
      setRatesLastUpdated(new Date().toISOString())
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

  // --- UI Styles & Helpers ---
  const COLORS = ['#1e3a5f', '#f97316', '#10b981', '#6366f1']
  const glassCard = "bg-white/60 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] rounded-[2rem] p-8 transition-all hover:-translate-y-1"
  const tableWrapper = "bg-white/70 backdrop-blur-xl border border-white rounded-[2.5rem] shadow-2xl overflow-hidden overflow-x-auto"
  const inputClass = "w-full px-5 py-3.5 bg-white/50 border border-gray-200/80 rounded-2xl focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 transition-all outline-none font-medium"
  const thClass = "px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500"
  const tdClass = "px-6 py-5 text-sm"
  const btnPrimary = "bg-[#1e3a5f] text-white px-6 py-3 rounded-2xl font-black text-sm shadow-lg flex items-center justify-center gap-2 hover:bg-[#152d4a] transition-all disabled:opacity-50"
  const btnOutline = "bg-transparent border-2 border-[#1e3a5f] text-[#1e3a5f] px-6 py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-slate-50 transition-all disabled:opacity-50"

  const statusBadge = (status) => {
    const cls = {
      delivered: 'bg-green-100 text-green-800 border border-green-200',
      in_transit: 'bg-blue-100 text-blue-800 border border-blue-200',
      pending: 'bg-amber-100 text-amber-800 border border-amber-200',
      cancelled: 'bg-red-100 text-red-800 border border-red-200',
    }
    return <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${cls[status] || 'bg-purple-100 text-purple-800 border border-purple-200'}`}>{status?.replace(/_/g, ' ')}</span>
  }

  if (loading && !stats) return <div className="flex items-center justify-center h-screen"><RefreshCw className="animate-spin text-[#1e3a5f]" size={48} /></div>

  const marketChartData = (stats?.markets || []).map(m => ({ name: m.market, value: parseInt(m.count) || 0, revenue: parseFloat(m.value) || 0 }))

  return (
    <div className="min-h-screen bg-[#f8fafc] relative font-sans text-gray-900 pb-20">
      <DashboardStyles />
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#1e3a5f]/5 blur-[120px] animate-morph pointer-events-none fixed"></div>
      
      <div className="max-w-[1600px] mx-auto px-6 py-12 relative z-10 space-y-10">
        {/* Header Navigation */}
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
          <div>
            <h1 className="text-5xl font-black text-[#1e3a5f] tracking-tighter mb-4">{t('admin.title')}</h1>
            <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest">Global Terminal • Auth: {currentUser?.name}</p>
          </div>
          <div className="flex bg-white/80 backdrop-blur-xl p-1.5 rounded-[2rem] border border-white shadow-sm overflow-x-auto no-scrollbar">
            {['overview', 'users', 'orders', 'payments', 'revenue', 'tickets', 'exchange', 'settings', 'errorLogs'].map((tab) => (
              <button key={tab} onClick={() => { setActiveTab(tab); if(tab === 'errorLogs') fetchErrorLogs(); }}
                className={`relative px-6 py-3 rounded-[1.5rem] font-extrabold text-sm whitespace-nowrap transition-all ${activeTab === tab ? 'bg-[#1e3a5f] text-white shadow-xl' : 'text-gray-500 hover:text-[#1e3a5f]'}`}>
                {tab.charAt(0).toUpperCase() + tab.slice(1).replace(/([A-Z])/g, ' $1')}
                {tab === 'errorLogs' && errorLogStats && parseInt(errorLogStats.last_24h) > 0 && (
                  <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-pulse border-2 border-white"></span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* --- OVERVIEW --- */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 auto-rows-[220px]">
            <div className="bg-[#1e3a5f] md:col-span-2 md:row-span-2 rounded-[2.5rem] p-10 text-white flex flex-col justify-between shadow-2xl glass-sheen">
              <div>
                <span className="text-xs font-black uppercase opacity-60">Global Revenue (Completed)</span>
                <h3 className="text-5xl lg:text-6xl font-black tracking-tighter mt-1">KES {(stats?.revenue?.total_revenue || 0).toLocaleString()}</h3>
                <p className="text-sm mt-2 font-medium opacity-80">{stats?.revenue?.total_transactions || 0} secure transactions</p>
              </div>
              <div className="h-56 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={marketChartData}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                    <Tooltip contentStyle={{ backgroundColor: '#1e3a5f', borderRadius: '1rem', border: 'none', color: '#fff' }} />
                    <Area type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={4} fillOpacity={1} fill="url(#colorRev)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className={glassCard + " flex flex-col justify-center"}>
              <Users className="text-[#1e3a5f] mb-3" size={32}/>
              <span className="text-xs font-black uppercase text-gray-400">Total Users</span>
              <h3 className="text-5xl font-black text-[#1e3a5f] mt-1">{stats?.users?.total || 0}</h3>
            </div>
            <div className={glassCard + " flex flex-col justify-center border-orange-100 bg-orange-50/30"}>
              <Package className="text-[#f97316] mb-3" size={32}/>
              <span className="text-xs font-black uppercase text-orange-600/60">Active Orders</span>
              <h3 className="text-5xl font-black text-[#1e3a5f] mt-1">{stats?.orders?.total_orders || 0}</h3>
            </div>
            <div className={glassCard + " md:col-span-2 flex flex-col"}>
              <h4 className="text-lg font-black mb-4 uppercase tracking-widest text-gray-400 text-xs">Volume by Market</h4>
              <div className="flex-1 min-h-[150px] flex items-center justify-center">
                {marketChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={marketChartData} innerRadius={60} outerRadius={80} dataKey="value" label>
                        {marketChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-gray-400 font-bold">No Market Data</p>}
              </div>
            </div>
          </div>
        )}

        {/* --- USERS --- */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-black text-[#1e3a5f] tracking-tighter">User Directory</h2>
              <button onClick={() => setShowCreateUserForm(true)} className={btnPrimary}><UserPlus size={18}/> Provision Account</button>
            </div>
            <div className={tableWrapper}>
              <table className="w-full text-left">
                <thead className="bg-[#1e3a5f]/5 border-b border-gray-100">
                  <tr>
                    <th className={thClass}>User Entity</th>
                    <th className={thClass}>Credentials</th>
                    <th className={thClass}>Wallet</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass + " text-right"}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-white/50 transition-colors">
                      <td className={tdClass}><p className="font-black text-[#1e3a5f]">{u.name}</p><p className="text-[10px] font-mono text-orange-500 font-bold">{u.warehouse_id}</p></td>
                      <td className={tdClass}><p className="font-bold">{u.email}</p><p className="text-xs text-gray-400">{u.phone}</p></td>
                      <td className={tdClass}><p className="font-bold text-green-600">KES {(u.wallet_balance||0).toLocaleString()}</p></td>
                      <td className={tdClass}><span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${u.is_active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>{u.is_active ? 'Active' : 'Disabled'}</span></td>
                      <td className={tdClass + " text-right"}>
                        <button onClick={() => handleOpenUserDetail(u)} className="p-2 hover:bg-blue-50 text-blue-600 rounded-xl transition-all inline-flex"><Eye size={18}/></button>
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
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-3xl font-black text-[#1e3a5f] tracking-tighter">Shipment Terminal</h2>
              <div className="flex gap-3">
                <button onClick={() => setShowCreateOrderForm(true)} className={btnPrimary}><Plus size={18}/> Create Order</button>
              </div>
            </div>

            {selectedOrders.length > 0 && (
              <div className={glassCard + " !p-4 !rounded-2xl flex items-center gap-4 bg-blue-50/50 border-blue-200"}>
                <span className="font-black text-blue-800">{selectedOrders.length} Selected</span>
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className={inputClass + " !w-auto !py-2 !px-4"}>
                  <option value="">Update Status...</option>
                  <option value="pending">Pending</option><option value="received_at_warehouse">Received</option><option value="in_transit">In Transit</option><option value="customs">Customs</option><option value="out_for_delivery">Out for Delivery</option><option value="delivered">Delivered</option>
                </select>
                <button onClick={handleBulkUpdateOrders} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold">Apply</button>
              </div>
            )}

            <div className={tableWrapper}>
              <table className="w-full text-left">
                <thead className="bg-[#1e3a5f]/5 border-b border-gray-100">
                  <tr>
                    <th className={thClass}><input type="checkbox" onChange={e => e.target.checked ? setSelectedOrders(orders.map(o=>o.id)) : setSelectedOrders([])} className="w-4 h-4 rounded" /></th>
                    <th className={thClass}>Dispatch ID</th>
                    <th className={thClass}>Client / Item</th>
                    <th className={thClass}>Stage</th>
                    <th className={thClass + " text-right"}>Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map(o => (
                    <tr key={o.id} className="hover:bg-white/50 transition-colors group">
                      <td className={tdClass}><input type="checkbox" checked={selectedOrders.includes(o.id)} onChange={() => handleToggleOrderSelection(o.id)} className="w-4 h-4 rounded" /></td>
                      <td className={tdClass}><p className="font-black text-[#1e3a5f]">{o.tracking_number}</p><p className="text-[10px] text-gray-400 font-bold uppercase">{o.market}</p></td>
                      <td className={tdClass}><p className="font-bold">{o.name || o.email}</p><p className="text-xs text-gray-500 max-w-[200px] truncate">{o.retailer}: {o.description}</p></td>
                      <td className={tdClass}>{statusBadge(o.status)}</td>
                      <td className={tdClass + " text-right flex justify-end gap-1"}>
                        <button onClick={() => { setPaymentModal({orderId: o.id, trackingNumber: o.tracking_number}); setPaymentAmount(String(o.estimated_cost||'')) }} className="p-2 hover:bg-green-100 text-green-700 rounded-xl" title="Request Payment"><DollarSign size={16}/></button>
                        <button onClick={() => { setReminderModal({orderId: o.id, trackingNumber: o.tracking_number}); setReminderAmount(String(o.estimated_cost||'')) }} className="p-2 hover:bg-orange-100 text-orange-700 rounded-xl" title="Payment Reminder"><Bell size={16}/></button>
                        <button onClick={() => { setCancelModal({orderId: o.id, trackingNumber: o.tracking_number}) }} className="p-2 hover:bg-amber-100 text-amber-700 rounded-xl" title="Cancel"><XCircle size={16}/></button>
                        <button onClick={() => handleDeleteOrder(o.id, o.tracking_number)} className="p-2 hover:bg-red-100 text-red-700 rounded-xl" title="Delete"><Trash2 size={16}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- PAYMENTS --- */}
        {activeTab === 'payments' && (
          <div className="space-y-6">
            <h2 className="text-3xl font-black text-[#1e3a5f] tracking-tighter">M-Pesa Verification Queue</h2>
            <div className="grid gap-4">
              {pendingPayments.length === 0 ? (
                <div className={glassCard + " text-center py-20"}><CreditCard className="mx-auto text-gray-300 mb-4" size={48} /><p className="font-bold text-gray-400 uppercase text-xs tracking-widest">No pending transactions</p></div>
              ) : pendingPayments.map(p => (
                <div key={p.id} className={glassCard + " flex flex-col gap-4"}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-black text-2xl text-green-600">KES {p.amount.toLocaleString()}</span>
                        <span className="px-3 py-1 bg-orange-100 text-orange-600 rounded-lg font-mono text-xs font-bold">{p.payment_reference}</span>
                      </div>
                      <p className="text-sm text-gray-500 font-bold">{p.name || p.email} • {new Date(p.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => handleApprovePayment(p.id)} disabled={approvingPayment===p.id} className="bg-emerald-500 text-white px-6 py-3 rounded-2xl hover:bg-emerald-600 font-bold flex items-center gap-2"><CheckCircle size={18}/> Verify</button>
                      <button onClick={() => handleRejectPayment(p.id)} disabled={approvingPayment===p.id} className="bg-rose-100 text-rose-700 px-6 py-3 rounded-2xl hover:bg-rose-200 font-bold">Reject</button>
                    </div>
                  </div>
                  <button onClick={() => setExpandedProof(expandedProof === p.id ? null : p.id)} className="text-blue-600 text-xs font-bold uppercase underline text-left w-fit">View Raw M-Pesa SMS</button>
                  {expandedProof === p.id && (
                     <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl font-mono text-sm text-slate-700 whitespace-pre-wrap">{p.mpesa_message || 'No message logged.'}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- REVENUE --- */}
        {activeTab === 'revenue' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-black text-[#1e3a5f] tracking-tighter">Revenue Reporting</h2>
              <button onClick={async () => {
                try {
                  const res = await adminApi.exportRevenue(); const url = window.URL.createObjectURL(new Blob([res.data])); const link = document.createElement('a'); link.href = url; link.setAttribute('download', 'revenue.csv'); document.body.appendChild(link); link.click(); link.remove(); toast.success('Exported');
                } catch { toast.error('Export failed') }
              }} className={btnOutline}>Export CSV</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className={glassCard + " !bg-green-50/50"}><p className="text-xs font-black uppercase text-green-700/60 mb-2">Total Deposits</p><h3 className="text-4xl font-black text-green-700">KES {(stats?.revenue?.deposits||0).toLocaleString()}</h3></div>
              <div className={glassCard + " !bg-blue-50/50"}><p className="text-xs font-black uppercase text-blue-700/60 mb-2">Total Payments</p><h3 className="text-4xl font-black text-blue-700">KES {(stats?.revenue?.payments||0).toLocaleString()}</h3></div>
              <div className={glassCard + " !bg-orange-50/50"}><p className="text-xs font-black uppercase text-orange-700/60 mb-2">Net Revenue</p><h3 className="text-4xl font-black text-orange-700">KES {(stats?.revenue?.total_revenue||0).toLocaleString()}</h3></div>
            </div>
          </div>
        )}

        {/* --- TICKETS --- */}
        {activeTab === 'tickets' && (
          <div className="space-y-6">
             <h2 className="text-3xl font-black text-[#1e3a5f] tracking-tighter">Support & Comms</h2>
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
               {/* List */}
               <div className={glassCard + " !p-4 flex flex-col overflow-hidden"}>
                 <h3 className="font-black text-sm uppercase text-gray-400 tracking-widest mb-4 px-2">Active Threads</h3>
                 <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                   {tickets.map(t => (
                     <div key={t.id} onClick={() => openTicket(t)} className={`p-4 rounded-2xl cursor-pointer border-2 transition-all ${selectedTicket?.id === t.id ? 'border-orange-500 bg-orange-50' : 'border-transparent bg-slate-50 hover:bg-slate-100'}`}>
                       <h4 className="font-bold text-sm truncate">{t.subject}</h4>
                       <div className="flex justify-between mt-2"><span className="text-[10px] font-bold text-gray-500">{t.email}</span><span className={`text-[10px] font-black uppercase ${t.status === 'open' ? 'text-red-500' : 'text-green-500'}`}>{t.status}</span></div>
                     </div>
                   ))}
                 </div>
               </div>
               {/* Chat Panel */}
               <div className={glassCard + " lg:col-span-2 flex flex-col !p-0 overflow-hidden"}>
                  {selectedTicket ? (
                    <>
                      <div className="p-6 border-b border-gray-100 bg-slate-50">
                        <h3 className="text-xl font-black text-[#1e3a5f]">{selectedTicket.subject}</h3>
                        <p className="text-xs text-gray-500 font-bold mt-1">Ticket ID: {selectedTicket.id}</p>
                      </div>
                      <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {ticketMessages.map((m, i) => (
                          <div key={m.id || i} className={`flex ${m.role === 'admin' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[70%] p-4 rounded-[1.5rem] ${m.role === 'admin' ? 'bg-[#1e3a5f] text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                              <p className="text-sm">{m.message}</p>
                              <p className="text-[10px] opacity-50 mt-2 font-bold uppercase">{new Date(m.created_at).toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <form onSubmit={sendAdminReply} className="p-4 border-t border-gray-100 flex gap-2 bg-white">
                        <input value={adminReply} onChange={e => setAdminReply(e.target.value)} placeholder="Type resolution..." className={inputClass + " !py-3"} />
                        <button disabled={sendingReply || !adminReply.trim()} className="bg-orange-500 text-white px-6 rounded-2xl font-black disabled:opacity-50"><Send size={18}/></button>
                      </form>
                    </>
                  ) : <div className="flex-1 flex flex-col items-center justify-center text-gray-300"><MessageSquare size={48} className="mb-4"/><p className="font-bold uppercase tracking-widest text-xs">Select a thread</p></div>}
               </div>
             </div>
          </div>
        )}

        {/* --- EXCHANGE --- */}
        {activeTab === 'exchange' && (
          <div className="max-w-2xl mx-auto"><div className={glassCard + " space-y-8"}>
            <div className="flex items-center gap-4"><div className="p-4 bg-orange-50 text-[#f97316] rounded-2xl"><Globe size={32}/></div><div><h3 className="text-3xl font-black text-[#1e3a5f] tracking-tighter">Currency Engine</h3><p className="text-sm font-bold text-gray-400">Set platform-wide conversion rates</p></div></div>
            <form onSubmit={handleSaveRates} className="space-y-6">
              {Object.keys(exchangeRates).map(pair => (
                <div key={pair}><label className="text-[10px] font-black uppercase text-gray-400 ml-2 mb-1 block">{pair.replace('_', ' to ')}</label><input type="number" step="0.01" value={exchangeRates[pair]} onChange={(e) => setExchangeRates({...exchangeRates, [pair]: e.target.value})} className={inputClass}/></div>
              ))}
              <button type="submit" disabled={savingRates} className="bg-[#1e3a5f] text-white w-full py-5 rounded-[1.5rem] font-black text-lg shadow-xl">{savingRates ? 'Updating...' : 'Sync Global Rates'}</button>
            </form>
          </div></div>
        )}

        {/* --- SETTINGS --- */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className={glassCard}>
               <h3 className="text-2xl font-black text-[#1e3a5f] mb-6 flex items-center gap-3"><Lock/> Admin Security</h3>
               <form onSubmit={handlePasswordChange} className="space-y-4">
                 <input type="password" placeholder="Current Password" value={passwordForm.currentPassword} onChange={e=>setPasswordForm(p=>({...p,currentPassword:e.target.value}))} className={inputClass} />
                 <input type="password" placeholder="New Password" value={passwordForm.newPassword} onChange={e=>setPasswordForm(p=>({...p,newPassword:e.target.value}))} className={inputClass} />
                 <input type="password" placeholder="Confirm Password" value={passwordForm.confirmPassword} onChange={e=>setPasswordForm(p=>({...p,confirmPassword:e.target.value}))} className={inputClass} />
                 <button type="submit" disabled={changingPassword} className={btnPrimary + " w-full !py-4 mt-2"}>Update Credentials</button>
               </form>
            </div>
            <div className={glassCard}>
               <h3 className="text-2xl font-black text-[#1e3a5f] mb-6 flex items-center gap-3"><Mail/> SMTP Diagnostics</h3>
               <p className="text-sm text-gray-500 font-medium mb-6">Test the Gmail OAuth2 integration to ensure automated receipts and reset links are dispatched correctly.</p>
               <div className="space-y-4">
                 <input type="email" placeholder="Recipient Email" value={testEmail} onChange={e => setTestEmail(e.target.value)} className={inputClass} />
                 <button onClick={async () => {
                   try { toast.loading('Dispatching test...', {id:'em'}); await adminApi.testEmail(testEmail || currentUser?.email); toast.success('Test email delivered', {id:'em'}) }
                   catch (err) { toast.error(err.response?.data?.message || 'Delivery failed', {id:'em'}) }
                 }} className={btnOutline + " w-full !py-4"}>Send Test Email</button>
               </div>
            </div>
          </div>
        )}

        {/* --- ERROR LOGS --- */}
        {activeTab === 'errorLogs' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-black text-[#1e3a5f] tracking-tighter">System Diagnostics</h2>
              <button onClick={() => handleClearErrorLogs(30)} className="bg-red-50 text-red-600 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-widest">Clear 30d+</button>
            </div>
            <div className="flex gap-4">
              <select value={errorLogFilter.level} onChange={e=>setErrorLogFilter(p=>({...p,level:e.target.value}))} className={inputClass + " !w-auto !py-2"}>
                <option value="">All Levels</option><option value="error">Error</option><option value="warn">Warn</option><option value="fatal">Fatal</option>
              </select>
              <button onClick={()=>fetchErrorLogs(1, errorLogFilter)} className="bg-slate-200 px-6 rounded-xl font-bold text-sm">Filter</button>
            </div>
            <div className={tableWrapper}>
              <table className="w-full text-left">
                <thead className="bg-[#1e3a5f]/5 border-b border-gray-100">
                  <tr><th className={thClass}>Level</th><th className={thClass}>Source</th><th className={thClass}>Message</th><th className={thClass}>Time</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {errorLogs.map(log => (
                    <React.Fragment key={log.id}>
                      <tr onClick={() => setExpandedError(expandedError === log.id ? null : log.id)} className="hover:bg-red-50/50 cursor-pointer">
                        <td className={tdClass}><Badge color={log.level==='fatal'?'red':'amber'}>{log.level}</Badge></td>
                        <td className={tdClass + " font-mono text-xs"}>{log.source}</td>
                        <td className={tdClass + " font-bold text-slate-700 truncate max-w-xs"}>{log.message}</td>
                        <td className={tdClass + " text-xs text-gray-500"}>{new Date(log.created_at).toLocaleString()}</td>
                      </tr>
                      {expandedError === log.id && (
                        <tr><td colSpan="4" className="bg-slate-900 text-green-400 p-6 font-mono text-xs whitespace-pre-wrap">{log.stack || log.message}</td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              <div className="p-4 flex gap-2 justify-end bg-gray-50">
                <button onClick={()=>fetchErrorLogs(errorLogPage-1)} disabled={errorLogPage<=1} className="px-4 py-2 bg-white rounded shadow-sm disabled:opacity-50">Prev</button>
                <button onClick={()=>fetchErrorLogs(errorLogPage+1)} disabled={errorLogPage>=errorLogTotalPages} className="px-4 py-2 bg-white rounded shadow-sm disabled:opacity-50">Next</button>
              </div>
            </div>
          </div>
        )}

        {/* --- GLOBAL MODALS --- */}
        {/* Create Order for Client Modal */}
        {showCreateOrderForm && (
          <div className="fixed inset-0 bg-[#1e3a5f]/60 backdrop-blur-md z-[100] flex justify-end">
            <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl relative p-10 animate-fade-in">
               <button onClick={() => setShowCreateOrderForm(false)} className="absolute top-8 right-8 text-gray-400 hover:text-red-500"><X size={24}/></button>
               <h3 className="text-3xl font-black text-[#1e3a5f] tracking-tighter mb-8">Dispatch Order</h3>
               <form onSubmit={handleCreateOrderForClient} className="space-y-6">
                 <div>
                   <label className="text-[10px] font-black uppercase text-gray-400 ml-2 mb-1 block">Locate Client</label>
                   <input type="text" value={customerSearch} onChange={e=>handleSearchCustomers(e.target.value)} placeholder="Search by name/email" className={inputClass}/>
                   {customerResults.map(c => <div key={c.id} onClick={()=>{setSelectedCustomer(c); setCustomerSearch(c.email); setCustomerResults([])}} className="p-3 hover:bg-orange-50 cursor-pointer text-sm font-bold border-b">{c.name} - {c.email}</div>)}
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <input placeholder="Retailer (e.g. Amazon)" className={inputClass} value={createOrderForm.retailer} onChange={e=>setCreateOrderForm(p=>({...p,retailer:e.target.value}))} required />
                   <select className={inputClass} value={createOrderForm.market} onChange={e=>setCreateOrderForm(p=>({...p,market:e.target.value}))}><option value="UK">UK</option><option value="USA">USA</option><option value="China">China</option></select>
                 </div>
                 <textarea placeholder="Item Description" className={inputClass + " resize-none"} rows={2} value={createOrderForm.description} onChange={e=>setCreateOrderForm(p=>({...p,description:e.target.value}))} required />
                 
                 {/* New Electronics Select Field */}
                 <div>
                   <label className="text-[10px] font-black uppercase text-gray-400 ml-2 mb-1 block">Electronics Handling</label>
                   <select className={inputClass} value={createOrderForm.electronics_item} onChange={e=>setCreateOrderForm(p=>({...p,electronics_item:e.target.value}))}>
                     <option value="">No electronics (Standard)</option>
                     <option value="phone">Phone (+£75 handling)</option>
                     <option value="laptop">Laptop / Accessories (+£65 handling)</option>
                     <option value="tv_monitor">TV / Screen / Monitor (+£65 handling)</option>
                   </select>
                 </div>
                 
                 <input type="number" step="0.1" placeholder="Weight (kg)" className={inputClass} value={createOrderForm.weight_kg} onChange={e=>setCreateOrderForm(p=>({...p,weight_kg:e.target.value}))} required />
                 <button type="submit" disabled={creatingOrder} className={btnPrimary + " w-full !py-5 text-lg"}>Finalize Dispatch</button>
               </form>
            </div>
          </div>
        )}

        {/* User Details Side Panel */}
        {selectedUser && selectedUserData && (
          <div className="fixed inset-0 bg-[#1e3a5f]/60 backdrop-blur-md z-[100] flex justify-end">
            <div className="bg-white w-full max-w-3xl h-full overflow-y-auto shadow-2xl relative p-10 animate-fade-in">
              <button onClick={() => setSelectedUser(null)} className="absolute top-8 right-8 text-gray-400 hover:text-red-500"><X size={24}/></button>
              <h3 className="text-4xl font-black text-[#1e3a5f] tracking-tighter mb-1">{selectedUser.name}</h3>
              <p className="font-mono text-orange-500 font-bold mb-8">{selectedUser.warehouse_id} • {selectedUser.email}</p>
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-green-50 p-6 rounded-3xl"><p className="text-xs font-black uppercase text-green-600/50 mb-1">Wallet</p><p className="text-3xl font-black text-green-700">KES {(selectedUserData.user?.wallet_balance||0).toLocaleString()}</p></div>
                <div className="bg-blue-50 p-6 rounded-3xl"><p className="text-xs font-black uppercase text-blue-600/50 mb-1">Orders</p><p className="text-3xl font-black text-blue-700">{selectedUserData.user?.orders?.length || 0}</p></div>
              </div>
              
              <h4 className="text-xl font-black mb-4 uppercase tracking-widest text-gray-400 text-xs">Admin Actions</h4>
              <div className="flex flex-wrap gap-4 mb-8">
                <button onClick={() => handleResetUserPassword(selectedUser.id, selectedUser.name, selectedUser.email)} className={btnOutline}><Key size={16}/> Push Reset Link</button>
                <button onClick={() => setShowUserOrderForm(!showUserOrderForm)} className={btnPrimary}><Package size={16}/> Drop Order</button>
                
                {/* User Active Toggle and Delete Buttons */}
                {selectedUser.id !== currentUser?.id && (
                  <>
                    <button onClick={() => handleToggleUserActive(selectedUser)} className={btnOutline + (selectedUser.is_active ? " !border-amber-500 !text-amber-600 hover:!bg-amber-50" : " !border-green-500 !text-green-600 hover:!bg-green-50")}>
                      <RefreshCw size={16}/> {selectedUser.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    <button onClick={() => handleDeleteUser(selectedUser)} className={btnOutline + " !border-red-500 !text-red-600 hover:!bg-red-50"}>
                      <Trash2 size={16}/> Delete Account
                    </button>
                  </>
                )}
              </div>

              {/* Order History */}
              <h4 className="text-xl font-black mb-4 uppercase tracking-widest text-gray-400 text-xs">Shipment History</h4>
              <div className="space-y-3 mb-8">
                {selectedUserData.user?.orders?.map(o => (
                  <div key={o.id} className="p-4 border-2 border-gray-100 rounded-2xl flex justify-between items-center">
                    <div><p className="font-black">{o.tracking_number}</p><p className="text-xs text-gray-500 font-bold">{o.market} • KES {o.estimated_cost}</p></div>
                    {statusBadge(o.status)}
                  </div>
                ))}
              </div>

              {/* Emails Sent */}
              <h4 className="text-xl font-black mb-4 uppercase tracking-widest text-gray-400 text-xs">Email Communications</h4>
              <div className="space-y-3">
                {emailLogs.length === 0 ? (
                  <p className="text-sm text-gray-400 font-bold">No email logs found</p>
                ) : (
                  emailLogs.map(log => (
                    <div key={log.id} className="p-4 border-2 border-gray-100 rounded-2xl flex justify-between items-center bg-slate-50">
                      <div>
                        <p className="font-black text-sm text-[#1e3a5f]">{log.subject}</p>
                        <p className="text-xs text-gray-500 font-bold mt-1">{log.email_type?.replace(/_/g, ' ')} • {new Date(log.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${log.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {log.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Small Modals */}
        {paymentModal && (
          <div className="fixed inset-0 bg-[#1e3a5f]/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-10 relative">
              <button onClick={() => setPaymentModal(null)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-red-500"><X /></button>
              <h3 className="text-3xl font-black text-[#1e3a5f] tracking-tighter mb-8">Request Funds</h3>
              <div className="space-y-6">
                <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className={inputClass} placeholder="Amount (KES)" />
                <textarea value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} className={inputClass} placeholder="Notes to client" rows={2} />
                <button onClick={handleRequestPayment} className={btnPrimary + " w-full !py-5 text-lg"}>Dispatch Invoice</button>
              </div>
            </div>
          </div>
        )}

        {reminderModal && (
          <div className="fixed inset-0 bg-[#1e3a5f]/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-10 relative">
              <button onClick={() => setReminderModal(null)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-red-500"><X /></button>
              <h3 className="text-3xl font-black text-[#1e3a5f] tracking-tighter mb-8">Payment Reminder</h3>
              <div className="space-y-6">
                <input type="number" value={reminderAmount} onChange={(e) => setReminderAmount(e.target.value)} className={inputClass} placeholder="Amount (KES)" />
                <button onClick={handleSendReminder} className="bg-orange-500 text-white w-full py-5 rounded-[1.5rem] font-black text-lg shadow-xl hover:bg-orange-600 transition-all">Send Notice</button>
              </div>
            </div>
          </div>
        )}

        {cancelModal && (
          <div className="fixed inset-0 bg-[#1e3a5f]/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-10 relative">
              <button onClick={() => setCancelModal(null)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-red-500"><X /></button>
              <h3 className="text-3xl font-black text-red-600 tracking-tighter mb-8">Halt Shipment</h3>
              <div className="space-y-6">
                <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className={inputClass} placeholder="Reason for cancellation" rows={2} />
                <button onClick={handleCancelOrder} className="bg-red-600 text-white w-full py-5 rounded-[1.5rem] font-black text-lg shadow-xl hover:bg-red-700 transition-all">Terminate Order</button>
              </div>
            </div>
          </div>
        )}
        
        {showCreateUserForm && (
          <div className="fixed inset-0 bg-[#1e3a5f]/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-10 relative">
              <button onClick={() => setShowCreateUserForm(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-red-500"><X /></button>
              <h3 className="text-3xl font-black text-[#1e3a5f] tracking-tighter mb-8">New Account</h3>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <input placeholder="Full Name" className={inputClass} value={createUserForm.name} onChange={e => setCreateUserForm({...createUserForm, name: e.target.value})} required />
                <input type="email" placeholder="Email Address" className={inputClass} value={createUserForm.email} onChange={e => setCreateUserForm({...createUserForm, email: e.target.value})} required />
                <input placeholder="Phone (+254...)" className={inputClass} value={createUserForm.phone} onChange={e => setCreateUserForm({...createUserForm, phone: e.target.value})} required />
                
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2 mb-1 block">Account Role</label>
                  <select className={inputClass} value={createUserForm.role} onChange={e => setCreateUserForm({...createUserForm, role: e.target.value})}>
                    <option value="customer">Customer</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                
                <button type="submit" disabled={creatingUser} className="bg-[#1e3a5f] text-white w-full py-5 rounded-[1.5rem] font-black text-lg mt-4">{creatingUser ? 'Provisioning...' : 'Create Account'}</button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

const Badge = ({ children, color = 'slate' }) => {
  const colors = {
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    blue: 'bg-blue-100 text-blue-800',
    amber: 'bg-amber-100 text-amber-800',
    slate: 'bg-gray-100 text-gray-800'
  }
  return <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border border-white ${colors[color]}`}>{children}</span>
}
