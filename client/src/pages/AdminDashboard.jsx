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
import { adminApi } from '../api' 
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area
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
  const { user: currentUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  
  // Data States
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [orders, setOrders] = useState([])
  const [pendingPayments, setPendingPayments] = useState([])
  const [tickets, setTickets] = useState([])
  
  // Action States
  const [paymentModal, setPaymentModal] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [showCreateUserForm, setShowCreateUserForm] = useState(false)
  const [createUserForm, setCreateUserForm] = useState({ name: '', email: '', phone: '', role: 'customer' })
  const [creatingUser, setCreatingUser] = useState(false)
  const [exchangeRates, setExchangeRates] = useState({ USD_KES: '', GBP_KES: '', EUR_KES: '', CNY_KES: '' })
  const [savingRates, setSavingRates] = useState(false)
  const [errorLogs, setErrorLogs] = useState([])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [statsRes, usersRes, ordersRes, ratesRes, paymentsRes, ticketsRes] = await Promise.all([
        adminApi.getDashboardStats(),
        adminApi.listUsers(),
        adminApi.listOrders(),
        adminApi.getExchangeRates(),
        adminApi.getPendingPayments(),
        adminApi.listTickets()
      ])

      setStats(statsRes.data?.stats || null)
      setUsers(usersRes.data?.users || [])
      setOrders(ordersRes.data?.orders || [])
      setPendingPayments(paymentsRes.data?.transactions || [])
      setTickets(ticketsRes.data?.tickets || [])
      
      if (ratesRes.data?.rates) {
        setExchangeRates(ratesRes.data.rates)
      }
    } catch (err) {
      toast.error('Sync failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // --- Handlers ---
  const handleSaveRates = async (e) => {
    e.preventDefault()
    setSavingRates(true)
    try {
      await adminApi.setExchangeRates(exchangeRates)
      toast.success('Rates updated')
      fetchData()
    } catch (err) {
      toast.error('Update failed')
    } finally { setSavingRates(false) }
  }

  const handleRequestPayment = async () => {
    if (!paymentAmount || !paymentModal) return
    try {
      await adminApi.requestPayment(paymentModal.id, parseFloat(paymentAmount), "Standard Invoice")
      toast.success('Request sent')
      setPaymentModal(null)
    } catch (err) { toast.error('Request failed') }
  }

  const handleApprovePayment = async (id) => {
    try {
      await adminApi.approvePayment(id)
      toast.success('Verified')
      fetchData()
    } catch (err) { toast.error('Approval failed') }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setCreatingUser(true)
    try {
      await adminApi.createUser(createUserForm)
      toast.success('User Created')
      setShowCreateUserForm(false)
      fetchData()
    } catch (err) { toast.error('Creation failed') } finally { setCreatingUser(false) }
  }

  const fetchErrorLogs = async () => {
    try {
      const res = await adminApi.getErrorLogs()
      setErrorLogs(res.data.error_logs || [])
    } catch (err) { toast.error('Logs failed') }
  }

  // UI Styles
  const COLORS = ['#1e3a5f', '#f97316', '#10b981', '#6366f1']
  const glassCard = "bg-white/60 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] rounded-[2rem] p-8 transition-all hover:-translate-y-1"
  const inputClass = "w-full px-5 py-3.5 bg-white/50 border border-gray-200/80 rounded-2xl focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 transition-all outline-none font-medium"

  if (loading) return <div className="flex items-center justify-center h-screen"><RefreshCw className="animate-spin text-[#1e3a5f]" size={48} /></div>

  const marketChartData = (stats?.markets || []).map(m => ({ name: m.market, value: parseInt(m.count) || 0, revenue: parseFloat(m.value) || 0 }))

  return (
    <div className="min-h-screen bg-[#f8fafc] relative overflow-hidden font-sans text-gray-900">
      <DashboardStyles />
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#1e3a5f]/5 blur-[120px] animate-morph pointer-events-none"></div>
      
      <div className="max-w-[1500px] mx-auto px-6 py-12 relative z-10">
        {/* Header Navigation */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div>
            <h1 className="text-5xl font-black text-[#1e3a5f] tracking-tighter mb-4">{t('admin.title')}</h1>
            <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest">Global Terminal • System Live</p>
          </div>
          <div className="flex bg-white/80 backdrop-blur-xl p-1.5 rounded-[2rem] border border-white shadow-sm overflow-x-auto no-scrollbar">
            {['overview', 'users', 'orders', 'payments', 'tickets', 'exchange', 'errorLogs'].map((tab) => (
              <button key={tab} onClick={() => { setActiveTab(tab); if(tab === 'errorLogs') fetchErrorLogs(); }}
                className={`px-6 py-3 rounded-[1.5rem] font-extrabold text-sm whitespace-nowrap transition-all ${activeTab === tab ? 'bg-[#1e3a5f] text-white shadow-xl' : 'text-gray-500 hover:text-[#1e3a5f]'}`}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* --- OVERVIEW --- */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 auto-rows-[220px]">
            <div className="bg-[#1e3a5f] md:col-span-2 md:row-span-2 rounded-[2rem] p-10 text-white flex flex-col justify-between shadow-2xl glass-sheen">
              <div>
                <span className="text-xs font-black uppercase opacity-60">Global Revenue</span>
                <h3 className="text-5xl font-black tracking-tighter mt-1">KES {(stats?.revenue?.total_revenue || 0).toLocaleString()}</h3>
              </div>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={marketChartData}><Area type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={4} fillOpacity={0.2} fill="#f97316" /></AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className={glassCard + " flex flex-col justify-center"}>
              <Users className="text-[#1e3a5f] mb-2" />
              <span className="text-xs font-black uppercase text-gray-400">Total Users</span>
              <h3 className="text-4xl font-black text-[#1e3a5f]">{stats?.users?.total || 0}</h3>
            </div>
            <div className={glassCard + " flex flex-col justify-center border-orange-100 bg-orange-50/30"}>
              <Package className="text-[#f97316] mb-2" />
              <span className="text-xs font-black uppercase text-orange-600/60">Active Orders</span>
              <h3 className="text-4xl font-black text-[#1e3a5f]">{stats?.orders?.total_orders || 0}</h3>
            </div>
            <div className={glassCard + " md:col-span-2 flex flex-col"}>
              <h4 className="text-lg font-black mb-4">Volume by Market</h4>
              <div className="flex-1 min-h-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={marketChartData} innerRadius={50} outerRadius={70} dataKey="value">
                      {marketChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* --- USERS & ORDERS --- */}
        {(activeTab === 'users' || activeTab === 'orders') && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-black text-[#1e3a5f] tracking-tighter">{activeTab === 'users' ? 'User Directory' : 'Shipment Terminal'}</h2>
              <button onClick={() => activeTab === 'users' ? setShowCreateUserForm(true) : fetchData()} className="bg-[#1e3a5f] text-white px-6 py-3 rounded-2xl font-black text-sm shadow-lg flex items-center gap-2">
                {activeTab === 'users' ? <Plus size={18}/> : <RefreshCw size={18}/>} {activeTab === 'users' ? 'New User' : 'Refresh'}
              </button>
            </div>
            <div className="bg-white/70 backdrop-blur-xl border border-white rounded-[2.5rem] shadow-2xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-[#1e3a5f]/5">
                  <tr>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest">Identify</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest">Details</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest">Status</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeTab === 'orders' ? orders.map(o => (
                    <tr key={o.id} className="hover:bg-white/50 transition-colors group">
                      <td className="px-8 py-6"><p className="font-black text-[#1e3a5f]">{o.tracking_number}</p><p className="text-[10px] text-gray-400 font-bold uppercase">{o.market}</p></td>
                      <td className="px-8 py-6"><p className="font-bold text-sm">{o.name || o.email}</p><p className="text-xs text-gray-400">{o.retailer}</p></td>
                      <td className="px-8 py-6"><span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-blue-50 text-blue-600 border border-blue-100">{o.status.replace(/_/g, ' ')}</span></td>
                      <td className="px-8 py-6 text-right"><button onClick={() => setPaymentModal(o)} className="p-2 hover:bg-[#1e3a5f] hover:text-white rounded-xl transition-all"><DollarSign size={18}/></button></td>
                    </tr>
                  )) : users.map(u => (
                    <tr key={u.id} className="hover:bg-white/50 transition-colors">
                      <td className="px-8 py-6"><p className="font-black text-[#1e3a5f]">{u.name}</p><p className="text-[10px] font-mono text-orange-500 font-bold">{u.warehouse_id}</p></td>
                      <td className="px-8 py-6"><p className="text-sm font-bold">{u.email}</p><p className="text-xs text-gray-400">{u.phone}</p></td>
                      <td className="px-8 py-6"><span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${u.is_active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>{u.is_active ? 'Active' : 'Disabled'}</span></td>
                      <td className="px-8 py-6 text-right"><button className="text-xs font-black text-[#1e3a5f] hover:underline">Manage</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- PAYMENTS --- */}
        {activeTab === 'payments' && (
          <div className="space-y-8">
            <h2 className="text-3xl font-black text-[#1e3a5f] tracking-tighter">M-Pesa Verification</h2>
            <div className="grid gap-4">
              {pendingPayments.length === 0 ? (
                <div className={glassCard + " text-center py-20"}><CreditCard className="mx-auto text-gray-300 mb-4" size={48} /><p className="font-bold text-gray-400 uppercase text-xs tracking-widest">No pending transactions</p></div>
              ) : pendingPayments.map(p => (
                <div key={p.id} className={glassCard + " flex items-center justify-between"}>
                  <div><div className="flex items-center gap-3 mb-1"><span className="font-black text-lg">KES {p.amount.toLocaleString()}</span><span className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-md font-mono text-[10px] font-bold">{p.payment_reference}</span></div><p className="text-sm text-gray-500 font-bold">{p.name || p.email}</p></div>
                  <div className="flex gap-3"><button onClick={() => handleApprovePayment(p.id)} className="bg-emerald-500 text-white p-3 rounded-2xl hover:bg-emerald-600 shadow-lg"><CheckCircle size={20}/></button><button className="bg-rose-500 text-white p-3 rounded-2xl hover:bg-rose-600 shadow-lg"><XCircle size={20}/></button></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- TICKETS --- */}
        {activeTab === 'tickets' && (
          <div className="space-y-8">
            <h2 className="text-3xl font-black text-[#1e3a5f] tracking-tighter">Support Queue</h2>
            <div className="bg-white/70 backdrop-blur-xl border border-white rounded-[2.5rem] shadow-2xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-[#1e3a5f]/5">
                  <tr>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest">Subject</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest">Customer</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest">Priority</th>
                    <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tickets.map(t => (
                    <tr key={t.id} className="hover:bg-white/50 transition-colors">
                      <td className="px-8 py-6 font-bold text-sm">{t.subject}</td>
                      <td className="px-8 py-6 text-sm text-gray-500">{t.email}</td>
                      <td className="px-8 py-6"><span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${t.priority === 'high' ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'}`}>{t.priority}</span></td>
                      <td className="px-8 py-6 text-right font-black text-[#1e3a5f] text-sm uppercase">{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- EXCHANGE --- */}
        {activeTab === 'exchange' && (
          <div className="max-w-2xl mx-auto"><div className={glassCard + " space-y-8"}>
            <div className="flex items-center gap-4"><div className="p-4 bg-orange-50 text-[#f97316] rounded-2xl"><Globe size={32}/></div><div><h3 className="text-3xl font-black text-[#1e3a5f] tracking-tighter">Currency Engine</h3><p className="text-sm font-bold text-gray-400">Update global KES conversion rates</p></div></div>
            <form onSubmit={handleSaveRates} className="space-y-6">
              {Object.keys(exchangeRates).map(pair => (
                <div key={pair}><label className="text-[10px] font-black uppercase text-gray-400 ml-2 mb-1 block">{pair.replace('_', ' to ')}</label><input type="number" step="0.01" value={exchangeRates[pair]} onChange={(e) => setExchangeRates({...exchangeRates, [pair]: e.target.value})} className={inputClass}/></div>
              ))}
              <button type="submit" disabled={savingRates} className="bg-[#1e3a5f] text-white w-full py-5 rounded-[1.5rem] font-black text-lg shadow-xl">{savingRates ? 'Updating...' : 'Sync Global Rates'}</button>
            </form>
          </div></div>
        )}

        {/* --- MODALS --- */}
        {paymentModal && (
          <div className="fixed inset-0 bg-[#1e3a5f]/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-10 relative">
              <button onClick={() => setPaymentModal(null)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-red-500"><X /></button>
              <h3 className="text-3xl font-black text-[#1e3a5f] tracking-tighter mb-8">Request Payment</h3>
              <div className="space-y-6">
                <div><label className="text-[10px] font-black uppercase text-gray-400 ml-2 mb-1 block">Amount (KES)</label><input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className={inputClass} placeholder="0.00" /></div>
                <button onClick={handleRequestPayment} className="bg-[#1e3a5f] text-white w-full py-5 rounded-[1.5rem] font-black text-lg shadow-xl">Dispatch Secure Request</button>
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
                <button type="submit" disabled={creatingUser} className="bg-[#1e3a5f] text-white w-full py-5 rounded-[1.5rem] font-black text-lg mt-4">{creatingUser ? 'Provisioning...' : 'Create Account'}</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
