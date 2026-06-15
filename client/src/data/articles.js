/**
 * Article / guide content for the public Resources hub (/articles).
 *
 * Every article is authored for both SEO (search-engine ranking) and AEO
 * (answer-engine optimization). The shared shape supports the AEO building
 * blocks that answer engines lift verbatim:
 *
 *   quickAnswer  — a single, self-contained answer to the title question,
 *                  written to be quotable as a featured snippet / AI answer.
 *   takeaways    — scannable key facts (great for "key points" extraction).
 *   body         — semantic blocks (h2/h3/p/ul/ol/table/callout/quote).
 *   faqs         — Q&A pairs rendered on-page AND emitted as FAQPage JSON-LD.
 *
 * Body blocks support lightweight inline markup in their text:
 *   **bold**            → <strong>
 *   [label](https://…)  → <a> (opens in a new tab for external links)
 *
 * To add an article: append an object here. The listing page, the article
 * page, the sitemap and the navigation pick it up automatically.
 */

export const ARTICLE_CATEGORIES = [
  'Getting started',
  'Costs & pricing',
  'Customs & tax',
  'Shopping',
  'Logistics',
]

const AUTHOR = { name: 'The Thapsus Cargo Team', role: 'UK–Kenya shipping specialists' }

export const articles = [
  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'how-to-ship-from-uk-to-kenya',
    title: 'How to Ship from the UK to Kenya: The Complete 2026 Guide',
    description:
      'A step-by-step guide to shipping parcels from the UK to Kenya in 2026 — from getting a free UK address to customs clearance and door-to-door delivery.',
    keywords: [
      'how to ship from UK to Kenya',
      'shipping from UK to Kenya',
      'send parcel UK to Kenya',
      'UK to Kenya courier',
      'parcel forwarding Kenya',
    ],
    category: 'Getting started',
    author: AUTHOR,
    datePublished: '2026-01-12',
    dateModified: '2026-06-01',
    readingTime: 9,
    emoji: '📦',
    featured: true,
    quickAnswer:
      'To ship from the UK to Kenya, you get a free UK warehouse address, send (or buy) your items to it, then have them consolidated and flown to Kenya. With Thapsus Cargo the steps are: create a free account, get your TC Code and UK address (or use Buy-for-me), ship or shop your items in, request consolidation, pay the weight-based shipping quote, and collect in Nairobi or get door delivery. Door-to-door usually takes 7–14 days after consolidation.',
    takeaways: [
      'You do not need a UK card or address of your own — a forwarder gives you a free one, or buys items for you.',
      'Shipping is charged by chargeable weight (the greater of actual vs volumetric weight), from £9/kg by air.',
      'Consolidating several parcels into one shipment is the single biggest way to cut cost.',
      'Customs duty and VAT are charged by Kenya Revenue Authority (KRA) on arrival and are separate from shipping.',
      'Typical UK→Kenya air transit is 7–14 business days after your shipment is consolidated and dispatched.',
    ],
    body: [
      { type: 'p', text: 'Shipping from the United Kingdom to Kenya used to mean a UK friend, a sky-high courier quote, or a long wait at the post office. Today a **parcel-forwarding service** does the hard part for you: you get a UK address, your items arrive there, and they are consolidated and flown to Kenya for a weight-based fee. This guide walks through the entire journey in plain English.' },

      { type: 'h2', text: 'The two ways to ship from the UK to Kenya' },
      { type: 'p', text: 'There are two paths, and most people use a mix of both:' },
      { type: 'ol', items: [
        '**Pre-register (parcel forwarding)** — you already bought something, or are sending items you own. You ship them to your personal UK warehouse address, and we forward them to Kenya.',
        '**Buy-for-me (concierge buying)** — you send us a product link, we buy it on your behalf with our UK payment method and address, then ship it on. Ideal if you have no UK card or the retailer blocks foreign cards.',
      ] },

      { type: 'h2', text: 'Step-by-step: shipping a parcel to Kenya' },
      { type: 'h3', text: '1. Create a free account and get your UK address' },
      { type: 'p', text: 'Registration is free. As soon as you sign up you receive a unique **TC Code** and a full UK warehouse address in Stockport. You use this exactly like your own address when checking out at any UK retailer.' },
      { type: 'h3', text: '2. Shop or send your items in' },
      { type: 'p', text: 'Either shop yourself and enter your warehouse address at checkout, or paste a product link into a [Buy-for-me request](/buy-for-me) and we purchase it for you. Always include your TC Code so we match the parcel to your account the moment it arrives.' },
      { type: 'h3', text: '3. We receive, check and store your goods' },
      { type: 'p', text: 'When a parcel lands at the warehouse we log it against your account and notify you. Items are stored free for a generous window so you can wait for several orders to arrive.' },
      { type: 'h3', text: '4. Request consolidation' },
      { type: 'p', text: 'Once your items are in, request a consolidation. We combine everything into one shipment, removing bulky retail packaging to cut volumetric weight (and therefore cost). You get one clean quote.' },
      { type: 'h3', text: '5. Pay your shipping quote' },
      { type: 'p', text: 'Pay by M-Pesa, card or PayPal. The quote covers chargeable weight, handling and any insurance you add. Customs is billed separately by KRA on arrival.' },
      { type: 'h3', text: '6. We fly it to Kenya and clear customs' },
      { type: 'p', text: 'Your shipment is dispatched by air, arrives in Nairobi, and clears customs. You receive tracking updates at each milestone.' },
      { type: 'h3', text: '7. Collect or get door delivery' },
      { type: 'p', text: 'Collect from our Nairobi CBD point, or have it delivered to your door anywhere in Kenya through your preferred courier.' },

      { type: 'callout', tone: 'tip', title: 'Pro tip: batch your orders', text: 'The fastest way to overpay is to ship one item at a time. Let two or three orders pile up at the warehouse, then consolidate — you pay one international leg instead of three.' },

      { type: 'h2', text: 'How long does shipping from the UK to Kenya take?' },
      { type: 'p', text: 'Air freight from the UK to Kenya typically takes **7–14 business days** from the moment your consolidated shipment is dispatched. Add a few days for items still in transit to the UK warehouse, and allow for customs clearance time, which varies with KRA workload and whether your goods are selected for inspection.' },

      { type: 'h2', text: 'What does it cost?' },
      { type: 'p', text: 'Shipping is priced by **chargeable weight** — the greater of the parcel’s actual weight and its volumetric (dimensional) weight. UK air freight starts from £9/kg. On top of shipping you should budget for Kenyan customs duty and VAT, which KRA assesses on the declared value of your goods. See our dedicated guides on [shipping cost](/articles/how-much-does-shipping-uk-to-kenya-cost) and [customs duty](/articles/kenya-customs-duty-import-tax-guide) for the full breakdown.' },

      { type: 'h2', text: 'Do I need to be in the UK to use this?' },
      { type: 'p', text: 'No. The whole point of parcel forwarding and Buy-for-me is that you can be anywhere — most of our customers are in Kenya. You shop UK websites (or send us links), and we bridge the UK leg for you.' },
    ],
    faqs: [
      { q: 'Do I need a UK bank card to shop from UK stores?', a: 'No. With Buy-for-me you send us the product link and we pay with our UK card and address, then ship the item to Kenya. You settle up with us in GBP using M-Pesa, card or PayPal.' },
      { q: 'How long does shipping from the UK to Kenya take?', a: 'Air freight typically takes 7–14 business days after your consolidated shipment is dispatched from the UK, plus customs clearance time on arrival in Kenya.' },
      { q: 'Is it cheaper to ship many parcels at once?', a: 'Yes. Consolidating multiple parcels into a single shipment means you pay one international shipping leg instead of several, which is almost always far cheaper.' },
      { q: 'Will I pay customs duty in Kenya?', a: 'Usually yes. Kenya Revenue Authority charges import duty and 16% VAT on the declared value of imported goods, billed separately from your shipping fee on clearance.' },
    ],
    related: ['how-much-does-shipping-uk-to-kenya-cost', 'what-is-buy-for-me-service', 'package-consolidation-save-money'],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'how-much-does-shipping-uk-to-kenya-cost',
    title: 'How Much Does It Cost to Ship a Parcel from the UK to Kenya?',
    description:
      'A clear breakdown of UK-to-Kenya shipping costs in 2026: per-kg air freight rates, volumetric weight, handling, insurance, customs and how to pay less.',
    keywords: [
      'cost to ship to Kenya',
      'UK to Kenya shipping cost',
      'shipping rates Kenya per kg',
      'how much to send a parcel to Kenya',
      'cheap shipping to Kenya',
    ],
    category: 'Costs & pricing',
    author: AUTHOR,
    datePublished: '2026-01-20',
    dateModified: '2026-06-01',
    readingTime: 8,
    emoji: '💷',
    featured: true,
    quickAnswer:
      'Shipping a parcel from the UK to Kenya by air typically costs from £9 per kilogram, charged on chargeable weight (the greater of actual or volumetric weight). A small 2 kg parcel therefore starts around £18 in freight, plus handling and any insurance. On top of shipping, Kenya Revenue Authority charges import duty (commonly 0–25%) and 16% VAT on the declared value at clearance. Consolidating several parcels into one shipment is the most effective way to reduce the per-kilo cost.',
    takeaways: [
      'Air freight starts from £9/kg, billed on chargeable weight.',
      'Chargeable weight = the greater of actual weight and volumetric weight (L×W×H ÷ 5000 cm).',
      'Light but bulky items (pillows, shoeboxes) are usually billed on volumetric weight.',
      'Budget separately for KRA import duty and 16% VAT on the declared value.',
      'Consolidation, removing retail packaging, and accurate declarations are the three biggest cost levers.',
    ],
    body: [
      { type: 'p', text: 'The honest answer to "how much does it cost?" is: it depends on **weight, size and value**. But the pricing logic is simple once you know the three components — freight, fees, and customs. Here is how each works.' },

      { type: 'h2', text: '1. Freight: charged by chargeable weight' },
      { type: 'p', text: 'Air freight from the UK to Kenya starts from **£9/kg**. The number that matters is not the weight on your bathroom scale, but the **chargeable weight** — whichever is greater of:' },
      { type: 'ul', items: [
        '**Actual weight** — what the parcel physically weighs.',
        '**Volumetric weight** — how much space it takes on the plane, calculated as length × width × height (in cm) ÷ 5000.',
      ] },
      { type: 'p', text: 'A dense, small item (a phone, a hard drive) is billed on actual weight. A light, bulky item (a duvet, trainers in a big box) is billed on volumetric weight. This is why we strip bulky retail packaging during consolidation.' },

      { type: 'h3', text: 'Worked example' },
      { type: 'table', headers: ['Item', 'Actual', 'Volumetric', 'Chargeable', 'Approx. freight'], rows: [
        ['Phone in padded mailer', '0.4 kg', '0.2 kg', '0.4 kg', 'from ~£9 (minimum)'],
        ['Pair of trainers (boxed)', '1.2 kg', '2.6 kg', '2.6 kg', 'from ~£23'],
        ['Laptop', '2.2 kg', '1.8 kg', '2.2 kg', 'from ~£20'],
      ] },
      { type: 'p', text: 'Figures are illustrative; always use the live [Shipping Calculator](/pricing) for an exact quote.' },

      { type: 'h2', text: '2. Service fees' },
      { type: 'ul', items: [
        '**Handling** — receiving, checking, repacking and consolidating your goods.',
        '**Insurance (optional but recommended)** — a small percentage of declared value; strongly advised for electronics and branded goods.',
        '**Buy-for-me fee** — if we purchase items for you, a 10% buying fee applies on the item price.',
        '**Card surcharge** — a small processing fee applies to card payments.',
      ] },

      { type: 'h2', text: '3. Kenyan customs: duty + VAT' },
      { type: 'p', text: 'This is the part many first-time importers forget. Kenya Revenue Authority charges duty and tax on the **customs value** of your goods (broadly item value + freight + insurance). Typical components are import duty (commonly 0%, 10% or 25% depending on the product), **16% VAT**, plus smaller levies. Your shipping quote does **not** include these — KRA bills them separately on clearance. See the [Kenya customs guide](/articles/kenya-customs-duty-import-tax-guide) for the full picture.' },

      { type: 'callout', tone: 'warning', title: 'Always declare honestly', text: 'Under-declaring value to dodge duty risks seizure, fines and delays. Accurate declarations keep clearance fast and your goods safe.' },

      { type: 'h2', text: 'How to pay less (legitimately)' },
      { type: 'ol', items: [
        '**Consolidate.** Combine multiple parcels into one shipment to pay a single international leg.',
        '**Cut volume.** Let us remove oversized boxes so you are not paying to fly air.',
        '**Choose the right items.** Heavy, low-value goods are often cheaper to buy locally — reserve shipping for things you cannot get in Kenya.',
        '**Insure smartly.** Insure high-value items; you rarely need it on cheap, replaceable goods.',
        '**Plan around customs.** Know the duty band of what you are buying before you buy it.',
      ] },
    ],
    faqs: [
      { q: 'What is the cheapest way to ship to Kenya?', a: 'Consolidating several parcels into one air shipment and removing bulky packaging gives the lowest cost per item. Sea freight can be cheaper for very heavy, non-urgent goods but takes much longer.' },
      { q: 'Why is my small parcel charged as if it were heavier?', a: 'Because of volumetric weight. Light but bulky parcels are billed on the space they occupy on the plane (L×W×H ÷ 5000), not their actual weight.' },
      { q: 'Does the shipping price include customs duty?', a: 'No. Shipping covers freight, handling and insurance. Kenya Revenue Authority charges import duty and 16% VAT separately when your goods clear customs.' },
      { q: 'How do I get an exact quote?', a: 'Use the live Shipping Calculator with your item weight and dimensions, or send a Buy-for-me link and we quote the full landed cost.' },
    ],
    related: ['how-to-ship-from-uk-to-kenya', 'kenya-customs-duty-import-tax-guide', 'package-consolidation-save-money'],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'kenya-customs-duty-import-tax-guide',
    title: 'Kenya Customs Duty & Import Tax Explained (2026)',
    description:
      'Understand exactly what you pay when importing goods into Kenya: import duty bands, 16% VAT, IDF, Railway Development Levy, and how customs value is calculated.',
    keywords: [
      'Kenya customs duty',
      'Kenya import tax',
      'KRA import duty calculator',
      'VAT on imports Kenya',
      'import declaration fee Kenya',
    ],
    category: 'Customs & tax',
    author: AUTHOR,
    datePublished: '2026-02-02',
    dateModified: '2026-06-01',
    readingTime: 10,
    emoji: '🏛️',
    featured: true,
    quickAnswer:
      'When importing into Kenya you typically pay: import duty (0%, 10% or 25% under the EAC Common External Tariff depending on the product), 16% VAT, an Import Declaration Fee (IDF) of 3.5%, and a Railway Development Levy (RDL) of 2%. These are charged on the customs value — broadly the item cost plus freight and insurance (CIF). Exact rates depend on the product’s tariff code, so always confirm with Kenya Revenue Authority (KRA) or your clearing agent before importing.',
    takeaways: [
      'Duty is based on customs (CIF) value: item cost + freight + insurance.',
      'Import duty bands under the EAC Common External Tariff are commonly 0%, 10% and 25%.',
      'VAT is 16% and applies on top of (duty-inclusive) value for most goods.',
      'IDF is 3.5% and RDL is 2% of the customs value.',
      'Rates vary by product (HS/tariff code) — always verify with KRA before you buy.',
    ],
    body: [
      { type: 'callout', tone: 'warning', title: 'This is general guidance, not tax advice', text: 'Tariff rates change and depend on each product’s exact classification. Always confirm current rates with Kenya Revenue Authority (KRA) or a licensed clearing agent before importing.' },

      { type: 'p', text: 'Customs charges are the part of importing that surprises people most, because they are separate from — and on top of — what you pay for shipping. The good news: once you understand the four building blocks, you can estimate your landed cost with confidence.' },

      { type: 'h2', text: 'What is "customs value"?' },
      { type: 'p', text: 'Kenya, like most countries, assesses duty on the **CIF value** — **C**ost (the item price) + **I**nsurance + **F**reight. So a £200 jacket with £30 freight and £5 insurance has a customs value of about £235, converted to Kenyan Shillings at the prevailing rate. All the percentages below apply to this value.' },

      { type: 'h2', text: 'The four main charges' },
      { type: 'h3', text: '1. Import duty (0% / 10% / 25%)' },
      { type: 'p', text: 'Kenya applies the **East African Community (EAC) Common External Tariff**, with three main bands: **0%** on many raw materials and essential goods, **10%** on intermediate goods, and **25%** on most finished consumer goods. Some "sensitive" items carry higher specific rates.' },
      { type: 'h3', text: '2. Value Added Tax (16%)' },
      { type: 'p', text: 'VAT of **16%** applies to most imported goods, charged on the duty-inclusive value. A handful of categories are zero-rated or exempt.' },
      { type: 'h3', text: '3. Import Declaration Fee — IDF (3.5%)' },
      { type: 'p', text: 'The **IDF is 3.5%** of the customs value, with a minimum charge on small consignments.' },
      { type: 'h3', text: '4. Railway Development Levy — RDL (2%)' },
      { type: 'p', text: 'The **RDL is 2%** of the customs value, funding Kenya’s rail infrastructure.' },

      { type: 'h2', text: 'A worked example' },
      { type: 'p', text: 'Say you import a smartphone with a CIF (customs) value of **KES 100,000**, classified at a 25% duty band:' },
      { type: 'table', headers: ['Charge', 'Rate', 'Amount (KES)'], rows: [
        ['Import duty', '25% of 100,000', '25,000'],
        ['VAT', '16% of (100,000 + 25,000)', '20,000'],
        ['IDF', '3.5% of 100,000', '3,500'],
        ['RDL', '2% of 100,000', '2,000'],
        ['Total taxes', '', '≈ 50,500'],
      ] },
      { type: 'p', text: 'The example is illustrative and rounded; your actual figures depend on the exact tariff code and exchange rate on clearance day.' },

      { type: 'h2', text: 'Who pays, and when?' },
      { type: 'p', text: 'Customs charges fall due when your goods **clear customs** in Kenya, not when you ship. A clearing agent lodges the entry, KRA assesses the duty, and the charges are settled before release. With Thapsus Cargo we guide you through the expected range so there are no surprises.' },

      { type: 'h2', text: 'How to keep customs charges predictable' },
      { type: 'ol', items: [
        '**Declare accurately.** The right value and description means the right tariff code and no penalties.',
        '**Keep invoices.** A clear commercial invoice speeds clearance and supports your declared value.',
        '**Know the band before you buy.** Finished electronics and clothing usually attract the 25% band plus VAT.',
        '**Ask first.** If you are unsure how an item is classified, ask us or a clearing agent before purchasing.',
      ] },
    ],
    faqs: [
      { q: 'How much is import duty in Kenya?', a: 'Under the EAC Common External Tariff, import duty is commonly 0%, 10% or 25% depending on the product category, with some sensitive items at higher specific rates. The exact rate depends on the product’s tariff (HS) code.' },
      { q: 'How much is VAT on imports into Kenya?', a: 'VAT is 16% on most imported goods, charged on the duty-inclusive customs value. Some categories are zero-rated or exempt.' },
      { q: 'What are IDF and RDL?', a: 'The Import Declaration Fee (IDF) is 3.5% and the Railway Development Levy (RDL) is 2% of the customs (CIF) value. Both are standard charges on most imports.' },
      { q: 'How is customs value calculated?', a: 'On the CIF basis: the item cost plus insurance plus freight, converted to Kenyan Shillings. All duty and tax percentages are applied to this value.' },
      { q: 'Can I avoid paying customs?', a: 'No — legitimate imports attract duty and tax. Under-declaring to avoid charges risks seizure and fines. The legal ways to pay less are to import lower-duty categories and to consolidate to reduce freight.' },
    ],
    related: ['how-much-does-shipping-uk-to-kenya-cost', 'prohibited-items-shipping-to-kenya', 'how-to-ship-from-uk-to-kenya'],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'what-is-buy-for-me-service',
    title: 'What Is a Buy-for-Me Service and How Does It Work?',
    description:
      'Buy-for-me lets you shop any UK store without a UK card or address. Learn how the concierge buying service works, what it costs, and when to use it.',
    keywords: [
      'buy for me service',
      'personal shopper UK to Kenya',
      'shop UK stores from Kenya',
      'concierge shopping service',
      'buy from UK without UK card',
    ],
    category: 'Shopping',
    author: AUTHOR,
    datePublished: '2026-02-15',
    dateModified: '2026-06-01',
    readingTime: 6,
    emoji: '🛍️',
    quickAnswer:
      'A Buy-for-me service is a concierge that buys items from UK retailers on your behalf and ships them to you. You send a product link, the service quotes the total in GBP (item price + a buying fee, usually around 10%, + shipping), you pay by card or M-Pesa, and they purchase, receive and forward the item. It lets you shop any UK store even if you have no UK card, no UK address, or the retailer refuses foreign payment cards.',
    takeaways: [
      'You shop UK stores without needing a UK card, UK address or retailer account.',
      'You send a link; the service quotes a single all-in GBP price before buying.',
      'A buying fee (typically ~10% of item price) covers the purchase service.',
      'Great for retailers that block foreign cards or do not ship internationally.',
      'Out-of-stock or wrong items are refunded or credited.',
    ],
    body: [
      { type: 'p', text: 'Plenty of UK retailers either refuse foreign payment cards, decline to ship abroad, or require a UK account. A **Buy-for-me** service removes all of that friction: it acts as your personal shopper in the UK.' },

      { type: 'h2', text: 'How Buy-for-me works, step by step' },
      { type: 'ol', items: [
        '**Send the link.** Paste the product URL (and size/colour/quantity) from any UK store.',
        '**Get a quote.** We reply with an all-in price: item cost + ~10% buying fee + shipping to Kenya. Customs is billed separately on arrival.',
        '**Pay to confirm.** Settle the quote by card, M-Pesa or PayPal. Quotes are typically valid for 24 hours.',
        '**We buy it.** We purchase the item with our UK card and ship it to our UK warehouse.',
        '**We forward it.** The item is consolidated (with anything else you have) and flown to Kenya for collection or door delivery.',
      ] },

      { type: 'h2', text: 'When should I use Buy-for-me instead of doing it myself?' },
      { type: 'ul', items: [
        'You **don’t have a UK card** or the retailer rejects your card.',
        'The retailer **won’t ship internationally** or to a forwarding address.',
        'You want **one accountable point of contact** if something goes wrong with the order.',
        'You’re buying from **multiple stores** and want them consolidated into one shipment.',
      ] },
      { type: 'p', text: 'If you already own the item or have already paid for it, use the [pre-register / parcel forwarding](/articles/how-to-ship-from-uk-to-kenya) path instead and simply ship it to your UK warehouse address.' },

      { type: 'callout', tone: 'tip', title: 'Always shop the UK site', text: 'Use the .co.uk version of a store (e.g. amazon.co.uk, not .com) so the order ships to our UK warehouse and prices are in GBP.' },

      { type: 'h2', text: 'What does Buy-for-me cost?' },
      { type: 'p', text: 'You pay the **item price**, a **buying fee** (typically around 10%), and **shipping** by weight. Card payments carry a small processing surcharge, and Kenyan customs duty/VAT applies on arrival. The quote you approve before purchase makes the total clear up front.' },

      { type: 'h2', text: 'What if the item is out of stock or wrong?' },
      { type: 'p', text: 'If an item sells out before we buy, you get a **full refund or store credit** — your choice. If a retailer ships the wrong item, we handle the return on the UK side wherever the retailer’s policy allows.' },
    ],
    faqs: [
      { q: 'Can I buy from any UK store with Buy-for-me?', a: 'Effectively any UK e-commerce store that delivers to our UK warehouse — Amazon UK, ASOS, John Lewis, Next, Argos, Currys and many more. If you are unsure, send the link and we will confirm.' },
      { q: 'How much is the Buy-for-me fee?', a: 'A buying fee of around 10% of the item price, plus weight-based shipping. The exact figure is shown in your quote before you pay.' },
      { q: 'Do I need a UK bank card?', a: 'No. That is the main reason Buy-for-me exists — we pay with our UK card and you settle with us in GBP via card, M-Pesa or PayPal.' },
      { q: 'What happens if my item is out of stock?', a: 'You receive a full refund or store credit toward another order. We re-check stock before charging if a quote is older than 24 hours.' },
    ],
    related: ['how-to-ship-from-uk-to-kenya', 'best-uk-stores-to-shop-from-kenya', 'package-consolidation-save-money'],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'package-consolidation-save-money',
    title: 'Package Consolidation: How Combining Parcels Saves You Money',
    description:
      'Package consolidation combines multiple UK parcels into one shipment to Kenya, cutting per-parcel shipping fees. Learn how it works and how much you can save.',
    keywords: [
      'package consolidation',
      'parcel consolidation Kenya',
      'combine parcels shipping',
      'save money shipping to Kenya',
      'consolidate shipment',
    ],
    category: 'Logistics',
    author: AUTHOR,
    datePublished: '2026-03-01',
    dateModified: '2026-06-01',
    readingTime: 6,
    emoji: '🧩',
    quickAnswer:
      'Package consolidation means combining several parcels you have received at a UK warehouse into a single shipment to Kenya. Instead of paying the international shipping leg multiple times, you pay it once, and bulky retail packaging is removed to reduce volumetric weight. For shoppers buying from several stores, consolidation commonly cuts total shipping cost by 30–60%.',
    takeaways: [
      'Consolidation = one international shipment instead of several.',
      'You pay the international leg once, not per parcel.',
      'Removing retail boxes lowers volumetric weight and therefore cost.',
      'Best for people ordering from multiple stores over a few weeks.',
      'Typical savings are substantial when shipping 3+ parcels.',
    ],
    body: [
      { type: 'p', text: 'If shipping a parcel to Kenya were a taxi ride, consolidation would be carpooling. Rather than sending each parcel on its own expensive journey, you wait for several to gather at the UK warehouse and send them together.' },

      { type: 'h2', text: 'How consolidation works' },
      { type: 'ol', items: [
        'You shop from several UK stores (or place several Buy-for-me orders) over days or weeks.',
        'Each parcel arrives at your UK warehouse address and is logged to your account.',
        'When you are ready, you request a consolidation.',
        'We open, check and combine the items, removing oversized boxes and void fill.',
        'You receive one quote for one shipment, which we fly to Kenya.',
      ] },

      { type: 'h2', text: 'Why it saves money' },
      { type: 'h3', text: '1. You pay the international leg once' },
      { type: 'p', text: 'Every separate shipment carries its own minimum charges and handling. Combine three parcels and you pay that once, not three times.' },
      { type: 'h3', text: '2. Lower volumetric weight' },
      { type: 'p', text: 'Retail boxes are full of air. By repacking three boxed items into one efficient parcel, we shrink the **volumetric weight** — and air freight is billed on the greater of actual and volumetric weight.' },
      { type: 'h3', text: '3. Fewer customs entries' },
      { type: 'p', text: 'One shipment generally means one customs clearance rather than several, simplifying the process on arrival.' },

      { type: 'callout', tone: 'tip', title: 'How long can I wait to consolidate?', text: 'Items are stored free for a generous window, so you can let a few weeks of shopping accumulate before sending it all at once.' },

      { type: 'h2', text: 'A simple example' },
      { type: 'table', headers: ['Approach', 'Parcels', 'Indicative cost'], rows: [
        ['Ship each separately', '3 × small parcels', 'Higher (3 minimums + 3 handlings)'],
        ['Consolidate', '1 combined parcel', 'Lower (1 leg, reduced volume)'],
      ] },
      { type: 'p', text: 'For shoppers buying from multiple stores, consolidation commonly reduces total shipping cost by **30–60%**. Use the [Shipping Calculator](/pricing) to compare for your specific items.' },
    ],
    faqs: [
      { q: 'What is package consolidation?', a: 'It is the process of combining several parcels received at a UK warehouse into one shipment to Kenya, so you pay the international shipping leg once instead of per parcel.' },
      { q: 'How much can consolidation save me?', a: 'For multiple parcels, savings of 30–60% on total shipping are common, thanks to paying one international leg and reducing volumetric weight by removing bulky packaging.' },
      { q: 'How long can my parcels stay in the warehouse?', a: 'Items are stored free for a generous window, giving you time to let several orders arrive before you consolidate.' },
      { q: 'Will you remove the original boxes?', a: 'Where it is safe to do so, yes — removing oversized retail packaging cuts volumetric weight and your cost. Fragile or collectible items can be kept in their boxes on request.' },
    ],
    related: ['how-much-does-shipping-uk-to-kenya-cost', 'how-to-ship-from-uk-to-kenya', 'what-is-buy-for-me-service'],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'air-freight-vs-sea-freight-kenya',
    title: 'Air Freight vs Sea Freight to Kenya: Which Should You Choose?',
    description:
      'Compare air freight and sea freight from the UK to Kenya on cost, speed, and the types of goods each suits, so you can pick the right option for your shipment.',
    keywords: [
      'air freight vs sea freight Kenya',
      'sea freight to Kenya',
      'air cargo Kenya',
      'shipping options Kenya',
      'cheapest freight to Kenya',
    ],
    category: 'Logistics',
    author: AUTHOR,
    datePublished: '2026-03-18',
    dateModified: '2026-06-01',
    readingTime: 7,
    emoji: '✈️',
    quickAnswer:
      'Choose air freight when you need speed (7–14 days) or are shipping smaller, higher-value or urgent goods — it costs more per kilo but is fast and well-tracked. Choose sea freight for heavy, bulky, non-urgent shipments (furniture, large appliances, big bulk orders), where the much lower per-kilo cost outweighs the longer transit of several weeks. For most online shopping parcels, air freight is the practical choice.',
    takeaways: [
      'Air freight: ~7–14 days, higher per-kg cost, best for parcels and urgent/valuable goods.',
      'Sea freight: several weeks, much lower per-kg cost, best for heavy or bulky cargo.',
      'Air is billed on chargeable weight; sea is typically billed by volume (cubic metres).',
      'Most e-commerce parcels go by air; full house moves and bulk goods favour sea.',
      'You can mix: urgent items by air, the heavy remainder by sea.',
    ],
    body: [
      { type: 'p', text: 'There is no single "best" freight mode — only the best fit for a given shipment. The decision comes down to **how fast you need it** versus **how heavy and bulky it is**.' },

      { type: 'h2', text: 'Air freight at a glance' },
      { type: 'ul', items: [
        '**Speed:** roughly 7–14 business days UK→Kenya after dispatch.',
        '**Cost basis:** chargeable weight (greater of actual vs volumetric).',
        '**Best for:** online shopping parcels, electronics, documents, anything urgent or valuable.',
        '**Tracking:** frequent milestone updates.',
      ] },

      { type: 'h2', text: 'Sea freight at a glance' },
      { type: 'ul', items: [
        '**Speed:** typically several weeks door-to-door.',
        '**Cost basis:** usually by volume (cubic metres) or container share.',
        '**Best for:** furniture, large appliances, vehicles parts, and large bulk orders.',
        '**Trade-off:** much cheaper per unit of weight, but slow and less granular tracking.',
      ] },

      { type: 'h2', text: 'Side-by-side comparison' },
      { type: 'table', headers: ['Factor', 'Air freight', 'Sea freight'], rows: [
        ['Transit time', '~7–14 days', 'Several weeks'],
        ['Cost per kg', 'Higher', 'Much lower'],
        ['Best cargo', 'Small, urgent, valuable', 'Heavy, bulky, non-urgent'],
        ['Billing basis', 'Chargeable weight', 'Volume / container share'],
        ['Tracking detail', 'High', 'Lower'],
      ] },

      { type: 'h2', text: 'How to decide' },
      { type: 'ol', items: [
        '**Is it urgent?** If yes, air.',
        '**Is it heavy or very bulky?** If yes and not urgent, sea may save a lot.',
        '**Is it high-value relative to weight?** Electronics and fashion usually go by air.',
        '**Is it a house move or bulk purchase?** Sea (or a mix) often wins.',
      ] },

      { type: 'callout', tone: 'tip', title: 'You don’t have to pick just one', text: 'Send the things you need now by air and the heavy, non-urgent remainder by sea. Talk to us and we’ll split the shipment sensibly.' },

      { type: 'p', text: 'For the vast majority of online-shopping parcels, **air freight** is the right call — fast, well-tracked, and competitively priced once consolidated. Reserve sea freight for the genuinely heavy and non-urgent.' },
    ],
    faqs: [
      { q: 'Is sea freight to Kenya cheaper than air?', a: 'Per kilogram, yes — significantly. But it takes several weeks and is billed by volume, so it only wins for heavy, bulky, non-urgent shipments. For small parcels, consolidated air freight is usually more practical.' },
      { q: 'How long does sea freight from the UK to Kenya take?', a: 'Typically several weeks door-to-door, depending on sailing schedules, port handling and customs clearance.' },
      { q: 'Which is better for electronics?', a: 'Air freight. Electronics are high-value relative to their weight, time-sensitive, and benefit from the faster, better-tracked air route.' },
      { q: 'Can I combine air and sea in one move?', a: 'Yes. A common approach is to send urgent items by air and the heavy, non-urgent remainder by sea to balance speed and cost.' },
    ],
    related: ['how-much-does-shipping-uk-to-kenya-cost', 'package-consolidation-save-money', 'how-to-ship-from-uk-to-kenya'],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'prohibited-items-shipping-to-kenya',
    title: 'Prohibited & Restricted Items: What You Can’t Ship to Kenya',
    description:
      'A practical guide to items that are prohibited or restricted when shipping to Kenya — from batteries and liquids to counterfeits — and how to avoid costly delays.',
    keywords: [
      'prohibited items Kenya',
      'restricted items shipping Kenya',
      'what can I not ship to Kenya',
      'KRA banned imports',
      'shipping restrictions Kenya',
    ],
    category: 'Customs & tax',
    author: AUTHOR,
    datePublished: '2026-04-05',
    dateModified: '2026-06-01',
    readingTime: 7,
    emoji: '🚫',
    quickAnswer:
      'You cannot ship weapons, illegal drugs, counterfeit or pirated goods, hazardous and flammable materials, or perishable foods to Kenya. Some items are restricted rather than banned — medicines, certain electronics, plants and animal products — and need permits or special handling. Lithium batteries, liquids and aerosols face air-transport limits. When unsure, check our prohibited-items list or ask support before shipping.',
    takeaways: [
      'Outright banned: weapons, illegal drugs, counterfeits, hazardous/flammable goods, most perishables.',
      'Restricted (need permits/handling): medicines, some electronics, plants, animal products.',
      'Lithium batteries, liquids and aerosols have strict air-freight limits.',
      'Counterfeit/branded fakes risk seizure and penalties — never ship them.',
      'When in doubt, ask before you buy or send.',
    ],
    body: [
      { type: 'callout', tone: 'warning', title: 'Rules change — check before you ship', text: 'Prohibited and restricted lists are updated by Kenyan authorities and air carriers. Always confirm the current rules with us or KRA before shipping anything you are unsure about.' },

      { type: 'p', text: 'Most everyday shopping ships without issue. But a small number of items are either **prohibited** (never allowed) or **restricted** (allowed only with permits or special handling). Knowing the difference saves you from seizures, fines and delays.' },

      { type: 'h2', text: 'Commonly prohibited items' },
      { type: 'ul', items: [
        '**Weapons and ammunition** — firearms, replicas, and parts.',
        '**Illegal drugs and narcotics** — and associated paraphernalia.',
        '**Counterfeit and pirated goods** — fake branded items, copied media.',
        '**Hazardous and flammable materials** — fuels, certain chemicals, fireworks.',
        '**Perishable foods** — most fresh foods that can spoil in transit.',
        '**Obscene or prohibited publications.**',
      ] },

      { type: 'h2', text: 'Commonly restricted items' },
      { type: 'p', text: 'These are not banned, but need permits, licences or special handling — and may be refused without the right paperwork:' },
      { type: 'ul', items: [
        '**Medicines and supplements** — may require permits/prescriptions.',
        '**Plants, seeds and animal products** — phytosanitary or veterinary controls.',
        '**Certain electronics and communications gear** — may need type approval.',
        '**Alcohol and tobacco** — restricted and heavily taxed where allowed.',
      ] },

      { type: 'h2', text: 'Air-transport limits to watch' },
      { type: 'h3', text: 'Lithium batteries' },
      { type: 'p', text: 'Devices with built-in lithium batteries (phones, laptops, power banks) are generally fine within limits, but **loose/spare lithium batteries and large power banks** face strict air-cargo rules and may be refused.' },
      { type: 'h3', text: 'Liquids, aerosols and pressurised items' },
      { type: 'p', text: 'Perfumes, aerosols and pressurised cans are flammable or pressure-sensitive and are often restricted or prohibited on passenger-belly air cargo.' },

      { type: 'h2', text: 'What happens if I ship a prohibited item?' },
      { type: 'p', text: 'At best it is returned or held; at worst it is **seized and you face penalties**. Counterfeit goods in particular are routinely confiscated. It is never worth the risk — check first.' },

      { type: 'callout', tone: 'tip', title: 'Not sure about an item?', text: 'See our full [Prohibited Items list](/prohibited) or message support with the product link before you buy. A 30-second check beats a seized parcel.' },
    ],
    faqs: [
      { q: 'Can I ship a power bank to Kenya?', a: 'Loose lithium batteries and large power banks face strict air-cargo limits and are often refused. Devices with built-in batteries are generally accepted within limits. Check the specific capacity with us before shipping.' },
      { q: 'Can I ship perfume or aerosols?', a: 'These are flammable or pressurised and are commonly restricted or prohibited on air cargo. Confirm with us before ordering.' },
      { q: 'What happens if I ship a prohibited item by mistake?', a: 'It may be held, returned, or seized, and you could face penalties. That is why we ask you to check our prohibited-items list or contact support whenever you are unsure.' },
      { q: 'Are counterfeit branded goods allowed?', a: 'No. Counterfeit and pirated goods are prohibited and are routinely seized by customs, with penalties for the importer.' },
    ],
    related: ['kenya-customs-duty-import-tax-guide', 'how-to-ship-from-uk-to-kenya', 'how-much-does-shipping-uk-to-kenya-cost'],
  },

  // ─────────────────────────────────────────────────────────────────────────
  {
    slug: 'best-uk-stores-to-shop-from-kenya',
    title: 'Best UK Online Stores to Shop From When You’re in Kenya',
    description:
      'The most popular UK online stores Kenyan shoppers buy from — fashion, electronics, beauty and home — plus tips for checkout, sizing and shipping to Kenya.',
    keywords: [
      'best UK online stores',
      'shop UK stores from Kenya',
      'UK shopping websites Kenya',
      'buy from Amazon UK Kenya',
      'UK retailers ship to Kenya',
    ],
    category: 'Shopping',
    author: AUTHOR,
    datePublished: '2026-04-22',
    dateModified: '2026-06-01',
    readingTime: 7,
    emoji: '🛒',
    quickAnswer:
      'The most popular UK stores for shoppers in Kenya include Amazon UK, ASOS, Next, John Lewis, Marks & Spencer, Boots, Currys, JD Sports, Argos and Selfridges. Shop the .co.uk version so orders ship to a UK warehouse address in GBP, then forward or use Buy-for-me to bring them to Kenya. Choose stores with clear sizing, GBP pricing and good returns.',
    takeaways: [
      'Always use the .co.uk site so prices are in GBP and orders reach the UK warehouse.',
      'Fashion: ASOS, Next, M&S, JD Sports. Electronics: Amazon UK, Currys.',
      'Beauty: Boots, LookFantastic. Home & department: John Lewis, Selfridges, Argos.',
      'Check sizing guides — UK sizes differ from US/EU.',
      'Buy-for-me covers stores that block foreign cards or international shipping.',
    ],
    body: [
      { type: 'p', text: 'UK retail is a treasure trove — but only if you can actually check out and get the goods home. Here are the stores Kenyan shoppers reach for most, grouped by category, with practical tips.' },

      { type: 'h2', text: 'Fashion & apparel' },
      { type: 'ul', items: [
        '**ASOS** — huge range, frequent sales, generous returns; great for trend-led fashion.',
        '**Next** — reliable quality across clothing, kids and homeware.',
        '**Marks & Spencer** — wardrobe staples, lingerie and quality basics.',
        '**JD Sports** — trainers and sportswear, often with exclusive drops.',
      ] },

      { type: 'h2', text: 'Electronics & tech' },
      { type: 'ul', items: [
        '**Amazon UK** — the widest selection of anything, fast UK delivery to our warehouse.',
        '**Currys** — laptops, TVs, appliances and accessories.',
      ] },
      { type: 'callout', tone: 'tip', title: 'Mind voltage & plugs', text: 'The UK and Kenya both use Type G plugs and 230–240V mains, so most UK electronics work in Kenya without a converter — one of the reasons UK electronics shopping is so popular.' },

      { type: 'h2', text: 'Beauty & health' },
      { type: 'ul', items: [
        '**Boots** — skincare, fragrance and health essentials.',
        '**LookFantastic** — premium beauty brands and bundles.',
      ] },

      { type: 'h2', text: 'Home & department stores' },
      { type: 'ul', items: [
        '**John Lewis** — quality homeware and electronics with strong guarantees.',
        '**Argos** — everyday home goods at sharp prices.',
        '**Selfridges** — luxury fashion and gifts.',
      ] },

      { type: 'h2', text: 'Tips for shopping UK stores from Kenya' },
      { type: 'ol', items: [
        '**Use the UK site (.co.uk).** Prices in GBP, ships to your UK warehouse address.',
        '**Enter your TC Code.** Add it to the address so we match your parcel instantly.',
        '**Check sizing.** UK clothing and shoe sizes differ from US/EU — use each store’s size guide.',
        '**Watch for restricted items.** Batteries, aerosols and liquids have shipping limits.',
        '**Consolidate.** Buy from several stores, then combine into one shipment to save.',
        '**No UK card? Use Buy-for-me.** We purchase on your behalf and ship it on.',
      ] },

      { type: 'p', text: 'Browse our curated [UK stores directory](/uk-stores) to jump straight to popular retailers, then forward your haul or place a [Buy-for-me request](/buy-for-me).' },
    ],
    faqs: [
      { q: 'Which UK stores are most popular with Kenyan shoppers?', a: 'Amazon UK, ASOS, Next, John Lewis, Marks & Spencer, Boots, Currys, JD Sports, Argos and Selfridges are among the most popular, spanning fashion, electronics, beauty and home.' },
      { q: 'Do UK electronics work in Kenya?', a: 'Generally yes. The UK and Kenya share Type G plugs and 230–240V mains, so most UK electronics work without a voltage converter.' },
      { q: 'What if a UK store won’t accept my card or ship abroad?', a: 'Use a Buy-for-me service: you send the product link, we purchase it with our UK card and ship it to Kenya for you.' },
      { q: 'How do I make sure my parcel is matched to my account?', a: 'Always include your TC Code in the delivery address at checkout so the warehouse links the parcel to you the moment it arrives.' },
    ],
    related: ['what-is-buy-for-me-service', 'how-to-ship-from-uk-to-kenya', 'package-consolidation-save-money'],
  },
]

/** Look up a single article by its slug. */
export function getArticleBySlug(slug) {
  return articles.find((a) => a.slug === slug)
}

/** Resolve an array of slugs to full article objects (for "related" links). */
export function getRelatedArticles(slugs = []) {
  return slugs.map(getArticleBySlug).filter(Boolean)
}
