import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { UK_STORES, storeInitials } from '../data/ukStores'

/**
 * A clickable, auto-scrolling marquee of popular UK stores. Each chip opens
 * the store in a new tab; the trailing pill links to the full /uk-stores
 * directory. Reminds customers to shop the UK version of a retailer.
 *
 * The track is duplicated and translated -50% so the loop is seamless;
 * `animation-play-state: paused` on hover lets users grab a chip.
 */
const Chip = ({ store }) => (
  <a
    href={store.url}
    target="_blank"
    rel="noreferrer"
    className="shrink-0 inline-flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full bg-surface-2 border border-line hover:border-line-strong hover:bg-white/[0.05] transition-colors"
  >
    <span
      className="w-8 h-8 rounded-full grid place-items-center text-[11px] font-black text-white shadow-inner"
      style={{ background: store.color }}
    >
      {storeInitials(store.name)}
    </span>
    <span className="text-sm font-bold text-white whitespace-nowrap">{store.name}</span>
  </a>
)

export const UkStoresMarquee = () => {
  // Two rows scrolling opposite directions, a curated slice each for variety.
  const rowA = UK_STORES.slice(0, Math.ceil(UK_STORES.length / 2))
  const rowB = UK_STORES.slice(Math.ceil(UK_STORES.length / 2))

  return (
    <div className="relative">
      <style>{`
        @keyframes marquee-l { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes marquee-r { from { transform: translateX(-50%); } to { transform: translateX(0); } }
        .marquee-track { display:flex; gap:0.75rem; width:max-content; }
        .marquee-l { animation: marquee-l 38s linear infinite; }
        .marquee-r { animation: marquee-r 44s linear infinite; }
        .marquee-mask:hover .marquee-l, .marquee-mask:hover .marquee-r { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .marquee-l, .marquee-r { animation: none; }
        }
      `}</style>

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-black uppercase tracking-widest text-mute">
          Shop UK stores · paste a <span className="text-ember-400">.co.uk</span> link
        </p>
        <Link to="/uk-stores" className="text-xs font-bold text-ember-400 inline-flex items-center gap-1 hover:underline">
          Browse all <ArrowRight size={13} />
        </Link>
      </div>

      <div className="marquee-mask space-y-3 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
        <div className="marquee-track marquee-l">
          {[...rowA, ...rowA].map((s, i) => <Chip key={`a-${i}`} store={s} />)}
        </div>
        <div className="marquee-track marquee-r">
          {[...rowB, ...rowB].map((s, i) => <Chip key={`b-${i}`} store={s} />)}
        </div>
      </div>
    </div>
  )
}

export default UkStoresMarquee
