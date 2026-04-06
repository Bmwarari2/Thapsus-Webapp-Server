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
  const [paymentModal, setPaymentModal] = useState(null) // { orderId, trackingNumber }
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  // Cancel order modal
  const [cancelModal, setCancelModal] = useState(null) // { orderId, trackingNumber }
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
  // Create user/admin account state
  const [showCreateUserForm, setShowCreateUserForm] = useState(false)
  const [createUserForm, setCreateUserForm] = useState({
    name: '', email: '', phone: '', role: 'customer'
  })
  const [creatingUser, setCreatingUser] = useState(false)
  // Payment reminder modal
  const [reminderModal, setReminderModal] = useState(null) // { orderId, trackingNumber }
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
  // Email logs (for user detail panel)

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
      // Also fetch error log stats for the badge
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

  // Error logs fetcher
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
  
// Password change handler
const handlePasswordChange = async (e) => {
  e.preventDefault();
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    toast.error('Passwords do not match');
    return;
  }
  try {
    const res = await adminApi.updateAdminPassword(passwordForm);
    toast.success(res.data?.message || 'Password updated');
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
  } catch (err) {
    toast.error(err.response?.data?.error || 'Failed to update password');
  }
};

// Exchange rate handlers
const handleRateChange = (rate, value) => {
  setExchangeRates(prev => ({ ...prev, [rate]: value }));
};

const handleSaveRates = async () => {
  setSavingRates(true);
  try {
    const res = await adminApi.updateExchangeRates(exchangeRates);
    toast.success(res.data?.message || 'Rates updated');
    setRatesLastUpdated(new Date());
  } catch (err) {
    toast.error(err.response?.data?.error || 'Failed to save rates');
  } finally {
    setSavingRates(false);
  }
};

// User order handlers
const handleCreateUserOrder = async (e) => {
  e.preventDefault();
  setCreatingUserOrder(true);
  try {
    const payload = {
      ...userOrderForm,
      dimensions: { ...userOrderForm.dimensions },
      insurance: userOrderForm.insurance || false,
    };
    const res = await adminApi.createOrderForUser(selectedUser._id, payload);
    toast.success(res.data?.message || 'Order created');
    setShowUserOrderForm(false);
    fetchOrders(1);
  } catch (err) {
    toast.error(err.response?.data?.error || 'Failed to create order');
  } finally {
    setCreatingUserOrder(false);
  }
};

// User detail panel handlers
const handleSelectUser = async (user) => {
  setSelectedUser(user);
  setLoadingUser(true);
  try {
    const res = await adminApi.getUserDetail(user._id);
    setSelectedUserData(res.data?.user || {});
  } catch (err) {
    toast.error('Failed to load user details');
  } finally {
    setLoadingUser(false);
  }
};

const handleApprovePayment = async (paymentId) => {
  setApprovingPayment(paymentId);
  try {
    await adminApi.approvePayment(paymentId);
    toast.success('Payment approved');
    fetchPendingPayments();
  } catch (err) {
    toast.error(err.response?.data?.error || 'Failed to approve');
  } finally {
    setApprovingPayment(null);
  }
};

const handleRejectPayment = async (paymentId) => {
  setApprovingPayment(paymentId);
  try {
    await adminApi.rejectPayment(paymentId);
    toast.success('Payment rejected');
    fetchPendingPayments();
  } catch (err) {
    toast.error(err.response?.data?.error || 'Failed to reject');
  } finally {
    setApprovingPayment(null);
  }
};

// Reminder handlers
const handleSendReminder = async () => {
  try {
    await adminApi.sendPaymentReminder(reminderModal.orderId, reminderAmount, reminderNotes);
    toast.success('Reminder sent');
    setReminderModal(null);
  } catch (err) {
    toast.error(err.response?.data?.error || 'Failed to send reminder');
  }
};

// Support ticket handlers
const handleAssignTicket = async (ticketId, assignedTo) => {
  try {
    await adminApi.assignTicket(ticketId, assignedTo);
    toast.success('Ticket assigned');
    fetchTickets(1);
  } catch (err) {
    toast.error('Failed to assign ticket');
  }
};

