import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageCircle, Search, Link2, Wallet, PackageCheck, Truck,
  ShieldCheck, Clock3, BadgeCheck,
} from 'lucide-react'
import { useAppConfig } from '../hooks/useAppConfig'
import { SEO } from '../components/SEO'
import { PillLabel, EmberIcon, ArcDecoration } from '../components/ui'
import { Reveal, FocusText } from '../components/motion'

const STEPS = [
  {
    icon: Link2,
    title: '1. Send us the link',
    body: 'Message our WhatsApp line with the product link from any online store abroad. We reply with a full quote in KES — item, exchange rate and our margin, no surprises.',
  },
  {
    icon: Wallet,
    title: '2. Pay with M-Pesa',
    body: 'Reply YES to your quote and an M-Pesa prompt lands on your phone. You get a PDF receipt and a tracking code the moment your payment clears.',
  },
  {
    icon: PackageCheck,
    title: '3. We buy & ship it',
    body: 'We purchase the item, label it with your customer code, and fly it to Kenya. Every step pings your WhatsApp automatically.',
  },
  {
    icon: Truck,
    title: '4. Delivered to your door',
    body: "Once it lands in Nairobi we dispatch it straight to your address. Text your tracking code any time to see exactly where it is.",
  },
]

const TRUST = [
  { icon: ShieldCheck, title: 'Pay safely with M-Pesa', body: 'No cards, no wire transfers — every shilling moves through M-Pesa with an instant receipt.' },
  { icon: Clock3, title: 'Live updates on WhatsApp', body: 'Quotes, payment confirmations, arrival alerts and delivery notices, all in one chat.' },
  { icon: BadgeCheck, title: 'Your personal customer code', body: 'One code (like TC-1042) identifies every parcel you ever ship with us.' },
]

export function Home() {
  const { support_whatsapp } = useAppConfig()
  const [code, setCode] = useState('')
  const navigate = useNavigate()

  const waLink = `https://wa.me/${support_whatsapp}?text=${encodeURIComponent('Hi Thapsus, I want to order something')}`

  const track = (e) => {
    e.preventDefault()
    const c = code.trim()
    if (c) navigate(`/track/${encodeURIComponent(c)}`)
  }

  return (
    <div className="overflow-x-clip">
      <SEO
        title="Thapsus Cargo — Shop the world on WhatsApp, delivered to Kenya"
        description="Send us any product link on WhatsApp, get a KES quote, pay with M-Pesa, and we deliver to your door in Kenya. Track your parcel by simply texting your code."
      />

      {/* ── Hero ── */}
      <section className="relative max-w-7xl mx-auto px-4 pt-16 pb-20 text-center">
        <ArcDecoration className="absolute -top-24 left-1/2 -translate-x-1/2 opacity-60" />
        <Reveal>
          <PillLabel className="mb-6">WhatsApp-first shopping &amp; shipping</PillLabel>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white max-w-3xl mx-auto">
            Shop any store abroad,{' '}
            <FocusText>delivered to Kenya</FocusText>
          </h1>
          <p className="mt-5 text-lg text-mute max-w-2xl mx-auto">
            No apps, no accounts, no paperwork. Send us a product link on WhatsApp,
            pay with M-Pesa, and we handle everything until it reaches your door.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href={waLink} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-2xl bg-[#25D366] hover:bg-[#1fb958] text-white font-bold text-lg shadow-[0_0_30px_rgba(37,211,102,0.35)] transition-colors">
              <MessageCircle size={22} /> Message us on WhatsApp
            </a>
            <form onSubmit={track} className="relative">
              <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-mute" />
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Track: TRK-8821"
                className="w-64 pl-11 pr-4 py-3.5 rounded-2xl bg-white/5 border border-line text-white placeholder:text-mute focus:outline-none focus:border-ember-500/50"
              />
            </form>
          </div>
        </Reveal>
      </section>

      {/* ── How it works ── */}
      <section className="max-w-7xl mx-auto px-4 pb-20">
        <Reveal>
          <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-10">
            How it works
          </h2>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map((s) => (
            <Reveal key={s.title}>
              <div className="h-full rounded-3xl bg-white/[0.04] border border-line p-6 hover:border-ember-500/30 transition-colors">
                <EmberIcon icon={s.icon} />
                <h3 className="mt-4 font-bold text-white">{s.title}</h3>
                <p className="mt-2 text-sm text-mute leading-relaxed">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Trust strip ── */}
      <section className="max-w-7xl mx-auto px-4 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TRUST.map((t) => (
            <Reveal key={t.title}>
              <div className="flex items-start gap-4 rounded-3xl bg-white/[0.03] border border-line p-5">
                <EmberIcon icon={t.icon} wrap="w-10 h-10" size={18} />
                <div>
                  <h3 className="font-semibold text-white text-sm">{t.title}</h3>
                  <p className="mt-1 text-sm text-mute">{t.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="max-w-4xl mx-auto px-4 pb-24 text-center">
        <Reveal>
          <div className="rounded-3xl bg-ember-500/10 border border-ember-500/25 px-6 py-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white">
              Ready to order? It takes one message.
            </h2>
            <p className="mt-3 text-mute">
              Say hi and we'll set you up in under a minute — then just send links.
            </p>
            <a href={waLink} target="_blank" rel="noreferrer"
              className="mt-6 inline-flex items-center gap-2.5 px-7 py-3.5 rounded-2xl bg-[#25D366] hover:bg-[#1fb958] text-white font-bold transition-colors">
              <MessageCircle size={20} /> Start on WhatsApp
            </a>
          </div>
        </Reveal>
      </section>
    </div>
  )
}
