import React, { useState, useEffect } from 'react'
import {
  Users, Package, DollarSign, BarChart3, MessageSquare, Activity,
  Lock, RefreshCw, Trash2, XCircle, Plus, CreditCard, Search,
  UserPlus, Bell, Mail, Eye, ArrowLeft, Key, Send, AlertTriangle,
  ChevronLeft, ChevronRight, Filter, ChevronDown, Globe, TrendingUp
} from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { adminApi, authApi, supportApi } from '../api'
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts'
import toast from 'react-hot-toast'

// Add these custom animations to your global CSS or a Style tag
const DashboardStyles = () => (
  <style>{`
    @keyframes morph {
      0% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
      50% { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; }
      100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
    }
    .animate-morph { animation: morph 8s ease-in-out infinite; }
    .glass-sheen {
      position: relative;
      overflow: hidden;
    }
    .glass-sheen::after {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: linear-gradient(45deg, transparent, rgba(255,255,255,0.1), transparent);
      transform: rotate(45deg);
      transition: 0.5s;
    }
    .glass-sheen:hover::after {
      left: 120%;
    }
  `}</style>
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

  // UI State
  const [expandedAdminOrderCost, setExpandedAdminOrderCost] = useState(null)
  const [showCreateOrderForm, setShowCreateOrderForm] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [createOrderForm, setCreateOrderForm] = useState({
    retailer: '', market: 'UK', description: '', weight_kg: '',
    dimensions: { length: '', width: '', height: '' },
    shipping_speed: 'economy', insurance: false, declared_value: '',
    electronics_item: '',
  })
  const [creatingOrder, setCreatingOrder] = useState(false)

  // Payment/Cancel Modals
  const [paymentModal, setPaymentModal] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [cancelModal, setCancelModal] = useState(null)
  const [cancelReason, setCancelReason] = useState('')

  // Rates & Settings
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [changingPassword, setChangingPassword] = useState(false)
  const [exchangeRates, setExchangeRates] = useState({ USD_KES: '', GBP_KES: '', EUR_KES: '', CNY_KES: '' })
  const [savingRates, setSavingRates] = useState(false)
  const [ratesLastUpdated, setRatesLastUpdated] = useState(null)
  const [shippingRates, setShippingRates] = useState({ UK: '', USA: '', China: '' })
  const [savingShippingRates, setSavingShippingRates] = useState(false)
  const [shippingRatesLastUpdated, setShippingRatesLastUpdated] = useState(null)

  // User Management
  const [showCreateUserForm, setShowCreateUserForm] = useState(false)
  const [createUserForm, setCreateUserForm] = useState({ name: '', email: '', phone: '', role: 'customer' })
  const [creatingUser, setCreatingUser] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedUserData, setSelectedUserData] = useState(null)
  const [loadingUser, setLoadingUser] = useState(false)
  const [showUserOrderForm, setShowUserOrderForm] = useState(false)
  const [userOrderForm, setUserOrderForm] = useState({
    retailer: '', market: 'UK', description: '', weight_kg: '', shipping_speed: 'economy',
    dimensions: { length: '', width: '', height: '' }, insurance: false, declared_value: '', electronics_item: '',
  })
  const [creatingUserOrder, setCreatingUserOrder] = useState(false)

  // Payments & Logs
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
          setShippingRates({ UK: srData.rates.UK || '', USA: srData.rates.USA || '', China: srData.rates.China || '' })
          setShippingRatesLastUpdated(srData.updated_at || null)
        }
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

  // --- API Handlers (Simplified for UI Focus) ---
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
    } catch (err) { toast.error('Failed to load logs') } finally { setLoadingErrorLogs(false) }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    try {
      setCreatingUser(true)
      await adminApi.createUser(createUserForm)
      toast.success('Account created successfully')
      setShowCreateUserForm(false)
      fetchData()
    } catch (err) { toast.error('Failed to create user') } finally { setCreatingUser(false) }
  }

  // UI Components & Styles
  const COLORS = ['#1e3a5f', '#f97316', '#10b981', '#6366f1']
  
  // Crystal Glass Card Style
  const glassCard = "bg-white/60 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] rounded-[2rem] p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_40px_0_rgba(31,38,135,0.12)]"
  const darkGlassCard = "bg-[#1e3a5f] backdrop-blur-2xl border border-white/10 shadow-xl rounded-[2rem] p-8 text-white glass-sheen"
  const orangeGlassCard = "bg-orange-50/80 backdrop-blur-2xl border border-orange-200/50 shadow-lg rounded-[2rem] p-8 glass-sheen"
  
  const btnPrimary = "glass-sheen bg-[#1e3a5f] hover:bg-[#152d4a] text-white px-6 py-3 rounded-2xl text-sm font-black tracking-tight shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95"
  const btnSecondary = "bg-white/80 backdrop-blur-md border border-gray-200 text-[#1e3a5f] hover:bg-gray-50 px-6 py-3 rounded-2xl text-sm font-bold tracking-tight transition-all flex items-center justify-center gap-2"
  
  const inputClassName = "w-full px-5 py-3.5 bg-white/50 border border-gray-200/80 rounded-2xl focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#f97316]/10 focus:border-[#f97316] transition-all text-sm font-medium"

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f8fafc]">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-[#1e3a5f]"></div>
          <div className="absolute inset-0 m-auto animate-ping rounded-full h-8 w-8 bg-[#f97316]/20"></div>
        </div>
      </div>
    )
  }

  const userStats = stats?.users || {}
  const orderStats = stats?.orders || {}
  const revenueStats = stats?.revenue || {}
  const marketStats = stats?.markets || []
  const marketChartData = marketStats.map((m) => ({ name: m.market, value: parseInt(m.count) || 0, revenue: parseFloat(m.value) || 0 }))

  return (
    <div className="min-h-screen bg-[#f8fafc] relative overflow-hidden font-sans text-gray-900 selection:bg-[#f97316]/20">
      <DashboardStyles />
      
      {/* Liquid Background Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#1e3a5f]/5 blur-[120px] animate-morph pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#f97316]/5 blur-[120px] animate-morph pointer-events-none"></div>

      <div className="max-w-[1500px] mx-auto px-6 py-12 relative z-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <h1 className="text-5xl md:text-6xl font-black text-[#1e3a5f] tracking-tighter leading-none mb-4">
              {t('admin.title')}
            </h1>
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></span>
              <p className="text-gray-500 font-bold tracking-tight uppercase text-xs">System Live • {new Date().toLocaleDateString()}</p>
            </div>
          </div>
          
          <div className="flex bg-white/80 backdrop-blur-xl p-1.5 rounded-[2rem] border border-white shadow-sm overflow-x-auto no-scrollbar">
            {['overview', 'users', 'orders', 'payments', 'tickets', 'exchange', 'errorLogs'].map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); if (tab === 'errorLogs') fetchErrorLogs(1, errorLogFilter); }}
                className={`px-6 py-3 rounded-[1.5rem] font-extrabold text-sm whitespace-nowrap transition-all duration-300 ${
                  activeTab === tab 
                    ? 'bg-[#1e3a5f] text-white shadow-xl translate-y-[-2px]' 
                    : 'text-gray-500 hover:text-[#1e3a5f] hover:bg-gray-50'
                }`}
              >
                {t(`admin.${tab}`)}
              </button>
            ))}
          </div>
        </div>

        {/* ═══ Overview Bento Grid ═══ */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 auto-rows-[200px]">
            {/* Main Stat: Revenue */}
            <div className={`${darkGlassCard} md:col-span-2 md:row-span-2 flex flex-col justify-between group`}>
              <div className="flex justify-between items-start">
                <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
                  <DollarSign size={32} className="text-orange-400" />
                </div>
                <div className="text-right">
                  <span className="text-xs font-black tracking-widest uppercase opacity-60">Total Revenue</span>
                  <h3 className="text-5xl font-black tracking-tighter mt-1">
                    KES {(revenueStats.total_revenue || 0).toLocaleString()}
                  </h3>
                </div>
              </div>
              <div className="h-32 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={marketChartData}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={4} fillOpacity={1} fill="url(#colorRev)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* User Stat */}
            <div className={`${glassCard} md:col-span-1 md:row-span-1 flex flex-col justify-between`}>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-50 text-[#1e3a5f] rounded-xl"><Users size={24} /></div>
                <span className="text-xs font-black uppercase tracking-wider text-gray-400">Total Users</span>
              </div>
              <h3 className="text-4xl font-black text-[#1e3a5f] tracking-tighter">{userStats.total || 0}</h3>
            </div>

            {/* Active Orders */}
            <div className={`${orangeGlassCard} md:col-span-1 md:row-span-1 flex flex-col justify-between`}>
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/50 text-[#f97316] rounded-xl"><Package size={24} /></div>
                <span className="text-xs font-black uppercase tracking-wider text-orange-700/60">Active Orders</span>
              </div>
              <h3 className="text-4xl font-black text-[#1e3a5f] tracking-tighter">{orderStats.total_orders || 0}</h3>
            </div>

            {/* Delivery Performance */}
            <div className={`${glassCard} md:col-span-2 md:row-span-1 flex items-center justify-between`}>
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-gray-400">Delivered Globally</span>
                <h3 className="text-4xl font-black text-[#1e3a5f] tracking-tighter mt-1">{orderStats.delivered || 0}</h3>
              </div>
              <div className="flex gap-2">
                {['UK', 'USA', 'China'].map(m => (
                  <div key={m} className="px-4 py-2 bg-gray-50 rounded-full text-[10px] font-black border border-gray-100">{m}</div>
                ))}
              </div>
            </div>

            {/* Market Distribution Pie */}
            <div className={`${glassCard} md:col-span-2 md:row-span-2 flex flex-col`}>
              <h4 className="text-lg font-black text-[#1e3a5f] tracking-tight mb-4">Volume by Market</h4>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={marketChartData} innerRadius={60} outerRadius={80} paddingAngle={8} dataKey="value" stroke="none">
                      {marketChartData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={10} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', padding: '15px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Quick Actions Card */}
            <div className="bg-white rounded-[2rem] border-2 border-dashed border-gray-200 md:col-span-2 md:row-span-1 flex items-center justify-around p-8">
               <button onClick={() => setActiveTab('users')} className="group flex flex-col items-center gap-2">
                  <div className="p-4 bg-gray-50 rounded-2xl group-hover:bg-[#1e3a5f] group-hover:text-white transition-all"><UserPlus /></div>
                  <span className="text-[10px] font-black uppercase tracking-tighter">Add User</span>
               </button>
               <button onClick={() => setActiveTab('orders')} className="group flex flex-col items-center gap-2">
                  <div className="p-4 bg-gray-50 rounded-2xl group-hover:bg-[#f97316] group-hover:text-white transition-all"><Plus /></div>
                  <span className="text-[10px] font-black uppercase tracking-tighter">New Order</span>
               </button>
               <button onClick={() => setActiveTab('exchange')} className="group flex flex-col items-center gap-2">
                  <div className="p-4 bg-gray-50 rounded-2xl group-hover:bg-emerald-500 group-hover:text-white transition-all"><TrendingUp /></div>
                  <span className="text-[10px] font-black uppercase tracking-tighter">Rates</span>
               </button>
            </div>
          </div>
        )}

        {/* ═══ Management Tables (Orders/Users) ═══ */}
        {(activeTab === 'orders' || activeTab === 'users') && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex items-center justify-between">
                <h2 className="text-3xl font-black text-[#1e3a5f] tracking-tighter">
                  {activeTab === 'orders' ? 'Global Shipments' : 'User Directory'}
                </h2>
                <button 
                  onClick={() => activeTab === 'orders' ? setShowCreateOrderForm(!showCreateOrderForm) : setShowCreateUserForm(!showCreateUserForm)} 
                  className={btnPrimary}
                >
                  <Plus size={18} strokeWidth={3} /> {activeTab === 'orders' ? 'Create Order' : 'New Account'}
                </button>
             </div>

             {/* Generic Glass Table Container */}
             <div className="bg-white/70 backdrop-blur-xl border border-white rounded-[2.5rem] shadow-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#1e3a5f]/5 border-b border-[#1e3a5f]/5">
                        <th className="px-8 py-6 text-[10px] font-black text-[#1e3a5f] uppercase tracking-widest">Identify</th>
                        <th className="px-8 py-6 text-[10px] font-black text-[#1e3a5f] uppercase tracking-widest">Detail</th>
                        <th className="px-8 py-6 text-[10px] font-black text-[#1e3a5f] uppercase tracking-widest">Status</th>
                        <th className="px-8 py-6 text-[10px] font-black text-[#1e3a5f] uppercase tracking-widest">Value</th>
                        <th className="px-8 py-6 text-[10px] font-black text-[#1e3a5f] uppercase tracking-widest text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {activeTab === 'orders' ? (
                        orders.map(o => (
                          <tr key={o.id} className="hover:bg-white/50 transition-colors group">
                            <td className="px-8 py-6">
                              <p className="font-black text-[#1e3a5f] tracking-tight">{o.tracking_number}</p>
                              <p className="text-[10px] text-gray-400 font-bold uppercase">{o.market} ORIGIN</p>
                            </td>
                            <td className="px-8 py-6">
                              <p className="font-bold text-sm text-gray-700">{o.name || o.email}</p>
                              <p className="text-xs text-gray-400">{o.retailer}</p>
                            </td>
                            <td className="px-8 py-6">
                              <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter border ${
                                o.status === 'delivered' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                o.status === 'pending' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-blue-50 text-blue-600 border-blue-100'
                              }`}>
                                {o.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-8 py-6 font-black text-[#1e3a5f]">KES {o.estimated_cost?.toLocaleString()}</td>
                            <td className="px-8 py-6 text-right">
                              <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="p-3 bg-gray-100 hover:bg-[#1e3a5f] hover:text-white rounded-xl transition-all"><Eye size={16}/></button>
                                <button className="p-3 bg-gray-100 hover:bg-rose-500 hover:text-white rounded-xl transition-all"><Trash2 size={16}/></button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        users.map(u => (
                          <tr key={u.id} className="hover:bg-white/50 transition-colors group">
                            <td className="px-8 py-6">
                              <p className="font-black text-[#1e3a5f] tracking-tight">{u.name}</p>
                              <p className="text-[10px] font-mono text-orange-500 font-bold">{u.warehouse_id}</p>
                            </td>
                            <td className="px-8 py-6">
                              <p className="font-bold text-sm text-gray-700">{u.email}</p>
                              <p className="text-xs text-gray-400">{u.phone}</p>
                            </td>
                            <td className="px-8 py-6">
                              <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter border ${u.is_active ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
                                {u.is_active ? 'Active' : 'Disabled'}
                              </span>
                            </td>
                            <td className="px-8 py-6 font-black text-emerald-600">KES {u.wallet_balance?.toLocaleString()}</td>
                            <td className="px-8 py-6 text-right">
                              <button onClick={() => handleOpenUserDetail(u)} className={btnSecondary + " !px-4 !py-2 !text-xs"}>Profile</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
             </div>
          </div>
        )}

        {/* ═══ Exchange Rates (Glassmorphic Inputs) ═══ */}
        {activeTab === 'exchange' && (
          <div className="max-w-4xl animate-in fade-in zoom-in-95 duration-500">
             <div className={`${glassCard} space-y-8`}>
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-4 bg-orange-50 text-[#f97316] rounded-2xl"><Globe size={32}/></div>
                  <div>
                    <h3 className="text-3xl font-black text-[#1e3a5f] tracking-tighter">Currency Engine</h3>
                    <p className="text-sm font-bold text-gray-400">Manage real-time conversion rates to KES</p>
                  </div>
                </div>

                <form onSubmit={handleSaveRates} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   {Object.keys(exchangeRates).map(pair => (
                     <div key={pair} className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">{pair.replace('_', ' / ')}</label>
                        <input 
                          type="number" 
                          step="0.01" 
                          value={exchangeRates[pair]} 
                          onChange={(e) => handleRateChange(pair, e.target.value)}
                          className={inputClassName}
                        />
                     </div>
                   ))}
                   <div className="md:col-span-2 pt-4">
                      <button type="submit" disabled={savingRates} className={btnPrimary + " w-full py-5 text-lg"}>
                        {savingRates ? 'Updating Engine...' : 'Synchronize Rates'}
                      </button>
                      {ratesLastUpdated && (
                        <p className="text-center mt-4 text-xs font-bold text-gray-400 italic">Last sync: {new Date(ratesLastUpdated).toLocaleString()}</p>
                      )}
                   </div>
                </form>
             </div>
          </div>
        )}

        {/* ═══ Error Logs (Terminal Aesthetic) ═══ */}
        {activeTab === 'errorLogs' && (
          <div className="bg-[#0f172a] rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden animate-in slide-in-from-right-8 duration-500">
            <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/5 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                </div>
                <span className="text-xs font-mono font-bold text-white/40 ml-4 tracking-widest uppercase">System_Logs_v3.log</span>
              </div>
              <button onClick={() => handleClearErrorLogs(7)} className="text-xs font-black text-rose-400 hover:text-rose-300 transition-colors uppercase tracking-widest flex items-center gap-2">
                <Trash2 size={14}/> Flush Logs
              </button>
            </div>
            <div className="p-4 font-mono text-xs overflow-y-auto max-h-[600px] bg-black/20">
               {errorLogs.map((log, i) => (
                 <div key={i} className="py-2 px-4 hover:bg-white/5 border-l-2 border-transparent hover:border-[#f97316] transition-all group">
                    <span className="text-emerald-500/50 mr-4">[{new Date(log.created_at).toLocaleTimeString()}]</span>
                    <span className={`font-black mr-4 ${log.level === 'error' ? 'text-rose-500' : 'text-amber-500'}`}>{log.level.toUpperCase()}</span>
                    <span className="text-white/80">{log.message}</span>
                    <div className="hidden group-hover:block mt-2 p-4 bg-black/40 rounded-xl text-white/40 overflow-x-auto">
                      {log.stack_trace || 'No stack trace available.'}
                    </div>
                 </div>
               ))}
            </div>
          </div>
        )}

        {/* Modals & Overlays (Style them as Glass) */}
        {paymentModal && (
          <div className="fixed inset-0 bg-[#1e3a5f]/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-10 animate-in zoom-in-95 duration-300 relative">
              <button onClick={() => setPaymentModal(null)} className="absolute top-6 right-6 p-2 bg-gray-50 rounded-full text-gray-400 hover:text-[#1e3a5f]"><XCircle/></button>
              <h3 className="text-3xl font-black text-[#1e3a5f] tracking-tighter mb-2">Request Payment</h3>
              <p className="text-gray-400 font-bold mb-8 uppercase text-[10px] tracking-widest">Order: {paymentModal.trackingNumber}</p>
              
              <div className="space-y-6">
                 <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Amount (KES)</label>
                    <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className={inputClassName} placeholder="0.00"/>
                 </div>
                 <button onClick={handleRequestPayment} className={btnPrimary + " w-full py-5"}>Send Secure Request</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
