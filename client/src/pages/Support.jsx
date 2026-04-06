import React, { useState, useEffect } from 'react'
import { MessageSquare, Plus, Send } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { supportApi } from '../api'
import { useTicketUpdates } from '../hooks/useRealtimeUpdates'
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
    file: null,
  })
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const shapeTicketThread = (ticket, messages) => {
    if (!ticket) return null
    const baseMessages = [
      {
        fromUser: true,
        createdAt: ticket.created_at,
        message: ticket.description,
      },
      ...(messages || []).map((m) => ({
        fromUser: m.role !== 'admin',
        createdAt: m.created_at,
        message: m.message,
      })),
    ]
    return { ...ticket, messages: baseMessages }
  }

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

  useTicketUpdates((payload) => {
    if (!payload) return

    if (payload.action === 'created' && payload.ticket) {
      setTickets((prev) => [payload.ticket, ...prev])
    }

    if (payload.action === 'new_message' && selectedTicket && payload.ticketId === selectedTicket.id) {
      supportApi
        .getTicket(selectedTicket.id)
        .then((res) => {
          const { ticket, messages } = res.data
          setSelectedTicket(shapeTicketThread(ticket, messages))
        })
        .catch(() => {})
    }
  })

  const handleFormChange = (e) => {
    const { name, value, type, files } = e.target
    if (type === 'file') {
      setFormData((prev) => ({ ...prev, [name]: files[0] || null }))
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }))
    }
  }

  const handleSelectTicket = async (id) => {
    try {
      const res = await supportApi.getTicket(id)
      const { ticket, messages } = res.data
      setSelectedTicket(shapeTicketThread(ticket, messages))
    } catch (err) {
      toast.error('Failed to load ticket details')
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
        formData.file
      )

      const ticket = response.data.ticket
      toast.success('Ticket created successfully!')

      setTickets((prev) => [ticket, ...prev])
      setFormData({ subject: '', description: '', file: null })
      setShowCreateForm(false)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create ticket')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReply = async (e) => {
    e.preventDefault()

    if (!replyText.trim() || !selectedTicket) {
      return
    }

    try {
      setSubmitting(true)
      await supportApi.replyToTicket(selectedTicket.id, replyText)

      const res = await supportApi.getTicket(selectedTicket.id)
      const { ticket, messages } = res.data

      setSelectedTicket(shapeTicketThread(ticket, messages))

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
                      onClick={() => handleSelectTicket(ticket.id)}
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
                        {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : ''}
                      </p>
                      <div className="mt-2">
                        <span
                          className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                            ticket.status === 'open'
                              ? 'bg-yellow-100 text-yellow-800'
                              : ticket.status === 'in_progress'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {ticket.status.replace(/_/g, ' ')}
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
              <div className="card flex flex-col h-[480px]">
                {/* Ticket Header */}
                <div className="flex items-start justify-between mb-4 pb-4 border-b border-gray-200">
                  <div>
                    <h2 className="text-2xl font-bold text-[#1e3a5f]">
                      {selectedTicket.subject}
                    </h2>
                    <p className="text-gray-600 mt-1 text-sm">
                      {t('support.ticketId')}: {selectedTicket.id.slice(0, 8).toUpperCase()}
                    </p>
                  </div>
                  <span
                    className={`px-4 py-2 rounded-lg font-medium text-xs md:text-sm ${
                      selectedTicket.status === 'open'
                        ? 'bg-yellow-100 text-yellow-800'
                        : selectedTicket.status === 'in_progress'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {selectedTicket.status.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Messages */}
                <div className="flex-1 space-y-3 mb-4 overflow-y-auto pr-1">
                  {selectedTicket.messages?.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.fromUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                          msg.fromUser
                            ? 'bg-orange-500 text-white rounded-br-none'
                            : 'bg-gray-100 text-gray-900 rounded-bl-none'
                        }`}
                      >
                        <p className="text-[11px] opacity-80 mb-1">
                          {msg.fromUser ? 'You' : 'Support Team'} •{' '}
                          {new Date(msg.createdAt).toLocaleString()}
                        </p>
                        <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                      </div>
                    </div>
                  ))}

                  {selectedTicket.messages?.length === 0 && (
                    <div className="text-center text-gray-500 text-sm py-8">
                      No messages yet. Start the conversation below.
                    </div>
                  )}
                </div>

                {/* Reply Form */}
                {selectedTicket.status !== 'closed' && (
                  <form onSubmit={handleReply} className="mt-auto pt-2 border-t border-gray-200">
                    <div className="flex gap-2 items-end">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Type your message..."
                        rows="2"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent text-sm resize-none"
                      />
                      <button
                        type="submit"
                        disabled={submitting || !replyText.trim()}
                        className="inline-flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-bold gap-2 transition-colors disabled:opacity-50"
                      >
                        <Send size={18} />
                        <span className="hidden sm:inline">{t('support.send')}</span>
                      </button>
                    </div>
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
