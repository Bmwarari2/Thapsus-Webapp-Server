import React, { useState } from 'react'
import { Plus, Minus, HelpCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PillLabel } from '../components/ui'
import { Reveal } from '../components/motion'

const faqs = [
  {
    category: 'Shop & ship (Buy-for-me)',
    items: [
      {
        q: 'How does Buy-for-me work?',
        a: 'Send us a link from any UK online retailer — Amazon, ASOS, Next, John Lewis, anywhere — and a friendly operator quotes you the total in GBP. Pay by card or M-Pesa to confirm, and we buy the item, receive it at our UK warehouse, and ship it on to Kenya. No UK card, UK address, or sign-up at the retailer required.',
      },
      {
        q: 'Which retailers can I buy from?',
        a: 'Effectively any UK e-commerce store that delivers to our Stockport warehouse. Most customers shop on Amazon UK, ASOS, John Lewis, Next, Boots, Currys, JD Sports, Argos, Selfridges. If you\'re not sure whether a retailer is supported, just send the link — we\'ll tell you in the quote.',
      },
      {
        q: 'When do I pay?',
        a: 'You pay the BFM quote up front, before we make the purchase. The quote covers the item price, our 10% buying fee, UK handling, and shipping to Kenya. Customs (VAT + Duty) may be charged separately by Kenya Revenue Authority on clearance and are not included.',
      },
      {
        q: 'What if the item is out of stock when you try to buy?',
        a: 'We refund you in full or apply the amount as credit toward another order — your choice. Quotes are good for 24 hours; after that we re-check stock before charging.',
      },
    ],
  },
  {
    category: 'Getting Started',
    items: [
      {
        q: 'How does Thapsus Cargo work?',
        a: 'Two ways. Most customers use our Buy-for-me service — send us a link, we shop, ship, and deliver. Or if you have already bought something from a UK retailer (or are forwarding items you already own), pre-register the parcel and ship it to your personal UK warehouse address. Either way, we consolidate, fly it to Kenya, and deliver to your door.',
      },
      {
        q: 'When should I use Buy-for-me vs pre-register?',
        a: 'Buy-for-me is the easiest path — you don\'t need a UK payment method, address, or retailer account. Pre-register a parcel when you have already paid for something, or when the seller doesn\'t ship to our warehouse (e.g. private resellers, eBay collections).',
      },
      {
        q: 'How do I get my warehouse address (TC Code)?',
        a: 'Only needed for the pre-register path. Once you create a free account, your unique TC Code and full UK warehouse address appear under "Warehouse Address" in the dashboard. Use these as the delivery address at checkout when shopping yourself.',
      },
      {
        q: 'Is there a registration fee?',
        a: 'No — creating an account is completely free. With Buy-for-me you pay the item price + a 10% buying fee + shipping. With pre-register you only pay the shipping weight of your goods.',
      },
    ],
  },
  {
    category: 'Shipping & Rates',
    items: [
      {
        q: 'How much does shipping cost?',
        a: 'Shipping rates depend on the chargeable weight (the heavier of actual or volumetric weight). UK shipments start from £9/kg for air freight. Use our Shipping Calculator for an instant quote including handling, insurance, and the card-processing surcharge.',
      },
      {
        q: 'What is package consolidation and how does it save me money?',
        a: 'Consolidation means we combine multiple packages you\'ve sent to our warehouse into a single shipment to Kenya. Instead of paying separate international shipping fees for each parcel, you pay one combined rate — which is almost always much cheaper.',
      },
      {
        q: 'How long does shipping take?',
        a: 'UK to Kenya air shipments typically take 7–14 business days after consolidation. You will receive tracking updates at every stage of the journey.',
      },
    ],
  },
  {
    category: 'Receiving Your Goods in Kenya',
    items: [
      {
        q: 'How do I receive my shipment in Kenya?',
        a: 'We offer two delivery options in Kenya: you can collect your shipment from our CBD collection point, or we can arrange delivery to your door using your preferred courier. You choose when placing your consolidation request.',
      },
      {
        q: 'Where is the CBD collection point?',
        a: 'Our Nairobi CBD collection point details are shared with you once your shipment arrives and clears customs. You will receive a notification with the exact location and collection instructions.',
      },
      {
        q: 'Do you deliver outside Nairobi?',
        a: 'Yes. We work with your preferred delivery courier for upcountry deliveries. Let us know your location and we will coordinate accordingly. Additional courier charges from Nairobi to your town may apply.',
      },
    ],
  },
  {
    category: 'Customs & Prohibited Items',
    items: [
      {
        q: 'What items are prohibited?',
        a: 'We do not ship weapons, illegal substances, counterfeit goods, perishable foods, flammable liquids, or any items banned by Kenyan customs. See our full Prohibited Items list for details. When in doubt, contact our support team before ordering.',
      },
      {
        q: 'Will I pay customs duty in Kenya?',
        a: 'Customs (VAT + Duty) is assessed by Kenya Revenue Authority based on the declared value of your goods on clearance. Our shipping quote does not include those charges — they are billed separately by KRA when your parcel clears. Electronics, clothing, and other categories attract different duty rates; we will guide you through the typical range when you place the order.',
      },
    ],
  },
  {
    category: 'Payments & Insurance',
    items: [
      {
        q: 'What payment methods do you accept?',
        a: 'We accept M-Pesa, card payments (Visa/Mastercard via Stripe), and PayPal. You can manage your wallet balance in the app and use it to pay for shipments.',
      },
      {
        q: 'Can I insure my shipment?',
        a: 'Yes — we strongly recommend adding insurance for valuable items such as electronics, jewellery, or branded goods. Insurance can be added during checkout and is calculated as a small percentage of your declared item value.',
      },
    ],
  },
]

