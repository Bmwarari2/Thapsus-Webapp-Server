import plugin from 'tailwindcss/plugin'

/**
 * Thapsus Cargo — dark design system ("Ember")
 * Palette derived from the logo: amber #F5A623 → orange #F26418 → scarlet #F03000.
 * Near-black surfaces, soft orange glows, white headings, gray body.
 */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Dark surfaces ────────────────────────────────────────────────
        ink: {
          DEFAULT: '#08080B',  // page background (deepest)
          800: '#0C0C10',
          700: '#101015',
        },
        surface: {
          DEFAULT: '#121216',  // base card
          2: '#17171D',        // elevated card / input
          3: '#1F1F27',        // hover / pressed
        },
        // hairline borders (use as border-line / bg-line)
        line: 'rgba(255,255,255,0.08)',
        'line-strong': 'rgba(255,255,255,0.14)',
        // ── Ember accent (from the logo) ─────────────────────────────────
        ember: {
          50:  '#fff5ec',
          100: '#ffe5d0',
          200: '#fec9a3',
          300: '#fba76a',
          400: '#f5a623',  // logo amber
          500: '#f26418',  // logo orange — primary accent
          DEFAULT: '#f26418',
          600: '#f03000',  // logo scarlet
          700: '#c2280a',
        },
        // muted text helpers
        mute: '#9aa0aa',
        dim:  '#6b7280',
        // transition-safety: legacy (not-yet-converted) pages still reference navy
        navy: '#1e3a5f',
        'brand-orange': '#f26418',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      transitionTimingFunction: {
        smooth:    'cubic-bezier(0.4, 0, 0.2, 1)',
        spring:    'cubic-bezier(0.34, 1.4, 0.5, 1)',
        'out-expo':'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      backgroundImage: {
        'ember-gradient': 'linear-gradient(135deg, #f5a623 0%, #f26418 48%, #f03000 100%)',
        'ember-soft':     'radial-gradient(120% 120% at 100% 0%, rgba(242,100,24,0.20) 0%, rgba(242,100,24,0) 55%)',
        'ember-radial':   'radial-gradient(60% 60% at 50% 0%, rgba(242,100,24,0.16) 0%, rgba(242,100,24,0) 70%)',
      },
      boxShadow: {
        card:        '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 32px -16px rgba(0,0,0,0.8)',
        'card-hover':'0 0 0 1px rgba(255,255,255,0.09) inset, 0 24px 60px -20px rgba(0,0,0,0.85)',
        ember:       '0 12px 40px -10px rgba(242,100,24,0.50)',
        'ember-sm':  '0 6px 22px -8px rgba(242,100,24,0.45)',
        'glow-ring': '0 0 0 1px rgba(242,100,24,0.40), 0 0 32px -4px rgba(242,100,24,0.38)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0', transform: 'translateY(8px)' },  to: { opacity: '1', transform: 'translateY(0)' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(22px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { from: { opacity: '0', transform: 'scale(0.96)' },      to: { opacity: '1', transform: 'scale(1)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        scroll:  { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-33.333%)' } },
        float:   { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        emberPulse: {
          '0%,100%': { opacity: '0.5' },
          '50%':     { opacity: '1' },
        },
      },
      animation: {
        'fade-in':  'fadeIn 0.5s cubic-bezier(0.16,1,0.3,1) both',
        'slide-up': 'slideUp 0.6s cubic-bezier(0.16,1,0.3,1) both',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.34,1.4,0.5,1) both',
        'shimmer':  'shimmer 1.6s infinite',
        'scroll':   'scroll 36s linear infinite',
        'float':    'float 6s ease-in-out infinite',
        'ember-pulse': 'emberPulse 3s ease-in-out infinite',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    plugin(({ addVariant }) => {
      addVariant('reduce-transparency', '@media (prefers-reduced-transparency: reduce)')
    }),
  ],
}
