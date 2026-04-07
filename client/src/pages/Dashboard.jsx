import React, { useState, useEffect } from 'react'
import {
  Users, Package, DollarSign, BarChart3, MessageSquare, Activity,
  Lock, RefreshCw, Trash2, XCircle, Plus, CreditCard, Search,
  UserPlus, Bell, Mail, Eye, ArrowLeft, Key, Send, AlertTriangle,
  ChevronLeft, ChevronRight, Filter, ChevronDown, Zap, Globe, Box, ShieldCheck, ExternalLink
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
 * THAPSUS UI COMPONENTS
 */
const StatCard = ({ title, value, subtext, icon: Icon, colorClass }) => (
  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{title}</p>
        <h3 className="text-3xl font-black text-[#1e3a5f]">{value}</h3>
        {subtext && <div className="mt-2">{subtext}</div>}
      </div>
      <div className={`p-3 rounded-lg ${colorClass}`}>
        <Icon size={24} />
      </div>
    </div>
  </div>
);

const SectionHeader = ({ title, subtitle, action }) => (
  <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
    <div>
      <h2 className="text-2xl font-black text-[#1e3a5f] uppercase tracking-tight">{title}</h2>
      {subtitle && <p className="text-slate-500 font-medium text-sm">{subtitle}</p>}
    </div>
    {action && <div>{action}</div>}
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

  // Settings & Detail States
  const [expandedAdminOrderCost, setExpandedAdminOrderCost] = useState(null)
  const [showCreateUserForm, setShowCreateUserForm] = useState(false)
  const [createUserForm, setCreateUserForm] = useState({ name: '', email: '', phone: '', role: 'customer' })
  const [creatingUser, setCreatingUser] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedUserData, setSelectedUserData] = useState(null)
  const [loadingUser, setLoadingUser] = useState(false)
  
  // Rates & Logs
  const [exchangeRates, setExchangeRates] = useState({ USD_KES: '', GBP_KES: '', EUR_KES: '', CNY_KES: '' })
  const [savingRates, setSavingRates] = useState(false)
  const [errorLogs, setErrorLogs] = useState([])
  const [errorLogStats, setErrorLogStats] = useState(null)
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
        adminApi.listTickets({ page: 1, limit: 20 }),
      ])

      if (results[0].status === 'fulfilled') setStats(results[0].value.data?.stats || null)
      if (results[1].status === 'fulfilled') setUsers(results[1].value.data?.users || [])
      if (results[2].status === 'fulfilled') setOrders(results[2].value.data?.orders || [])
      if (results[3].status === 'fulfilled') {
        const ratesData = results[3].value.data?.rates
        if (ratesData) setExchangeRates({ USD_KES: ratesData.USD_KES, GBP_KES: ratesData.GBP_KES, EUR_KES: ratesData.EUR_KES, CNY_KES: ratesData.CNY_KES })
      }
      
      try {
        const errStats = await adminApi.getErrorLogStats()
        if (errStats.data?.stats) setErrorLogStats(errStats.data.stats)
      } catch (_) {}
    } catch (err) {
      toast.error('Sync Error: Could not reach management server')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenUserDetail = async (u) => {
    setSelectedUser(u); setLoadingUser(true);
    try {
      const res = await adminApi.getUser(u.id)
      setSelectedUserData(res.data)
    } catch (err) { toast.error('User data fetch failed') }
    finally { setLoadingUser(false) }
  }

  const fetchErrorLogs = async () => {
    try {
      const res = await adminApi.getErrorLogs({ page: 1, limit: 25 })
      setErrorLogs(res.data?.error_logs || [])
    } catch (err) { toast.error('Failed to load system logs') }
  }

  const handleRateChange = (pair, value) => setExchangeRates(prev => ({ ...prev, [pair]: value }))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[#1e3a5f] font-black text-xs uppercase tracking-widest">Initializing Thapsus Core...</p>
        </div>
      </div>
    )
  }

  const COLORS = ['#1e3a5f', '#f97316', '#0ea5e9', '#8b5cf6'];
  const userStats = stats?.users || {}
  const orderStats = stats?.orders || {}
  const revenueStats = stats?.revenue || {}

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans">
      
      {/* Top Navbar */}
      <nav className="bg-[#1e3a5f] text-white px-8 py-4 flex items-center justify-between sticky top-0 z-40 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="bg-orange-500 p-2 rounded-lg">
            <ShieldCheck size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none uppercase">{t('admin.title')}</h1>
            <p className="text-[10px] text-orange-400 font-bold tracking-[0.2em] uppercase">Control Console v3.1</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:block text-right">
            <p className="text-xs font-bold text-slate-300">{user?.name}</p>
            <p className="text-[10px] text-orange-400 uppercase font-black">System Administrator</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-700 border-2 border-slate-600 flex items-center justify-center font-bold">
            {user?.name?.charAt(0)}
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-10">
        
        {/* Navigation Tabs */}
        <div className="flex gap-1 mb-10 overflow-x-auto pb-2 bg-slate-200/50 p-1 rounded-2xl border border-slate-200">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'users', label: 'Users', icon: Users },
            { id: 'orders', label: 'Orders', icon: Box },
            { id: 'payments', label: 'Payments', icon: CreditCard },
            { id: 'exchange', label: 'Currency', icon: RefreshCw },
            { id: 'errorLogs', label: 'System Logs', icon: AlertTriangle }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); if(tab.id === 'errorLogs') fetchErrorLogs(); }}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-white text-[#1e3a5f] shadow-sm' 
                  : 'text-slate-500 hover:text-[#1e3a5f] hover:bg-white/50'
              }`}
            >
              <tab.icon size={16} className={activeTab === tab.id ? 'text-orange-500' : ''} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ═══ Overview Tab ═══ */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard title="Global Users" value={userStats.total || 0} icon={Users} colorClass="bg-blue-50 text-blue-600" 
                subtext={<p className="text-[10px] font-bold text-blue-600 uppercase">{userStats.customers || 0} Customers Active</p>} />
              <StatCard title="Active Orders" value={orderStats.total_orders || 0} icon={Package} colorClass="bg-orange-50 text-orange-600" 
                subtext={<p className="text-[10px] font-bold text-orange-600 uppercase">{orderStats.pending || 0} Pending Pickup</p>} />
              <StatCard title="Total Revenue" value={`KES ${(revenueStats.total_revenue || 0).toLocaleString()}`} icon={DollarSign} colorClass="bg-emerald-50 text-emerald-600" 
                subtext={<p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Completed Payments</p>} />
              <StatCard title="System Health" value={errorLogStats ? (100 - parseInt(errorLogStats.last_24h)).toString() + '%' : '100%'} icon={Activity} colorClass="bg-slate-100 text-slate-600" 
                subtext={<p className="text-[10px] font-bold text-slate-500 uppercase">Operational Status</p>} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-black text-[#1e3a5f] uppercase tracking-widest mb-6 border-b border-slate-100 pb-4">Logistics Status Share</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={stats?.order_statuses?.map(s => ({ name: s.status, value: parseInt(s.count) })) || []} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={8} dataKey="value">
                        {stats?.order_statuses?.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-[#1e3a5f] p-8 rounded-2xl shadow-xl text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><Globe size={120} /></div>
                <h3 className="text-sm font-black text-orange-400 uppercase tracking-widest mb-6">Market Performance</h3>
                <div className="space-y-6 relative z-10">
                  {stats?.markets?.map((m, i) => (
                    <div key={i} className="flex items-center justify-between border-b border-white/10 pb-4">
                      <div>
                        <p className="text-lg font-black uppercase">{m.market}</p>
                        <p className="text-xs text-slate-400 font-bold">{m.count} Total Shipments</p>
                      </div>
                      <div className="text-right">
                        <p className="text-orange-500 font-black">KES {parseFloat(m.value).toLocaleString()}</p>
                        <p className="text-[10px] uppercase font-bold text-slate-500">Value Handled</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Users Tab ═══ */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <SectionHeader title="User Directory" subtitle="Manage customer accounts and administrative access" />
              <button onClick={() => setShowCreateUserForm(!showCreateUserForm)} className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all">
                <UserPlus size={16} /> Provision User
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest">Client Identity</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest">Warehouse ID</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest">Account Type</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-500 tracking-widest text-right">Balance (KES)</th>
                    <th className="px-8 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-[#1e3a5f] text-white rounded-lg flex items-center justify-center font-black">{u.name.charAt(0)}</div>
                          <div>
                            <p className="font-bold text-[#1e3a5f]">{u.name}</p>
                            <p className="text-xs text-slate-400 font-medium">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5 font-mono text-sm font-bold text-orange-600">{u.warehouse_id}</td>
                      <td className="px-8 py-5">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${u.role === 'admin' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right font-black text-[#1e3a5f]">{(u.wallet_balance || 0).toLocaleString()}</td>
                      <td className="px-8 py-5 text-right">
                        <button onClick={() => handleOpenUserDetail(u)} className="p-2 text-slate-400 hover:text-orange-500 transition-colors">
                          <ExternalLink size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ Exchange Rates Tab ═══ */}
        {activeTab === 'exchange' && (
          <div className="max-w-xl mx-auto">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
              <div className="bg-[#1e3a5f] p-8 text-white">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-orange-500 rounded-xl"><RefreshCw size={24} /></div>
                  <h3 className="text-xl font-black uppercase tracking-tight">Global Exchange Rates</h3>
                </div>
                <p className="text-slate-400 text-sm mt-2 font-medium">Core conversion values for all automated invoicing</p>
              </div>
              <div className="p-8 space-y-6">
                {Object.entries(exchangeRates).map(([pair, val]) => (
                  <div key={pair} className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{pair.replace('_', ' → ')}</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#1e3a5f] font-black">KES</div>
                      <input 
                        type="number" 
                        value={val} 
                        onChange={(e) => handleRateChange(pair, e.target.value)}
                        className="w-full pl-14 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none font-black text-lg text-[#1e3a5f]" 
                      />
                    </div>
                  </div>
                ))}
                <button className="w-full bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-5 rounded-xl font-black uppercase tracking-widest text-sm transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98]">
                  Commit System-Wide Update
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Error Logs Tab ═══ */}
        {activeTab === 'errorLogs' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <SectionHeader title="System Integrity Logs" subtitle="Live exception tracking and performance diagnostics" />
              <button onClick={() => { if(window.confirm('Wipe logs?')) fetchData(); }} className="bg-red-50 text-red-600 border border-red-100 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all">Purge Logs</button>
            </div>
            
            <div className="bg-[#0f172a] rounded-2xl shadow-2xl overflow-hidden border border-slate-800">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800">
                    <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-500">Level</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-500">Component</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-500">Timestamp</th>
                    <th className="px-8 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {errorLogs.map((log) => (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-white/5 cursor-pointer transition-colors" onClick={() => setExpandedError(expandedError === log.id ? null : log.id)}>
                        <td className="px-8 py-5">
                          <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${log.level === 'fatal' ? 'bg-red-900 text-red-200' : 'bg-orange-900 text-orange-200'}`}>
                            {log.level}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-xs font-mono text-slate-300">{log.source}</td>
                        <td className="px-8 py-5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{new Date(log.created_at).toLocaleString()}</td>
                        <td className="px-8 py-5 text-right"><ChevronDown className={`text-slate-600 transition-transform ${expandedError === log.id ? 'rotate-180' : ''}`} size={16} /></td>
                      </tr>
                      {expandedError === log.id && (
                        <tr className="bg-black/40">
                          <td colSpan={4} className="px-12 py-6 border-l-4 border-orange-500">
                            <p className="text-orange-500 text-[10px] font-black uppercase mb-2">Message</p>
                            <p className="text-white font-bold mb-4">{log.message}</p>
                            <p className="text-slate-500 text-[10px] font-black uppercase mb-2">Stack Trace</p>
                            <pre className="bg-slate-900 p-4 rounded-lg text-xs text-slate-400 font-mono whitespace-pre-wrap leading-relaxed border border-slate-800">
                              {log.stack || 'No trace available'}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* User Detail Side-Drawer */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-[#1e3a5f]/40 backdrop-blur-sm" onClick={() => setSelectedUser(null)} />
          <div className="absolute inset-y-0 right-0 max-w-xl w-full bg-white shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="h-full flex flex-col">
              <div className="bg-[#1e3a5f] p-8 text-white">
                <button onClick={() => setSelectedUser(null)} className="mb-6 flex items-center gap-2 text-orange-400 font-black text-[10px] uppercase tracking-widest hover:text-white transition-colors">
                  <ArrowLeft size={16} /> Return to Directory
                </button>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center font-black text-2xl text-orange-500 border border-white/10">
                    {selectedUser.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-3xl font-black uppercase tracking-tight leading-none">{selectedUser.name}</h2>
                    <p className="text-orange-400 font-mono text-sm mt-1">{selectedUser.warehouse_id}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {loadingUser ? <div className="animate-pulse space-y-4 pt-10"><div className="h-20 bg-slate-100 rounded-xl w-full"></div><div className="h-20 bg-slate-100 rounded-xl w-full"></div></div> : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Email</p>
                        <p className="font-bold text-[#1e3a5f] truncate">{selectedUserData?.user?.email}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Wallet Balance</p>
                        <p className="text-lg font-black text-emerald-600">KES {(selectedUserData?.user?.wallet_balance || 0).toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2">Active Shipments</h4>
                      {selectedUserData?.user?.orders?.map(o => (
                        <div key={o.id} className="p-4 border border-slate-100 rounded-xl hover:border-orange-200 transition-colors group">
                          <div className="flex justify-between items-start mb-2">
                            <p className="font-black text-[#1e3a5f] uppercase text-sm group-hover:text-orange-500 transition-colors">{o.tracking_number}</p>
                            <span className="text-[9px] font-black uppercase bg-blue-50 text-blue-700 px-2 py-1 rounded">{o.status}</span>
                          </div>
                          <div className="flex justify-between items-end">
                            <p className="text-[10px] text-slate-400 font-bold uppercase">{o.market} · {o.retailer}</p>
                            <p className="text-xs font-black text-[#1e3a5f]">KES {o.estimated_cost?.toLocaleString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedOrders.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#1e3a5f] text-white px-8 py-5 rounded-2xl shadow-2xl flex items-center gap-8 border border-white/10 animate-in slide-in-from-bottom-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center font-black text-sm">{selectedOrders.length}</div>
            <p className="text-xs font-black uppercase tracking-widest">Shipments Selected</p>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="flex items-center gap-4">
            <select className="bg-slate-800 border-none rounded-lg text-[10px] font-black uppercase tracking-widest py-2 px-4 focus:ring-1 focus:ring-orange-500 outline-none">
              <option>Set Status: In Transit</option>
              <option>Set Status: Delivered</option>
              <option>Flag for Review</option>
            </select>
            <button className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-lg shadow-orange-500/20">Apply</button>
          </div>
        </div>
      )}
    </div>
  )
}