const handleUpdateTicketStatus = async (ticketId, status) => {
  try {
    await adminApi.updateTicketStatus(ticketId, status);
    toast.success('Status updated');
    fetchTickets(1);
  } catch (err) {
    toast.error('Failed to update status');
  }
};

// User admin handlers
const handleCreateUser = async (e) => {
  e.preventDefault();
  setCreatingUser(true);
  try {
    const payload = {
      name: createUserForm.name,
      email: createUserForm.email,
      phone: createUserForm.phone,
      role: createUserForm.role,
    };
    const res = await adminApi.createUser(payload);
    toast.success(res.data?.message || 'User created');
    setShowCreateUserForm(false);
    setCreateUserForm({ name: '', email: '', phone: '', role: 'customer' });
    fetchUsers(1);
  } catch (err) {
    toast.error(err.response?.data?.error || 'Failed to create user');
  } finally {
    setCreatingUser(false);
  }
};

const handleUpdateUser = async (userId, updates) => {
  try {
    await adminApi.updateUser(userId, updates);
    toast.success('User updated');
    fetchUsers(errorLogPage);
  } catch (err) {
    toast.error('Failed to update user');
  }
};

const handleDeleteUser = async (userId) => {
  if (!window.confirm('Are you sure you want to delete this user?')) return;
  try {
    await adminApi.deleteUser(userId);
    toast.success('User deleted');
    fetchUsers(errorLogPage);
  } catch (err) {
    toast.error('Failed to delete user');
  }
};

// Revenue/Stats handlers
const handleExportStats = async (format = 'csv') => {
  try {
    const res = await adminApi.exportStats(format);
    const blob = new Blob([res.data], { type: res.headers['content-type'] });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `swiftcargo-stats.${format}`;
    link.click();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    toast.error('Failed to export stats');
  }
};

// Error log filter handlers
const handleFilterErrorLogs = (newFilters) => {
  setErrorLogFilter(prev => ({ ...prev, ...newFilters }));
  fetchErrorLogs(1, { ...errorLogFilter, ...newFilters });
};

const handleViewProof = (proofUrl) => {
  setExpandedProof(proofUrl);
};

// Order handlers
const handleUpdateOrderStatus = async (orderId, status) => {
  try {
    await adminApi.updateOrderStatus(orderId, status);
    toast.success('Order status updated');
    fetchOrders(ordersPage);
  } catch (err) {
    toast.error('Failed to update order status');
  }
};

const handleApproveOrder = async (orderId) => {
  try {
    await adminApi.approveOrder(orderId);
    toast.success('Order approved');
    fetchOrders(ordersPage);
  } catch (err) {
    toast.error('Failed to approve order');
  }
};

const handleRejectOrder = async (orderId, reason) => {
  try {
    await adminApi.rejectOrder(orderId, reason);
    toast.success('Order rejected');
    fetchOrders(ordersPage);
  } catch (err) {
    toast.error('Failed to reject order');
  }
};

// ============ RENDER ============
if (loading) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="text-xl text-gray-600">Loading admin dashboard...</div>
    </div>
  );
}

