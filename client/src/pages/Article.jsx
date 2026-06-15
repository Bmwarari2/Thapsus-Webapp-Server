import React, { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Clock, Calendar, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react'
import { getArticleBySlug, getRelatedArticles } from '../data/articles'
import { SEO } from '../components/SEO'
import { Reveal } from '../components/motion'

const SITE_URL = 'https://thapsus.uk'

/* ── Inline markup: **bold** and [label](url) → React nodes ─────────────────── */
function renderInline(text) {
  if (!text) return null
  const tokens = []
  // Split on **bold** and [label](url) while keeping the delimiters.
  const regex = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let m
  let key = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) tokens.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) {
      tokens.push(<strong key={key++} className="text-white font-semibold">{tok.slice(2, -2)}</strong>)
    } else {
      const label = tok.slice(1, tok.indexOf(']'))
      const url = tok.slice(tok.indexOf('(') + 1, -1)
      const external = /^https?:\/\//.test(url)
      tokens.push(
        external
          ? <a key={key++} href={url} target="_blank" rel="noopener noreferrer" className="text-ember-400 underline decoration-ember-500/40 hover:decoration-ember-400">{label}</a>
          : <Link key={key++} to={url} className="text-ember-400 underline decoration-ember-500/40 hover:decoration-ember-400">{label}</Link>
      )
    }
    last = regex.lastIndex
  }
  if (last < text.length) tokens.push(text.slice(last))
  return tokens
}

const CALLOUT_STYLES = {
  tip: { icon: Lightbulb, ring: 'border-ember-500/30 bg-ember-500/[0.06]', tint: 'text-ember-300' },
  warning: { icon: AlertTriangle, ring: 'border-amber-500/30 bg-amber-500/[0.06]', tint: 'text-amber-300' },
  info: { icon: CheckCircle2, ring: 'border-sky-500/30 bg-sky-500/[0.06]', tint: 'text-sky-300' },
}

