import React, { useState, useEffect } from 'react'
import { MessageSquare, Plus, Send, AlertCircle } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { supportApi } from '../api'
import toast from 'react-hot-toast'

export const Support = () => {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState([])
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    priority: 'medium',
    file: null,
  })
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        const response = await supportApi.listTickets()
        setTickets(response.data.tickets || [])
      } catch (err) {
        toast.error('Failed to load tickets')
      } finally {
        setLoading(false)
      }
    }

    fetchTickets()
  }, [])

  const handleFormChange = (e) => {
    const { name, value, type, files } = e.target
    if (type === 'file') {
      setFormData((prev) => ({ ...prev, [name]: files[0] || null }))
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }))
    }
  }

  const handleCreateTicket = async (e) => {
    e.preventDefault()

    if (!formData.subject || !formData.description) {
      toast.error(t('common.required'))
      return
    }

    try {
      setSubmitting(true)
      const response = await supportApi.createTicket(
        formData.subject,
        formData.description,
        formData.priority,
        formData.file
      )

      toast.success('Ticket created successfully!')
      setTickets([response.data, ...tickets])
      setFormData({ subject: '', description: '', priority: 'medium', file: null })
      setShowCreateForm(false)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create ticket')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReply = async (e) => {
    e.preventDefault()

    if (!replyText.trim()) {
      return
    }

    try {
      setSubmitting(true)
      await supportApi.replyToTicket(selectedTicket.id, replyText)

      // Refresh ticket
      const response = await supportApi.getTicket(selectedTicket.id)
      setSelectedTicket(response.data)
      setReplyText('')
      toast.success('Reply sent!')
    } catch (err) {
      toast.error('Failed to send reply')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-[#1e3a5f] mb-2">
              {t('support.title')}
            </h1>
            <p className="text-gray-600">Get help from our support team</p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition-colors"
          >
            <Plus size={20} />
            {t('support.create')}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Tickets List */}
          <div className="lg:col-span-1">
            <div className="card">
              <h2 className="text-lg font-bold text-[#1e3a5f] mb-4">
                {t('support.myTickets')}
              </h2>

              {tickets.length > 0 ? (
                <div className="space-y-2">
                  {tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => setSelectedTicket(ticket)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedTicket?.id === ticket.id
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <h3 className="font-semibold text-gray-900 text-sm truncate">
                        {ticket.subject}
                      </h3>
                      <p className="text-xs text-gray-600 mt-1">
                        {ticket.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </p>
                      <div className="mt-2">
                        <span
                          className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                            ticket.status === 'open'
                              ? 'bg-yellow-100 text-yellow-800'
                              : ticket.status === 'in-progress'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {ticket.status}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600 text-center py-8">
                  {t('support.noTickets')}
                </p>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2">
            {showCreateForm ? (
              <div className="card">
                <h2 className="text-2xl font-bold text-[#1e3a5f] mb-6">
                  {t('support.create')}
                </h2>

                <form onSubmit={handleCreateTicket} className="space-y-4">
                  {/* Subject */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('support.subject')} *
                    </label>
                    <input
                      type="text"
                      name="subject"
                      value={formData.subject}
                      onChange={handleFormChange}
                      placeholder="Brief description of your issue"
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('support.description')} *
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleFormChange}
                      placeholder="Provide as much detail as possible"
                      rows="5"
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                    />
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('support.priority')}
                    </label>
                    <select
                      name="priority"
                      value={formData.priority}
                      onChange={handleFormChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                    >
                      <option value="low">{t('support.low')}</option>
                      <option value="medium">{t('support.medium')}</option>
                      <option value="high">{t('support.high')}</option>
                    </select>
                  </div>

                  {/* File Upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('support.attach')} (Optional)
                    </label>
                    <input
                      type="file"
                      name="file"
                      onChange={handleFormChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                    />
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-4">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 bg-[#1e3a5f] hover:bg-[#152d4a] text-white py-3 rounded-lg font-bold transition-colors disabled:opacity-50"
                    >
                      {submitting ? t('common.loading') : t('support.submit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-50 transition-colors"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </form>
              </div>
            ) : selectedTicket ? (
              <div className="card">
                {/* Ticket Header */}
                <div className="flex items-start justify-between mb-6 pb-6 border-b border-gray-200">
                  <div>
                    <h2 className="text-2xl font-bold text-[#1e3a5f]">
                      {selectedTicket.subject}
                    </h2>
                    <p className="text-gray-600 mt-1">
                      {t('support.ticketId')}: {selectedTicket.id.slice(0, 8).toUpperCase()}
                    </p>
                  </div>
                  <span
                    className={`px-4 py-2 rounded-lg font-medium ${
                      selectedTicket.status === 'open'
                        ? 'bg-yellow-100 text-yellow-800'
                        : selectedTicket.status === 'in-progress'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {selectedTicket.status}
                  </span>
                </div>

                {/* Messages */}
                <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
                  {selectedTicket.messages?.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg ${
                        msg.fromUser
                          ? 'bg-blue-50 border border-blue-200'
                          : 'bg-gray-50 border border-gray-200'
                      }`}
                    >
                      <p className="text-xs text-gray-600 mb-2">
                        {msg.fromUser ? 'You' : 'Support Team'} •{' '}
                        {new Date(msg.createdAt).toLocaleString()}
                      </p>
                      <p className="text-gray-900">{msg.message}</p>
                    </div>
                  ))}
                </div>

                {/* Reply Form */}
                {selectedTicket.status !== 'closed' && (
                  <form onSubmit={handleReply} className="space-y-4">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type your reply..."
                      rows="3"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
                    />
                    <button
                      type="submit"
                      disabled={submitting || !replyText.trim()}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      <Send size={20} />
                      {t('support.send')}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <div className="card text-center py-12">
                <MessageSquare className="mx-auto text-gray-400 mb-4" size={48} />
                <p className="text-gray-600 mb-4">
                  Select a ticket or create a new one to get started
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
