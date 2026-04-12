import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Phone, Copy, CheckCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/client'

export const PublicPayment = () => {
  const { orderId } = useParams()
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    payer_name: '',
    payer_phone: '',
    amount_paid: '',
    mpesa_message: '',
  })

  useEffect(() => {
    fetchOrder()
  }, [orderId])

  const fetchOrder = async () => {
    try {
      setLoading(true)
      const res = await api.get(`/payment/${orderId}`)
      if (res.data.success) {
        setOrder(res.data.order)
        setFormData((prev) => ({ ...prev, amount_paid: res.data.order.amount_due }))
      } else {
        toast.error(res.data.message || 'Failed to load order')
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load order details')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.payer_name || !formData.payer_phone || !formData.amount_paid || !formData.mpesa_message) {
      toast.error('Please fill in all fields')
      return
    }

    try {
      setSubmitting(true)
      const res = await api.post(`/payment/${orderId}/confirm`, {
        mpesa_message: formData.mpesa_message,
        amount: parseFloat(formData.amount_paid),
        payer_name: formData.payer_name,
        payer_phone: formData.payer_phone,
      })

      if (res.data.success) {
        setSubmitted(true)
        toast.success('Payment submitted successfully!')
      } else {
        toast.error(res.data.message || 'Failed to submit payment')
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit payment')
    } finally {
      setSubmitting(false)
    }
  }

  // Helper component for the liquid backgrounds to keep code DRY across screens
  const LiquidBackgrounds = () => (
    <>
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-blue-300/30 rounded-full blur-[100px] animate-morph mix-blend-multiply pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-orange-300/20 rounded-full blur-[100px] animate-morph mix-blend-multiply pointer-events-none" />
      <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[40vw] h-[40vw] max-w-[400px] max-h-[400px] bg-indigo-200/20 rounded-full blur-[120px] animate-morph mix-blend-multiply pointer-events-none" />
    </>
  )

  if (loading) {
    return (
      <div className="min-h-screen relative bg-slate-50 overflow-hidden flex items-center justify-center font-sans">
        <LiquidBackgrounds />
        <div className="text-center relative z-10">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
          <p className="mt-4 text-slate-600 font-bold tracking-tight">Loading order details...</p>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen relative bg-slate-50 overflow-hidden flex items-center justify-center p-4 font-sans">
        <LiquidBackgrounds />
        <div className="rounded-[24px] p-[1px] bg-gradient-to-br from-red-300/60 via-white/20 to-red-400/60 shadow-2xl max-w-md w-full relative z-10">
          <div className="bg-white/60 backdrop-blur-3xl rounded-[23px] p-10 text-center relative overflow-hidden glass-sheen">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-400/10 rounded-full blur-[40px] pointer-events-none" />
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-6" />
            <h2 className="text-3xl font-black text-[#1e3a5f] tracking-tighter leading-none mb-3">Order Not Found</h2>
            <p className="text-slate-600 font-medium">The order you're looking for doesn't exist or is no longer available.</p>
          </div>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen relative bg-slate-50 overflow-hidden flex items-center justify-center p-4 font-sans">
        <LiquidBackgrounds />
        <div className="rounded-[24px] p-[1px] bg-gradient-to-br from-green-300/60 via-white/20 to-emerald-300/60 shadow-2xl max-w-md w-full relative z-10">
          <div className="bg-white/60 backdrop-blur-3xl rounded-[23px] p-10 text-center relative overflow-hidden glass-sheen">
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-400/10 rounded-full blur-[40px] pointer-events-none" />
            <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-6" />
            <h2 className="text-3xl font-black text-[#1e3a5f] tracking-tighter leading-none mb-3">Payment Submitted</h2>
            <p className="text-slate-600 font-medium mb-6">Your payment has been submitted successfully. Our team will review and approve it shortly. You'll receive a confirmation email once it's processed.</p>
            <div className="bg-white/50 backdrop-blur-md rounded-xl p-4 border border-white/60 shadow-sm">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Tracking Number</p>
              <p className="text-xl font-black text-[#1e3a5f] tracking-tight">{order.tracking_number}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative bg-slate-50 overflow-hidden py-12 px-4 font-sans">
      <LiquidBackgrounds />
      
      <div className="max-w-2xl mx-auto relative z-10">
        {/* Header - Refined Typography */}
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-black text-[#1e3a5f] mb-3 leading-none tracking-tighter">
            <span>Thapsus</span><span className="text-orange-500">Cargo</span>
          </h1>
          <p className="text-slate-600 font-bold tracking-tight text-lg">Complete Your Payment</p>
        </div>

        {/* Order Summary - Dark Glass Bento */}
        <div className="group relative overflow-hidden bg-[#0f172a]/90 backdrop-blur-2xl border border-white/10 rounded-[24px] p-8 md:p-10 text-white shadow-2xl mb-8 transition-transform duration-500 hover:-rotate-1 hover:scale-[1.02] transform perspective-1000 glass-sheen">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-orange-500/30 rounded-full blur-[80px] pointer-events-none" />
          
          <div className="relative z-10">
            <h2 className="text-2xl font-black tracking-tighter leading-none mb-8">Order Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-white/5 rounded-xl p-4 border border-white/10 backdrop-blur-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Tracking Number</p>
                <p className="text-xl font-black text-white tracking-tight">{order.tracking_number}</p>
              </div>
              <div className="bg-gradient-to-br from-orange-500/20 to-rose-600/10 rounded-xl p-4 border border-orange-500/30 backdrop-blur-md">
                <p className="text-xs font-bold text-orange-300 uppercase tracking-widest mb-1">Amount Due</p>
                <p className="text-2xl font-black text-orange-400 tracking-tighter">KES {order.amount_due.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* M-Pesa Instructions - Border Gradient (Step 4 Style) */}
        <div className="rounded-[24px] p-[1px] bg-gradient-to-br from-blue-300/60 via-white/20 to-orange-300/60 shadow-xl mb-8 transform transition-transform hover:scale-[1.01] duration-500">
          <div className="bg-white/60 backdrop-blur-3xl rounded-[23px] p-8 md:p-10 relative overflow-hidden glass-sheen">
            <div className="absolute top-0 right-0 w-48 h-48 bg-blue-400/10 rounded-full blur-[50px] pointer-events-none" />
            
            <h3 className="text-2xl font-black text-[#1e3a5f] tracking-tighter leading-none mb-6 relative z-10">M-Pesa Payment Instructions</h3>
            <ol className="space-y-4 text-slate-700 font-medium relative z-10">
              <li className="flex items-start bg-white/40 p-4 rounded-xl border border-white/50 backdrop-blur-sm">
                <span className="font-black text-orange-500 text-lg leading-none mr-4">1.</span>
                <span>Open your M-Pesa App or dial <strong className="text-[#1e3a5f] font-black">*134#</strong> on your phone</span>
              </li>
              <li className="flex items-start bg-white/40 p-4 rounded-xl border border-white/50 backdrop-blur-sm">
                <span className="font-black text-orange-500 text-lg leading-none mr-4">2.</span>
                <span>Select <strong className="text-[#1e3a5f] font-black">Lipa na M-Pesa Online</strong> or similar option</span>
              </li>
              <li className="flex items-start bg-white/40 p-4 rounded-xl border border-white/50 backdrop-blur-sm">
                <span className="font-black text-orange-500 text-lg leading-none mr-4">3.</span>
                <span>Enter the Paybill: <strong className="text-[#1e3a5f] font-black text-lg tracking-tight">XXXXXX</strong></span>
              </li>
              <li className="flex items-start bg-white/40 p-4 rounded-xl border border-white/50 backdrop-blur-sm">
                <span className="font-black text-orange-500 text-lg leading-none mr-4">4.</span>
                <span className="break-all">Enter Account Number: <strong className="text-[#1e3a5f] font-black text-lg tracking-tight">{order.tracking_number}</strong></span>
              </li>
              <li className="flex items-start bg-white/40 p-4 rounded-xl border border-white/50 backdrop-blur-sm">
                <span className="font-black text-orange-500 text-lg leading-none mr-4">5.</span>
                <span>Enter Amount: <strong className="text-[#1e3a5f] font-black text-lg tracking-tight">KES {order.amount_due.toLocaleString()}</strong></span>
              </li>
              <li className="flex items-start bg-white/40 p-4 rounded-xl border border-white/50 backdrop-blur-sm">
                <span className="font-black text-orange-500 text-lg leading-none mr-4">6.</span>
                <span>Enter your M-Pesa PIN and complete the transaction</span>
              </li>
              <li className="flex items-start bg-white/40 p-4 rounded-xl border border-white/50 backdrop-blur-sm">
                <span className="font-black text-orange-500 text-lg leading-none mr-4">7.</span>
                <span>Copy the confirmation message and paste it below</span>
              </li>
            </ol>
          </div>
        </div>

        {/* Payment Form - Crystal Borders */}
        <div className="bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[24px] p-8 md:p-10 relative overflow-hidden glass-sheen mb-8">
          <h3 className="text-2xl font-black text-[#1e3a5f] tracking-tighter leading-none mb-8 relative z-10">Submit Payment Details</h3>
          
          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Your Full Name</label>
              <input
                type="text"
                name="payer_name"
                value={formData.payer_name}
                onChange={handleChange}
                placeholder="Enter your full name"
                className="w-full px-4 py-3 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-slate-800 font-bold transition-all placeholder-slate-400 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Your Phone Number</label>
              <input
                type="tel"
                name="payer_phone"
                value={formData.payer_phone}
                onChange={handleChange}
                placeholder="e.g., +254712345678"
                className="w-full px-4 py-3 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-slate-800 font-bold transition-all placeholder-slate-400 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Amount Paid (KES)</label>
              <input
                type="number"
                name="amount_paid"
                value={formData.amount_paid}
                onChange={handleChange}
                placeholder={order.amount_due}
                className="w-full px-4 py-3 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-slate-800 font-bold transition-all placeholder-slate-400 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">M-Pesa Confirmation Message</label>
              <p className="text-[10px] font-bold text-slate-400 tracking-wide uppercase mb-3">Paste the complete SMS you received from M-Pesa</p>
              <textarea
                name="mpesa_message"
                value={formData.mpesa_message}
                onChange={handleChange}
                placeholder="e.g., ABC123DEF Confirmed. You have received KES 5,000 from John Doe on 04/01/2026 at 14:30. New M-Pesa balance is KES 10,000.00"
                rows={4}
                className="w-full px-4 py-3 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-slate-800 font-mono text-sm font-bold transition-all placeholder-slate-400 shadow-sm resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="group relative overflow-hidden w-full bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-4 rounded-xl font-black tracking-tight transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 glass-sheen disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
              <span className="relative z-10">{submitting ? 'Submitting...' : 'Submit Payment'}</span>
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="bg-white/30 backdrop-blur-md border border-white/40 rounded-2xl p-6 text-center text-sm text-slate-600 font-semibold shadow-sm">
          <p className="mb-2">Questions? Contact our support team</p>
          <p className="flex items-center justify-center text-[#1e3a5f] font-black tracking-tight text-base">
            <Phone className="w-4 h-4 mr-2" />
            +254 (0) 700 000 000
          </p>
        </div>
      </div>
    </div>
  )
}
