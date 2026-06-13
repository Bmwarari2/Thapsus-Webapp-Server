import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, ArrowUp, MessageSquare, CheckCircle2, RotateCcw } from 'lucide-react'
import { supportApi, adminApi } from '../api'
import { useTicketUpdates } from '../hooks/useRealtimeUpdates'
import toast from 'react-hot-toast'

// ─────────────────────────────────────────────────────────────────────────────
// TicketConversation — a full-page, iMessage-style thread.
//
// Used by both the admin TIC tab (mode="admin") and the customer /support
// list (mode="customer"). A ticket "opens" as its own route so the cramped
// inline split-pane (which broke on mobile) is gone: this page fills the
// screen, scrolls the bubbles, and pins the composer at the bottom — exactly
// like the Messages app.
//
//   • Outgoing bubbles (you) → blue, right-aligned.
//   • Incoming bubbles      → graphite, left-aligned.
//   • The ticket's opening `description` is rendered as the customer's first
//     message (it lives on the ticket row, not in ticket_messages).
// ─────────────────────────────────────────────────────────────────────────────

const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?'

const sameDay = (a, b) => {
  const da = new Date(a), db = new Date(b)
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
}

const dayLabel = (d) => {
  const date = new Date(d)
  const now = new Date()
  const yest = new Date(); yest.setDate(now.getDate() - 1)
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (sameDay(date, now)) return `Today ${time}`
  if (sameDay(date, yest)) return `Yesterday ${time}`
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ` ${time}`
}