/* ── Single body block renderer ─────────────────────────────────────────────── */
function Block({ block }) {
  switch (block.type) {
    case 'h2':
      return <h2 className="text-2xl md:text-3xl font-bold text-white mt-10 mb-4 scroll-mt-24">{block.text}</h2>
    case 'h3':
      return <h3 className="text-xl font-bold text-white mt-7 mb-3">{block.text}</h3>
    case 'p':
      return <p className="text-mute text-base md:text-lg leading-relaxed mb-4">{renderInline(block.text)}</p>
    case 'ul':
      return (
        <ul className="list-disc pl-6 space-y-2 mb-5 text-mute text-base md:text-lg leading-relaxed marker:text-ember-500">
          {block.items.map((it, i) => <li key={i}>{renderInline(it)}</li>)}
        </ul>
      )
    case 'ol':
      return (
        <ol className="list-decimal pl-6 space-y-2 mb-5 text-mute text-base md:text-lg leading-relaxed marker:text-ember-400 marker:font-bold">
          {block.items.map((it, i) => <li key={i}>{renderInline(it)}</li>)}
        </ol>
      )
    case 'quote':
      return (
        <blockquote className="border-l-4 border-ember-500 pl-5 my-6 italic text-white/90 text-lg">
          {renderInline(block.text)}
        </blockquote>
      )
    case 'callout': {
      const s = CALLOUT_STYLES[block.tone] || CALLOUT_STYLES.info
      const Icon = s.icon
      return (
        <div className={`rounded-2xl border p-5 my-6 ${s.ring}`}>
          <div className={`flex items-center gap-2 font-bold mb-1.5 ${s.tint}`}>
            <Icon size={18} /> {block.title}
          </div>
          <p className="text-mute leading-relaxed">{renderInline(block.text)}</p>
        </div>
      )
    }
    case 'table':
      return (
        <div className="overflow-x-auto no-scrollbar my-6 rounded-2xl border border-line">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-white/[0.04]">
                {block.headers.map((h, i) => (
                  <th key={i} className="px-4 py-3 font-bold text-white whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} className="border-t border-line">
                  {row.map((cell, ci) => (
                    <td key={ci} className={`px-4 py-3 ${ci === 0 ? 'text-white font-semibold' : 'text-mute'}`}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    default:
      return null
  }
}

export const Article = () => {
  const { slug } = useParams()
  const article = getArticleBySlug(slug)
  const related = useMemo(() => getRelatedArticles(article?.related), [article])

  const jsonLd = useMemo(() => {
    if (!article) return []
    const url = `${SITE_URL}/articles/${article.slug}`
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: article.title,
        description: article.description,
        keywords: (article.keywords || []).join(', '),
        articleSection: article.category,
        datePublished: article.datePublished,
        dateModified: article.dateModified || article.datePublished,
        author: { '@type': 'Organization', name: article.author?.name || 'Thapsus Cargo' },
        publisher: { '@type': 'Organization', name: 'Thapsus Cargo', logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` } },
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        url,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: (article.faqs || []).map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE_URL}/articles` },
          { '@type': 'ListItem', position: 3, name: article.title, item: url },
        ],
      },
    ]
  }, [article])

  if (!article) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-3">Guide not found</h1>
          <p className="text-mute mb-6">This guide doesn’t exist or may have moved.</p>
          <Link to="/articles" className="btn-primary">Browse all guides</Link>
        </div>
      </div>
    )
  }

  const published = new Date(article.dateModified || article.datePublished)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="relative overflow-hidden py-12 px-4">
      <SEO
        title={article.title}
        description={article.description}
        canonical={`/articles/${article.slug}`}
        type="article"
        jsonLd={jsonLd}
      />

      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[44rem] h-[44rem] bg-ember-radial blur-2xl pointer-events-none" />

      <article className="max-w-3xl mx-auto relative">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <Link to="/articles" className="inline-flex items-center gap-1.5 text-sm font-semibold text-mute hover:text-ember-400 transition-colors">
            <ArrowLeft size={15} /> All guides
          </Link>
        </nav>

        {/* Header */}
        <header className="mb-8">
          <span className="text-[10px] font-black uppercase tracking-widest text-ember-300 bg-ember-500/10 border border-ember-500/20 px-2.5 py-1 rounded-full">{article.category}</span>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white mt-4 leading-[1.1]">{article.title}</h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-5 text-sm text-mute font-semibold">
            <span className="flex items-center gap-1.5"><Clock size={14} /> {article.readingTime} min read</span>
            <span className="flex items-center gap-1.5"><Calendar size={14} /> Updated {published}</span>
            {article.author?.name && <span>By {article.author.name}</span>}
          </div>
        </header>

        {/* Quick answer (AEO featured-snippet target) */}
        {article.quickAnswer && (
          <Reveal className="glow-card p-6 mb-8">
            <div className="flex items-center gap-2 text-ember-300 font-bold mb-2">
              <HelpCircle size={18} /> Quick answer
            </div>
            <p className="text-white/90 text-base md:text-lg leading-relaxed">{article.quickAnswer}</p>
          </Reveal>
        )}

        {/* Key takeaways */}
        {article.takeaways?.length > 0 && (
          <div className="rounded-2xl border border-line bg-surface p-6 mb-10">
            <h2 className="eyebrow !tracking-widest mb-3">Key takeaways</h2>
            <ul className="space-y-2.5">
              {article.takeaways.map((t, i) => (
                <li key={i} className="flex items-start gap-2.5 text-mute leading-relaxed">
                  <CheckCircle2 size={18} className="text-ember-400 shrink-0 mt-0.5" />
                  <span>{renderInline(t)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Body */}
        <div className="article-body">
          {article.body.map((block, i) => <Block key={i} block={block} />)}
        </div>

        {/* FAQs */}
        {article.faqs?.length > 0 && (
          <section className="mt-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-5">Frequently asked questions</h2>
            <div className="space-y-3">
              {article.faqs.map((f, i) => (
                <details key={i} className="group rounded-2xl border border-line bg-surface p-5 [&_summary]:cursor-pointer">
                  <summary className="font-semibold text-white list-none flex items-center justify-between gap-4">
                    {f.q}
                    <span className="text-ember-400 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
                  </summary>
                  <p className="text-mute leading-relaxed mt-3">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <div className="glow-card p-8 text-center mt-12">
          <h3 className="text-2xl font-bold text-white mb-2">Ready to ship from the UK to Kenya?</h3>
          <p className="text-mute mb-6">Get an instant quote, or let us buy and ship it for you.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/pricing" className="btn-primary glass-sheen">Get a quote</Link>
            <Link to="/register" className="btn-secondary">Create a free account</Link>
          </div>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <section className="mt-14">
            <h2 className="eyebrow !tracking-widest mb-4">Related guides</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {related.map((r) => (
                <Link key={r.slug} to={`/articles/${r.slug}`}
                  className="group rounded-2xl bg-surface-2 border border-line p-5 hover:border-line-strong transition-colors flex flex-col gap-2">
                  <span className="text-xl">{r.emoji}</span>
                  <h3 className="font-bold text-white text-sm leading-snug group-hover:text-ember-300 transition-colors">{r.title}</h3>
                  <span className="inline-flex items-center gap-1 text-ember-400 text-xs font-semibold mt-auto pt-1">
                    Read <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>
    </div>
  )
}

export default Article
