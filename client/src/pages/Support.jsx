import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, Plus, ChevronRight } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { supportApi } from '../api'
import { useTicketUpdates } from '../hooks/useRealtimeUpdates'
import toast from 'react-hot-toast'

export const Support = () => {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
  })
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

  // Keep the list fresh: a brand-new ticket (or any update) pushed over the
  // websocket pops it to the top. The conversation itself lives on /support/:id,
  // which owns its own realtime subscription.
  useTicketUpdates((payload) => {
    if (!payload) return
    if (payload.action === 'created' && payload.ticket) {
      setTickets((prev) => [payload.ticket, ...prev])
    }
  })

  const handleFormChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  // A ticket opens as its own page — an iMessage-style conversation thread.
  const openTicket = (id) => navigate(`/support/${id}`)

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

      setFormData({ subject: '', description: '' })
      setShowCreateForm(false)
      // Drop the customer straight into the new conversation.
      if (ticket?.id) navigate(`/support/${ticket.id}`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create ticket')
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

        {showCreateForm ? (
          /* Create Ticket - Dark Glass Bento */
          <div className="group relative overflow-hidden bg-surface border border-line rounded-3xl p-8 md:p-10 text-white shadow-card max-w-2xl">
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-ember-500/20 rounded-full blur-[80px] pointer-events-none" />

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
                  className="btn-primary glass-sheen flex-1 py-4 disabled:opacity-50"
                >
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
        ) : (
          /* Ticket list — each row opens its own conversation page */
          <div className="bg-surface-2 backdrop-blur-2xl border border-line shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-6 relative overflow-hidden glass-sheen">
            <h2 className="text-2xl font-black text-white tracking-tighter leading-none mb-6 relative z-10">
              {t('support.myTickets')}
            </h2>

            {tickets.length > 0 ? (
              <div className="space-y-3 relative z-10">
                {tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    onClick={() => openTicket(ticket.id)}
                    className="w-full text-left p-4 rounded-xl border border-line bg-surface-2 hover:bg-white/5 hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-4"
                  >
                    <div className="shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-orange-500 to-ember-600 flex items-center justify-center text-white shadow-inner">
                      <MessageSquare size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-white text-sm truncate tracking-tight">
                        {ticket.subject}
                      </h3>
                      <p className="text-xs font-medium text-dim mt-0.5">
                        {ticket.id.slice(0, 8)}
                        {ticket.created_at ? ` · ${new Date(ticket.created_at).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                        ticket.status === 'open'
                          ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20'
                          : ticket.status === 'in_progress'
                            ? 'bg-blue-500/15 text-blue-300 border-blue-500/20'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20'
                      }`}
                    >
                      {ticket.status.replace(/_/g, ' ')}
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-white/30" />
                  </button>
                ))}
              </div>
            ) : (
              /* Empty State */
              <div className="text-center py-16 relative z-10">
                <div className="w-24 h-24 mx-auto bg-surface-2 backdrop-blur-xl border border-line rounded-full flex items-center justify-center mb-6 shadow-sm">
                  <MessageSquare className="text-dim" size={48} />
                </div>
                <h3 className="text-2xl font-black text-white tracking-tighter mb-2">How can we help?</h3>
                <p className="text-mute font-medium max-w-sm mx-auto">
                  Create a ticket to start a conversation with our support team.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