return (
  <div className="min-h-screen bg-gray-100">
    {/* Top bar */}
    <header className="bg-blue-900 text-white py-4 px-6 flex justify-between items-center shadow">
      <div className="flex items-center gap-4">
        <button
          onClick={() => window.location.href = '/dashboard'}
          className="text-sm bg-blue-800 hover:bg-blue-700 px-3 py-1 rounded"
        >
          Back to User Dashboard
        </button>
        <h1 className="text-2xl font-bold">Admin Panel</h1>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-blue-200">
          {users.length} users | {orders.length} orders
        </span>
        <span className="text-sm text-blue-200">Admin</span>
      </div>
    </header>

    <div className="flex">
      {/* Sidebar */}
      <nav className="w-64 bg-white shadow-lg min-h-screen">
        <div className="p-4">
          <h2 className="font-semibold text-gray-700 mb-4">Navigation</h2>
          <ul className="space-y-2">
            <li>
              <button
                onClick={() => setActiveTab('overview')}
                className={`w-full text-left px-3 py-2 rounded ${activeTab === 'overview' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
              >
                Overview
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('users')}
                className={`w-full text-left px-3 py-2 rounded ${activeTab === 'users' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
              >
                Users
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('orders')}
                className={`w-full text-left px-3 py-2 rounded ${activeTab === 'orders' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
              >
                Orders
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('payments')}
                className={`w-full text-left px-3 py-2 rounded ${activeTab === 'payments' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
              >
                Payments
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('revenue')}
                className={`w-full text-left px-3 py-2 rounded ${activeTab === 'revenue' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
              >
                Revenue
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('tickets')}
                className={`w-full text-left px-3 py-2 rounded ${activeTab === 'tickets' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
              >
                Support Tickets
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('exchange')}
                className={`w-full text-left px-3 py-2 rounded ${activeTab === 'exchange' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
              >
                Exchange Rates
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('settings')}
                className={`w-full text-left px-3 py-2 rounded ${activeTab === 'settings' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
              >
                Admin Settings
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('errorLogs')}
                className={`w-full text-left px-3 py-2 rounded ${activeTab === 'errorLogs' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
              >
                Error Logs
              </button>
            </li>
          </ul>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Dashboard Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm text-gray-500">Total Users</h3>
                <p className="text-3xl font-bold text-blue-600">{users.length}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm text-gray-500">Total Orders</h3>
                <p className="text-3xl font-bold text-green-600">{orders.length}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm text-gray-500">Pending Payments</h3>
                <p className="text-3xl font-bold text-orange-600">{pendingPayments.length}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm text-gray-500">Support Tickets</h3>
                <p className="text-3xl font-bold text-purple-600">{tickets.length}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold mb-4">Recent Orders</h3>
                {orders.slice(0, 5).map((order, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm">{order.trackingNumber || 'N/A'}</span>
                    <span className={`text-xs px-2 py-1 rounded ${order.status === 'delivered' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {order.status}
                    </span>
                  </div>
                ))}
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold mb-4">Pending Payments</h3>
                {pendingPayments.slice(0, 5).map((payment, idx) => (
                  <div key={idx} className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm">{payment.orderId?.trackingNumber || 'N/A'}</span>
                    <span className="text-sm text-orange-600">{payment.amount} {payment.currency}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Users Management</h2>
              <button
                onClick={() => setShowCreateUserForm(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                + Create User
              </button>
            </div>
            {showCreateUserForm && (
              <div className="bg-white p-6 rounded-lg shadow mb-6">
                <h3 className="text-lg font-semibold mb-4">Create New User</h3>
                <form onSubmit={handleCreateUser} className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Name"
                    value={createUserForm.name}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, name: e.target.value })}
                    className="border p-2 rounded"
                    required
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={createUserForm.email}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, email: e.target.value })}
                    className="border p-2 rounded"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Phone"
                    value={createUserForm.phone}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, phone: e.target.value })}
                    className="border p-2 rounded"
                  />
                  <select
                    value={createUserForm.role}
                    onChange={(e) => setCreateUserForm({ ...createUserForm, role: e.target.value })}
                    className="border p-2 rounded"
                  >
                    <option value="customer">Customer</option>
                    <option value="agent">Agent</option>
                    <option value="admin">Admin</option>
                  </select>
                  <div className="col-span-2 flex gap-2">
                    <button type="submit" disabled={creatingUser} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                      {creatingUser ? 'Creating...' : 'Create User'}
                    </button>
                    <button type="button" onClick={() => setShowCreateUserForm(false)} className="bg-gray-300 px-4 py-2 rounded">
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-4">Name</th>
                    <th className="text-left p-4">Email</th>
                    <th className="text-left p-4">Phone</th>
                    <th className="text-left p-4">Role</th>
                    <th className="text-left p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, idx) => (
                    <tr key={idx} className="border-t hover:bg-gray-50">
                      <td className="p-4">{user.name}</td>
                      <td className="p-4">{user.email}</td>
                      <td className="p-4">{user.phone || 'N/A'}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs ${user.role === 'admin' ? 'bg-red-100 text-red-700' : user.role === 'agent' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="p-4">
                        <button onClick={() => handleSelectUser(user)} className="text-blue-600 hover:underline mr-2">View</button>
                        <button onClick={() => handleDeleteUser(user._id)} className="text-red-600 hover:underline">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Orders Management</h2>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-4">Tracking #</th>
                    <th className="text-left p-4">Customer</th>
                    <th className="text-left p-4">Status</th>
                    <th className="text-left p-4">Weight</th>
                    <th className="text-left p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, idx) => (
                    <tr key={idx} className="border-t hover:bg-gray-50">
                      <td className="p-4">{order.trackingNumber || 'N/A'}</td>
                      <td className="p-4">{order.userId?.name || 'N/A'}</td>
                      <td className="p-4">
                        <select
                          value={order.status}
                          onChange={(e) => handleUpdateOrderStatus(order._id, e.target.value)}
                          className="border p-1 rounded text-sm"
                        >
                          <option value="pending">Pending</option>
                          <option value="approved">Approved</option>
                          <option value="processing">Processing</option>
                          <option value="shipped">Shipped</option>
                          <option value="delivered">Delivered</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                      <td className="p-4">{order.weight_kg || 'N/A'} kg</td>
                      <td className="p-4">
                        {order.status === 'pending' && (
                          <>
                            <button onClick={() => handleApproveOrder(order._id)} className="text-green-600 hover:underline mr-2">Approve</button>
                            <button onClick={() => handleRejectOrder(order._id, 'Not approved')} className="text-red-600 hover:underline">Reject</button>
                          </>
                        )}
                        <button onClick={() => window.location.href = `/order/${order._id}`} className="text-blue-600 hover:underline ml-2">View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Payments Tab */}
        {activeTab === 'payments' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Payments Management</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Pending Payments</h3>
                {pendingPayments.length === 0 ? (
                  <p className="text-gray-500">No pending payments</p>
                ) : (
                  <div className="space-y-4">
                    {pendingPayments.map((payment, idx) => (
                      <div key={idx} className="border p-4 rounded">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{payment.orderId?.trackingNumber || 'N/A'}</p>
                            <p className="text-sm text-gray-600">{payment.userId?.name || 'N/A'}</p>
                            <p className="text-lg font-bold text-orange-600">{payment.amount} {payment.currency}</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApprovePayment(payment._id)}
                              disabled={approvingPayment === payment._id}
                              className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                            >
                              {approvingPayment === payment._id ? '...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => handleRejectPayment(payment._id)}
                              disabled={approvingPayment === payment._id}
                              className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Send Payment Reminder</h3>
                {reminderModal ? (
                  <div>
                    <p className="text-sm text-gray-600 mb-4">Sending reminder for order {reminderModal.orderId}</p>
                    <input
                      type="number"
                      placeholder="Amount"
                      value={reminderAmount}
                      onChange={(e) => setReminderAmount(e.target.value)}
                      className="border p-2 rounded w-full mb-2"
                    />
                    <textarea
                      placeholder="Notes"
                      value={reminderNotes}
                      onChange={(e) => setReminderNotes(e.target.value)}
                      className="border p-2 rounded w-full mb-4"
                    />
                    <div className="flex gap-2">
                      <button onClick={handleSendReminder} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Send</button>
                      <button onClick={() => setReminderModal(null)} className="bg-gray-300 px-4 py-2 rounded">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">Select a pending payment to send a reminder</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Revenue Tab */}
        {activeTab === 'revenue' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Revenue & Analytics</h2>
              <div className="flex gap-2">
                <button onClick={() => handleExportStats('csv')} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Export CSV</button>
                <button onClick={() => handleExportStats('pdf')} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">Export PDF</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm text-gray-500">Total Revenue</h3>
                <p className="text-3xl font-bold text-green-600">{orders.reduce((sum, o) => sum + (o.total_price || 0), 0).toFixed(2)} GBP</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm text-gray-500">Pending Revenue</h3>
                <p className="text-3xl font-bold text-orange-600">{pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0).toFixed(2)}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm text-gray-500">Avg Order Value</h3>
                <p className="text-3xl font-bold text-blue-600">
                  {orders.length > 0 ? (orders.reduce((sum, o) => sum + (o.total_price || 0), 0) / orders.length).toFixed(2) : '0'} GBP
                </p>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Revenue by Market</h3>
              <div className="space-y-4">
                {['UK', 'USA', 'EU', 'Asia', 'Other'].map((market) => {
                  const marketOrders = orders.filter(o => o.market === market);
                  const revenue = marketOrders.reduce((sum, o) => sum + (o.total_price || 0), 0);
                  return (
                    <div key={market} className="flex justify-between items-center">
                      <span>{market}</span>
                      <span className="font-medium">{marketOrders.length} orders - {revenue.toFixed(2)} GBP</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Support Tickets Tab */}
        {activeTab === 'tickets' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Support Tickets</h2>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-4">Subject</th>
                    <th className="text-left p-4">Customer</th>
                    <th className="text-left p-4">Status</th>
                    <th className="text-left p-4">Priority</th>
                    <th className="text-left p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket, idx) => (
                    <tr key={idx} className="border-t hover:bg-gray-50">
                      <td className="p-4">
                        <p className="font-medium">{ticket.subject}</p>
                        <p className="text-sm text-gray-500">{ticket.description?.substring(0, 50)}...</p>
                      </td>
                      <td className="p-4">{ticket.userId?.name || 'N/A'}</td>
                      <td className="p-4">
                        <select
                          value={ticket.status}
                          onChange={(e) => handleUpdateTicketStatus(ticket._id, e.target.value)}
                          className="border p-1 rounded text-sm"
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs ${ticket.priority === 'high' ? 'bg-red-100 text-red-700' : ticket.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                          {ticket.priority || 'low'}
                        </span>
                      </td>
                      <td className="p-4">
                        <button onClick={() => handleAssignTicket(ticket._id, 'admin')} className="text-blue-600 hover:underline mr-2">Assign</button>
                        <button onClick={() => window.location.href = `/support/ticket/${ticket._id}`} className="text-green-600 hover:underline">View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Exchange Rates Tab */}
        {activeTab === 'exchange' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Exchange Rates</h2>
            <div className="bg-white p-6 rounded-lg shadow max-w-2xl">
              <p className="text-sm text-gray-500 mb-4">All rates are against KES (Kenyan Shilling)</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">USD to KES</label>
                  <input
                    type="number"
                    step="0.01"
                    value={exchangeRates.USD_KES}
                    onChange={(e) => handleRateChange('USD_KES', e.target.value)}
                    className="mt-1 border p-2 rounded w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">GBP to KES</label>
                  <input
                    type="number"
                    step="0.01"
                    value={exchangeRates.GBP_KES}
                    onChange={(e) => handleRateChange('GBP_KES', e.target.value)}
                    className="mt-1 border p-2 rounded w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">EUR to KES</label>
                  <input
                    type="number"
                    step="0.01"
                    value={exchangeRates.EUR_KES}
                    onChange={(e) => handleRateChange('EUR_KES', e.target.value)}
                    className="mt-1 border p-2 rounded w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">CNY to KES</label>
                  <input
                    type="number"
                    step="0.01"
                    value={exchangeRates.CNY_KES}
                    onChange={(e) => handleRateChange('CNY_KES', e.target.value)}
                    className="mt-1 border p-2 rounded w-full"
                  />
                </div>
              </div>
              <div className="mt-6 flex items-center gap-4">
                <button
                  onClick={handleSaveRates}
                  disabled={savingRates}
                  className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
                >
                  {savingRates ? 'Saving...' : 'Save Rates'}
                </button>
                {ratesLastUpdated && (
                  <span className="text-sm text-gray-500">
                    Last updated: {new Date(ratesLastUpdated).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Admin Settings</h2>
            <div className="bg-white p-6 rounded-lg shadow max-w-xl">
              <h3 className="text-lg font-semibold mb-4">Change Password</h3>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Current Password</label>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    className="mt-1 border p-2 rounded w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">New Password</label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    className="mt-1 border p-2 rounded w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    className="mt-1 border p-2 rounded w-full"
                    required
                  />
                </div>
                <button type="submit" disabled={changingPassword} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
                  {changingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </div>
            <div className="bg-white p-6 rounded-lg shadow max-w-xl mt-6">
              <h3 className="text-lg font-semibold mb-4">Platform Settings</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-700">Enable User Registration</span>
                  <input type="checkbox" defaultChecked className="h-4 w-4" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-700">Enable Email Notifications</span>
                  <input type="checkbox" defaultChecked className="h-4 w-4" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-700">Maintenance Mode</span>
                  <input type="checkbox" className="h-4 w-4" />
                </div>
              </div>
              <button className="mt-4 bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
                Save Settings
              </button>
            </div>
          </div>
        )}

        {/* Error Logs Tab */}
        {activeTab === 'errorLogs' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Error Logs</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => handleClearErrorLogs(7)}
                  className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700"
                >
                  Clear Logs (7 days)
                </button>
                <button
                  onClick={() => handleClearErrorLogs(30)}
                  className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                >
                  Clear Logs (30 days)
                </button>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow mb-4">
              <div className="flex gap-4 flex-wrap">
                <select
                  value={errorLogFilter.level}
                  onChange={(e) => handleFilterErrorLogs({ level: e.target.value })}
                  className="border p-2 rounded"
                >
                  <option value="">All Levels</option>
                  <option value="error">Error</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
                <select
                  value={errorLogFilter.source}
                  onChange={(e) => handleFilterErrorLogs({ source: e.target.value })}
                  className="border p-2 rounded"
                >
                  <option value="">All Sources</option>
                  <option value="api">API</option>
                  <option value="frontend">Frontend</option>
                  <option value="payment">Payment</option>
                  <option value="order">Order</option>
                </select>
                <input
                  type="text"
                  placeholder="Search..."
                  value={errorLogFilter.search}
                  onChange={(e) => handleFilterErrorLogs({ search: e.target.value })}
                  className="border p-2 rounded flex-1"
                />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              {errorLogStats && (
                <div className="p-4 bg-gray-50 border-b flex gap-6">
                  <span className="text-red-600">Errors: {errorLogStats.errors || 0}</span>
                  <span className="text-yellow-600">Warnings: {errorLogStats.warnings || 0}</span>
                  <span className="text-blue-600">Info: {errorLogStats.info || 0}</span>
                </div>
              )}
              {loadingErrorLogs ? (
                <p className="p-4 text-center text-gray-500">Loading...</p>
              ) : errorLogs.length === 0 ? (
                <p className="p-4 text-center text-gray-500">No error logs found</p>
              ) : (
                <>
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-4">Level</th>
                        <th className="text-left p-4">Source</th>
                        <th className="text-left p-4">Message</th>
                        <th className="text-left p-4">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errorLogs.map((log, idx) => (
                        <tr key={idx} className="border-t hover:bg-gray-50">
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded text-xs ${log.level === 'error' ? 'bg-red-100 text-red-700' : log.level === 'warning' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                              {log.level}
                            </span>
                          </td>
                          <td className="p-4">{log.source}</td>
                          <td className="p-4 text-sm">{log.message}</td>
                          <td className="p-4 text-sm text-gray-500">{new Date(log.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="p-4 flex justify-between items-center">
                    <button
                      disabled={errorLogPage <= 1}
                      onClick={() => fetchErrorLogs(errorLogPage - 1)}
                      className="px-4 py-2 border rounded disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-500">
                      Page {errorLogPage} of {errorLogTotalPages}
                    </span>
                    <button
                      disabled={errorLogPage >= errorLogTotalPages}
                      onClick={() => fetchErrorLogs(errorLogPage + 1)}
                      className="px-4 py-2 border rounded disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>

    {/* Expanded proof modal */}
    {expandedProof && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setExpandedProof(null)}>
        <div className="bg-white p-4 rounded max-w-lg max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-semibold mb-4">Payment Proof</h3>
          <img src={expandedProof} alt="Payment proof" className="w-full" />
          <button onClick={() => setExpandedProof(null)} className="mt-4 bg-gray-300 px-4 py-2 rounded">Close</button>
        </div>
      </div>
    )}
  </div>
);
}

export default AdminDashboard;

  const [emailLogs, setEmailLogs] = useState([])
  // Error logs (developer tools)
  const [errorLogs, setErrorLogs] = useState([])
  const [errorLogStats, setErrorLogStats] = useState(null)
  const [errorLogPage, setErrorLogPage] = useState(1)
  const [errorLogTotal, setErrorLogTotal] = useState(0)
  const [errorLogTotalPages, setErrorLogTotalPages] = useState(0)
  const [errorLogFilter, setErrorLogFilter] = useState({ level: '', source: '', search: '' })
  const [loadingErrorLogs, setLoadingErrorLogs] = useState(false)
  const [expandedError, setExpandedError] = useState(null)
