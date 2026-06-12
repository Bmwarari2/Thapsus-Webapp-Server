import React, { useState, useEffect, useRef } from 'react'
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
  })
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Auto-scroll refs
  const messagesEndRef   = useRef(null)   // bottom anchor inside the chat window
  const createFormRef    = useRef(null)   // top of the create-ticket form

  /** Scroll chat to the very last message */
  const scrollToLatest = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }

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

  // Scroll to latest message whenever the thread changes (new reply, SSE push, ticket load).
  // This `useEffect` fires after React commits the new messages to the DOM,
  // which is the actual condition we want to wait on — replaces three earlier
  // `setTimeout(scrollToLatest, 80–100)` band-aids that hoped React had finished
  // painting by the time the timer fired.
  useEffect(() => {
    if (selectedTicket?.messages?.length) scrollToLatest()
  }, [selectedTicket?.messages?.length])

  // Same idea for the create-ticket form: scroll it into view once the form
  // has actually been rendered (showCreateForm transitioned to true), not on
  // an arbitrary timer.
  useEffect(() => {
    if (showCreateForm) {
      createFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [showCreateForm])

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
          // The `useEffect` keyed on `selectedTicket?.messages?.length`
          // handles the scroll after React commits the new messages.
        })
        .catch(() => {})
    }
  })

  const handleFormChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
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
        formData.description
      )

      const ticket = response.data.ticket
      toast.success('Ticket created successfully!')

      setTickets((prev) => [ticket, ...prev])
      setFormData({ subject: '', description: '' })
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
      // Scroll handled by the `useEffect` on `selectedTicket?.messages?.length`.
    } catch (err) {
      toast.error('Failed to send reply')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white/[0.03]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative bg-white/[0.03] overflow-hidden py-12 px-4 font-sans">
      {/* Liquid Backgrounds */}
      
      
      

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header - Refined Typography */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-black text-white mb-3 leading-none tracking-tighter">
              {t('support.title')}
            </h1>
            <p className="text-mute font-medium text-lg">Get help from our support team</p>
          </div>
          <button
            onClick={() => setShowCreateForm((prev) => !prev)}
            className="group relative overflow-hidden bg-orange-500 hover:bg-orange-400 text-white px-6 py-3.5 rounded-2xl font-black tracking-tight flex items-center gap-2 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 glass-sheen"
          >
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
            <Plus size={20} className="relative z-10" />
            <span className="relative z-10">{t('support.create')}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Tickets List - Crystal Borders */}
          <div className="lg:col-span-1">
            <div className="bg-surface-2 backdrop-blur-2xl border border-line shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-6 relative overflow-hidden glass-sheen h-full">
              <h2 className="text-2xl font-black text-white tracking-tighter leading-none mb-6 relative z-10">
                {t('support.myTickets')}
              </h2>

              {tickets.length > 0 ? (
                <div className="space-y-3 relative z-10">
                  {tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => handleSelectTicket(ticket.id)}
                      className={`w-full text-left p-4 rounded-xl border backdrop-blur-md transition-all duration-300 ${
                        selectedTicket?.id === ticket.id
                          ? 'bg-surface-2 border-orange-300 shadow-md scale-[1.02]'
                          : 'bg-surface-2 border-line hover:bg-surface-2 hover:shadow-sm hover:-translate-y-0.5'
                      }`}
                    >
                      <h3 className="font-bold text-white text-sm truncate tracking-tight">
                        {ticket.subject}
                      </h3>
                      <p className="text-xs font-semibold text-mute mt-1 uppercase tracking-widest">
                        {ticket.id.slice(0, 8)}
                      </p>
                      <p className="text-xs font-medium text-dim mt-1">
                        {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : ''}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                            ticket.status === 'open'
                              ? 'bg-yellow-500/15/80 text-yellow-300 border-yellow-500/20'
                              : ticket.status === 'in_progress'
                                ? 'bg-blue-500/15/80 text-blue-300 border-blue-500/20'
                                : 'bg-emerald-500/15/80 text-emerald-300 border-emerald-500/20'
                          }`}
                        >
                          {ticket.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-mute font-medium text-center py-8 relative z-10">
                  {t('support.noTickets')}
                </p>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2">
            {showCreateForm ? (
              /* Create Ticket - Dark Glass Bento */
              <div ref={createFormRef} className="group relative overflow-hidden bg-surface/90 backdrop-blur-2xl border border-line rounded-[24px] p-8 md:p-10 text-white shadow-2xl transition-transform duration-500 hover:-rotate-1 hover:scale-[1.02] transform perspective-1000 glass-sheen">
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-500/30 rounded-full blur-[80px] pointer-events-none" />
                
                <h2 className="text-3xl font-black tracking-tighter leading-none mb-8 relative z-10">
                  {t('support.create')}
                </h2>

                <form onSubmit={handleCreateTicket} className="space-y-6 relative z-10">
                  {/* Subject */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-dim mb-2">
                      {t('support.subject')} <span className="text-orange-400">*</span>
                    </label>
                    <input
                      type="text"
                      name="subject"
                      value={formData.subject}
                      onChange={handleFormChange}
                      placeholder="Brief description of your issue"
                      required
                      className="w-full px-4 py-3 bg-white/5 backdrop-blur-md border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-white font-semibold transition-all placeholder-slate-500 shadow-inner"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-dim mb-2">
                      {t('support.description')} <span className="text-orange-400">*</span>
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleFormChange}
                      placeholder="Provide as much detail as possible"
                      rows="6"
                      required
                      className="w-full px-4 py-3 bg-white/5 backdrop-blur-md border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-white font-semibold transition-all placeholder-slate-500 shadow-inner resize-none"
                    />
                  </div>

                  {/* Buttons */}
                  <div className="flex flex-col sm:flex-row gap-4 pt-4">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="group/btn relative overflow-hidden flex-1 bg-blue-500 hover:bg-blue-400 text-white py-4 rounded-xl font-black tracking-tight transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 glass-sheen disabled:opacity-50"
                    >
                      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover/btn:animate-[shimmer_1.5s_infinite]" />
                      <span className="relative z-10">{submitting ? t('common.loading') : t('support.submit')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="flex-1 border border-line bg-white/5 backdrop-blur-md text-mute py-4 rounded-xl font-black tracking-tight hover:bg-white/10 transition-all active:scale-95"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </form>
              </div>
            ) : selectedTicket ? (
              /* Chat View - Crystal Borders */
              <div className="bg-surface-2 backdrop-blur-2xl border border-line shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[24px] p-6 md:p-8 flex flex-col h-[600px] relative overflow-hidden glass-sheen">
                {/* Ticket Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-6 pb-6 border-b border-line relative z-10 gap-4">
                  <div>
                    <h2 className="text-3xl font-black text-white tracking-tighter leading-none mb-2">
                      {selectedTicket.subject}
                    </h2>
                    <p className="text-mute font-bold text-xs uppercase tracking-widest">
                      {t('support.ticketId')}: <span className="text-white/80">{selectedTicket.id.slice(0, 8)}</span>
                    </p>
                  </div>
                  <span
                    className={`inline-block px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest border backdrop-blur-sm shadow-sm ${
                      selectedTicket.status === 'open'
                        ? 'bg-yellow-500/15/80 text-yellow-300 border-yellow-500/20'
                        : selectedTicket.status === 'in_progress'
                          ? 'bg-blue-500/15/80 text-blue-300 border-blue-500/20'
                          : 'bg-emerald-500/15/80 text-emerald-300 border-emerald-500/20'
                    }`}
                  >
                    {selectedTicket.status.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Messages */}
                <div className="flex-1 space-y-4 mb-6 overflow-y-auto pr-2 custom-scrollbar relative z-10">
                  {selectedTicket.messages?.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.fromUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-4 text-sm shadow-sm backdrop-blur-md border ${
                          msg.fromUser
                            ? 'bg-gradient-to-br from-ember-500 to-ember-600 text-white border-blue-800 rounded-br-sm'
                            : 'bg-surface-2 text-white border-line rounded-bl-sm'
                        }`}
                      >
                        <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${msg.fromUser ? 'text-blue-200' : 'text-mute'}`}>
                          {msg.fromUser ? 'You' : 'Support Team'} •{' '}
                          {new Date(msg.createdAt).toLocaleString()}
                        </p>
                        <p className="whitespace-pre-wrap break-words font-medium leading-relaxed">{msg.message}</p>
                      </div>
                    </div>
                  ))}

                  {selectedTicket.messages?.length === 0 && (
                    <div className="text-center text-mute font-medium text-sm py-8">
                      No messages yet. Start the conversation below.
                    </div>
                  )}
                  {/* Scroll anchor — always sits below the last message */}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply Form */}
                {selectedTicket.status !== 'closed' && (
                  <form onSubmit={handleReply} className="mt-auto pt-4 border-t border-line relative z-10">
                    <div className="flex gap-3 items-end">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Type your message..."
                        rows="2"
                        className="flex-1 px-4 py-3 bg-surface-2 backdrop-blur-md border border-line rounded-xl focus:outline-none focus:ring-2 focus:ring-ember-500/30 text-white font-medium transition-all placeholder-white/30 shadow-inner resize-none"
                      />
                      <button
                        type="submit"
                        disabled={submitting || !replyText.trim()}
                        className="group relative overflow-hidden inline-flex items-center justify-center bg-ember-gradient hover:brightness-110 text-white px-6 py-4 rounded-xl font-black tracking-tight gap-2 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed glass-sheen"
                      >
                        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                        <Send size={18} className="relative z-10" />
                        <span className="hidden sm:inline relative z-10">{t('support.send')}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              /* Empty State - Border Gradient */
              <div className="rounded-2xl h-full min-h-[400px]">
                <div className="bg-surface border border-line shadow-card rounded-2xl p-12 text-center h-full flex flex-col items-center justify-center">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-blue-400/10 rounded-full blur-[50px] pointer-events-none" />
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-orange-400/10 rounded-full blur-[50px] pointer-events-none" />
                  
                  <div className="w-24 h-24 bg-surface-2 backdrop-blur-xl border border-line rounded-full flex items-center justify-center mb-6 shadow-sm">
                    <MessageSquare className="text-dim" size={48} />
                  </div>
                  <h3 className="text-2xl font-black text-white tracking-tighter mb-2">How can we help?</h3>
                  <p className="text-mute font-medium max-w-sm">
                    Select a ticket from the sidebar or create a new one to get in touch with our support team.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