export const TicketConversation = ({ mode = 'customer' }) => {
  const isAdmin = mode === 'admin'
  const { id } = useParams()
  const navigate = useNavigate()

  const [ticket, setTicket] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)

  const endRef = useRef(null)
  const inputRef = useRef(null)

  // Fold the ticket + message rows into a single, side-aware bubble list.
  const normalize = useCallback((tk, msgs) => {
    const out = []
    if (tk?.description) {
      out.push({
        id: '__opening__',
        body: tk.description,
        role: 'customer',
        created_at: tk.created_at,
        outgoing: !isAdmin, // the opening message is always the customer's
      })
    }
    for (const m of msgs || []) {
      const role = m.role === 'admin' ? 'admin' : 'customer'
      out.push({
        id: m.id,
        body: m.message,
        role,
        created_at: m.created_at,
        outgoing: isAdmin ? role === 'admin' : role !== 'admin',
      })
    }
    return out
  }, [isAdmin])

  const load = useCallback(async (spin = false) => {
    try {
      if (spin) setLoading(true)
      const res = await supportApi.getTicket(id)
      setTicket(res.data.ticket)
      setMessages(normalize(res.data.ticket, res.data.messages))
    } catch (err) {
      if (err.response?.status === 404) setNotFound(true)
      else toast.error('Failed to load conversation')
    } finally {
      setLoading(false)
    }
  }, [id, normalize])

  useEffect(() => { load(true) }, [load])

  // Live updates — refresh the thread when this ticket gets a new message or
  // a status change pushed over the websocket.
  useTicketUpdates((payload) => {
    if (!payload || payload.ticketId !== id) return
    if (payload.action === 'new_message' || payload.action === 'status_changed') load(false)
  })

  // Stick to the latest message after every commit.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  const closed = ticket?.status === 'closed'
  const resolvedish = ticket?.status === 'resolved' || ticket?.status === 'closed'

  const send = async (e) => {
    e?.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true)

    // Optimistic bubble so the reply appears instantly; reconciled by load().
    const optimistic = {
      id: `tmp-${Date.now()}`,
      body,
      role: isAdmin ? 'admin' : 'customer',
      created_at: new Date().toISOString(),
      outgoing: true,
      pending: true,
    }
    setMessages((prev) => [...prev, optimistic])
    setText('')

    try {
      await supportApi.replyToTicket(id, body)
      await load(false)
    } catch {
      toast.error('Failed to send')
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      setText(body)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  // Admin-only: flip between resolved and reopened.
  const toggleStatus = async () => {
    if (!ticket || statusBusy) return
    const next = resolvedish ? 'open' : 'resolved'
    setStatusBusy(true)
    try {
      await adminApi.updateTicketStatus(id, next)
      setTicket((t) => ({ ...t, status: next }))
      toast.success(next === 'resolved' ? 'Marked resolved' : 'Reopened')
    } catch {
      toast.error('Failed to update status')
    } finally {
      setStatusBusy(false)
    }
  }

  const goBack = () => navigate(isAdmin ? '/admin?tab=tickets' : '/support')

  // iMessage-style enter-to-send (Shift+Enter for newline).
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const contactName = isAdmin
    ? (ticket?.customer_name || ticket?.customer_email || 'Customer')
    : 'Thapsus Support'

  // Page fills the viewport below the fixed top bar; on mobile we also leave
  // room for the bottom tab bar so the composer sits just above it.
  const shell =
    'flex flex-col bg-[#0b0b0c] ' +
    'h-[calc(100dvh-4rem-4rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] ' +
    'lg:h-[calc(100dvh-4rem-env(safe-area-inset-top,0px))]'

  if (loading) {
    return (
      <div className={shell + ' items-center justify-center'}>
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className={shell + ' items-center justify-center text-center px-6'}>
        <MessageSquare size={48} className="text-white/20 mb-5" />
        <h2 className="text-xl font-black text-white tracking-tight mb-2">Conversation not found</h2>
        <p className="text-mute font-medium mb-6">This ticket may have been removed.</p>
        <button onClick={goBack} className="bg-orange-500 hover:bg-orange-400 text-white px-6 py-3 rounded-2xl font-black tracking-tight transition-all">
          Back to tickets
        </button>
      </div>
    )
  }

  return (
    <div className={shell}>
      {/* ── Header (iMessage contact bar) ─────────────────────────────── */}
      <header className="shrink-0 flex items-center gap-3 px-3 sm:px-5 py-3 border-b border-white/10 bg-[#1c1c1e]/90 backdrop-blur-xl">
        <button
          onClick={goBack}
          aria-label="Back"
          className="shrink-0 -ml-1 p-1.5 rounded-full text-[#0a84ff] hover:bg-white/10 transition-colors active:scale-90"
        >
          <ChevronLeft size={26} />
        </button>

        <div className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-ember-600 flex items-center justify-center text-white font-black text-sm shadow-inner">
          {isAdmin ? initials(contactName) : 'TC'}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-white font-bold text-[15px] leading-tight truncate">{contactName}</h1>
          {ticket?.subject && (
            <p className="text-white/45 text-[11px] leading-tight truncate">{ticket.subject}</p>
          )}
        </div>

        {/* Status: admins can toggle; customers just see the badge. */}
        {isAdmin ? (
          <button
            onClick={toggleStatus}
            disabled={statusBusy}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all disabled:opacity-50 ${
              resolvedish
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25 hover:bg-emerald-500/25'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/25 hover:bg-amber-500/25'
            }`}
          >
            {resolvedish ? <RotateCcw size={12} /> : <CheckCircle2 size={12} />}
            {resolvedish ? 'Reopen' : 'Resolve'}
          </button>
        ) : (
          <span
            className={`shrink-0 inline-block px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
              ticket?.status === 'open'
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/25'
                : ticket?.status === 'in_progress'
                  ? 'bg-blue-500/15 text-blue-300 border-blue-500/25'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
            }`}
          >
            {(ticket?.status || 'open').replace(/_/g, ' ')}
          </span>
        )}
      </header>

      {/* ── Messages ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-0.5 no-scrollbar">
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const showDay = !prev || !sameDay(prev.created_at, m.created_at)
          // Tighten consecutive bubbles from the same side into a group.
          const grouped = prev && prev.outgoing === m.outgoing && !showDay
          return (
            <React.Fragment key={m.id || i}>
              {showDay && (
                <div className="flex justify-center py-3">
                  <span className="text-[11px] font-semibold text-white/35">{dayLabel(m.created_at)}</span>
                </div>
              )}
              <div className={`flex ${m.outgoing ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-0.5' : 'mt-2'}`}>
                <div
                  className={`max-w-[78%] sm:max-w-[65%] px-3.5 py-2 text-[15px] leading-snug whitespace-pre-wrap break-words shadow-sm ${
                    m.outgoing
                      ? 'bg-[#0a84ff] text-white rounded-[20px] rounded-br-[6px]'
                      : 'bg-[#262628] text-white rounded-[20px] rounded-bl-[6px]'
                  } ${m.pending ? 'opacity-60' : ''}`}
                >
                  {m.body}
                </div>
              </div>
            </React.Fragment>
          )
        })}
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-white/40">
            <MessageSquare size={40} className="mb-3 opacity-50" />
            <p className="text-sm font-medium">No messages yet.</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* ── Composer ──────────────────────────────────────────────────── */}
      {closed && !isAdmin ? (
        <div className="shrink-0 px-5 py-4 border-t border-white/10 bg-[#1c1c1e]/90 text-center">
          <p className="text-white/40 text-xs font-semibold uppercase tracking-widest">This conversation is closed</p>
        </div>
      ) : (
        <form
          onSubmit={send}
          className="shrink-0 flex items-end gap-2 px-3 sm:px-4 py-3 border-t border-white/10 bg-[#1c1c1e]/90 backdrop-blur-xl"
        >
          <div className="flex-1 flex items-end rounded-[22px] border border-white/15 bg-[#0b0b0c] focus-within:border-[#0a84ff]/60 transition-colors">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={isAdmin ? 'Type a reply…' : 'Message…'}
              rows={1}
              className="flex-1 max-h-32 resize-none bg-transparent px-4 py-2.5 text-[15px] text-white placeholder-white/35 outline-none no-scrollbar"
            />
          </div>
          <button
            type="submit"
            disabled={sending || !text.trim()}
            aria-label="Send"
            className="shrink-0 w-9 h-9 rounded-full bg-[#0a84ff] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all active:scale-90"
          >
            <ArrowUp size={20} strokeWidth={2.5} />
          </button>
        </form>
      )}
    </div>
  )
}

export default TicketConversation
