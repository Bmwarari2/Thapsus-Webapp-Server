// CreditCenter.jsx
// Replaces the legacy Wallet page (server PR #61, migration 028).
// Shows the customer's running KES credit balance + a tip about how
// it gets earned (referrals) and applied (auto-deduct on next payment).
// No deposits — credit is referral-only.

import React, { useEffect, useState } from 'react'
import { Gift, TrendingUp } from 'lucide-react'
import { paymentsApi, referralApi } from '../api'
import { useCreditUpdates } from '../hooks/useRealtimeUpdates'

const fmt = (n) => Number(n || 0).toLocaleString()

export function CreditCenter() {
  const [credit, setCredit] = useState(0)
  const [loading, setLoading] = useState(true)
  const [referral, setReferral] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.allSettled([
      paymentsApi.myCredit(),
      referralApi.getInfo?.() ?? Promise.resolve(null),
    ]).then(([cr, rf]) => {
      if (!alive) return
      if (cr.status === 'fulfilled') setCredit(cr.value.data?.balance_kes ?? 0)
      if (rf?.status === 'fulfilled') setReferral(rf.value?.data?.referral ?? null)
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  useCreditUpdates(() => {
    paymentsApi.myCredit().then(r => setCredit(r.data?.balance_kes ?? 0)).catch(() => {})
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50/40 px-4 sm:px-8 py-12">
      <div className="max-w-3xl mx-auto">
        <p className="text-[10px] font-black uppercase tracking-widest text-orange-600 mb-3">Credit</p>
        <h1 className="text-4xl sm:text-5xl font-black text-[#0f172a] tracking-tighter mb-2">My credit</h1>
        <p className="text-slate-500 text-sm mb-10">
          Earned from referrals — auto-applied to your next payment.
        </p>

        <div className="bg-white/70 backdrop-blur-2xl rounded-[2.5rem] border border-orange-100 shadow-xl p-10 mb-8">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
            Available credit
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-400">KES</span>
            <span className="text-6xl font-black text-[#0f172a] tracking-tighter">
              {loading ? '—' : fmt(credit)}
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-4">
            {credit === 0
              ? 'Refer a friend to earn KES 50.'
              : 'Will be deducted from your next invoice.'}
          </p>
        </div>

        <div className="bg-white/70 backdrop-blur-2xl rounded-[2.5rem] border border-slate-200 shadow-sm p-8 mb-8">
          <h2 className="text-lg font-black text-[#0f172a] tracking-tight mb-4">How credit works</h2>
          <ol className="space-y-4">
            <Step n="1" title="Earn" body="Refer someone with your code → both of you get KES 50 on their first paid order." />
            <Step n="2" title="Apply" body="On any payment, your full credit balance is auto-applied first." />
            <Step n="3" title="Pay the rest" body="If credit fully covers it, you're done. Otherwise pay the remainder via card or M-Pesa." />
          </ol>
        </div>

        {referral?.referral_code && (
          <div className="bg-white/70 backdrop-blur-2xl rounded-[2.5rem] border border-slate-200 shadow-sm p-8 flex items-center gap-4">
            <div className="p-4 rounded-2xl bg-orange-50 text-orange-600">
              <TrendingUp size={24} />
            </div>
            <div className="flex-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Your referral code</p>
              <p className="text-xl font-black tracking-tight text-[#0f172a]">{referral.referral_code}</p>
              {typeof referral.stats?.completed_referrals === 'number' && (
                <p className="text-xs text-slate-500 mt-1">
                  {referral.stats.completed_referrals} successful referral
                  {referral.stats.completed_referrals === 1 ? '' : 's'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Step({ n, title, body }) {
  return (
    <li className="flex gap-4">
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#0f172a] text-white grid place-items-center text-xs font-black">
        {n}
      </div>
      <div>
        <p className="font-bold text-[#0f172a]">{title}</p>
        <p className="text-sm text-slate-500">{body}</p>
      </div>
    </li>
  )
}
