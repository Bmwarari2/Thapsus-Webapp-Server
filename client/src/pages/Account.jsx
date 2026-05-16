// Account.jsx
// Customer Account hub. Mirror of iOS CustomerHomeView (see
// thapsus-v1.1/iosApp/iosApp/Features/CustomerHomeView.swift).
//
// Layout, top to bottom (matches iOS order):
//   1. Profile card        — avatar initial, name, email, Edit profile CTA
//   2. Credit hero         — KES balance, "Invite friends" CTA → /referral
//   3. Link card #1        — Prohibited items, Refer friends
//   4. Link card #2        — Support, Data rights (GDPR), Delete account
//   5. Marketing links     — About, FAQs, Privacy, Terms (open in new tab)
//   6. WhatsApp support    — quick external chat link
//   7. Sign out            — solid dark button
//
// Web omits the iOS "Appearance" entry (web inherits OS theme via media
// query, no in-app toggle to ship). Everything else lines up 1:1.

import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  User, Pencil, Gift, ShieldAlert, LifeBuoy, Database, Trash2,
  Info, BookOpen, ScrollText, FileText, MessageCircle, LogOut, ChevronRight,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { paymentsApi } from '../api'

const WHATSAPP_URL = 'https://wa.me/254700000000?text=Hi%20Thapsus%20Cargo%2C%20I%20need%20a%20hand'

export const Account = () => {
  const { user, logout } = useAuth()
  const [credit, setCredit] = useState(null)

  useEffect(() => {
    paymentsApi.myCredit()
      .then((r) => setCredit(r.data?.balance_kes ?? 0))
      .catch(() => setCredit(0))
  }, [])

  const name    = user?.name  || 'Welcome'
  const email   = user?.email || ''
  const initial = (name[0] || '?').toUpperCase()

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 pb-24">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-12 space-y-4">

        {/* Eyebrow + heading */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-[10px] font-black uppercase tracking-[0.3em] text-orange-700 mb-4">
            <User size={12} /> Account
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-[#0f172a] tracking-tighter uppercase leading-none">
            Account
          </h1>
        </div>

        {/* Profile card */}
        <div className="rounded-3xl bg-white border border-slate-200 p-5 md:p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-black text-2xl shadow-inner shrink-0">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-lg text-[#0f172a] truncate">{name}</p>
              {email && <p className="text-sm text-slate-500 font-bold truncate">{email}</p>}
            </div>
            <Link
              to="/dashboard"
              className="text-xs font-black uppercase tracking-widest px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors flex items-center gap-1.5"
            >
              <Pencil size={12} /> Edit
            </Link>
          </div>
        </div>

        {/* Credit hero */}
        <div className="rounded-3xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 p-5 md:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-700 mb-2">Referral credit</p>
              <p className="font-black text-3xl text-[#0f172a] tracking-tighter font-mono">
                KES {credit == null ? '—' : Number(credit).toLocaleString()}
              </p>
              <p className="text-xs text-slate-600 font-bold mt-1">Auto-applies on your next payment.</p>
            </div>
            <Link
              to="/referral"
              className="text-xs font-black uppercase tracking-widest px-4 py-2.5 rounded-full bg-[#0f172a] hover:bg-slate-800 text-white shadow-md transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Gift size={14} /> Invite
            </Link>
          </div>
        </div>

        {/* Link card 1 */}
        <LinkCard rows={[
          { to: '/prohibited', icon: <ShieldAlert size={16} />, title: 'Prohibited items',
            subtitle: "What you can't ship" },
          { to: '/referral',   icon: <Gift size={16} />,        title: 'Refer friends',
            subtitle: 'Earn KES 50 per referral' },
        ]} />

        {/* Link card 2 */}
        <LinkCard rows={[
          { to: '/support',         icon: <LifeBuoy size={16} />, title: 'Support',
            subtitle: 'Tickets and help' },
          { to: '/dsar',            icon: <Database size={16} />, title: 'Data rights (GDPR)',
            subtitle: 'Export your data' },
          { to: '/account/delete',  icon: <Trash2 size={16} />,   title: 'Delete account',
            subtitle: '14-day cooldown, with data export' },
        ]} />

        {/* Marketing links (external) */}
        <div className="rounded-3xl bg-white border border-slate-200 overflow-hidden">
          <ExternalRow icon={<Info       size={16} />} title="About Thapsus" href="https://thapsus.uk/" />
          <Divider />
          <ExternalRow icon={<BookOpen   size={16} />} title="FAQs"          href="https://thapsus.uk/faq" />
          <Divider />
          <ExternalRow icon={<ScrollText size={16} />} title="Privacy"       href="https://thapsus.uk/privacy" />
          <Divider />
          <ExternalRow icon={<FileText   size={16} />} title="Terms of service" href="https://thapsus.uk/terms" />
        </div>

        {/* WhatsApp support */}
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noreferrer"
          className="w-full block py-4 rounded-2xl bg-green-50 hover:bg-green-100 border border-green-200 text-green-800 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition"
        >
          <MessageCircle size={16} /> Chat on WhatsApp
        </a>

        {/* Sign out */}
        <button
          onClick={logout}
          className="w-full py-4 rounded-2xl bg-[#0f172a] hover:bg-slate-800 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition shadow-lg"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  )
}

// ─── Re-usable bits ─────────────────────────────────────────────────────────

function LinkCard({ rows }) {
  return (
    <div className="rounded-3xl bg-white border border-slate-200 overflow-hidden">
      {rows.map((r, idx) => (
        <React.Fragment key={r.to}>
          <Link
            to={r.to}
            className="group flex items-center gap-4 p-4 md:p-5 hover:bg-orange-50/40 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-orange-100 flex items-center justify-center text-orange-600 transition-colors shrink-0">
              {r.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm text-[#0f172a]">{r.title}</p>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">{r.subtitle}</p>
            </div>
            <ChevronRight
              size={16}
              className="text-slate-300 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all"
            />
          </Link>
          {idx < rows.length - 1 && <Divider />}
        </React.Fragment>
      ))}
    </div>
  )
}

function ExternalRow({ icon, title, href }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-4 p-4 md:p-5 hover:bg-orange-50/40 transition-colors"
    >
      <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-orange-100 flex items-center justify-center text-orange-600 transition-colors shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-black text-sm text-[#0f172a]">{title}</p>
      </div>
      <ChevronRight
        size={16}
        className="text-slate-300 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all"
      />
    </a>
  )
}

function Divider() {
  return <div className="h-px bg-slate-100 mx-4 md:mx-5" />
}
