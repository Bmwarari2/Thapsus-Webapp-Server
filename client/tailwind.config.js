import plugin from 'tailwindcss/plugin'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Brand: Navy ──────────────────────────────────────────────────
        // DEFAULT keeps `text-navy` / `bg-navy` / `border-navy` working as
        // before, while the numeric scale unlocks subtle tints (navy-50 for
        // soft fills, navy-700/800 for hover/active depth) so the whole UI can
        // breathe in one consistent brand hue instead of ad-hoc hex literals.
        navy: {
          50:  '#eef3f8',
          100: '#d6e1ee',
          200: '#aec3da',
          300: '#7c9cc0',
          400: '#4f74a0',
          500: '#345887',
          600: '#264a72',
          DEFAULT: '#1e3a5f',
          700: '#1a3354',
          800: '#152941',
          900: '#0f1d30',
        },
        // ── Brand: Orange (accent / CTA) ─────────────────────────────────
        'brand-orange': '#f97316',
        accent: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          DEFAULT: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      // ── Motion easing tokens ───────────────────────────────────────────
      // One shared rhythm for the whole app. `smooth` for everyday state
      // changes, `spring` for the gentle overshoot on press/pop, `out-expo`
      // for confident entrances that decelerate hard then settle.
      transitionTimingFunction: {
        smooth:    'cubic-bezier(0.4, 0, 0.2, 1)',
        spring:    'cubic-bezier(0.34, 1.4, 0.5, 1)',
        'out-expo':'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        // Skeleton shimmer — sweeps a soft highlight across loading surfaces.
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        // Repurposed from the old orange neon "glow": now a calm, brand-tinted
        // elevation breathe with no saturated halo. Conveys "live / active"
        // without the neon look.
        glow: {
          '0%, 100%': { boxShadow: '0 1px 2px rgba(15,23,42,0.06)' },
          '50%':      { boxShadow: '0 8px 24px -6px rgba(30,58,95,0.22)' },
        },
        liquidShift: {
          '0%, 100%': { transform: 'translate3d(0,0,0)' },
          '50%':      { transform: 'translate3d(0,-1px,0)' },
        },
      },
      animation: {
        'fade-in':     'fadeIn 0.4s cubic-bezier(0.16,1,0.3,1) both',
        'slide-up':    'slideUp 0.45s cubic-bezier(0.16,1,0.3,1) both',
        'scale-in':    'scaleIn 0.28s cubic-bezier(0.34,1.4,0.5,1) both',
        'shimmer':     'shimmer 1.6s infinite',
        'glow':        'glow 2.8s ease-in-out infinite',
        'liquid-shift':'liquidShift 7s ease-in-out infinite',
      },
      // ── Elevation scale ────────────────────────────────────────────────
      // Soft, neutral-tinted, layered shadows (ambient + contact) for a clean
      // modern depth. No inset speculars, no colored neon halos.
      boxShadow: {
        xs:   '0 1px 2px rgba(15,23,42,0.05)',
        card: '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)',
        'card-hover': '0 10px 24px -8px rgba(15,23,42,0.14), 0 4px 8px -6px rgba(15,23,42,0.08)',
        soft: '0 4px 16px -4px rgba(15,23,42,0.10)',
        float:'0 12px 32px -8px rgba(15,23,42,0.16), 0 4px 10px -6px rgba(15,23,42,0.08)',
        // Kept for backward compatibility, retuned to a clean frosted look
        // (no inset highlight) so legacy references stay sleek, not glassy.
        'liquid-glass':        '0 8px 30px -10px rgba(15,23,42,0.18)',
        'liquid-glass-strong': '0 18px 48px -14px rgba(15,23,42,0.28)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      textShadow: {
        DEFAULT: '0 1px 2px rgba(0,0,0,0.18)',
        glass:   '0 1px 1px rgba(0,0,0,0.20), 0 0 6px rgba(255,255,255,0.20)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),

    // Variant: prefers-reduced-transparency:reduce
    // Lets components opt out of backdrop blur / translucent fills when the OS
    // signals the user wants reduced transparency, which is critical for WCAG
    // contrast on the floating frosted pill.
    plugin(({ addVariant }) => {
      addVariant('reduce-transparency', '@media (prefers-reduced-transparency: reduce)')
    }),

    // Utilities: text-shadow-* (Tailwind has no built-in text-shadow utility)
    plugin(({ matchUtilities, theme }) => {
      matchUtilities(
        {
          'text-shadow': (value) => ({ textShadow: value }),
        },
        { values: theme('textShadow') }
      )
    }),
  ],
}
