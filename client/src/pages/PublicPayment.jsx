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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#1e3a5f]"></div>
          <p className="mt-4 text-gray-600">Loading order details...</p>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="bg-white rounded-lg shadow p-8 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[#1e3a5f] mb-2">Order Not Found</h2>
          <p className="text-gray-600">The order you're looking for doesn't exist or is no longer available.</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="bg-white rounded-lg shadow p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[#1e3a5f] mb-2">Payment Submitted</h2>
          <p className="text-gray-600 mb-4">Your payment has been submitted successfully. Our team will review and approve it shortly. You'll receive a confirmation email once it's processed.</p>
          <p className="text-sm text-gray-500">Tracking Number: <strong>{order.tracking_number}</strong></p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-[#1e3a5f] text-white rounded-t-lg p-8 text-center">
          <h1 className="text-3xl font-bold mb-2">
            Thapsus<span className="text-[#f97316]">Cargo</span>
          </h1>
          <p className="text-gray-300">Complete Your Payment</p>
        </div>

        {/* Order Summary */}
        <div className="bg-white border border-gray-200 p-8">
          <h2 className="text-xl font-bold text-[#1e3a5f] mb-6">Order Details</h2>
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <p className="text-sm text-gray-600">Tracking Number</p>
              <p className="text-lg font-semibold text-[#1e3a5f]">{order.tracking_number}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Amount Due</p>
              <p className="text-lg font-semibold text-[#1e3a5f]">KES {order.amount_due.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Customer Name</p>
              <p className="text-lg font-semibold">{order.user_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <p className="text-lg font-semibold capitalize text-gray-700">{order.status.replace(/_/g, ' ')}</p>
            </div>
          </div>
        </div>

        {/* M-Pesa Instructions */}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-8">
          <h3 className="text-lg font-bold text-[#1e3a5f] mb-4">M-Pesa Payment Instructions</h3>
          <ol className="space-y-3 text-gray-700">
            <li className="flex items-start">
              <span className="font-bold text-[#f97316] mr-3">1.</span>
              <span>Open your M-Pesa App or dial <strong>*134#</strong> on your phone</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-[#f97316] mr-3">2.</span>
              <span>Select <strong>Lipa na M-Pesa Online</strong> or similar option</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-[#f97316] mr-3">3.</span>
              <span>Enter the Paybill: <strong>XXXXXX</strong></span>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-[#f97316] mr-3">4.</span>
              <span>Enter Account Number: <strong>{order.tracking_number}</strong></span>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-[#f97316] mr-3">5.</span>
              <span>Enter Amount: <strong>KES {order.amount_due.toLocaleString()}</strong></span>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-[#f97316] mr-3">6.</span>
              <span>Enter your M-Pesa PIN and complete the transaction</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-[#f97316] mr-3">7.</span>
              <span>Copy the confirmation message and paste it below</span>
            </li>
          </ol>
        </div>

        {/* Payment Form */}
        <div className="bg-white border-l border-r border-b border-gray-200 p-8">
          <h3 className="text-lg font-bold text-[#1e3a5f] mb-6">Submit Payment Details</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Your Full Name</label>
              <input
                type="text"
                name="payer_name"
                value={formData.payer_name}
                onChange={handleChange}
                placeholder="Enter your full name"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f97316] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Your Phone Number</label>
              <input
                type="tel"
                name="payer_phone"
                value={formData.payer_phone}
                onChange={handleChange}
                placeholder="e.g., +254712345678"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f97316] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Amount Paid (KES)</label>
              <input
                type="number"
                name="amount_paid"
                value={formData.amount_paid}
                onChange={handleChange}
                placeholder={order.amount_due}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f97316] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">M-Pesa Confirmation Message</label>
              <p className="text-xs text-gray-500 mb-2">Paste the complete SMS you received from M-Pesa</p>
              <textarea
                name="mpesa_message"
                value={formData.mpesa_message}
                onChange={handleChange}
                placeholder="e.g., ABC123DEF Confirmed. You have received KES 5,000 from John Doe on 04/01/2026 at 14:30. New M-Pesa balance is KES 10,000.00"
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f97316] focus:border-transparent font-mono text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#f97316] hover:bg-orange-600 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : 'Submit Payment'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="bg-gray-100 rounded-b-lg p-6 text-center text-sm text-gray-600">
          <p className="mb-2">Questions? Contact our support team</p>
          <p className="flex items-center justify-center text-gray-700">
            <Phone className="w-4 h-4 mr-2" />
            +254 (0) 700 000 000
          </p>
        </div>
      </div>
    </div>
  )
}
