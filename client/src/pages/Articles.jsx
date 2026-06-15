import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Search, Clock, ArrowRight } from 'lucide-react'
import { articles, ARTICLE_CATEGORIES } from '../data/articles'
import { SEO } from '../components/SEO'
import { PillLabel } from '../components/ui'
import { Reveal } from '../components/motion'

const SITE_URL = 'https://thapsus.uk'

/**
 * /articles — public Resources hub. A searchable, filterable index of the
 * SEO/AEO-optimized shipping guides defined in src/data/articles.js.
 *
 * Emits Blog + ItemList JSON-LD so search and answer engines understand the
 * collection and can surface individual guides.
 */
export const Articles = () => {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')

  const sorted = useMemo(
    () => [...articles].sort((a, b) => new Date(b.datePublished) - new Date(a.datePublished)),
    []
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return sorted.filter((a) => {
      if (cat !== 'All' && a.category !== cat) return false
      if (!needle) return true
      return (
        a.title.toLowerCase().includes(needle) ||
        a.description.toLowerCase().includes(needle) ||
        (a.keywords || []).some((k) => k.toLowerCase().includes(needle))
      )
    })
  }, [q, cat, sorted])

  const featured = sorted.filter((a) => a.featured).slice(0, 3)

  const jsonLd = useMemo(() => ([
    {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'Thapsus Cargo Shipping Guides',
      description:
        'In-depth guides on shipping from the UK to Kenya — costs, customs, consolidation, Buy-for-me and more.',
      url: `${SITE_URL}/articles`,
      publisher: { '@type': 'Organization', name: 'Thapsus Cargo', logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` } },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: sorted.map((a, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/articles/${a.slug}`,
        name: a.title,
      })),
    },
  ]), [sorted])

  return (
    <div className="relative overflow-hidden py-14 px-4">
      <SEO
        title="Shipping Guides & Resources"
        description="In-depth guides on shipping from the UK to Kenya — costs, customs duty, package consolidation, Buy-for-me and more. Practical, up-to-date answers for Kenyan shoppers."
        canonical="/articles"
        jsonLd={jsonLd}
      />

      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[44rem] h-[44rem] bg-ember-radial blur-2xl pointer-events-none" />

      <div className="max-w-6xl mx-auto relative">
        {/* Header */}
        <Reveal className="mb-10 text-center space-y-5">
          <div className="flex justify-center"><PillLabel>Resources</PillLabel></div>
          <div className="flex justify-center"><span className="ember-badge w-16 h-16 rounded-3xl"><BookOpen size={32} /></span></div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">Shipping guides &amp; resources</h1>
          <p className="text-mute text-lg max-w-2xl mx-auto">
            Clear, in-depth answers to everything about shipping from the UK to Kenya —
            costs, customs, consolidation and smart shopping.
          </p>
        </Reveal>

        {/* Featured */}
        {featured.length > 0 && !q && cat === 'All' && (
          <Reveal className="mb-12">
            <h2 className="eyebrow !tracking-widest mb-4 px-1">Start here</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {featured.map((a) => (
                <Link key={a.slug} to={`/articles/${a.slug}`}
                  className="glow-card p-6 flex flex-col gap-3 hover:border-ember-500/40 transition-colors group">
                  <span className="text-3xl">{a.emoji}</span>
                  <h3 className="text-lg font-bold text-white leading-snug group-hover:text-ember-300 transition-colors">{a.title}</h3>
                  <p className="text-mute text-sm leading-relaxed line-clamp-3 flex-grow">{a.description}</p>
                  <span className="inline-flex items-center gap-1.5 text-ember-400 text-sm font-semibold">
                    Read guide <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
                  </span>
                </Link>
              ))}
            </div>
          </Reveal>
        )}

        {/* Search + category filter */}
        <div className="sticky top-[calc(4rem+env(safe-area-inset-top,0px))] z-20 -mx-4 px-4 py-3 bg-ink/70 backdrop-blur-xl">
          <div className="relative mb-3">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-mute" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search guides…"
              aria-label="Search guides"
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-surface-2 border border-line text-white font-semibold placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-ember-500/30 focus:border-ember-500 transition-all"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {['All', ...ARTICLE_CATEGORIES].map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`shrink-0 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest border transition-all ${
                  cat === c
                    ? 'bg-ember-gradient text-white border-transparent'
                    : 'bg-surface-2 text-mute border-line hover:text-white'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {filtered.map((a) => (
            <Link key={a.slug} to={`/articles/${a.slug}`}
              className="group rounded-3xl bg-surface-2 border border-line p-6 hover:border-line-strong transition-colors flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{a.emoji}</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-ember-300 bg-ember-500/10 border border-ember-500/20 px-2.5 py-1 rounded-full">{a.category}</span>
              </div>
              <h3 className="font-bold text-white leading-snug group-hover:text-ember-300 transition-colors">{a.title}</h3>
              <p className="text-mute text-sm leading-relaxed line-clamp-3 flex-grow">{a.description}</p>
              <div className="flex items-center gap-1.5 text-xs text-mute font-semibold pt-1">
                <Clock size={13} /> {a.readingTime} min read
              </div>
            </Link>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-20 text-mute">
            <BookOpen size={40} className="mx-auto mb-4 opacity-40" />
            <p className="font-semibold">No guides match “{q}”.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Articles
