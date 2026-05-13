import React, { useState } from 'react'
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

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
    <div className="border border-white/20 rounded-xl overflow-hidden bg-white/30 backdrop-blur-sm transition-all duration-300">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between gap-4 p-5 text-left hover:bg-white/20 transition-colors"
        aria-expanded={open}
      >
        <span className="font-bold text-[#1e3a5f] text-sm md:text-base leading-snug">{q}</span>
        {open
          ? <ChevronUp size={20} className="text-orange-700 flex-shrink-0 mt-0.5" />
          : <ChevronDown size={20} className="text-slate-400 flex-shrink-0 mt-0.5" />
        }
      </button>
      {open && (
        <div className="px-5 pb-5 text-slate-700 text-sm md:text-base leading-relaxed font-medium border-t border-white/20 pt-4">
          {a}
        </div>
      )}
    </div>
  )
}

export const FAQ = () => {
  return (
    <div className="min-h-screen relative bg-slate-50 overflow-hidden py-12 px-4 font-sans">
      {/* Liquid Backgrounds */}
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-blue-300/30 rounded-full blur-[100px] animate-morph mix-blend-multiply pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] max-w-[600px] max-h-[600px] bg-orange-300/20 rounded-full blur-[100px] animate-morph mix-blend-multiply pointer-events-none" />

      <div className="max-w-3xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 mb-6">
            <HelpCircle size={32} className="text-orange-700" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-[#1e3a5f] mb-4 leading-none tracking-tighter">
            Help Centre
          </h1>
          <p className="text-slate-600 font-medium text-lg max-w-xl mx-auto">
            Answers to the most common questions about shipping with Thapsus Cargo.
          </p>
        </div>

        {/* FAQ Sections */}
        <div className="space-y-10">
          {faqs.map(({ category, items }) => (
            <div key={category}>
              <h2 className="text-xs font-black uppercase tracking-widest text-orange-700 mb-4 px-1">
                {category}
              </h2>
              <div className="space-y-3">
                {items.map((item) => (
                  <FAQItem key={item.q} {...item} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Still need help CTA */}
        <div className="mt-14 rounded-2xl bg-[#1e3a5f] text-white p-8 text-center">
          <h3 className="text-2xl font-black tracking-tighter mb-2">Still need help?</h3>
          <p className="text-slate-300 font-medium mb-6">
            Our support team is here to assist you with any questions not covered above.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://wa.me/447424531483"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-green-500 hover:bg-green-400 text-white font-black rounded-xl transition-colors"
            >
              WhatsApp Us
            </a>
            <a
              href="mailto:admin@thapsus.uk"
              className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-black rounded-xl border border-white/20 transition-colors"
            >
              Email Support
            </a>
            <Link
              to="/support"
              className="px-6 py-3 bg-orange-500 hover:bg-orange-400 text-white font-black rounded-xl transition-colors"
            >
              Open a Ticket
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
