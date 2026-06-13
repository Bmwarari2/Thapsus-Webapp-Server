import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Phone, CheckCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/client'
import { PillLabel } from '../components/ui'

const Shell = ({ children, center = false }) => (
  <div className={`relative min-h-[calc(100vh-4rem)] px-4 py-12 overflow-hidden ${center ? 'flex items-center justify-center' : ''}`}>
    <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[44rem] h-[44rem] bg-ember-radial blur-2xl pointer-events-none" />
    <div className="relative z-10 w-full">{children}</div>
  </div>
)

export const PublicPayment = () => {
  const { orderId } = useParams()
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({ payer_name: '', payer_phone: '', amount_paid: '', mpesa_message: '' })

  useEffect(() => { fetchOrder() }, [orderId])

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
      toast.error('Please fill in all fields'); return
    }
    try {
      setSubmitting(true)
      const res = await api.post(`/payment/${orderId}/confirm`, {
        mpesa_message: formData.mpesa_message,
        amount: parseFloat(formData.amount_paid),
        payer_name: formData.payer_name,
        payer_phone: formData.payer_phone,
      })
      if (res.data.success) { setSubmitted(true); toast.success('Payment submitted successfully!') }
      else toast.error(res.data.message || 'Failed to submit payment')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit payment')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <Shell center><div className="text-center"><div className="spinner w-12 h-12 mx-auto" /><p className="mt-4 text-mute">Loading order details…</p></div></Shell>
  }

  if (!order) {
    return (
      <Shell center>
        <div className="glow-card max-w-md mx-auto w-full p-10 text-center animate-slide-up">
          <span className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 border border-red-500/20 grid place-items-center"><AlertCircle className="text-red-400" size={36} /></span>
          <h2 className="text-2xl font-bold text-white mb-2">Order not found</h2>
          <p className="text-mute">The order you're looking for doesn't exist or is no longer available.</p>
        </div>
      </Shell>
    )
  }

  if (submitted) {
    return (
      <Shell center>
        <div className="glow-card max-w-md mx-auto w-full p-10 text-center animate-slide-up">
          <span className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 grid place-items-center"><CheckCircle className="text-emerald-400" size={36} /></span>
          <h2 className="text-2xl font-bold text-white mb-2">Payment submitted</h2>
          <p className="text-mute mb-6">Your payment has been submitted. Our team will review and approve it shortly. You'll receive a confirmation email once it's processed.</p>
          <div className="rounded-2xl bg-surface-2 border border-line p-4">
            <p className="text-[11px] font-semibold text-mute uppercase tracking-widest mb-1">Tracking number</p>
            <p className="text-xl font-bold text-white">{order.tracking_number}</p>
          </div>
        </div>
      </Shell>
    )
  }

  const steps = [
    <>Open your M-Pesa App or dial <strong className="text-white">*134#</strong> on your phone</>,
    <>Select <strong className="text-white">Lipa na M-Pesa</strong>, then <strong className="text-white">Buy Goods and Services</strong></>,
    <><span>Enter Till Number: <strong className="text-white text-lg">5530500</strong></span><p className="text-xs text-mute mt-1">Account name: <strong className="text-white/80">Brian Wanderi</strong></p></>,
    <>Enter Amount: <strong className="text-white text-lg">KES {order.amount_due.toLocaleString()}</strong></>,
    <>Enter your M-Pesa PIN and complete the transaction</>,
    <>Copy the confirmation message and paste it below</>,
  ]

  return (
    <Shell>
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10 space-y-4">
          <div className="flex justify-center"><PillLabel>Secure payment</PillLabel></div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">Complete your payment</h1>
        </div>

        {/* Order summary */}
        <div className="glow-card p-7 md:p-8 mb-6">
          <h2 className="text-xl font-bold text-white mb-6">Order details</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-surface-2 border border-line p-4">
              <p className="text-[11px] font-semibold text-mute uppercase tracking-widest mb-1">Tracking number</p>
              <p className="text-xl font-bold text-white">{order.tracking_number}</p>
            </div>
            <div className="rounded-2xl border border-ember-500/30 bg-ember-500/[0.08] p-4">
              <p className="text-[11px] font-semibold text-ember-300 uppercase tracking-widest mb-1">Amount due</p>
              <p className="text-2xl font-bold text-ember-400">KES {order.amount_due.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* M-Pesa instructions */}
        <div className="card p-7 md:p-8 mb-6">
          <h3 className="text-xl font-bold text-white mb-5">M-Pesa payment instructions</h3>
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-4 rounded-2xl bg-surface-2 border border-line p-4">
                <span className="font-bold text-ember-400 text-lg leading-none">{i + 1}.</span>
                <div className="text-white/80 text-sm">{s}</div>
              </li>
            ))}
          </ol>
        </div>

        {/* Form */}
        <div className="glow-card p-7 md:p-8 mb-6">
          <h3 className="text-xl font-bold text-white mb-6">Submit payment details</h3>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="form-label">Your full name</label>
              <input type="text" name="payer_name" value={formData.payer_name} onChange={handleChange} placeholder="Enter your full name" className="form-input" />
            </div>
            <div>
              <label className="form-label">Your phone number</label>
              <input type="tel" name="payer_phone" value={formData.payer_phone} onChange={handleChange} placeholder="e.g., +254712345678" className="form-input" />
            </div>
            <div>
              <label className="form-label">Amount paid (KES)</label>
              <input type="number" name="amount_paid" value={formData.amount_paid} onChange={handleChange} placeholder={order.amount_due} className="form-input" />
            </div>
            <div>
              <label className="form-label">M-Pesa confirmation message</label>
              <p className="text-[10px] font-semibold text-mute uppercase tracking-wide mb-2">Paste the complete SMS you received from M-Pesa</p>
              <textarea name="mpesa_message" value={formData.mpesa_message} onChange={handleChange} rows={4}
                placeholder="e.g., ABC123DEF Confirmed. You have received KES 5,000 from John Doe on 04/01/2026 at 14:30. New M-Pesa balance is KES 10,000.00"
                className="form-textarea font-mono text-sm" />
            </div>
            <button type="submit" disabled={submitting} className="btn-primary glass-sheen w-full btn-lg">
              {submitting ? 'Submitting…' : 'Submit payment'}
            </button>
          </form>
        </div>

        <div className="card text-center text-sm text-mute p-6">
          <p className="mb-2">Questions? Contact our support team</p>
          <p className="flex items-center justify-center text-white font-semibold text-base"><Phone className="w-4 h-4 mr-2 text-ember-400" /> +254 (0) 700 000 000</p>
        </div>
      </div>
    </Shell>
  )
}
