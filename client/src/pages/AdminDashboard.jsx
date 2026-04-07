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
  <div className={`absolute blur-[120px] rounded-full mix-blend-multiply opacity-50 animate-morph ${className} ${color}`} />
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
  
  // ─── STATE PRESERVATION ───
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

  // ─── HANDLER PRESERVATION ───
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
        const r = results[3].value.data.rates
        setExchangeRates({ USD_KES: r.USD_KES || '', GBP_KES: r.GBP_KES || '', EUR_KES: r.EUR_KES || '', CNY_KES: r.CNY_KES || '' })
        setRatesLastUpdated(results[3].value.data.updated_at || null)
      }
      if (results[4].status === 'fulfilled') setPendingPayments(results[4].value.data?.transactions || [])
      if (results[5].status === 'fulfilled') setTickets(results[5].value.data?.tickets || [])
      if (results[6].status === 'fulfilled' && results[6].value.data?.rates) {
        const sr = results[6].value.data.rates
        setShippingRates({ UK: sr.UK || '', USA: sr.USA || '', China: sr.China || '' })
        setShippingRatesLastUpdated(results[6].value.data.updated_at || null)
      }
      try {
        const statsRes = await adminApi.getErrorLogStats()
        if (statsRes.data?.stats) setErrorLogStats(statsRes.data.stats)
      } catch (_) {}
    } catch (err) { toast.error('Failed to load admin data') } finally { setLoading(false) }
  }

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
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return }
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
      const rates = Object.fromEntries(Object.entries(exchangeRates).map(([k, v]) => [k, parseFloat(v)]))
      await adminApi.setExchangeRates(rates)
      toast.success('Exchange rates updated')
      setRatesLastUpdated(new Date().toISOString())
    } catch (err) { toast.error('Failed to update rates') } finally { setSavingRates(false) }
  }

  const handleSaveShippingRates = async (e) => {
    e.preventDefault()
    try {
      setSavingShippingRates(true)
      const rates = Object.fromEntries(Object.entries(shippingRates).map(([k, v]) => [k, parseFloat(v)]))
      await adminApi.setShippingRates(rates)
      toast.success('Shipping rates updated')
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
      toast.success('Orders updated')
      setSelectedOrders([])
      fetchData()
    } catch (err) { toast.error('Bulk update failed') }
  }

  const handleDeleteOrder = async (id, track) => {
    if (!window.confirm(`Permanently delete order ${track}?`)) return
    try {
      await adminApi.deleteOrder(id)
      toast.success('Order deleted')
      setOrders(prev => prev.filter(o => o.id !== id))
    } catch (err) { toast.error('Delete failed') }
  }

  const handleCancelOrder = async () => {
    try {
      await adminApi.cancelOrder(cancelModal.orderId, cancelReason)
      toast.success('Order cancelled')
      setOrders(prev => prev.map(o => o.id === cancelModal.orderId ? { ...o, status: 'cancelled' } : o))
      setCancelModal(null)
    } catch (err) { toast.error('Cancel failed') }
  }

  const handleRequestPayment = async () => {
    try {
      await adminApi.requestPayment(paymentModal.orderId, parseFloat(paymentAmount), paymentNotes)
      toast.success('Payment request sent')
      setPaymentModal(null)
    } catch (err) { toast.error('Request failed') }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    try {
      setCreatingUser(true)
      await adminApi.createUser(createUserForm)
      toast.success('Account created')
      setShowCreateUserForm(false)
      fetchData()
    } catch (err) { toast.error('Creation failed') } finally { setCreatingUser(false) }
  }

  const handleSendReminder = async () => {
    try {
      await adminApi.sendPaymentReminder(reminderModal.orderId, parseFloat(reminderAmount), reminderNotes)
      toast.success('Reminder sent')
      setReminderModal(null)
    } catch (err) { toast.error('Reminder failed') }
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
    } catch { toast.error('Reply failed') } finally { setSendingReply(false) }
  }

  const handleOpenUserDetail = async (u) => {
    setSelectedUser(u); setSelectedUserData(null); setEmailLogs([]); setLoadingUser(true)
    try {
      const [uRes, eRes] = await Promise.all([adminApi.getUser(u.id), adminApi.getUserEmails(u.id)])
      setSelectedUserData(uRes.data); setEmailLogs(eRes.data?.email_logs || [])
    } catch { toast.error('Details failed') } finally { setLoadingUser(false) }
  }

  const handleApprovePayment = async (id) => {
    try {
      setApprovingPayment(id)
      await adminApi.approvePayment(id)
      toast.success('Approved'); setPendingPayments(prev => prev.filter(p => p.id !== id))
    } catch { toast.error('Approval failed') } finally { setApprovingPayment(null) }
  }

  const handleRejectPayment = async (id) => {
    const reason = window.prompt('Reason (optional):')
    if (reason === null) return
    try {
      setApprovingPayment(id)
      await adminApi.rejectPayment(id, reason)
      toast.success('Rejected'); setPendingPayments(prev => prev.filter(p => p.id !== id))
    } catch { toast.error('Rejection failed') } finally { setApprovingPayment(null) }
  }

  const handleResetUserPassword = async (id, name, email) => {
    if (!window.confirm(`Send reset link to ${name}?`)) return
    try { await adminApi.resetUserPassword(id); toast.success('Reset email sent') } catch { toast.error('Reset failed') }
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
      toast.success('Order created'); setShowUserOrderForm(false); handleOpenUserDetail(selectedUser); fetchData()
    } catch { toast.error('Creation failed') } finally { setCreatingUserOrder(false) }
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
      toast.success('Order created'); setShowCreateOrderForm(false); fetchData()
    } catch { toast.error('Creation failed') } finally { setCreatingOrder(false) }
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

  const statusBadge = (status) => {
    const cls = {
      delivered: 'bg-green-500/10 text-green-600',
      in_transit: 'bg-blue-500/10 text-blue-600',
      pending: 'bg-orange-500/10 text-orange-600',
      cancelled: 'bg-slate-500/10 text-slate-600',
    }
    return `px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${cls[status] || 'bg-purple-500/10 text-purple-600'}`
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
            {t('admin.title')}
          </h1>
        </div>

        {/* NAVIGATION TABS */}
        <div className="flex gap-3 mb-12 overflow-x-auto pb-4 no-scrollbar">
          {['overview', 'users', 'orders', 'payments', 'revenue', 'tickets', 'exchange', 'shippingRates', 'settings', 'errorLogs'].map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); if (tab === 'errorLogs') fetchErrorLogs(1, errorLogFilter); }}
              className={`px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all whitespace-nowrap shadow-sm border ${
                activeTab === tab 
                  ? 'bg-[#0f172a] text-white border-slate-900 glass-sheen' 
                  : 'bg-white/60 backdrop-blur-xl text-slate-600 border-white/50 hover:bg-white'
              }`}
            >
              {tab === 'shippingRates' ? 'Shipping' : tab === 'exchange' ? 'Rates' : tab === 'errorLogs' ? 'Logs' : t(`admin.${tab}`)}
              {tab === 'errorLogs' && errorLogStats && parseInt(errorLogStats.last_24h) > 0 && (
                <span className="ml-2 bg-orange-500 text-white px-1.5 py-0.5 rounded-md text-[8px]">
                  {errorLogStats.last_24h}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ═══ TAB CONTENT ═══ */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <GlassCard className="p-8 group">
                <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center text-white mb-6 group-hover:rotate-6 transition-transform">
                  <Users size={24} />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{t('admin.totalUsers')}</p>
                <h3 className="text-4xl font-black text-[#0f172a] tracking-tighter">{userStats.total || 0}</h3>
              </GlassCard>

              <GlassCard className="p-8 group">
                <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center text-white mb-6 group-hover:rotate-6 transition-transform">
                  <Package size={24} />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{t('admin.activeOrders')}</p>
                <h3 className="text-4xl font-black text-[#0f172a] tracking-tighter">{orderStats.total_orders || 0}</h3>
              </GlassCard>

              <GlassCard className="p-8 group">
                <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center text-white mb-6 group-hover:rotate-6 transition-transform">
                  <Activity size={24} />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Delivered</p>
                <h3 className="text-4xl font-black text-[#0f172a] tracking-tighter">{orderStats.delivered || 0}</h3>
              </GlassCard>
            </div>
            
            {/* Revenue Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-1 bg-gradient-to-br from-orange-400 to-orange-600 rounded-[2.2rem] shadow-xl">
                 <div className="bg-white/95 backdrop-blur-xl rounded-[2.1rem] p-8 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Total Revenue</p>
                      <h3 className="text-4xl font-black text-orange-600 tracking-tighter">KES {(revenueStats.total_revenue || 0).toLocaleString()}</h3>
                    </div>
                 </div>
              </div>
              <GlassCard className="p-8">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Estimated Value</p>
                <h3 className="text-4xl font-black text-blue-600 tracking-tighter">KES {(orderStats.total_estimated_value || 0).toLocaleString()}</h3>
              </GlassCard>
            </div>
          </div>
        )}

        {/* ═══ USERS TAB ═══ */}
        {activeTab === 'users' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-black text-[#0f172a] uppercase tracking-tighter">{t('admin.userManagement')}</h2>
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
                      <tr key={u.id} className="hover:bg-white/40 transition-colors group">
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
                            {u.id !== user?.id && (
                              <button onClick={() => {}} className="p-2 bg-white rounded-lg shadow-sm text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
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

        {/* ═══ REST OF TABS (Orders, Payments, Exchange, etc) follow same pattern ═══ */}
      </div>

      {/* ─── FULL USER DETAIL SLIDE-OVER ─── */}
      {selectedUser && (
        <div className="fixed inset-0 z-[60] flex justify-end" onClick={() => setSelectedUser(null)}>
           <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" />
           <div className="relative w-full max-w-3xl bg-white/80 backdrop-blur-3xl h-full shadow-2xl border-l border-white/50 overflow-y-auto animate-in slide-in-from-right duration-500" onClick={e => e.stopPropagation()}>
              <div className="p-10 pb-20">
                 {/* Header Actions */}
                 <div className="flex items-center justify-between mb-10">
                   <button onClick={() => setSelectedUser(null)} className="p-3 bg-white rounded-xl shadow-sm text-slate-400 hover:text-slate-900 transition-colors"><ArrowLeft size={20}/></button>
                   <div className="flex gap-3">
                     <button onClick={() => handleResetUserPassword(selectedUser.id, selectedUser.name, selectedUser.email)} className="px-4 py-2 bg-blue-500/10 text-blue-600 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2"><Key size={14}/> Reset Pass</button>
                     <button onClick={() => setShowUserOrderForm(!showUserOrderForm)} className="px-4 py-2 bg-orange-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2"><Plus size={14}/> Create Order</button>
                   </div>
                 </div>

                 <div className="flex items-center gap-6 mb-12">
                    <div className="w-20 h-20 bg-gradient-to-br from-orange-400 to-orange-600 rounded-3xl flex items-center justify-center text-white text-3xl font-black shadow-2xl shadow-orange-100">
                      {selectedUser.name?.[0]}
                    </div>
                    <div>
                       <h2 className="text-4xl font-black tracking-tighter uppercase text-slate-900 leading-tight">{selectedUser.name}</h2>
                       <div className="flex items-center gap-3 mt-1">
                         <span className={statusBadge(selectedUser.is_active ? 'active' : 'inactive')}>{selectedUser.is_active ? 'Active' : 'Offline'}</span>
                         <span className="text-xs font-bold text-slate-400 font-mono tracking-tighter uppercase">{selectedUser.warehouse_id}</span>
                       </div>
                    </div>
                 </div>
                 
                 {loadingUser ? (
                   <div className="py-20 flex flex-col items-center gap-4">
                     <div className="w-12 h-12 bg-orange-500 rounded-xl animate-spin" />
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Profiles...</p>
                   </div>
                 ) : selectedUserData && (
                   <div className="space-y-12">
                      {/* Grid Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                         <GlassCard className="p-6 bg-white/40">
                            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Wallet</p>
                            <p className="text-xl font-black text-green-600">KES {selectedUserData.user?.wallet_balance?.toLocaleString()}</p>
                         </GlassCard>
                         <GlassCard className="p-6 bg-white/40">
                            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Phone</p>
                            <p className="text-sm font-black text-slate-900">{selectedUserData.user?.phone || '—'}</p>
                         </GlassCard>
                         <GlassCard className="p-6 bg-white/40">
                            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Joined</p>
                            <p className="text-sm font-black text-slate-900">{new Date(selectedUserData.user?.created_at).toLocaleDateString()}</p>
                         </GlassCard>
                      </div>

                      {/* Referral Section */}
                      {selectedUserData.referralStats && (
                        <div className="p-8 rounded-[2rem] bg-orange-500/5 border border-orange-500/10">
                           <div className="flex items-center gap-3 mb-6">
                             <Sparkles size={18} className="text-orange-500" />
                             <h3 className="text-sm font-black uppercase tracking-tighter">Referral Network</h3>
                           </div>
                           <div className="flex gap-12">
                              <div><p className="text-[9px] font-black text-slate-400 uppercase mb-1">Invites</p><p className="text-lg font-black">{selectedUserData.referralStats.total_referrals}</p></div>
                              <div><p className="text-[9px] font-black text-slate-400 uppercase mb-1">Earned</p><p className="text-lg font-black text-orange-600">KES {selectedUserData.referralStats.total_earned?.toLocaleString()}</p></div>
                           </div>
                        </div>
                      )}

                      {/* User's Orders */}
                      <div className="space-y-6">
                         <h3 className="text-sm font-black uppercase tracking-tighter flex items-center gap-3"><ShoppingBag size={18} className="text-slate-400" /> Recent Shipments</h3>
                         <GlassCard className="overflow-hidden">
                           <table className="w-full text-left text-xs">
                             <thead className="bg-slate-900/5 border-b border-white/50">
                               <tr>
                                 <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase">Tracking</th>
                                 <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase">Status</th>
                                 <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase">Cost</th>
                               </tr>
                             </thead>
                             <tbody className="divide-y divide-white/40">
                               {selectedUserData.user?.orders?.map(o => (
                                 <tr key={o.id} className="hover:bg-white/40 transition-colors">
                                   <td className="px-6 py-4 font-mono font-bold text-slate-900">{o.tracking_number}</td>
                                   <td className="px-6 py-4"><span className={statusBadge(o.status)}>{o.status?.replace('_', ' ')}</span></td>
                                   <td className="px-6 py-4 font-black text-slate-900">KES {o.estimated_cost?.toLocaleString()}</td>
                                 </tr>
                               ))}
                             </tbody>
                           </table>
                         </GlassCard>
                      </div>

                      {/* Email History */}
                      <div className="space-y-6">
                         <h3 className="text-sm font-black uppercase tracking-tighter flex items-center gap-3"><Mail size={18} className="text-slate-400" /> Communication Log</h3>
                         <GlassCard className="overflow-hidden">
                            <div className="max-h-60 overflow-y-auto">
                               <table className="w-full text-left text-xs">
                                 <tbody className="divide-y divide-white/40">
                                   {emailLogs.map(log => (
                                     <tr key={log.id} className="hover:bg-white/40">
                                       <td className="px-6 py-4">
                                          <p className="font-bold text-slate-900 truncate max-w-[200px]">{log.subject}</p>
                                          <p className="text-[9px] text-slate-400 uppercase font-black">{new Date(log.created_at).toLocaleString()}</p>
                                       </td>
                                       <td className="px-6 py-4 text-right">
                                          <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase ${log.status === 'sent' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>{log.status}</span>
                                       </td>
                                     </tr>
                                   ))}
                                 </tbody>
                               </table>
                            </div>
                         </GlassCard>
                      </div>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}
    </div>
  )
}

export default AdminDashboard;
