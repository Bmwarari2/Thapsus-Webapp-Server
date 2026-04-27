import React, { useEffect, useState } from 'react'
import { Plane, Clock } from 'lucide-react'
import { consolidationsApi } from '../api'

/**
 * CutoffBanner — live countdown to the current weekly UK→NBO flight cut-off.
 *
 * Surface is data-driven from the active consolidation row.  If no open
 * consolidation exists, the banner renders nothing (graceful fallback).
 */
export const CutoffBanner = ({ compact = false }) => {
  const [cons, setCons] = useState(null)
  const [now,  setNow]  = useState(Date.now())

  useEffect(() => {
    let cancelled = false
    consolidationsApi.current()
      .then((res) => { if (!cancelled) setCons(res.data?.consolidation || null) })
      .catch(() => { /* unauthenticated public banner — silent fail */ })
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => { cancelled = true; clearInterval(tick) }
  }, [])

  if (!cons || !cons.cutoff_at) return null

  const remaining = new Date(cons.cutoff_at).getTime() - now
  if (remaining <= 0) return null

  const days  = Math.floor(remaining / 86_400_000)
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000)
  const mins  = Math.floor((remaining % 3_600_000)  / 60_000)
  const secs  = Math.floor((remaining % 60_000) / 1000)

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] text-white rounded-full text-xs font-bold shadow-lg">
        <Plane size={14} className="text-orange-400" />
        <span className="uppercase tracking-wider">Next flight cut-off</span>
        <span className="font-mono">
          {days}d {String(hours).padStart(2,'0')}:{String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}
        </span>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-[#1e3a5f] to-[#2a4a7f] text-white p-5 md:p-7 shadow-2xl">
      <div className="absolute top-[-2rem] right-[-2rem] w-40 h-40 bg-orange-500/30 blur-[80px] rounded-full pointer-events-none animate-pulse" />
      <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-orange-500/20 rounded-2xl">
            <Plane size={22} className="text-orange-300" />
          </div>
          <div>
            <p className="text-[10px] md:text-xs uppercase tracking-widest text-orange-300 font-black">Weekly UK → Nairobi flight</p>
            <p className="text-lg md:text-xl font-bold tracking-tight">Cut-off closes in</p>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3 text-center font-mono">
          <CountdownBlock value={days}  label="DAYS"  />
          <CountdownBlock value={hours} label="HRS"   />
          <CountdownBlock value={mins}  label="MIN"   />
          <CountdownBlock value={secs}  label="SEC"   />
        </div>
      </div>
      {cons.total_kg !== undefined && (
        <div className="relative z-10 mt-4 flex items-center gap-4 text-xs text-white/70">
          <span className="inline-flex items-center gap-1"><Clock size={12} /> {cons.total_parcels || 0} parcels booked</span>
          <span>· {(cons.total_kg || 0).toFixed(1)} kg consolidated so far</span>
        </div>
      )}
    </div>
  )
}

const CountdownBlock = ({ value, label }) => (
  <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-2 min-w-[3.5rem]">
    <div className="text-2xl md:text-3xl font-black leading-none">{String(value).padStart(2,'0')}</div>
    <div className="text-[9px] uppercase tracking-widest text-white/60 mt-1">{label}</div>
  </div>
)
