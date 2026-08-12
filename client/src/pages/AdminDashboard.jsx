import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import {
  Users, Package, DollarSign, BarChart3, MessageSquare, Activity,
  Lock, RefreshCw, Trash2, XCircle, Plus, CreditCard, Search,
  UserPlus, Bell, Mail, Eye, ArrowLeft, Key, Send, AlertTriangle,
  ChevronLeft, ChevronRight, Filter, ChevronDown, Globe, TrendingUp,
  CheckCircle, X, Box, Pencil, Scale, Ruler, ShoppingCart, Zap,
  ArrowUpRight, Clock, Megaphone
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { adminApi, authApi } from '../api'
// Recharts moved into a lazy chunk (audit F-20) — see
// client/src/components/admin/AdminCharts.jsx. Keeps ~225 KB of chart
// vendor code out of the main admin entry bundle; it loads on first
// paint of a chart-bearing tab.
const RevenueAreaChart = lazy(() =>
  import('../components/admin/AdminCharts').then((m) => ({ default: m.RevenueAreaChart }))
)
const OrdersTrendAreaChart = lazy(() =>
  import('../components/admin/AdminCharts').then((m) => ({ default: m.OrdersTrendAreaChart }))
)
// Sized placeholder so layout doesn't reflow when the chunk lands.
const ChartFallback = () => (
  <div className="h-full w-full flex items-center justify-center">
    <div className="h-2 w-24 rounded-full bg-slate-200/60 animate-pulse" />
  </div>
)
import toast from 'react-hot-toast'
import { ShippingRatesPanel } from '../components/ShippingRatesPanel'
import { useAdminStats } from '../hooks/useRealtimeUpdates'

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
  null
);

const GlassCard = ({ children, className = "" }) => (
  <div className={`relative overflow-hidden rounded-[2.5rem] bg-surface-2 backdrop-blur-2xl border border-line shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] ${className}`}>
    <div className="absolute inset-0 hidden" />
    <div className="relative z-10">{children}</div>
  </div>
);

