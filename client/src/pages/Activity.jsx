// Activity.jsx
// Secondary-surface hub for customers. Mirror of iOS CustomerActivityHubView
// (see thapsus-v1.1/iosApp/iosApp/Features/CustomerActivityHubView.swift).
//
// Four cards, in the same order as iOS:
//   1. Parcel tracking      → /orders   (every parcel by status)
//   2. Pre-register a parcel → /new-order (where the UK warehouse address lives)
//   3. Invoices             → /orders   (web folds invoice CTAs into Orders)
//   4. Transactions         → /transactions
//
// Lives at /activity. Reachable from the new mobile bottom tab + the
// desktop nav. The page is intentionally light — it's a launcher, not a
// destination. All real data lives behind the linked routes.

import React from 'react'
import { Link } from 'react-router-dom'
import {
  Package, PlusSquare, FileText, History, ChevronRight, Activity as ActivityIcon,
} from 'lucide-react'

export const Activity = () => {
  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 pb-24">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-12">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-[10px] font-black uppercase tracking-[0.3em] text-orange-700 mb-4">
            <ActivityIcon size={12} /> Activity
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-[#0f172a] tracking-tighter uppercase leading-none mb-4">
            Activity
          </h1>
          <p className="text-slate-500 font-bold leading-relaxed text-sm md:text-base max-w-2xl">
            Tracking, invoices, transactions, and pre-register in one place.
          </p>
        </div>

        <div className="space-y-4">
          <HubCard
            to="/orders"
            icon={<Package size={22} />}
            iconBg="bg-[#0f172a]"
            title="Parcel tracking"
            subtitle="Every parcel we're shipping for you, by status."
          />
          <HubCard
            to="/new-order"
            icon={<PlusSquare size={22} />}
            iconBg="bg-purple-600"
            title="Pre-register a parcel"
            subtitle="Already bought something? Tell us it's coming — your UK warehouse address is here too."
          />
          <HubCard
            to="/orders"
            icon={<FileText size={22} />}
            iconBg="bg-orange-600"
            title="Invoices"
            subtitle="Active and past shipping invoices alongside the parcels they cover."
          />
          <HubCard
            to="/transactions"
            icon={<History size={22} />}
            iconBg="bg-[#0f172a]"
            title="Transactions"
            subtitle="Every card or M-Pesa payment plus your credit activity."
          />
        </div>
      </div>
    </div>
  )
}

// ─── Card ───────────────────────────────────────────────────────────────────

function HubCard({ to, icon, iconBg, title, subtitle }) {
  return (
    <Link
      to={to}
      className="group block rounded-3xl bg-white border border-slate-200 hover:border-orange-200 hover:shadow-lg transition-all p-5 md:p-6"
    >
      <div className="flex items-center gap-4 md:gap-5">
        <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-inner ${iconBg}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-base md:text-lg text-[#0f172a] tracking-tight">{title}</p>
          <p className="text-xs md:text-sm text-slate-500 font-semibold mt-1 leading-snug">{subtitle}</p>
        </div>
        <ChevronRight
          size={18}
          className="text-slate-300 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all shrink-0"
        />
      </div>
    </Link>
  )
}
