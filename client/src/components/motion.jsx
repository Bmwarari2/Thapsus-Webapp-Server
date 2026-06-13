import React, { useRef, useState, useEffect } from 'react'

/* Shared scroll-driven motion primitives (reusable across every page). */

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function useInView(once = true, threshold = 0.12) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReduced() || typeof IntersectionObserver === 'undefined') { setInView(true); return }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { setInView(true); if (once) io.disconnect() }
        else if (!once) setInView(false)
      })
    }, { threshold, rootMargin: '0px 0px -6% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [once, threshold])
  return [ref, inView]
}

/* Fade/slide a block into view as it scrolls in. variant: '', 'left', 'right', 'scale'. */
export function Reveal({ as: Tag = 'div', children, delay = 0, variant = '', className = '', once = true, ...rest }) {
  const [ref, inView] = useInView(once)
  return (
    <Tag
      ref={ref}
      data-reveal={variant}
      className={`${inView ? 'is-visible' : ''} ${className}`}
      style={{ '--reveal-delay': `${delay}ms`, ...(rest.style || {}) }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/* Headline that resolves word-by-word from dim+blurred to sharp white. */
export function FocusText({ text, as: Tag = 'h2', className = '', stagger = 45 }) {
  const [ref, inView] = useInView(true, 0.2)
  const words = String(text).split(' ')
  return (
    <Tag ref={ref} className={`focus-text ${inView ? 'is-visible' : ''} ${className}`}>
      {words.map((w, i) => (
        <span key={i} className="focus-word" style={{ '--word-delay': `${i * stagger}ms` }}>
          {w}{i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </Tag>
  )
}

/* Number that counts up from 0 to `to` when scrolled into view. */
export function CountUp({ to = 0, duration = 1500, prefix = '', suffix = '', decimals = 0, className = '' }) {
  const [ref, inView] = useInView(true, 0.4)
  const [val, setVal] = useState(0)
  const raf = useRef(0)
  useEffect(() => {
    if (!inView) return
    if (prefersReduced()) { setVal(to); return }
    const start = performance.now()
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3) // ease-out cubic
      setVal(to * eased)
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [inView, to, duration])
  const display = val.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals })
  return <span ref={ref} className={className}>{prefix}{display}{suffix}</span>
}

/* Animated ember "data core": breathing glow, pulsing rings, rising sparks,
   orbiting nodes — the signature hero centrepiece from the reference. */
export function DataCore({ className = '' }) {
  return (
    <div className={`data-core ${className}`} aria-hidden="true">
      <div className="core-glow" />
      <span className="ring" />
      <span className="ring" />
      <span className="ring" />
      <div className="disc" />
      {[
        { ml: -30, d: '0s' }, { ml: 0, d: '0.6s' }, { ml: 28, d: '1.1s' },
        { ml: -14, d: '1.7s' }, { ml: 14, d: '2.2s' },
      ].map((s, i) => (
        <span key={i} className="spark" style={{ marginLeft: `${s.ml}px`, animationDelay: s.d }} />
      ))}
      {[
        { o: 110, d: '0s', dur: '14s' }, { o: 130, d: '-5s', dur: '18s' }, { o: 95, d: '-9s', dur: '12s' },
      ].map((n, i) => (
        <span key={i} className="orbit-node" style={{ '--orbit': `${n.o}px`, animationDelay: n.d, animationDuration: n.dur }} />
      ))}
    </div>
  )
}