export const AdminDashboard = () => {
  const { t } = useLanguage()
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  // Honour ?tab= so returning from a ticket conversation lands back on TIC.
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview')
  
  // Data States
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [orders, setOrders] = useState([])
  const [tickets, setTickets] = useState([])
  const [pendingPayments, setPendingPayments] = useState([])
  const [errorLogs, setErrorLogs] = useState([])
  const [errorLogStats, setErrorLogStats] = useState(null)

  // Interaction States
  const [selectedOrders, setSelectedOrders] = useState([])
  const [newStatus, setNewStatus] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  // Form & Modal States
  const [showCreateOrderForm, setShowCreateOrderForm] = useState(false)
  const [createOrderForm, setCreateOrderForm] = useState({ retailer: '', description: '', weight_kg: '', dimensions: { length: '', width: '', height: '' }, shipping_speed: 'economy', insurance: false, declared_value: '', electronics_item: '' })
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
  const [editOrderForm, setEditOrderForm] = useState({ weight_kg: '', length: '', width: '', height: '', actual_cost: '', customs_duty: '', status: '', description: '', electronics_item: '', order_notes: '' })
  const [savingOrder, setSavingOrder] = useState(false)
  const [testEmail, setTestEmail] = useState(currentUser?.email || '')
  
  // User Panel States
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedUserData, setSelectedUserData] = useState(null)
  const [loadingUser, setLoadingUser] = useState(false)
  const [showUserOrderForm, setShowUserOrderForm] = useState(false)
  const [emailLogs, setEmailLogs] = useState([])
  const [deliveryForm, setDeliveryForm] = useState({ delivery_address: '', admin_notes: '' })
  const [savingDelivery, setSavingDelivery] = useState(false)
  const [approvingPayment, setApprovingPayment] = useState(null)
  const [expandedProof, setExpandedProof] = useState(null)

  // Error Log Pagination
  const [errorLogPage, setErrorLogPage] = useState(1)
  const [errorLogTotalPages, setErrorLogTotalPages] = useState(0)
  const [errorLogFilter, setErrorLogFilter] = useState({ level: '', source: '', search: '' })
  const [loadingErrorLogs, setLoadingErrorLogs] = useState(false)
  const [expandedError, setExpandedError] = useState(null)

  // Audit Log Pagination — privileged-action feed (admin_logs table)
  const [auditLogs, setAuditLogs] = useState([])
  const [auditLogPage, setAuditLogPage] = useState(1)
  const [auditLogTotalPages, setAuditLogTotalPages] = useState(0)
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false)
  const [expandedAudit, setExpandedAudit] = useState(null)

  // AML risk queue — server filters by status (open|cleared|escalated)
  const [amlFlags, setAmlFlags] = useState([])
  const [amlStatusFilter, setAmlStatusFilter] = useState('open')
  const [loadingAml, setLoadingAml] = useState(false)
  const [resolvingAml, setResolvingAml] = useState(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const results = await Promise.allSettled([
        adminApi.getDashboardStats(),
        // listUsers() defaults the server to limit=10 (routes/admin.js:58),
        // which truncated the dashboard's user table — accounts past the
        // first page (e.g. wanderibrian@gmail.com at rank 11 of 15) were
        // missing while the iOS admin tab, which passes limit=20, showed
        // them. Match parity at 100 — the dashboard renders a single
        // summary table and isn't paginated, so a higher cap covers the
        // whole user base for any realistic operator workload.
        adminApi.listUsers({ limit: 100 }),
        adminApi.listOrders(),
        adminApi.getExchangeRates(),
        adminApi.getPendingPayments(),
      ])
      if (results[0].status === 'fulfilled') setStats(results[0].value.data?.stats || null)
      if (results[1].status === 'fulfilled') setUsers(results[1].value.data?.users || [])
      if (results[2].status === 'fulfilled') setOrders(results[2].value.data?.orders || [])
      if (results[3].status === 'fulfilled') {
        const ratesData = results[3].value.data
        if (ratesData?.rates) setExchangeRates(ratesData.rates)
      }
      if (results[4].status === 'fulfilled') setPendingPayments(results[4].value.data?.payments || [])

      try {
        const statsRes = await adminApi.getErrorLogStats()
        if (statsRes.data?.stats) setErrorLogStats(statsRes.data.stats)
      } catch (_) {}
    } catch (err) {
      toast.error('Failed to load admin data')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Real-time admin stats updates via SSE — avoids stale overview numbers
  useAdminStats((payload) => {
    if (!payload) return
    setStats((prev) => ({ ...(prev || {}), ...payload }))
  })

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

  const fetchAuditLogs = async (page = 1) => {
    try {
      setLoadingAuditLogs(true)
      const res = await adminApi.getAuditLogs({ page, limit: 25 })
      if (res.data?.logs) {
        setAuditLogs(res.data.logs)
        setAuditLogPage(res.data.pagination?.page || page)
        setAuditLogTotalPages(res.data.pagination?.totalPages || 0)
      }
    } catch (err) { toast.error('Failed to load audit logs') } finally { setLoadingAuditLogs(false) }
  }

  const fetchAmlFlags = async (status = amlStatusFilter) => {
    try {
      setLoadingAml(true)
      const res = await adminApi.listAmlFlags(status)
      setAmlFlags(res.data?.flags || [])
    } catch (err) { toast.error('Failed to load AML queue') } finally { setLoadingAml(false) }
  }

  const handleResolveAml = async (id, status) => {
    let notes = null
    if (status === 'escalated') {
      notes = window.prompt('Escalation notes (optional)')
      if (notes === null) return // user cancelled
    }
    try {
      setResolvingAml(id)
      await adminApi.resolveAmlFlag(id, status, notes || undefined)
      toast.success(status === 'cleared' ? 'Flag cleared' : 'Flag escalated')
      fetchAmlFlags(amlStatusFilter)
    } catch (err) { toast.error('Failed to update flag') } finally { setResolvingAml(null) }
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
      const res = await adminApi.requestPayment(paymentModal.orderId, amount, paymentNotes)
      if (res.data?.email_warning) {
        toast.error(`⚠️ ${res.data.email_warning}`, { duration: 8000 })
      } else {
        toast.success('Payment request sent via email & in-app notification')
      }
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
      const res = await adminApi.sendPaymentReminder(reminderModal.orderId, amount, reminderNotes)
      if (res.data?.email_warning) {
        toast.error(`⚠️ ${res.data.email_warning}`, { duration: 8000 })
      } else {
        toast.success('Reminder sent via email & in-app notification')
      }
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

  // A ticket opens as its own iMessage-style conversation page.
  const openTicket = (ticket) => navigate(`/admin/tickets/${ticket.id}`)

  const handleOpenUserDetail = async (u) => {
    setSelectedUser(u); setSelectedUserData(null); setEmailLogs([]); setLoadingUser(true); setShowUserOrderForm(false);
    setDeliveryForm({ delivery_address: '', admin_notes: '' });
    try {
      const [userRes, emailRes] = await Promise.all([adminApi.getUser(u.id), adminApi.getUserEmails(u.id)])
      setSelectedUserData(userRes.data);
      setDeliveryForm({
        delivery_address: userRes.data?.user?.delivery_address || '',
        admin_notes: userRes.data?.user?.admin_notes || '',
      });
      setEmailLogs(emailRes.data?.email_logs || [])
    } catch (err) { toast.error('Failed to load details') } finally { setLoadingUser(false) }
  }

  const handleSaveDeliveryInfo = async (e) => {
    e.preventDefault()
    if (!selectedUser?.id) return
    try {
      setSavingDelivery(true)
      await adminApi.updateUser(selectedUser.id, {
        delivery_address: deliveryForm.delivery_address || null,
        admin_notes: deliveryForm.admin_notes || null,
      })
      toast.success('Delivery info saved')
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save delivery info')
    } finally { setSavingDelivery(false) }
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

  const handleToggleFinanceAccess = async (u) => {
    const next = !u.can_manage_finances
    if (!window.confirm(`${next ? 'Grant' : 'Revoke'} finance management access for ${u.name}?`)) return
    try {
      await adminApi.updateUser(u.id, { can_manage_finances: next })
      toast.success(`Finance access ${next ? 'granted' : 'revoked'}`)
      setSelectedUser(prev => ({ ...prev, can_manage_finances: next }))
      fetchData()
    } catch (err) { toast.error('Failed to update finance access') }
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

  // Audit P1.2: when the customer-claimed M-Pesa amount is short of the
  // invoice, /approve 409s with `error: 'amount_mismatch'` unless the
  // admin sends `override_reason` >= 10 chars. The Verify button on a
  // mismatched row opens `mismatchOverride` instead of approving
  // directly; clean rows still go through the unguarded path below.
  const [mismatchOverride, setMismatchOverride] = useState(null)
  // null when no override sheet open. Otherwise:
  //   { paymentId, amountDueKes, amountClaimedKes, reasonText }

  const handleApprovePayment = async (paymentId, { overrideReason } = {}) => {
    try {
      setApprovingPayment(paymentId)
      await adminApi.approvePayment(paymentId, { overrideReason })
      toast.success(overrideReason ? 'Payment approved with override' : 'Payment approved')
      setPendingPayments(pendingPayments.filter(p => p.id !== paymentId))
      setMismatchOverride(null)
    } catch (err) {
      const data = err?.response?.data
      if (data?.error === 'amount_mismatch' && !overrideReason) {
        // Open the override sheet with the server-returned figures.
        setMismatchOverride({
          paymentId,
          amountDueKes: Number(data.amount_due_kes ?? 0),
          amountClaimedKes: Number(data.amount_claimed_kes ?? 0),
          reasonText: '',
        })
      } else {
        toast.error(data?.message || 'Approval failed')
      }
    } finally { setApprovingPayment(null) }
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
      setCreateOrderForm({ retailer:'', description:'', weight_kg:'', dimensions:{length:'',width:'',height:''}, shipping_speed:'economy', insurance:false, declared_value:'', electronics_item:'' })
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
      description: order.description || '',
      electronics_item: order.electronics_item || '',
      order_notes: order.order_notes || '',
    })
    setEditOrderModal(order)
  }

  const handleSaveEditOrder = async (e) => {
    e.preventDefault()
    if (!editOrderModal?.id) return
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
      data.electronics_item = editOrderForm.electronics_item || null
      data.order_notes = editOrderForm.order_notes || null

      const res = await adminApi.editOrder(editOrderModal.id, data)
      toast.success(`Order ${editOrderModal.tracking_number} updated successfully`)
      setOrders(prev => prev.map(o => o.id === editOrderModal.id ? { ...o, ...res.data.order } : o))
      setEditOrderModal(null)
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to update order'
      toast.error(msg)
      console.error('Edit order error:', err)
    } finally { setSavingOrder(false) }
  }

  // --- UI Styles & Helpers ---
  const COLORS = ['#1e3a5f', '#f97316', '#10b981', '#6366f1']
  const tableWrapper = "bg-surface-2 backdrop-blur-2xl border border-line rounded-[2.5rem] shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] overflow-hidden overflow-x-auto"
  const inputClass = "w-full px-5 py-3.5 bg-surface-2 border border-line/80 rounded-2xl focus:ring-4 focus:ring-orange-500/10 focus:border-ember-500 transition-all outline-none font-bold text-white placeholder-white/30 shadow-sm"
  const thClass = "px-6 py-5 text-[10px] font-black uppercase tracking-widest text-mute"
  const tdClass = "px-6 py-5 text-sm"
  const btnPrimary = "glass-sheen bg-surface text-white px-6 py-3 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-50 hover:-translate-y-1"
  const btnOutline = "bg-surface-2 backdrop-blur-md border border-line text-white px-6 py-3 rounded-[1.5rem] font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-surface-2 transition-all disabled:opacity-50 shadow-sm hover:-translate-y-1"

  const statusBadge = (status) => {
    const cls = {
      delivered: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
      in_transit: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
      pending: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
      cancelled: 'bg-red-500/10 text-red-300 border-red-500/20',
    }
    return <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm ${cls[status] || 'bg-white/[0.03] text-white/80 border-line'}`}>{status?.replace(/_/g, ' ')}</span>
  }

  if (loading && !stats) return <div className="flex items-center justify-center h-screen bg-transparent"><div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div></div>

  return (
    <div className="min-h-screen bg-transparent relative font-sans text-white pb-20 overflow-x-hidden">
      <DashboardStyles />
      
      {/* --- LIQUID BACKGROUNDS --- */}
      <LiquidBlob className="top-[-5%] left-[-10%] w-[400px] h-[400px] md:w-[600px] md:h-[600px]" color="bg-blue-200" />
      <LiquidBlob className="bottom-[10%] right-[-5%] w-[350px] h-[350px] md:w-[500px] md:h-[500px]" color="bg-orange-200" />
      <div className="absolute inset-0 bg-surface-2 backdrop-blur-[2px] pointer-events-none" />
      
      <div className="max-w-[1600px] mx-auto px-6 py-12 relative z-10 space-y-10">
        {/* Header Navigation */}
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-surface-2 backdrop-blur-md border border-line text-[10px] font-black uppercase tracking-[0.3em] text-mute shadow-sm mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Auth: {currentUser?.name}
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter uppercase leading-none mb-2">{t('admin.title')}</h1>
            <p className="text-mute font-bold text-sm tracking-wide uppercase">Global Terminal • System Live</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {currentUser?.can_manage_finances && (
                <a href="/admin/finance"
                   className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-ember-gradient text-white font-black text-xs uppercase tracking-widest shadow-lg no-underline"
                   style={{ textDecoration: 'none' }}>
                  <DollarSign size={15}/> Finance Dashboard
                </a>
              )}
              <a href="/admin/influencers"
                 className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-surface-2 border border-line text-white font-black text-xs uppercase tracking-widest shadow-lg no-underline hover:bg-ember-500/10"
                 style={{ textDecoration: 'none' }}>
                <Megaphone size={15}/> Influencers
              </a>
            </div>
          </div>
          <div className="flex bg-surface-2 backdrop-blur-2xl p-2 rounded-[2rem] border border-line shadow-sm overflow-x-auto no-scrollbar">
            {['overview', 'users', 'orders', 'payments', 'revenue', 'exchange', 'settings', 'auditLogs', 'errorLogs'].map((tab) => (
              <button key={tab} onClick={() => { setActiveTab(tab); if(tab === 'errorLogs') fetchErrorLogs(); if(tab === 'auditLogs') fetchAuditLogs(); }}
                className={`relative px-4 md:px-6 py-2.5 md:py-3 rounded-[1.5rem] font-black text-[11px] md:text-xs uppercase tracking-widest whitespace-nowrap transition-all ${activeTab === tab ? 'bg-surface text-white shadow-xl glass-sheen' : 'text-mute hover:text-white hover:bg-surface-2'}`}>
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
              <div className="relative group overflow-hidden rounded-[2.5rem] bg-surface p-5 md:p-10 text-white shadow-2xl flex flex-col justify-between transition-all hover:scale-[1.01] duration-300 md:col-span-2 md:row-span-2 glass-sheen min-h-[300px]">
                
                <div className="relative z-10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-dim">Global Revenue (Completed)</span>
                  <h3 className="text-5xl lg:text-7xl font-black tracking-tighter mt-2 leading-none">KES {(stats?.revenue?.total_revenue || 0).toLocaleString()}</h3>
                  <p className="text-xs mt-3 font-bold text-orange-400 uppercase tracking-widest">{stats?.revenue?.total_transactions || 0} secure transactions</p>
                </div>
                <div className="h-40 w-full mt-4 relative z-10">
                  <Suspense fallback={<ChartFallback />}>
                    <RevenueAreaChart data={stats?.daily_orders} />
                  </Suspense>
                </div>
              </div>

              {/* New Users Today */}
              <GlassCard className="flex flex-col justify-center p-8 group hover:-translate-y-2 transition-all duration-500">
                <div className="flex items-center justify-between mb-4">
                  <UserPlus className="text-emerald-500" size={32}/>
                  <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-full text-[9px] font-black uppercase tracking-widest">Today</span>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-dim mb-1">New Users</span>
                <h3 className="text-4xl font-black text-white tracking-tighter">{stats?.users?.new_today || 0}</h3>
                <p className="text-[10px] font-bold text-dim mt-2 uppercase tracking-wider">{stats?.users?.total || 0} total users</p>
              </GlassCard>

              {/* New Orders Today */}
              <GlassCard className="flex flex-col justify-center p-8 border-ember-500/25 bg-ember-500/10 group hover:-translate-y-2 transition-all duration-500">
                <div className="flex items-center justify-between mb-4">
                  <ShoppingCart className="text-ember-400" size={32}/>
                  <span className="px-2.5 py-1 bg-ember-500/10 text-ember-400 border border-ember-500/25 rounded-full text-[9px] font-black uppercase tracking-widest">Today</span>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-ember-400/60 mb-1">New Orders</span>
                <h3 className="text-4xl font-black text-white tracking-tighter">{stats?.orders?.new_today || 0}</h3>
                <p className="text-[10px] font-bold text-dim mt-2 uppercase tracking-wider">{stats?.orders?.total_orders || 0} total orders</p>
              </GlassCard>

              {/* Active Orders */}
              <GlassCard className="flex flex-col justify-center p-8 group hover:-translate-y-2 transition-all duration-500">
                <div className="flex items-center justify-between mb-4">
                  <Zap className="text-blue-500" size={32}/>
                  <span className="px-2.5 py-1 bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded-full text-[9px] font-black uppercase tracking-widest animate-pulse">Live</span>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-dim mb-1">Active Orders</span>
                <h3 className="text-4xl font-black text-white tracking-tighter">{stats?.orders?.active_orders || 0}</h3>
                <p className="text-[10px] font-bold text-dim mt-2 uppercase tracking-wider">In pipeline now</p>
              </GlassCard>

              {/* Total Users */}
              <GlassCard className="flex flex-col justify-center p-8 group hover:-translate-y-2 transition-all duration-500">
                <Users className="text-indigo-500 mb-4" size={32}/>
                <span className="text-[10px] font-black uppercase tracking-widest text-dim mb-1">Total Users</span>
                <h3 className="text-4xl font-black text-white tracking-tighter">{stats?.users?.total || 0}</h3>
                <div className="flex gap-3 mt-2">
                  <span className="text-[9px] font-black text-dim uppercase">{stats?.users?.customers || 0} customers</span>
                  <span className="text-[9px] font-black text-ember-400 uppercase">{stats?.users?.admins || 0} admins</span>
                </div>
              </GlassCard>
            </div>

            {/* Middle Row: Order Status Breakdown + Market Pie */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Order Status Breakdown */}
              <GlassCard className="md:col-span-2 p-8">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-dim mb-6 flex items-center gap-2"><BarChart3 size={14} className="text-ember-400" /> Orders by Status</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {(stats?.order_statuses || []).map(s => {
                    const statusColors = {
                      pending: { bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-500/20', icon: <Clock size={18} className="text-amber-500" /> },
                      received_at_warehouse: { bg: 'bg-blue-500/10', text: 'text-blue-300', border: 'border-blue-500/20', icon: <Box size={18} className="text-blue-500" /> },
                      consolidating: { bg: 'bg-purple-500/10', text: 'text-purple-300', border: 'border-purple-500/20', icon: <Package size={18} className="text-purple-500" /> },
                      in_transit: { bg: 'bg-indigo-500/10', text: 'text-indigo-300', border: 'border-indigo-500/20', icon: <ArrowUpRight size={18} className="text-indigo-500" /> },
                      customs: { bg: 'bg-yellow-500/10', text: 'text-yellow-300', border: 'border-yellow-500/20', icon: <Globe size={18} className="text-yellow-600" /> },
                      out_for_delivery: { bg: 'bg-teal-50/80', text: 'text-teal-700', border: 'border-teal-200/50', icon: <TrendingUp size={18} className="text-teal-500" /> },
                      delivered: { bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/20', icon: <CheckCircle size={18} className="text-emerald-500" /> },
                      cancelled: { bg: 'bg-red-500/10', text: 'text-red-300', border: 'border-red-500/20', icon: <XCircle size={18} className="text-red-500" /> },
                    }
                    const c = statusColors[s.status] || { bg: 'bg-white/[0.03]/80', text: 'text-white/80', border: 'border-line/50', icon: <Package size={18} className="text-dim" /> }
                    return (
                      <div key={s.status} className={`relative overflow-hidden rounded-2xl ${c.bg} backdrop-blur-md border ${c.border} p-4 hover:scale-[1.02] transition-all duration-300 group/card`}>
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent pointer-events-none" />
                        <div className="relative z-10">
                          <div className="flex items-center justify-between mb-2">{c.icon}<span className={`text-2xl font-black ${c.text} tracking-tighter`}>{parseInt(s.count) || 0}</span></div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-mute">{s.status?.replace(/_/g, ' ')}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </GlassCard>

            </div>

            {/* Bottom Row: Daily Orders Chart + Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Daily Orders Trend */}
              <GlassCard className="md:col-span-2 p-8">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-dim mb-6 flex items-center gap-2"><TrendingUp size={14} className="text-green-500" /> Orders Trend (14 Days)</h4>
                <div className="h-48">
                  <Suspense fallback={<ChartFallback />}>
                    <OrdersTrendAreaChart data={stats?.daily_orders} />
                  </Suspense>
                </div>
              </GlassCard>

              {/* Quick Stats Stack */}
              <div className="space-y-4">
                <GlassCard className="p-6 flex items-center gap-4 group hover:-translate-y-1 transition-all duration-300">
                  <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20"><DollarSign size={20} className="text-emerald-300" /></div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-dim">Deposits</p>
                    <p className="text-xl font-black text-white tracking-tighter">KES {(parseFloat(stats?.revenue?.deposits) || 0).toLocaleString()}</p>
                  </div>
                </GlassCard>
                <GlassCard className="p-6 flex items-center gap-4 group hover:-translate-y-1 transition-all duration-300">
                  <div className="p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20"><CreditCard size={20} className="text-blue-300" /></div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-dim">Payments</p>
                    <p className="text-xl font-black text-white tracking-tighter">KES {(parseFloat(stats?.revenue?.payments) || 0).toLocaleString()}</p>
                  </div>
                </GlassCard>
                <GlassCard className="p-6 flex items-center gap-4 group hover:-translate-y-1 transition-all duration-300">
                  <div className="p-3 bg-purple-500/10 rounded-2xl border border-purple-500/20"><Users size={20} className="text-purple-600" /></div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-dim">Referrals</p>
                    <p className="text-xl font-black text-white tracking-tighter">{parseInt(stats?.referrals?.completed_referrals) || 0} / {parseInt(stats?.referrals?.total_referrals) || 0}</p>
                    <p className="text-[9px] font-bold text-ember-400">KES {(parseFloat(stats?.referrals?.total_rewards_paid) || 0).toLocaleString()} paid</p>
                  </div>
                </GlassCard>
                <GlassCard className="p-6 flex items-center gap-4 group hover:-translate-y-1 transition-all duration-300">
                  <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20"><Package size={20} className="text-amber-600" /></div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-dim">Pending Orders</p>
                    <p className="text-xl font-black text-white tracking-tighter">{parseInt(stats?.orders?.pending) || 0}</p>
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
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">User Directory</h2>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/admin/customer-consolidations"
                  className={btnPrimary + " no-underline"}
                  style={{ textDecoration: 'none' }}
                >
                  <Package size={16}/> New customer consolidation
                </a>
                <button onClick={() => setShowCreateUserForm(true)} className={btnPrimary}><UserPlus size={16}/> Provision Account</button>
              </div>
            </div>
            <div className={tableWrapper}>
              <table className="w-full text-left">
                <thead className="bg-surface/5">
                  <tr>
                    <th className={thClass}>User Entity</th>
                    <th className={thClass}>Credentials</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass + " text-right"}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-surface-2 transition-colors">
                      <td className={tdClass}><p className="font-black text-white">{u.name}</p><p className="text-[10px] font-mono text-ember-400 font-bold mt-1">{u.warehouse_id}</p></td>
                      <td className={tdClass}><p className="font-bold text-white/80">{u.email}</p><p className="text-xs text-dim font-medium mt-1">{u.phone}</p></td>
                      <td className={tdClass}><span className={`inline-flex px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm border ${u.is_active ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-red-500/10 text-red-300 border-red-500/20'}`}>{u.is_active ? 'Active' : 'Disabled'}</span></td>
                      <td className={tdClass + " text-right"}>
                        <button onClick={() => handleOpenUserDetail(u)} className="p-2 hover:bg-blue-500/15 text-blue-300 bg-surface rounded-xl transition-all inline-flex shadow-sm"><Eye size={16}/></button>
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
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">Shipment Terminal</h2>
              <div className="flex gap-3">
                <button onClick={() => setShowCreateOrderForm(true)} className={btnPrimary}><Plus size={16}/> Create Order</button>
              </div>
            </div>

            {selectedOrders.length > 0 && (
              <GlassCard className="!p-4 flex flex-col md:flex-row items-center gap-4 bg-blue-500/10 border-blue-500/20">
                <span className="font-black text-blue-300 text-sm tracking-wide uppercase">{selectedOrders.length} Selected</span>
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
                <thead className="bg-surface/5">
                  <tr>
                    <th className={thClass}><input type="checkbox" onChange={e => e.target.checked ? setSelectedOrders(orders.map(o=>o.id)) : setSelectedOrders([])} className="w-4 h-4 rounded accent-[#0f172a]" /></th>
                    <th className={thClass}>Dispatch ID</th>
                    <th className={thClass}>Client / Item</th>
                    <th className={thClass}>Weight / Dims</th>
                    <th className={thClass}>Stage</th>
                    <th className={thClass + " text-right"}>Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {orders.map(o => {
                    const dims = o.dimensions_json
                    return (
                    <tr key={o.id} className="hover:bg-surface-2 transition-colors group">
                      <td className={tdClass}><input type="checkbox" checked={selectedOrders.includes(o.id)} onChange={() => handleToggleOrderSelection(o.id)} className="w-4 h-4 rounded accent-[#0f172a]" /></td>
                      <td className={tdClass}><p className="font-black text-white">{o.tracking_number}</p></td>
                      <td className={tdClass}><p className="font-bold text-white">{o.name || o.email}</p><p className="text-xs text-mute font-medium max-w-[200px] truncate mt-1">{o.retailer}: {o.description}</p></td>
                      <td className={tdClass}>
                        {o.weight_kg ? (
                          <div>
                            <p className="font-black text-white">{o.weight_kg} kg</p>
                            {dims && <p className="text-[10px] text-dim font-bold mt-1">{dims.length}×{dims.width}×{dims.height} cm</p>}
                          </div>
                        ) : (
                          <span className="px-2 py-1 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-full text-[9px] font-black uppercase tracking-widest">Pending</span>
                        )}
                      </td>
                      <td className={tdClass}>{statusBadge(o.status)}</td>
                      <td className={tdClass + " text-right"}>
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleOpenEditOrder(o)} className="p-2 bg-surface hover:bg-blue-500/15 text-blue-300 border border-blue-100 rounded-xl shadow-sm transition-colors" title="Edit Order"><Pencil size={16}/></button>
                          <button onClick={() => { setPaymentModal({orderId: o.id, trackingNumber: o.tracking_number}); setPaymentAmount(String(o.estimated_cost||'')) }} className="p-2 bg-surface hover:bg-emerald-500/15 text-emerald-300 border border-green-100 rounded-xl shadow-sm transition-colors" title="Request Payment"><DollarSign size={16}/></button>
                          <button onClick={() => { setReminderModal({orderId: o.id, trackingNumber: o.tracking_number}); setReminderAmount(String(o.estimated_cost||'')) }} className="p-2 bg-surface hover:bg-ember-500/15 text-ember-400 border border-ember-500/20 rounded-xl shadow-sm transition-colors" title="Payment Reminder"><Bell size={16}/></button>
                          <button onClick={() => { setCancelModal({orderId: o.id, trackingNumber: o.tracking_number}) }} className="p-2 bg-surface hover:bg-amber-500/15 text-amber-600 border border-amber-100 rounded-xl shadow-sm transition-colors" title="Cancel"><XCircle size={16}/></button>
                          <button onClick={() => handleDeleteOrder(o.id, o.tracking_number)} className="p-2 bg-surface hover:bg-red-500/15 text-red-300 border border-red-100 rounded-xl shadow-sm transition-colors" title="Delete"><Trash2 size={16}/></button>
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
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">M-Pesa Verification Queue</h2>
            <div className="grid gap-6">
              {pendingPayments.length === 0 ? (
                <GlassCard className="text-center py-24 flex flex-col items-center justify-center">
                  <CreditCard className="text-mute mb-6" size={56} />
                  <p className="font-black text-dim uppercase text-xs tracking-widest">No pending transactions</p>
                </GlassCard>
              ) : pendingPayments.map(p => {
                // PaymentDto field names from server PR #61 (migration 028).
                const claimedKes = p.mpesa_message_amount_kes
                const dueKes     = p.amount_due_kes
                const mismatch   = claimedKes != null && Number(claimedKes) !== Number(dueKes)
                return (
                <GlassCard key={p.id} className="flex flex-col gap-6 p-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                      <div className="flex items-center gap-4 mb-2">
                        <span className="font-black text-3xl text-emerald-300 tracking-tighter">KES {Number(dueKes||0).toLocaleString()}</span>
                        <span className="px-3 py-1.5 bg-ember-500/10 text-ember-400 border border-ember-500/25 rounded-full font-mono text-[10px] font-black uppercase tracking-widest shadow-sm">{p.mpesa_reference || '—'}</span>
                        {claimedKes != null && (
                          <span className={`px-3 py-1.5 rounded-full font-mono text-[10px] font-black uppercase tracking-widest shadow-sm border ${mismatch ? 'bg-red-500/10 text-red-300 border-red-500/20' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'}`}>
                            Customer claimed KES {Number(claimedKes).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-mute font-bold">
                        {p.user_name || p.user_email || p.user_id} • {new Date(p.created_at).toLocaleDateString()} • {p.target_kind}
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => mismatch
                          ? setMismatchOverride({ paymentId: p.id, amountDueKes: Number(dueKes||0), amountClaimedKes: Number(claimedKes||0), reasonText: '' })
                          : handleApprovePayment(p.id)}
                        disabled={approvingPayment===p.id}
                        className={`glass-sheen text-white px-8 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-xl transition-all hover:-translate-y-1 ${mismatch ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-500 hover:bg-green-600'}`}
                        title={mismatch ? 'Amount mismatch — opens override sheet' : 'Approve payment'}
                      >
                        <CheckCircle size={16}/> {mismatch ? 'Verify w/ override' : 'Verify'}
                      </button>
                      <button onClick={() => handleRejectPayment(p.id)} disabled={approvingPayment===p.id} className="bg-red-500/10 text-red-300 border border-red-500/20 px-8 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:bg-red-500/15 transition-colors shadow-sm">Reject</button>
                    </div>
                  </div>

                  {/* Full M-Pesa Message — Always Visible */}
                  <div className="relative overflow-hidden rounded-2xl bg-slate-900/5 backdrop-blur-md border border-line p-6 shadow-inner">
                    <div className="absolute inset-0 hidden" />
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-3">
                        <MessageSquare size={14} className="text-blue-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-300">Full M-Pesa SMS</span>
                      </div>
                      <div className="font-mono text-sm text-white/80 whitespace-pre-wrap leading-relaxed bg-surface-2 p-4 rounded-xl border border-line">
                        {p.mpesa_message_raw || 'No message logged.'}
                      </div>
                    </div>
                  </div>

                  {p.mpesa_phone && (
                    <div className="flex flex-wrap gap-3">
                      <span className="px-3 py-1.5 bg-white/[0.03] border border-line rounded-full text-[10px] font-black uppercase tracking-widest text-mute">Phone: {p.mpesa_phone}</span>
                    </div>
                  )}
                </GlassCard>
                )
              })}
            </div>
          </div>
        )}

        {/* --- REVENUE (Border Gradient Bento) --- */}
        {activeTab === 'revenue' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="rounded-3xl">
              <div className="h-full w-full bg-surface border border-line shadow-card rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8">
                <div>
                  <h2 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter leading-none mb-2">Revenue Reporting</h2>
                  <p className="text-sm font-bold text-mute">Extract and analyze financial throughput.</p>
                </div>
                <button onClick={async () => {
                  try {
                    const res = await adminApi.exportRevenue(); const url = window.URL.createObjectURL(new Blob([res.data])); const link = document.createElement('a'); link.href = url; link.setAttribute('download', 'revenue.csv'); document.body.appendChild(link); link.click(); link.remove(); toast.success('Exported');
                  } catch { toast.error('Export failed') }
                }} className={btnPrimary + " w-full md:w-auto !px-10 !py-5"}>Export CSV Report</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <GlassCard className="p-8 border-emerald-500/20 bg-emerald-500/10">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300/60 mb-3">Total Deposits</p>
                <h3 className="text-4xl md:text-5xl font-black text-emerald-300 tracking-tighter">KES {(stats?.revenue?.deposits||0).toLocaleString()}</h3>
              </GlassCard>
              <GlassCard className="p-8 border-blue-500/20 bg-blue-500/10">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-300/60 mb-3">Total Payments</p>
                <h3 className="text-4xl md:text-5xl font-black text-blue-300 tracking-tighter">KES {(stats?.revenue?.payments||0).toLocaleString()}</h3>
              </GlassCard>
              <GlassCard className="p-8 border-ember-500/25 bg-ember-500/10">
                <p className="text-[10px] font-black uppercase tracking-widest text-ember-400/60 mb-3">Net Revenue</p>
                <h3 className="text-4xl md:text-5xl font-black text-ember-400 tracking-tighter">KES {(stats?.revenue?.total_revenue||0).toLocaleString()}</h3>
              </GlassCard>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
              <GlassCard className="p-8 border-indigo-500/20 bg-indigo-500/10">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300/60 mb-3">Paid via card (Stripe)</p>
                <h3 className="text-4xl md:text-5xl font-black text-indigo-300 tracking-tighter">KES {(stats?.revenue?.paid_via_card||0).toLocaleString()}</h3>
              </GlassCard>
              <GlassCard className="p-8 border-emerald-500/20 bg-emerald-500/10">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300/60 mb-3">Paid via M-Pesa</p>
                <h3 className="text-4xl md:text-5xl font-black text-emerald-300 tracking-tighter">KES {(stats?.revenue?.paid_via_mpesa||0).toLocaleString()}</h3>
              </GlassCard>
            </div>
          </div>
        )}

        {/* --- TICKETS --- */}
        {activeTab === 'tickets' && (
          <div className="space-y-6 animate-in fade-in duration-500">
             <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">Support & Comms</h2>
             {/* Each thread opens as its own iMessage-style conversation page
                 (/admin/tickets/:id) — replaces the old cramped split-pane that
                 broke down on mobile. */}
             <GlassCard className="flex flex-col overflow-hidden !p-0">
               <div className="p-6 border-b border-line bg-surface-2 backdrop-blur-md">
                 <h3 className="font-black text-xs uppercase tracking-widest text-mute">Active Threads</h3>
               </div>
               {tickets.length > 0 ? (
                 <div className="divide-y divide-line">
                   {tickets.map(t => (
                     <button
                       key={t.id}
                       onClick={() => openTicket(t)}
                       className="w-full text-left flex items-center gap-4 p-5 hover:bg-white/5 transition-colors"
                     >
                       <div className="shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-orange-500 to-ember-600 flex items-center justify-center text-white font-black text-xs shadow-inner">
                         {(t.customer_name || t.customer_email || '?').trim().split(/\s+/).slice(0,2).map(w => w[0]?.toUpperCase() || '').join('') || '?'}
                       </div>
                       <div className="min-w-0 flex-1">
                         <h4 className="font-black text-sm text-white truncate">{t.customer_name || t.customer_email || 'Customer'}</h4>
                         <p className="text-xs font-medium text-mute truncate">{t.subject}</p>
                       </div>
                       <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${t.status === 'open' ? 'bg-amber-500/15 text-amber-300 border-amber-500/25' : t.status === 'in_progress' ? 'bg-blue-500/15 text-blue-300 border-blue-500/25' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'}`}>{(t.status || 'open').replace(/_/g, ' ')}</span>
                       <ChevronRight size={18} className="shrink-0 text-white/30" />
                     </button>
                   ))}
                 </div>
               ) : (
                 <div className="flex flex-col items-center justify-center text-mute py-20">
                   <MessageSquare size={48} className="mb-5 opacity-50" />
                   <p className="font-black uppercase tracking-widest text-[10px]">No active threads</p>
                 </div>
               )}
             </GlassCard>
          </div>
        )}

        {/* --- EXCHANGE --- */}
        {activeTab === 'exchange' && (
          <div className="max-w-2xl mx-auto animate-in fade-in duration-500">
            {/* Border Gradient Wrap */}
            <div className="rounded-3xl">
              <div className="h-full w-full bg-surface border border-line shadow-card rounded-3xl p-5 md:p-10 md:p-14 space-y-10">
                <div className="flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
                  <div className="w-16 h-16 bg-ember-500/15 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                    <Globe size={32} className="text-ember-400" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-black text-white tracking-tighter uppercase leading-none mb-2">Currency Engine</h3>
                    <p className="text-sm font-bold text-mute">Set platform-wide conversion rates globally.</p>
                  </div>
                </div>
                <form onSubmit={handleSaveRates} className="space-y-6">
                  {Object.keys(exchangeRates).map(pair => (
                    <div key={pair} className="relative group/input">
                      <label className="text-[10px] font-black uppercase tracking-widest text-mute mb-2 ml-2 block">{pair.replace('_', ' to ')}</label>
                      <input type="number" step="0.01" value={exchangeRates[pair]} onChange={(e) => setExchangeRates({...exchangeRates, [pair]: e.target.value})} className={inputClass}/>
                    </div>
                  ))}
                  <button type="submit" disabled={savingRates} className="glass-sheen bg-surface hover:bg-slate-800 text-white w-full py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-xl transition-all hover:-translate-y-1 disabled:opacity-50 mt-4">
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
            <GlassCard className="p-5 md:p-10">
               <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-8 flex items-center gap-4">
                 <div className="p-3 bg-blue-500/15 text-blue-300 rounded-xl"><Lock size={20}/></div>
                 Admin Security
               </h3>
               <form onSubmit={handlePasswordChange} className="space-y-5">
                 <input type="password" placeholder="Current Password" value={passwordForm.currentPassword} onChange={e=>setPasswordForm(p=>({...p,currentPassword:e.target.value}))} className={inputClass} />
                 <input type="password" placeholder="New Password" value={passwordForm.newPassword} onChange={e=>setPasswordForm(p=>({...p,newPassword:e.target.value}))} className={inputClass} />
                 <input type="password" placeholder="Confirm Password" value={passwordForm.confirmPassword} onChange={e=>setPasswordForm(p=>({...p,confirmPassword:e.target.value}))} className={inputClass} />
                 <button type="submit" disabled={changingPassword} className={btnPrimary + " w-full !py-5 mt-4"}>Update Credentials</button>
               </form>
            </GlassCard>
            <GlassCard className="p-5 md:p-10">
               <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-6 flex items-center gap-4">
                 <div className="p-3 bg-ember-500/15 text-ember-400 rounded-xl"><Mail size={20}/></div>
                 SMTP Diagnostics
               </h3>
               <p className="text-sm text-mute font-bold mb-8 leading-relaxed">Test the Gmail OAuth2 integration to ensure automated receipts and reset links are dispatched correctly.</p>
               <div className="space-y-5">
                 <input type="email" placeholder="Recipient Email" value={testEmail} onChange={e => setTestEmail(e.target.value)} className={inputClass} />
                 <button onClick={async () => {
                   try { toast.loading('Dispatching test...', {id:'em'}); await adminApi.testEmail(testEmail || currentUser?.email); toast.success('Test email delivered', {id:'em'}) }
                   catch (err) { toast.error(err.response?.data?.message || 'Delivery failed', {id:'em'}) }
                 }} className={btnOutline + " w-full !py-5"}>Fire Test Email</button>
               </div>
            </GlassCard>
            
            {/* ADDED SHIPPING RATES PANEL HERE */}
            <GlassCard className="p-5 md:p-10 md:col-span-2">
               <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-6 flex items-center gap-4">
                 <div className="p-3 bg-emerald-500/15 text-emerald-300 rounded-xl"><Package size={20}/></div>
                 Global Shipping Rates
               </h3>
               <ShippingRatesPanel />
            </GlassCard>
          </div>
        )}

        {/* --- AUDIT LOGS --- privileged-action feed (admin_logs table). */}
        {activeTab === 'auditLogs' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">Privileged Action Feed</h2>
              <button onClick={() => fetchAuditLogs(1)} disabled={loadingAuditLogs} className={btnOutline + " !py-2.5 !px-5"}>
                {loadingAuditLogs ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>

            <div className={tableWrapper}>
              <table className="w-full text-left">
                <thead className="bg-surface/5">
                  <tr>
                    <th className={thClass}>Action</th>
                    <th className={thClass}>Admin</th>
                    <th className={thClass}>Details</th>
                    <th className={thClass}>Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {auditLogs.length === 0 && !loadingAuditLogs && (
                    <tr><td colSpan="4" className={tdClass + " text-center font-bold text-dim"}>No audit entries on this page.</td></tr>
                  )}
                  {auditLogs.map(log => (
                    <React.Fragment key={log.id}>
                      <tr onClick={() => setExpandedAudit(expandedAudit === log.id ? null : log.id)} className="hover:bg-blue-500/10 cursor-pointer transition-colors">
                        <td className={tdClass}>
                          <span className="inline-flex px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm border bg-blue-500/10 text-blue-300 border-blue-500/20">{log.action}</span>
                        </td>
                        <td className={tdClass + " font-bold text-white/80"}>
                          {log.admin_name || log.admin_email || '—'}
                        </td>
                        <td className={tdClass + " font-mono text-[10px] text-mute truncate max-w-md"}>
                          {typeof log.details === 'string' ? log.details : JSON.stringify(log.details || {})}
                        </td>
                        <td className={tdClass + " text-[10px] font-black uppercase tracking-widest text-dim"}>
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                      </tr>
                      {expandedAudit === log.id && (
                        <tr>
                          <td colSpan="4" className="bg-surface text-blue-300 p-8 font-mono text-[10px] sm:text-xs whitespace-pre-wrap shadow-inner border-y border-line">
                            {JSON.stringify(log.details || {}, null, 2)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              <div className="p-6 flex gap-3 justify-end bg-surface-2 backdrop-blur-md border-t border-line">
                <button onClick={() => fetchAuditLogs(auditLogPage - 1)} disabled={auditLogPage <= 1 || loadingAuditLogs} className={btnOutline + " !py-2.5 !px-5"}>Prev</button>
                <span className="text-[10px] font-black uppercase tracking-widest text-dim self-center">Page {auditLogPage} / {auditLogTotalPages || 1}</span>
                <button onClick={() => fetchAuditLogs(auditLogPage + 1)} disabled={auditLogPage >= auditLogTotalPages || loadingAuditLogs} className={btnOutline + " !py-2.5 !px-5"}>Next</button>
              </div>
            </div>
          </div>
        )}

        {/* --- AML RISK QUEUE --- compliance review, mirrors iOS AdminAmlQueueView. */}
        {activeTab === 'aml' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">AML Risk Queue</h2>
              <div className="flex gap-2">
                {['open','cleared','escalated'].map(s => (
                  <button key={s}
                    onClick={() => { setAmlStatusFilter(s); fetchAmlFlags(s) }}
                    className={`px-5 py-2.5 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest transition-all ${amlStatusFilter === s ? 'bg-surface text-white shadow-lg' : 'bg-surface-2 text-mute hover:text-white border border-line'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className={tableWrapper}>
              <table className="w-full text-left">
                <thead className="bg-surface/5">
                  <tr>
                    <th className={thClass}>User</th>
                    <th className={thClass}>Reason</th>
                    <th className={thClass}>Notes</th>
                    <th className={thClass}>Raised</th>
                    <th className={thClass}>Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {amlFlags.length === 0 && !loadingAml && (
                    <tr><td colSpan="5" className={tdClass + " text-center font-bold text-dim"}>
                      No {amlStatusFilter} flags.
                    </td></tr>
                  )}
                  {amlFlags.map(f => (
                    <tr key={f.id} className="hover:bg-amber-500/10 transition-colors">
                      <td className={tdClass}>
                        <p className="font-black text-white">{f.user_name || '—'}</p>
                        <p className="text-[10px] font-bold text-mute mt-1">{f.user_email || f.user_id}</p>
                        {f.parcel_id && <p className="text-[10px] font-mono text-amber-300 mt-1">parcel · {f.parcel_id.slice(0,8)}</p>}
                      </td>
                      <td className={tdClass + " font-bold text-white/80"}>{f.reason}</td>
                      <td className={tdClass + " text-xs text-mute max-w-xs"}>{f.notes || '—'}</td>
                      <td className={tdClass + " text-[10px] font-black uppercase tracking-widest text-dim"}>
                        {new Date(f.created_at).toLocaleString()}
                      </td>
                      <td className={tdClass}>
                        {f.status === 'open' ? (
                          <div className="flex gap-2">
                            <button onClick={() => handleResolveAml(f.id, 'cleared')} disabled={resolvingAml === f.id}
                              className="bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 px-4 py-2 rounded-[1rem] font-black text-[10px] uppercase tracking-widest transition-colors shadow-sm">
                              Clear
                            </button>
                            <button onClick={() => handleResolveAml(f.id, 'escalated')} disabled={resolvingAml === f.id}
                              className="bg-red-500/10 hover:bg-red-500/15 text-red-300 border border-red-500/20 px-4 py-2 rounded-[1rem] font-black text-[10px] uppercase tracking-widest transition-colors shadow-sm">
                              Escalate
                            </button>
                          </div>
                        ) : (
                          <span className={`inline-flex px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm border ${f.status==='escalated' ? 'bg-red-500/10 text-red-300 border-red-500/20' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'}`}>
                            {f.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- ERROR LOGS --- */}
        {activeTab === 'errorLogs' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">System Diagnostics</h2>
              <button onClick={() => handleClearErrorLogs(30)} className="bg-red-500/10 hover:bg-red-500/15 text-red-300 border border-red-500/20 px-6 py-3 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest transition-colors shadow-sm">
                Clear 30d+
              </button>
            </div>
            
            <GlassCard className="!p-6 flex flex-col md:flex-row gap-4 bg-surface-2">
              <select value={errorLogFilter.level} onChange={e=>setErrorLogFilter(p=>({...p,level:e.target.value}))} className={inputClass + " md:max-w-[200px]"}>
                <option value="">All Levels</option><option value="error">Error</option><option value="warn">Warn</option><option value="fatal">Fatal</option>
              </select>
              <button onClick={()=>fetchErrorLogs(1, errorLogFilter)} className="bg-surface hover:bg-slate-800 text-white px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-md">Apply Filter</button>
            </GlassCard>

            <div className={tableWrapper}>
              <table className="w-full text-left">
                <thead className="bg-surface/5">
                  <tr>
                    <th className={thClass}>Level</th>
                    <th className={thClass}>Source</th>
                    <th className={thClass}>Message</th>
                    <th className={thClass}>Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {errorLogs.map(log => (
                    <React.Fragment key={log.id}>
                      <tr onClick={() => setExpandedError(expandedError === log.id ? null : log.id)} className="hover:bg-red-500/10 cursor-pointer transition-colors">
                        <td className={tdClass}><span className={`inline-flex px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm border ${log.level==='fatal' ? 'bg-red-500/10 text-red-300 border-red-500/20' : 'bg-amber-500/10 text-amber-300 border-amber-500/20'}`}>{log.level}</span></td>
                        <td className={tdClass + " font-mono text-[10px] font-bold"}>{log.source}</td>
                        <td className={tdClass + " font-bold text-white truncate max-w-xs"}>{log.message}</td>
                        <td className={tdClass + " text-[10px] font-black uppercase tracking-widest text-dim"}>{new Date(log.created_at).toLocaleString()}</td>
                      </tr>
                      {expandedError === log.id && (
                        <tr>
                          <td colSpan="4" className="bg-surface text-green-400 p-8 font-mono text-[10px] sm:text-xs whitespace-pre-wrap shadow-inner border-y border-line">
                            {log.stack || log.message}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              <div className="p-6 flex gap-3 justify-end bg-surface-2 backdrop-blur-md border-t border-line">
                <button onClick={()=>fetchErrorLogs(errorLogPage-1)} disabled={errorLogPage<=1} className={btnOutline + " !py-2.5 !px-5"}>Prev</button>
                <button onClick={()=>fetchErrorLogs(errorLogPage+1)} disabled={errorLogPage>=errorLogTotalPages} className={btnOutline + " !py-2.5 !px-5"}>Next</button>
              </div>
            </div>
          </div>
        )}

        {/* --- GLOBAL MODALS --- */}
        
        {/* Create Order for Client Modal */}
        {showCreateOrderForm && (
          <div className="fixed inset-0 bg-surface/80 backdrop-blur-sm z-[100] flex justify-end">
            <div className="bg-surface w-full max-w-2xl h-full overflow-y-auto shadow-float relative p-5 md:p-10 md:p-14 animate-fade-in border-l border-line">
               <button onClick={() => setShowCreateOrderForm(false)} aria-label="Close" className="absolute top-10 right-10 w-10 h-10 bg-surface rounded-full flex items-center justify-center text-mute hover:text-red-500 shadow-sm transition-colors"><X size={20}/></button>
               
               <div className="mb-10">
                 <h3 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter leading-none mb-2">Dispatch Order</h3>
                 <p className="text-mute font-bold text-sm">Create a secure manifest on behalf of a client.</p>
               </div>
               
               <form onSubmit={handleCreateOrderForClient} className="space-y-8">
                 <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-dim ml-2 mb-2 block">Locate Client</label>
                   <input type="text" value={customerSearch} onChange={e=>handleSearchCustomers(e.target.value)} placeholder="Search by name/email" className={inputClass}/>
                   {customerResults.length > 0 && (
                     <div className="mt-2 bg-surface rounded-2xl shadow-lg border border-line overflow-hidden">
                       {customerResults.map(c => (
                         <div key={c.id} onClick={()=>{setSelectedCustomer(c); setCustomerSearch(c.email); setCustomerResults([])}} className="p-4 hover:bg-ember-500/10 cursor-pointer border-b last:border-0 transition-colors flex justify-between items-center">
                           <span className="font-black text-white text-sm">{c.name}</span>
                           <span className="text-xs font-bold text-mute">{c.email}</span>
                         </div>
                       ))}
                     </div>
                   )}
                 </div>
                 <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-dim ml-2 mb-2 block">Retailer</label>
                   <input placeholder="e.g. Amazon" className={inputClass} value={createOrderForm.retailer} onChange={e=>setCreateOrderForm(p=>({...p,retailer:e.target.value}))} required />
                 </div>
                 <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-dim ml-2 mb-2 block">Manifest Description</label>
                   <textarea placeholder="Item details..." className={inputClass + " resize-none"} rows={3} value={createOrderForm.description} onChange={e=>setCreateOrderForm(p=>({...p,description:e.target.value}))} required />
                 </div>
                 
                 <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-dim ml-2 mb-2 block">Electronics Handling</label>
                   <select className={inputClass} value={createOrderForm.electronics_item} onChange={e=>setCreateOrderForm(p=>({...p,electronics_item:e.target.value}))}>
                     <option value="">No electronics (Standard)</option>
                     <option value="phone">Phone (+£75 handling)</option>
                     <option value="laptop">Laptop / Accessories (+£65 handling)</option>
                     <option value="tv_monitor">TV / Screen / Monitor (+£65 handling)</option>
                   </select>
                 </div>
                 
                 <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-dim ml-2 mb-2 block">Dead Weight (KG)</label>
                   <input type="number" step="0.1" placeholder="0.0" className={inputClass} value={createOrderForm.weight_kg} onChange={e=>setCreateOrderForm(p=>({...p,weight_kg:e.target.value}))} required />
                 </div>
                 
                 <button type="submit" disabled={creatingOrder} className={btnPrimary + " w-full !py-5"}>Finalize Dispatch</button>
               </form>
            </div>
          </div>
        )}

        {/* User Details Side Panel */}
        {selectedUser && selectedUserData && (
          <div className="fixed inset-0 bg-surface/80 backdrop-blur-sm z-[100] flex justify-end">
            <div className="bg-surface w-full max-w-3xl h-full overflow-y-auto shadow-float relative p-5 md:p-10 md:p-14 animate-fade-in border-l border-line">
              <button onClick={() => setSelectedUser(null)} aria-label="Close" className="absolute top-10 right-10 w-10 h-10 bg-surface rounded-full flex items-center justify-center text-mute hover:text-red-500 shadow-sm transition-colors"><X size={20}/></button>
              
              <div className="mb-10">
                <h3 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase leading-none mb-3">{selectedUser.name}</h3>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="px-3 py-1.5 bg-ember-500/15 text-ember-400 rounded-lg font-mono text-[10px] font-black uppercase tracking-widest shadow-sm">{selectedUser.warehouse_id}</span>
                  <span className="text-sm font-bold text-mute">{selectedUser.email}</span>
                </div>
                <div className="mt-3 p-3 bg-white/[0.03] border border-line rounded-xl text-[11px] text-mute font-mono">
                  <span className="font-black text-white/80 uppercase tracking-widest text-[9px]">Warehouse Address · </span>
                  Thapsus Cargo, [Warehouse Name], Nairobi, Kenya — Ref: <span className="text-ember-400 font-black">{selectedUser.warehouse_id}</span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-6 mb-12">
                <GlassCard className="p-8 border-blue-500/20 bg-blue-500/10 shadow-none">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-300/60 mb-2">Active Orders</p>
                  <p className="text-3xl md:text-4xl font-black text-blue-300 tracking-tighter">{selectedUserData.user?.orders?.length || 0}</p>
                </GlassCard>
              </div>
              
              <h4 className="text-[10px] font-black uppercase tracking-widest text-dim mb-4">Administrative Protocols</h4>
              <div className="flex flex-wrap gap-4 mb-12">
                <button onClick={() => handleResetUserPassword(selectedUser.id, selectedUser.name, selectedUser.email)} className={btnOutline + " !bg-surface"}><Key size={16}/> Push Reset Link</button>
                <button onClick={() => setShowUserOrderForm(!showUserOrderForm)} className={btnPrimary}><Package size={16}/> Drop Order</button>
                
                {selectedUser.role === 'admin' && (
                  <button onClick={() => handleToggleFinanceAccess(selectedUser)} className={btnOutline + (selectedUser.can_manage_finances ? " !border-emerald-500 !text-emerald-300 hover:!bg-emerald-500/10 bg-surface" : " !border-orange-500 !text-orange-300 hover:!bg-orange-500/10 bg-surface")}>
                    <DollarSign size={16}/> {selectedUser.can_manage_finances ? 'Revoke Finance Access' : 'Grant Finance Access'}
                  </button>
                )}
                {selectedUser.id !== currentUser?.id && (
                  <>
                    <button onClick={() => handleToggleUserActive(selectedUser)} className={btnOutline + (selectedUser.is_active ? " !border-amber-500 !text-amber-600 hover:!bg-amber-500/10 bg-surface" : " !border-green-500 !text-emerald-300 hover:!bg-emerald-500/10 bg-surface")}>
                      <RefreshCw size={16}/> {selectedUser.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    <button onClick={() => handleDeleteUser(selectedUser)} className={btnOutline + " !border-red-500 !text-red-300 hover:!bg-red-500/10 bg-surface"}>
                      <Trash2 size={16}/> Delete Account
                    </button>
                  </>
                )}
              </div>

              {/* ── Delivery Address & Admin Notes ──────────────────────── */}
              <h4 className="text-[10px] font-black uppercase tracking-widest text-dim mb-4">Delivery &amp; Notes</h4>
              <form onSubmit={handleSaveDeliveryInfo} className="mb-12 space-y-4">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-mute mb-1 block">Kenya Delivery Address</label>
                  <textarea
                    className={inputClass + " resize-none !bg-surface"}
                    rows="3"
                    placeholder="Enter the customer's delivery address in Kenya…"
                    value={deliveryForm.delivery_address}
                    onChange={e => setDeliveryForm(p => ({ ...p, delivery_address: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-mute mb-1 block">Admin Notes</label>
                  <textarea
                    className={inputClass + " resize-none !bg-surface"}
                    rows="3"
                    placeholder="Internal notes about this customer (not visible to them)…"
                    value={deliveryForm.admin_notes}
                    onChange={e => setDeliveryForm(p => ({ ...p, admin_notes: e.target.value }))}
                  />
                </div>
                <button type="submit" disabled={savingDelivery} className={btnPrimary + " w-full !py-3"}>
                  {savingDelivery ? 'Saving…' : 'Save Delivery Info'}
                </button>
              </form>

              <h4 className="text-[10px] font-black uppercase tracking-widest text-dim mb-4">Shipment History</h4>
              <div className="space-y-3 mb-12">
                {selectedUserData.user?.orders?.length === 0 ? <p className="text-sm font-bold text-dim">No shipments found.</p> : null}
                {selectedUserData.user?.orders?.map((o) => {
                  const breakdown = o.cost_breakdown;
                  const baseShipping =
                    breakdown?.breakdown?.base_shipping?.amount ??
                    o.estimated_cost ??
                    0;
                  const handlingFee =
                    (breakdown?.breakdown?.electronics_handling?.amount || 0) +
                    (breakdown?.breakdown?.handling_fee?.amount || 0);
                  const insuranceFee = breakdown?.breakdown?.insurance?.amount || 0;
                  const customsDuty =
                    o.customs_duty ??
                    breakdown?.breakdown?.customs_estimate?.amount ??
                    0;
                  const totalBase = breakdown?.total ?? o.estimated_cost ?? 0;
                  const total = (o.actual_cost ?? totalBase) + (customsDuty ?? 0);

                  return (
                    <div key={o.id} className="p-5 bg-surface border border-line rounded-2xl shadow-sm">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-black text-white text-sm">{o.tracking_number}</p>
                          <p className="text-[10px] font-bold text-mute uppercase tracking-widest mt-1">
                            £{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        {statusBadge(o.status)}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-mute font-mono">
                        {baseShipping > 0 && (
                          <div>Shipping: £{baseShipping.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        )}
                        {handlingFee > 0 && (
                          <div>Handling: £{handlingFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        )}
                        {insuranceFee > 0 && (
                          <div>Insurance: £{insuranceFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        )}
                        {customsDuty > 0 && (
                          <div>Customs: £{customsDuty.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        )}
                        <div className="col-span-2 font-bold text-white">
                          Total: £{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      {o.order_notes && (
                        <div className="mt-3 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[10px] text-amber-300 font-semibold">
                          📝 {o.order_notes}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <h4 className="text-[10px] font-black uppercase tracking-widest text-dim mb-4">Payment History</h4>
              <div className="space-y-3 mb-12">
                {(!selectedUserData.recentTransactions || selectedUserData.recentTransactions.length === 0) ? (
                  <p className="text-sm font-bold text-dim">No transactions found.</p>
                ) : (
                  selectedUserData.recentTransactions.map(tx => {
                    const isCredit = ['deposit', 'refund', 'referral_credit'].includes(tx.type)
                    const typeLabels = { deposit: 'M-Pesa Deposit', payment: 'Order Payment', refund: 'Refund', referral_credit: 'Referral Bonus' }
                    return (
                      <div key={tx.id} className="p-5 bg-surface border border-line rounded-2xl flex justify-between items-center shadow-sm">
                        <div>
                          <p className="font-black text-sm text-white">{typeLabels[tx.type] || tx.type}</p>
                          <p className="text-[10px] font-bold text-mute uppercase tracking-widest mt-1">
                            {tx.currency || 'KES'} • {new Date(tx.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {tx.payment_method ? ` • ${tx.payment_method}` : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`font-black text-lg ${isCredit ? 'text-emerald-300' : 'text-red-500'}`}>
                            {isCredit ? '+' : '-'}KES {Math.abs(tx.amount || 0).toLocaleString()}
                          </p>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${tx.status === 'completed' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : tx.status === 'pending' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : 'bg-red-500/10 text-red-300 border-red-500/20'}`}>
                            {tx.status}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <h4 className="text-[10px] font-black uppercase tracking-widest text-dim mb-4">Email Communications</h4>
              <div className="space-y-3">
                {emailLogs.length === 0 ? (
                  <p className="text-sm text-dim font-bold">No email logs found</p>
                ) : (
                  emailLogs.map(log => (
                    <div key={log.id} className="p-5 bg-surface border border-line rounded-2xl flex justify-between items-center shadow-sm">
                      <div>
                        <p className="font-black text-sm text-white">{log.subject}</p>
                        <p className="text-[10px] font-bold text-mute uppercase tracking-widest mt-1">{log.email_type?.replace(/_/g, ' ')} • {new Date(log.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className={`inline-flex px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm ${log.status === 'sent' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-red-500/10 text-red-300 border-red-500/20'}`}>
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
          <div className="fixed inset-0 bg-surface/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <GlassCard className="w-full max-w-lg p-5 md:p-10 relative">
              <button onClick={() => setPaymentModal(null)} aria-label="Close" className="absolute top-6 right-6 w-8 h-8 bg-surface rounded-full flex items-center justify-center text-mute hover:text-red-500 transition-colors shadow-sm"><X size={16} /></button>
              <h3 className="text-3xl font-black text-white uppercase tracking-tighter leading-none mb-8">Request Funds</h3>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-mute ml-2 mb-2 block">Amount (KES)</label>
                  <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className={inputClass} placeholder="0.00" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-mute ml-2 mb-2 block">Notes to Client</label>
                  <textarea value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} className={inputClass + " resize-none"} placeholder="Optional..." rows={3} />
                </div>
                <button onClick={handleRequestPayment} className={btnPrimary + " w-full !py-5"}>Dispatch Invoice</button>
              </div>
            </GlassCard>
          </div>
        )}

        {reminderModal && (
          <div className="fixed inset-0 bg-surface/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <GlassCard className="w-full max-w-lg p-5 md:p-10 relative">
              <button onClick={() => setReminderModal(null)} aria-label="Close" className="absolute top-6 right-6 w-8 h-8 bg-surface rounded-full flex items-center justify-center text-mute hover:text-red-500 transition-colors shadow-sm"><X size={16} /></button>
              <h3 className="text-3xl font-black text-white uppercase tracking-tighter leading-none mb-8">Payment Reminder</h3>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-mute ml-2 mb-2 block">Amount (KES)</label>
                  <input type="number" value={reminderAmount} onChange={(e) => setReminderAmount(e.target.value)} className={inputClass} placeholder="0.00" />
                </div>
                <button onClick={handleSendReminder} className="glass-sheen w-full bg-orange-500 hover:bg-orange-600 text-white py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-xs transition-all shadow-xl hover:-translate-y-1">Send Notice</button>
              </div>
            </GlassCard>
          </div>
        )}

        {cancelModal && (
          <div className="fixed inset-0 bg-surface/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <GlassCard className="w-full max-w-lg p-5 md:p-10 relative bg-red-500/10 border-red-500/20">
              <button onClick={() => setCancelModal(null)} aria-label="Close" className="absolute top-6 right-6 w-8 h-8 bg-surface rounded-full flex items-center justify-center text-mute hover:text-red-500 transition-colors shadow-sm"><X size={16} /></button>
              <h3 className="text-3xl font-black text-red-300 uppercase tracking-tighter leading-none mb-8">Halt Shipment</h3>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-red-800 ml-2 mb-2 block">Reason for Cancellation</label>
                  <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className={inputClass + " !border-red-500/20 focus:!ring-red-500/20 focus:!border-red-500 resize-none"} placeholder="Will be visible to client..." rows={3} />
                </div>
                <button onClick={handleCancelOrder} className="glass-sheen w-full bg-red-600 hover:bg-red-700 text-white py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-xs transition-all shadow-xl hover:-translate-y-1">Terminate Order</button>
              </div>
            </GlassCard>
          </div>
        )}
        
        {showCreateUserForm && (
          <div className="fixed inset-0 bg-surface/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <GlassCard className="w-full max-w-lg p-5 md:p-10 relative">
              <button onClick={() => setShowCreateUserForm(false)} aria-label="Close" className="absolute top-6 right-6 w-8 h-8 bg-surface rounded-full flex items-center justify-center text-mute hover:text-red-500 transition-colors shadow-sm"><X size={16} /></button>
              <div className="mb-10">
                 <h3 className="text-3xl font-black text-white uppercase tracking-tighter leading-none mb-2">New Account</h3>
                 <p className="text-mute font-bold text-sm">Provision a new entity on the system.</p>
              </div>
              <form onSubmit={handleCreateUser} className="space-y-5">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-mute ml-2 mb-2 block">Full Name</label>
                  <input className={inputClass} value={createUserForm.name} onChange={e => setCreateUserForm({...createUserForm, name: e.target.value})} required />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-mute ml-2 mb-2 block">Email Address</label>
                  <input type="email" className={inputClass} value={createUserForm.email} onChange={e => setCreateUserForm({...createUserForm, email: e.target.value})} required />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-mute ml-2 mb-2 block">Phone (+254...)</label>
                  <input className={inputClass} value={createUserForm.phone} onChange={e => setCreateUserForm({...createUserForm, phone: e.target.value})} required />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-mute ml-2 mb-2 block">Account Role</label>
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
              <GlassCard className="p-8 md:p-10">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Edit Order</h3>
                    <p className="text-sm font-bold text-ember-400 mt-1">{editOrderModal.tracking_number}</p>
                  </div>
                  <button onClick={() => setEditOrderModal(null)} className="p-2 hover:bg-red-500/15 text-red-500 rounded-xl transition-colors"><X size={20}/></button>
                </div>

                <form onSubmit={handleSaveEditOrder} className="space-y-6">
                  {/* Weight & Dimensions Section */}
                  <div className="relative overflow-hidden rounded-2xl bg-blue-500/10 backdrop-blur-md border border-blue-500/20 p-5">
                    <div className="absolute inset-0 bg-gradient-to-tr from-blue-100/20 to-transparent pointer-events-none" />
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-4 relative z-10 flex items-center gap-2"><Scale size={14}/> Weight & Dimensions</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-mute mb-1 block">Weight (kg)</label>
                        <input type="number" step="0.01" min="0" className={inputClass} placeholder="0.00" value={editOrderForm.weight_kg} onChange={e => setEditOrderForm({...editOrderForm, weight_kg: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-mute mb-1 block">Length (cm)</label>
                        <input type="number" step="0.1" min="0" className={inputClass} placeholder="0" value={editOrderForm.length} onChange={e => setEditOrderForm({...editOrderForm, length: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-mute mb-1 block">Width (cm)</label>
                        <input type="number" step="0.1" min="0" className={inputClass} placeholder="0" value={editOrderForm.width} onChange={e => setEditOrderForm({...editOrderForm, width: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-mute mb-1 block">Height (cm)</label>
                        <input type="number" step="0.1" min="0" className={inputClass} placeholder="0" value={editOrderForm.height} onChange={e => setEditOrderForm({...editOrderForm, height: e.target.value})} />
                      </div>
                    </div>
                  </div>

                  {/* Electronics & Special Handling */}
                  <div className="relative overflow-hidden rounded-2xl bg-ember-500/10 backdrop-blur-md border border-ember-500/25 p-5">
                    <div className="absolute inset-0 bg-gradient-to-tr from-orange-100/20 to-transparent pointer-events-none" />
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-ember-400 mb-1 relative z-10 flex items-center gap-2">⚡ Electronics &amp; Special Handling</h4>
                    <p className="text-[10px] text-ember-400/80 font-semibold mb-4 relative z-10">Adds a handling fee on top of the standard shipping rate. Also enforces a 1 kg minimum weight.</p>
                    <select
                      className={inputClass + " relative z-10"}
                      value={editOrderForm.electronics_item}
                      onChange={e => setEditOrderForm({...editOrderForm, electronics_item: e.target.value})}
                    >
                      <option value="">No electronics (Standard)</option>
                      <option value="phone">Phone — £75 handling fee</option>
                      <option value="laptop">Laptop / Accessories — £65 handling fee</option>
                      <option value="tv_monitor">TV / Screen / Monitor — £65 handling fee</option>
                    </select>
                    {editOrderForm.electronics_item && (
                      <p className="mt-3 text-[10px] font-black text-ember-400 relative z-10">
                        ⚠ Estimated cost will be recalculated to include the handling fee.
                      </p>
                    )}
                  </div>

                  {/* Status & Costs */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-mute mb-1 block">Status</label>
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
                      <label className="text-[9px] font-black uppercase tracking-widest text-mute mb-1 block">Actual Cost (£)</label>
                      <input type="number" step="0.01" min="0" className={inputClass} placeholder="0.00" value={editOrderForm.actual_cost} onChange={e => setEditOrderForm({...editOrderForm, actual_cost: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-mute mb-1 block">Customs Duty (£)</label>
                      <input type="number" step="0.01" min="0" className={inputClass} placeholder="0.00" value={editOrderForm.customs_duty} onChange={e => setEditOrderForm({...editOrderForm, customs_duty: e.target.value})} />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-mute mb-1 block">Description</label>
                    <textarea className={inputClass + " resize-none"} rows="3" value={editOrderForm.description} onChange={e => setEditOrderForm({...editOrderForm, description: e.target.value})} />
                  </div>

                  {/* Order Notes */}
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-mute mb-1 block">Order Notes (admin only)</label>
                    <textarea className={inputClass + " resize-none"} rows="2" placeholder="Internal notes about this order…" value={editOrderForm.order_notes} onChange={e => setEditOrderForm({...editOrderForm, order_notes: e.target.value})} />
                  </div>

                  {/* Current Info Display */}
                  <div className="flex flex-wrap gap-3 text-[10px] font-black uppercase tracking-widest">
                    <span className="px-3 py-1.5 bg-white/[0.03] border border-line rounded-full text-mute">Est. Cost: £{(editOrderModal.estimated_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="px-3 py-1.5 bg-white/[0.03] border border-line rounded-full text-mute">Speed: {editOrderModal.shipping_speed}</span>
                    {editOrderModal.electronics_item && (
                      <span className="px-3 py-1.5 bg-ember-500/10 border border-ember-500/25 rounded-full text-ember-400">
                        ⚡ {editOrderModal.electronics_item === 'phone' ? 'Phone' : editOrderModal.electronics_item === 'laptop' ? 'Laptop' : 'TV/Monitor'}
                      </span>
                    )}
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

        {/* M-Pesa amount-mismatch override sheet (audit P1.2). Opens when
            an admin clicks Verify on a row whose claimed amount is
            short of amount_due_kes — the server 409s without an
            `override_reason` >=10 chars, and we surface the same gate
            in the UI so admins can't accidentally settle a short pay. */}
        {mismatchOverride && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
              <GlassCard className="bg-surface p-8">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white tracking-tight">Amount mismatch</h3>
                    <p className="text-sm text-mute font-bold mt-1">Customer's M-Pesa SMS is short of the invoice. Approving requires a written reason.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100">
                    <p className="text-[9px] font-black uppercase tracking-widest text-rose-600">Customer claimed</p>
                    <p className="text-2xl font-black text-rose-700 mt-1 tracking-tighter">KES {mismatchOverride.amountClaimedKes.toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-line">
                    <p className="text-[9px] font-black uppercase tracking-widest text-mute">Invoice due</p>
                    <p className="text-2xl font-black text-white/80 mt-1 tracking-tighter">KES {mismatchOverride.amountDueKes.toLocaleString()}</p>
                  </div>
                </div>
                <label className="block mb-1 text-[9px] font-black uppercase tracking-widest text-mute">Reason (min 10 chars)</label>
                <textarea
                  value={mismatchOverride.reasonText}
                  onChange={e => setMismatchOverride({ ...mismatchOverride, reasonText: e.target.value })}
                  rows={3}
                  placeholder="e.g. Customer forwarded the second receipt offline; total clears amount."
                  className={inputClass + " resize-none"}
                />
                <p className={`mt-1 text-[10px] font-bold ${mismatchOverride.reasonText.trim().length >= 10 ? 'text-emerald-600' : 'text-dim'}`}>
                  {mismatchOverride.reasonText.trim().length}/10 chars minimum
                </p>
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => handleApprovePayment(mismatchOverride.paymentId, { overrideReason: mismatchOverride.reasonText.trim() })}
                    disabled={mismatchOverride.reasonText.trim().length < 10 || approvingPayment === mismatchOverride.paymentId}
                    className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-6 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl transition-all"
                  >
                    Approve with override
                  </button>
                  <button onClick={() => setMismatchOverride(null)} className="flex-1 bg-white/[0.03] border border-line text-white/80 px-6 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:bg-white/[0.05]">
                    Cancel
                  </button>
                </div>
              </GlassCard>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
