import React, { useState, useEffect } from 'react'
import {
  Users, Package, DollarSign, BarChart3, MessageSquare, Activity,
  Lock, RefreshCw, Trash2, XCircle, Plus, CreditCard, Search,
  UserPlus, Bell, Mail, Eye, ArrowLeft, Key, Send, AlertTriangle,
  ChevronLeft, ChevronRight, Filter, ChevronDown, Sparkles, Globe, Zap, ShoppingBag
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { adminApi, authApi, supportApi } from '../api'
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import toast from 'react-hot-toast'

/** ─── LIQUID GLASS COMPONENTS ─── **/
const LiquidBlob = ({ className, color }) => (
  <div className={`absolute blur-[120px] rounded-full mix-blend-multiply opacity-50 animate-morph ${className} ${color} -z-10`} />
);

const GlassCard = ({ children, className = "" }) => (
  <div className={`relative overflow-hidden rounded-[2rem] bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.05)] ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />
    {children}
  </div>
);

export const AdminDashboard = () => {
  const { t } = useLanguage()
  const { user } = useAuth()
  
  // ─── STATE ───
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
  const [expandedAdminOrderCost, setExpandedAdminOrderCost] = useState(null)
  const [showCreateOrderForm, setShowCreateOrderForm] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [createOrderForm, setCreateOrderForm] = useState({
    retailer: '', market: 'UK', description: '',
    weight_kg: '', dimensions: { length: '', width: '', height: '' },
    shipping_speed: 'economy', insurance: false, declared_value: '', electronics_item: '',
  })
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
  const [shippingRates, setShippingRates] = useState({ UK: '', USA: '', China: '' })
  const [savingShippingRates, setSavingShippingRates] = useState(false)
  const [shippingRatesLastUpdated, setShippingRatesLastUpdated] = useState(null)
  const [showCreateUserForm, setShowCreateUserForm] = useState(false)
  const [createUserForm, setCreateUserForm] = useState({ name: '', email: '', phone: '', role: 'customer' })
  const [creatingUser, setCreatingUser] = useState(false)
  const [reminderModal, setReminderModal] = useState(null)
  const [reminderAmount, setReminderAmount] = useState('')
  const [reminderNotes, setReminderNotes] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedUserData, setSelectedUserData] = useState(null)
  const [loadingUser, setLoadingUser] = useState(false)
  const [showUserOrderForm, setShowUserOrderForm] = useState(false)
  const [userOrderForm, setUserOrderForm] = useState({
    retailer: '', market: 'UK', description: '', weight_kg: '', shipping_speed: 'economy',
    dimensions: { length: '', width: '', height: '' }, insurance: false, declared_value: '', electronics_item: '',
  })
  const [creatingUserOrder, setCreatingUserOrder] = useState(false)
  const [pendingPayments, setPendingPayments] = useState([])
  const [approvingPayment, setApprovingPayment] = useState(null)
  const [expandedProof, setExpandedProof] = useState(null)
  const [emailLogs, setEmailLogs] = useState([])
  const [errorLogs, setErrorLogs] = useState([])
  const [errorLogStats, setErrorLogStats] = useState(null)
  const [errorLogPage, setErrorLogPage] = useState(1)
  const [errorLogTotal, setErrorLogTotal] = useState(0)
  const [errorLogTotalPages, setErrorLogTotalPages] = useState(0)
  const [errorLogFilter, setErrorLogFilter] = useState({ level: '', source: '', search: '' })
  const [loadingErrorLogs, setLoadingErrorLogs] = useState(false)
  const [expandedError, setExpandedError] = useState(null)

  useEffect(() => { fetchData() }, [])

  // ─── LOGIC HANDLERS (Identical to original) ───
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
      if (results[3].status === 'fulfilled' && results[3].value.data?.rates) {
        const ratesData = results[3].value.data
        setExchangeRates({
          USD_KES: ratesData.rates.USD_KES || '', GBP_KES: ratesData.rates.GBP_KES || '',
          EUR_KES: ratesData.rates.EUR_KES || '', CNY_KES: ratesData.rates.CNY_KES || '',
        })
        setRatesLastUpdated(ratesData.updated_at || null)
      }
      if (results[4].status === 'fulfilled') setPendingPayments(results[4].value.data?.transactions || [])
      if (results[5].status === 'fulfilled') setTickets(results[5].value.data?.tickets || [])
      if (results[6].status === 'fulfilled' && results[6].value.data?.rates) {
        const srData = results[6].value.data
        setShippingRates({ UK: srData.rates.UK || '', USA: srData.rates.USA || '', China: srData.rates.China || '' })
        setShippingRatesLastUpdated(srData.updated_at || null)
      }
      try {
        const statsRes = await adminApi.getErrorLogStats()
        if (statsRes.data?.stats) setErrorLogStats(statsRes.data.stats)
      } catch (_) { }
    } catch (err) {
      toast.error('Failed to load admin data')
    } finally {
      setLoading(false)
    }
  }

  // RESTORED: Error logs fetcher
  const fetchErrorLogs = async (page = 1, filters = errorLogFilter) => {
    try {
      setLoadingErrorLogs(true)
      const params = { page, limit: 25, ...filters }
      const res = await adminApi.getErrorLogs(params)
      if (res.data?.error_logs) {
        setErrorLogs(res.data.error_logs)
        setErrorLogPage(res.data.pagination.page)
        setErrorLogTotal(res.data.pagination.total)
        setErrorLogTotalPages(res.data.pagination.totalPages)
      }
    } catch (err) { toast.error('Failed to load error logs') } finally { setLoadingErrorLogs(false) }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    const { currentPassword, newPassword, confirmPassword } = passwordForm
    if (newPassword !== confirmPassword) { toast.error('New passwords do not match'); return }
    try {
      setChangingPassword(true)
      await authApi.changePassword(currentPassword, newPassword)
      toast.success('Password changed successfully')
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) { toast.error(err.message || 'Failed to change password') } finally { setChangingPassword(false) }
  }

  const handleSaveRates = async (e) => {
    e.preventDefault()
    try {
      setSavingRates(true)
      const rates = {}
      for (const [pair, val] of Object.entries(exchangeRates)) {
        rates[pair] = parseFloat(val)
      }
      await adminApi.setExchangeRates(rates)
      toast.success('Exchange rates updated successfully')
      setRatesLastUpdated(new Date().toISOString())
    } catch (err) { toast.error('Failed to update rates') } finally { setSavingRates(false) }
  }

  const handleSaveShippingRates = async (e) => {
    e.preventDefault()
    try {
      setSavingShippingRates(true)
      const rates = {}
      for (const [market, val] of Object.entries(shippingRates)) {
        rates[market] = parseFloat(val)
      }
      await adminApi.setShippingRates(rates)
      toast.success('Shipping rates updated successfully')
      setShippingRatesLastUpdated(new Date().toISOString())
    } catch (err) { toast.error('Failed to update shipping rates') } finally { setSavingShippingRates(false) }
  }

  const handleToggleOrderSelection = (id) => {
    setSelectedOrders(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const handleBulkUpdateOrders = async () => {
    if (!newStatus) return
    try {
      await adminApi.bulkUpdateOrders(selectedOrders, newStatus)
      toast.success('Orders updated successfully')
      setSelectedOrders([])
      fetchData()
    } catch (err) { toast.error('Failed to update orders') }
  }

  const handleDeleteOrder = async (id, track) => {
    if (!window.confirm(`Permanently delete order ${track}?`)) return
    try {
      await adminApi.deleteOrder(id)
      toast.success('Order deleted')
      setOrders(prev => prev.filter(o => o.id !== id))
    } catch (err) { toast.error('Failed to delete order') }
  }

  const handleCancelOrder = async () => {
    try {
      await adminApi.cancelOrder(cancelModal.orderId, cancelReason)
      toast.success('Order cancelled')
      setOrders(prev => prev.map(o => o.id === cancelModal.orderId ? { ...o, status: 'cancelled' } : o))
      setCancelModal(null)
    } catch (err) { toast.error('Failed to cancel order') }
  }

  const handleRequestPayment = async () => {
    try {
      await adminApi.requestPayment(paymentModal.orderId, parseFloat(paymentAmount), paymentNotes)
      toast.success('Payment request sent')
      setPaymentModal(null)
    } catch (err) { toast.error('Failed to send request') }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    try {
      setCreatingUser(true)
      await adminApi.createUser(createUserForm)
      toast.success('Account created successfully')
      setShowCreateUserForm(false)
      fetchData()
    } catch (err) { toast.error('Failed to create account') } finally { setCreatingUser(false) }
  }

  const handleSendReminder = async () => {
    try {
      await adminApi.sendPaymentReminder(reminderModal.orderId, parseFloat(reminderAmount), reminderNotes)
      toast.success('Payment reminder sent')
      setReminderModal(null)
    } catch (err) { toast.error('Failed to send reminder') }
  }

  const handleSearchCustomers = async (query) => {
    setCustomerSearch(query)
    if (query.length < 2) return setCustomerResults([])
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
    } catch { toast.error('Failed to load ticket') }
  }

  const sendAdminReply = async (e) => {
    e.preventDefault()
    if (!adminReply.trim()) return
    try {
      setSendingReply(true)
      await supportApi.replyToTicket(selectedTicket.id, adminReply)
      const res = await supportApi.getTicket(selectedTicket.id)
      setTicketMessages(res.data.messages || [])
      setAdminReply('')
    } catch { toast.error('Failed to send reply') } finally { setSendingReply(false) }
  }

  const handleOpenUserDetail = async (u) => {
    setSelectedUser(u); setSelectedUserData(null); setEmailLogs([]); setLoadingUser(true)
    try {
      const [uRes, eRes] = await Promise.all([adminApi.getUser(u.id), adminApi.getUserEmails(u.id)])
      setSelectedUserData(uRes.data); setEmailLogs(eRes.data?.email_logs || [])
    } catch { toast.error('Failed to load user details') } finally { setLoadingUser(false) }
  }

  const handleApprovePayment = async (id) => {
    try {
      setApprovingPayment(id)
      await adminApi.approvePayment(id)
      toast.success('Payment approved'); setPendingPayments(prev => prev.filter(p => p.id !== id))
    } catch { toast.error('Failed to approve payment') } finally { setApprovingPayment(null) }
  }

  const handleRejectPayment = async (id) => {
    const reason = window.prompt('Reason for rejection (optional):')
    if (reason === null) return
    try {
      setApprovingPayment(id)
      await adminApi.rejectPayment(id, reason)
      toast.success('Payment rejected'); setPendingPayments(prev => prev.filter(p => p.id !== id))
    } catch { toast.error('Failed to reject payment') } finally { setApprovingPayment(null) }
  }

  const handleResetUserPassword = async (id, name, email) => {
    if (!window.confirm(`Send password reset email to ${name}?`)) return
    try { await adminApi.resetUserPassword(id); toast.success('Password reset email sent') } catch { toast.error('Failed to send reset') }
  }

  const handleCreateOrderForSelectedUser = async (e) => {
    e.preventDefault()
    try {
      setCreatingUserOrder(true)
      const { dimensions, ...rest } = userOrderForm
      await adminApi.createOrderForClient({
        customer_email: selectedUser.email,
        ...rest,
        weight_kg: parseFloat(rest.weight_kg) || 0,
        declared_value: parseFloat(rest.declared_value) || 0,
        dimensions: dimensions.length ? { length: parseFloat(dimensions.length), width: parseFloat(dimensions.width), height: parseFloat(dimensions.height) } : null
      })
      toast.success('Order created successfully'); setShowUserOrderForm(false); handleOpenUserDetail(selectedUser); fetchData()
    } catch { toast.error('Failed to create order') } finally { setCreatingUserOrder(false) }
  }

  const handleCreateOrderForClient = async (e) => {
    e.preventDefault()
    if (!selectedCustomer) return
    try {
      setCreatingOrder(true)
      const { dimensions, ...rest } = createOrderForm
      await adminApi.createOrderForClient({
        customer_email: selectedCustomer.email,
        ...rest,
        weight_kg: parseFloat(rest.weight_kg) || 0,
        declared_value: parseFloat(rest.declared_value) || 0,
        dimensions: dimensions.length ? { length: parseFloat(dimensions.length), width: parseFloat(dimensions.width), height: parseFloat(dimensions.height) } : null
      })
      toast.success('Order created successfully'); setShowCreateOrderForm(false); fetchData()
    } catch { toast.error('Failed to create order') } finally { setCreatingOrder(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f8fafc]">
        <div className="w-16 h-16 bg-orange-500 rounded-2xl animate-pulse shadow-2xl shadow-orange-200" />
      </div>
    )
  }

  const COLORS = ['#f97316', '#0f172a', '#3b82f6', '#8b5cf6']
  const userStats = stats?.users || {}
  const orderStats = stats?.orders || {}
  const revenueStats = stats?.revenue || {}

  const getStatusBadge = (status) => {
    const cls = {
      delivered: 'bg-green-500/10 text-green-600',
      in_transit: 'bg-blue-500/10 text-blue-600',
      pending: 'bg-orange-500/10 text-orange-600',
      cancelled: 'bg-slate-500/10 text-slate-600',
    }
    return `px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${cls[status] || 'bg-purple-500/10 text-purple-600'}`
  }

  // Override labels for tabs that might have missing translations
  const getTabLabel = (tab) => {
    const labels = {
      overview: 'Overview',
      users: 'Users',
      orders: 'Orders',
      payments: 'Payments',
      revenue: 'Revenue',
      tickets: 'Tickets',
      exchange: 'Rates',
      shippingRates: 'Shipping',
      settings: 'Settings',
      errorLogs: 'Logs'
    }
    const translated = t(`admin.${tab}`);
    // If the translation key is returned (e.g. "admin.orders"), use our hardcoded label
    return (translated.includes('admin.') || !translated) ? labels[tab] : translated;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-x-hidden relative pb-20">
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
        .animate-morph { animation: morph 15s ease-in-out infinite; }
        .glass-sheen { position: relative; overflow: hidden; }
        .glass-sheen::after {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 50%; height: 100%;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.3), transparent);
          animation: sheen 4s infinite;
        }
      `}</style>

      {/* BACKGROUND ELEMENTS */}
      <LiquidBlob className="top-[-10%] left-[-5%] w-[600px] h-[600px]" color="bg-orange-200" />
      <LiquidBlob className="bottom-[5%] right-[-5%] w-[500px] h-[500px]" color="bg-blue-200" />
      <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] -z-10" />

      <div className="max-w-7xl mx-auto px-6 py-12 relative z-10">
        {/* HEADER */}
        <div className="mb-12">
          <div className="inline-flex items-center space-x-3 px-4 py-1.5 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/50 shadow-sm mb-6">
            <Sparkles size={14} className="text-orange-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">Admin Control Center</span>
          </div>
          <h1 className="text-5xl lg:text-6xl font-black tracking-tighter text-[#0f172a] uppercase leading-none">
            {t('admin.title').includes('admin.') ? 'Admin Dashboard' : t('admin.title')}
          </h1>
        </div>

        {/* NAVIGATION TABS (FIXED SHRINKING) */}
        <div className="flex gap-3 mb-12 overflow-x-auto pb-4 no-scrollbar">
          {['overview', 'users', 'orders', 'payments', 'revenue', 'tickets', 'exchange', 'shippingRates', 'settings', 'errorLogs'].map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); if (tab === 'errorLogs') fetchErrorLogs(1, errorLogFilter); }}
              className={`px-6 py-3 min-w-[110px] rounded-2xl font-black text-xs uppercase tracking-widest transition-all whitespace-nowrap shadow-sm border ${
                activeTab === tab 
                  ? 'bg-[#0f172a] text-white border-slate-900' 
                  : 'bg-white/60 backdrop-blur-xl text-slate-600 border-white/50 hover:bg-white'
              }`}
            >
              {getTabLabel(tab)}
              {tab === 'errorLogs' && errorLogStats && parseInt(errorLogStats.last_24h) > 0 && (
                <span className="ml-2 bg-orange-500 text-white px-1.5 py-0.5 rounded-md text-[8px]">
                  {errorLogStats.last_24h}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ═══ TAB CONTENT (RESTORED FULL JSX) ═══ */}
        
        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <GlassCard className="p-8 group">
                <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center text-white mb-6 group-hover:rotate-6 transition-transform">
                  <Users size={24} />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Total Users</p>
                <h3 className="text-4xl font-black text-[#0f172a] tracking-tighter">{userStats.total || 0}</h3>
                <p className="text-[10px] text-slate-400 mt-2">{userStats.customers || 0} clients, {userStats.admins || 0} staff</p>
              </GlassCard>

              <GlassCard className="p-8 group">
                <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center text-white mb-6 group-hover:rotate-6 transition-transform">
                  <Package size={24} />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Active Orders</p>
                <h3 className="text-4xl font-black text-[#0f172a] tracking-tighter">{orderStats.total_orders || 0}</h3>
                <p className="text-[10px] text-slate-400 mt-2">{orderStats.pending || 0} pending, {orderStats.in_transit || 0} transit</p>
              </GlassCard>

              <GlassCard className="p-8 group">
                <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center text-white mb-6 group-hover:rotate-6 transition-transform">
                  <Activity size={24} />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Delivered</p>
                <h3 className="text-4xl font-black text-[#0f172a] tracking-tighter">{orderStats.delivered || 0}</h3>
              </GlassCard>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-1 bg-gradient-to-br from-orange-400 to-orange-600 rounded-[2.2rem] shadow-xl">
                 <div className="bg-white/95 backdrop-blur-xl rounded-[2.1rem] p-8 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Total Revenue</p>
                      <h3 className="text-4xl font-black text-orange-600 tracking-tighter">KES {(revenueStats.total_revenue || 0).toLocaleString()}</h3>
                      <p className="text-[10px] text-slate-400 mt-1">{revenueStats.total_transactions || 0} transactions</p>
                    </div>
                 </div>
              </div>
              <GlassCard className="p-8 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Estimated Value</p>
                  <h3 className="text-4xl font-black text-blue-600 tracking-tighter">KES {(orderStats.total_estimated_value || 0).toLocaleString()}</h3>
                </div>
              </GlassCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <GlassCard className="p-8">
                <h2 className="text-xl font-black text-[#0f172a] mb-8 uppercase tracking-tighter">Orders by Status</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={stats?.order_statuses?.map(s => ({ name: s.status, value: parseInt(s.count) })) || []} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                      {stats?.order_statuses?.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </GlassCard>
              <GlassCard className="p-8">
                <h2 className="text-xl font-black text-[#0f172a] mb-8 uppercase tracking-tighter">Revenue by Market</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={stats?.markets?.map(m => ({ name: m.market, value: parseFloat(m.value) })) || []} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                      {stats?.markets?.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => `KES ${v.toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              </GlassCard>
            </div>
          </div>
        )}

        {/* USERS */}
        {activeTab === 'users' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-black text-[#0f172a] uppercase tracking-tighter">User Management</h2>
              <button onClick={() => setShowCreateUserForm(!showCreateUserForm)} className="glass-sheen px-6 py-3 bg-[#0f172a] text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <UserPlus size={16} /> Create Account
              </button>
            </div>
            
            <GlassCard>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-900/5 border-b border-white/50">
                    <tr>
                      {['User', 'Warehouse ID', 'Role', 'Status', 'Balance', 'Actions'].map(h => (
                        <th key={h} className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/40">
                    {users.map(u => (
                      <tr key={u.id} className="hover:bg-white/40 group">
                        <td className="px-8 py-5">
                          <p className="font-black text-slate-900 text-sm">{u.name}</p>
                          <p className="text-xs text-slate-500 font-medium">{u.email}</p>
                        </td>
                        <td className="px-8 py-5 font-mono text-xs font-bold text-slate-600">{u.warehouse_id}</td>
                        <td className="px-8 py-5">
                          <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${u.role === 'admin' ? 'bg-orange-500 text-white' : 'bg-blue-500/10 text-blue-600'}`}>{u.role}</span>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-2">
                             <div className={`w-2 h-2 rounded-full ${u.is_active ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
                             <span className="text-xs font-bold text-slate-700">{u.is_active ? 'Active' : 'Offline'}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5 font-black text-slate-900 text-sm">KES {u.wallet_balance?.toLocaleString()}</td>
                        <td className="px-8 py-5">
                          <div className="flex gap-2">
                            <button onClick={() => handleOpenUserDetail(u)} className="p-2 bg-white rounded-lg shadow-sm text-slate-400 hover:text-blue-500 transition-colors"><Eye size={16}/></button>
                            <button onClick={() => handleResetUserPassword(u.id, u.name, u.email)} className="p-2 bg-white rounded-lg shadow-sm text-slate-400 hover:text-orange-500 transition-colors"><Key size={16}/></button>
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

        {/* ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
             <div className="flex items-center justify-between">
              <h2 className="text-3xl font-black text-[#0f172a] uppercase tracking-tighter">Shipment Logistics</h2>
              <button onClick={() => setShowCreateOrderForm(!showCreateOrderForm)} className="glass-sheen px-6 py-3 bg-orange-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <Plus size={16} /> Create Shipment
              </button>
            </div>

            <GlassCard>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-900/5 border-b border-white/50">
                    <tr>
                      <th className="px-6 py-5">
                        <input type="checkbox" className="rounded-md border-white/50 bg-white/50" onChange={(e) => {
                          if (e.target.checked) setSelectedOrders(orders.map(o => o.id))
                          else setSelectedOrders([])
                        }} />
                      </th>
                      {['Tracking', 'Customer', 'Status', 'Market', 'Cost', 'Actions'].map(h => (
                        <th key={h} className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/40">
                    {orders.map(o => (
                      <tr key={o.id} className={`hover:bg-white/40 transition-colors ${o.status === 'cancelled' ? 'opacity-40' : ''}`}>
                        <td className="px-6 py-5">
                           <input type="checkbox" checked={selectedOrders.includes(o.id)} onChange={() => handleToggleOrderSelection(o.id)} className="rounded-md" />
                        </td>
                        <td className="px-6 py-5 font-mono text-xs font-black text-slate-900">{o.tracking_number}</td>
                        <td className="px-6 py-5">
                          <p className="text-sm font-bold text-slate-900">{o.name || 'Anonymous'}</p>
                          <p className="text-[10px] text-slate-500 uppercase">{o.retailer}</p>
                        </td>
                        <td className="px-6 py-5"><span className={getStatusBadge(o.status)}>{o.status?.replace('_', ' ')}</span></td>
                        <td className="px-6 py-5 font-black text-slate-900">{o.market}</td>
                        <td className="px-6 py-5 font-black text-slate-900 text-sm">KES {o.estimated_cost?.toLocaleString()}</td>
                        <td className="px-6 py-5">
                          <div className="flex gap-2">
                             <button onClick={() => { setPaymentModal({ orderId: o.id, trackingNumber: o.tracking_number }); setPaymentAmount(String(o.estimated_cost)) }} className="p-2 bg-white rounded-lg shadow-sm text-green-600 hover:scale-110 transition-transform"><CreditCard size={16}/></button>
                             <button onClick={() => handleDeleteOrder(o.id, o.tracking_number)} className="p-2 bg-white rounded-lg shadow-sm text-red-400 hover:scale-110 transition-transform"><Trash2 size={16}/></button>
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

        {/* PAYMENTS */}
        {activeTab === 'payments' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-3xl font-black text-[#0f172a] uppercase tracking-tighter">Pending M-Pesa Verification</h2>
            <GlassCard>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-900/5 border-b border-white/50">
                    <tr>
                      {['Customer', 'Amount', 'Reference', 'Proof', 'Actions'].map(h => (
                        <th key={h} className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/40">
                    {pendingPayments.map((p) => (
                      <React.Fragment key={p.id}>
                        <tr className="hover:bg-white/40">
                          <td className="px-8 py-5">
                             <p className="font-bold text-slate-900 text-sm">{p.name}</p>
                             <p className="text-xs text-slate-500 font-medium">{p.email}</p>
                          </td>
                          <td className="px-8 py-5 font-black text-slate-900">KES {p.amount?.toLocaleString()}</td>
                          <td className="px-8 py-5 font-mono text-xs font-bold text-slate-600">{p.payment_reference}</td>
                          <td className="px-8 py-5">
                            <button onClick={() => setExpandedProof(expandedProof === p.id ? null : p.id)} className="text-[10px] font-black text-blue-500 uppercase">View Details</button>
                          </td>
                          <td className="px-8 py-5 flex gap-2">
                            <button onClick={() => handleApprovePayment(p.id)} className="px-3 py-1 bg-green-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest">Approve</button>
                            <button onClick={() => handleRejectPayment(p.id)} className="px-3 py-1 bg-red-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest">Reject</button>
                          </td>
                        </tr>
                        {expandedProof === p.id && (
                          <tr className="bg-slate-900/5">
                            <td colSpan={5} className="px-8 py-4">
                              <pre className="text-xs text-slate-600 bg-white/40 p-4 rounded-xl border border-white/50 whitespace-pre-wrap font-mono">
                                {p.mpesa_message || 'No receipt details provided.'}
                              </pre>
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

        {/* EXCHANGE RATES */}
        {activeTab === 'exchange' && (
          <div className="max-w-xl animate-in fade-in slide-in-from-bottom-4">
            <GlassCard className="p-10">
               <div className="flex items-center gap-4 mb-10">
                  <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl"><RefreshCw size={28}/></div>
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter">Market Exchange</h2>
                    <p className="text-xs font-bold text-slate-400">Live platform conversion rates</p>
                  </div>
               </div>
               <form onSubmit={handleSaveRates} className="space-y-6">
                  {Object.keys(exchangeRates).map(pair => (
                    <div key={pair} className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{pair.replace('_', ' to ')}</label>
                      <div className="flex items-center gap-4 bg-white/50 rounded-2xl p-4 border border-white/50">
                        <span className="font-black text-orange-500">1.00</span>
                        <input type="number" step="0.01" value={exchangeRates[pair]} onChange={e => setExchangeRates({...exchangeRates, [pair]: e.target.value})} className="flex-1 bg-transparent border-none outline-none font-black text-lg text-slate-900" />
                        <span className="text-xs font-black text-slate-400">KES</span>
                      </div>
                    </div>
                  ))}
                  <button type="submit" className="w-full glass-sheen py-5 bg-[#0f172a] text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl">
                    {savingRates ? 'Updating...' : 'Update All Rates'}
                  </button>
               </form>
            </GlassCard>
          </div>
        )}
        
        {/* SETTINGS / EMAIL TEST */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in">
             <GlassCard className="p-10">
                <h3 className="text-xl font-black uppercase tracking-tighter mb-8 flex items-center gap-2"><Lock size={20}/> Security</h3>
                <form onSubmit={handlePasswordChange} className="space-y-6">
                   <input type="password" placeholder="Current Password" value={passwordForm.currentPassword} onChange={e => setPasswordForm({...passwordForm, currentPassword: e.target.value})} className="w-full px-5 py-4 rounded-xl bg-white/50 border border-white/50 outline-none" />
                   <input type="password" placeholder="New Password" value={passwordForm.newPassword} onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})} className="w-full px-5 py-4 rounded-xl bg-white/50 border border-white/50 outline-none" />
                   <input type="password" placeholder="Confirm" value={passwordForm.confirmPassword} onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})} className="w-full px-5 py-4 rounded-xl bg-white/50 border border-white/50 outline-none" />
                   <button className="w-full glass-sheen py-4 bg-orange-500 text-white rounded-xl font-black uppercase text-xs tracking-widest">Update Password</button>
                </form>
             </GlassCard>
             <GlassCard className="p-10">
                <h3 className="text-xl font-black uppercase tracking-tighter mb-4 flex items-center gap-2"><Mail size={20}/> Email System</h3>
                <p className="text-xs text-slate-500 mb-8 font-medium">Verify your Gmail API integration.</p>
                <button onClick={async () => {
                   try { await adminApi.testEmail(user?.email); toast.success('Test email sent!') } catch { toast.error('Test failed') }
                }} className="w-full py-4 bg-slate-900 text-white rounded-xl font-black uppercase text-xs tracking-widest">Run Diagnostic Test</button>
             </GlassCard>
          </div>
        )}

      </div>

      {/* ─── MODALS & USER SLIDE-OVER ─── */}
      {selectedUser && (
        <div className="fixed inset-0 z-[60] flex justify-end" onClick={() => setSelectedUser(null)}>
           <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" />
           <div className="relative w-full max-w-2xl bg-white/80 backdrop-blur-3xl h-full shadow-2xl border-l border-white/50 overflow-y-auto animate-in slide-in-from-right duration-500" onClick={e => e.stopPropagation()}>
              <div className="p-10">
                 <button onClick={() => setSelectedUser(null)} className="mb-10 p-3 bg-white rounded-xl shadow-sm text-slate-400 hover:text-slate-900 transition-colors"><ArrowLeft size={20}/></button>
                 <div className="flex items-center gap-6 mb-12">
                    <div className="w-20 h-20 bg-gradient-to-br from-orange-400 to-orange-600 rounded-3xl flex items-center justify-center text-white text-3xl font-black">
                      {selectedUser.name?.[0]}
                    </div>
                    <div>
                       <h2 className="text-4xl font-black tracking-tighter uppercase text-slate-900">{selectedUser.name}</h2>
                       <p className="text-sm font-bold text-slate-400">{selectedUser.email}</p>
                    </div>
                 </div>
                 
                 {loadingUser ? (
                   <div className="py-20 flex justify-center"><RefreshCw className="animate-spin text-orange-500" /></div>
                 ) : selectedUserData && (
                   <div className="space-y-10">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                         <GlassCard className="p-6 bg-white/40">
                            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Wallet</p>
                            <p className="text-xl font-black text-green-600">KES {selectedUserData.user?.wallet_balance?.toLocaleString()}</p>
                         </GlassCard>
                         <GlassCard className="p-6 bg-white/40">
                            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Invites</p>
                            <p className="text-xl font-black text-slate-900">{selectedUserData.referralStats?.total_referrals || 0}</p>
                         </GlassCard>
                         <GlassCard className="p-6 bg-white/40">
                            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">ID</p>
                            <p className="text-xs font-black text-slate-600">{selectedUser.warehouse_id}</p>
                         </GlassCard>
                      </div>

                      <div className="space-y-6">
                         <h3 className="text-sm font-black uppercase tracking-tighter">Recent Shipments</h3>
                         {selectedUserData.user?.orders?.map(o => (
                            <div key={o.id} className="flex items-center justify-between p-4 bg-white/40 border border-white/50 rounded-2xl">
                               <div className="font-mono text-xs font-bold text-slate-900">{o.tracking_number}</div>
                               <div className={getStatusBadge(o.status)}>{o.status}</div>
                            </div>
                         ))}
                      </div>

                      <div className="space-y-6">
                         <h3 className="text-sm font-black uppercase tracking-tighter">System Logs</h3>
                         <div className="space-y-2">
                           {emailLogs.map(log => (
                             <div key={log.id} className="text-[10px] flex justify-between p-3 bg-white/20 rounded-xl">
                               <span className="font-bold text-slate-600 truncate max-w-[150px]">{log.subject}</span>
                               <span className="text-slate-400 font-mono">{new Date(log.created_at).toLocaleDateString()}</span>
                             </div>
                           ))}
                         </div>
                      </div>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* MODALS */}
      {paymentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
           <GlassCard className="max-w-md w-full p-10 bg-white/90">
              <h3 className="text-2xl font-black uppercase tracking-tighter mb-2">Request Payment</h3>
              <p className="text-xs font-bold text-slate-500 mb-8">Order: {paymentModal.trackingNumber}</p>
              <div className="space-y-6">
                <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-white border border-slate-200 outline-none font-black text-lg" placeholder="Amount (KES)" />
                <button onClick={handleRequestPayment} className="w-full glass-sheen py-5 bg-orange-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl">Send Request</button>
                <button onClick={() => setPaymentModal(null)} className="w-full py-2 text-slate-400 font-black text-xs uppercase">Cancel</button>
              </div>
           </GlassCard>
        </div>
      )}
      
    </div>
  )
}

export default AdminDashboard;