const FAQItem = ({ q, a }) => {
  const [open, setOpen] = useState(false)
  return (
    <div className={`rounded-2xl border bg-surface transition-colors duration-300 ${open ? 'border-ember-500/30' : 'border-line hover:border-line-strong'}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 p-5 text-left"
        aria-expanded={open}
      >
        <span className="font-semibold text-white text-sm md:text-base leading-snug">{q}</span>
        <span className={`shrink-0 grid place-items-center w-7 h-7 rounded-full border transition-colors ${open ? 'bg-ember-gradient text-white border-transparent' : 'border-line text-mute'}`}>
          {open ? <Minus size={15} /> : <Plus size={15} />}
        </span>
      </button>
      <div className={`grid transition-all duration-300 ease-smooth ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="px-5 pb-5 text-mute text-sm md:text-base leading-relaxed">{a}</div>
        </div>
      </div>
    </div>
  )
}

export const FAQ = () => {
  return (
    <div className="relative overflow-hidden py-14 px-4">
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[44rem] h-[44rem] bg-ember-radial blur-2xl pointer-events-none" />

      <div className="max-w-3xl mx-auto relative">
        {/* Header */}
        <Reveal className="mb-12 text-center space-y-5">
          <div className="flex justify-center"><PillLabel>Questions answered</PillLabel></div>
          <div className="flex justify-center"><span className="ember-badge w-16 h-16 rounded-3xl"><HelpCircle size={32} /></span></div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">Help centre</h1>
          <p className="text-mute text-lg max-w-xl mx-auto">
            Answers to the most common questions about shipping with Thapsus Cargo.
          </p>
        </Reveal>

        {/* Sections */}
        <div className="space-y-10">
          {faqs.map(({ category, items }) => (
            <Reveal key={category}>
              <h2 className="eyebrow !tracking-widest mb-4 px-1">{category}</h2>
              <div className="space-y-3">
                {items.map((item) => <FAQItem key={item.q} {...item} />)}
              </div>
            </Reveal>
          ))}
        </div>

        {/* Still need help */}
        <Reveal className="mt-14">
          <div className="glow-card p-8 text-center">
            <h3 className="text-2xl font-bold text-white mb-2">Still need help?</h3>
            <p className="text-mute mb-6">Our support team is here to assist with anything not covered above.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href="https://wa.me/447424531483" target="_blank" rel="noopener noreferrer"
                className="btn bg-[#25D366] hover:bg-[#1ebe5b] text-white">WhatsApp us</a>
              <a href="mailto:admin@thapsus.uk" className="btn-secondary">Email support</a>
              <Link to="/support" className="btn-primary glass-sheen">Open a ticket</Link>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
