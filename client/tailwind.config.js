import plugin from 'tailwindcss/plugin'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: '#1e3a5f',
        'brand-orange': '#f97316',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(249,115,22,0)' },
          '50%':       { boxShadow: '0 0 20px 4px rgba(249,115,22,0.25)' },
        },
        liquidShift: {
          '0%, 100%': { transform: 'translate3d(0,0,0)' },
          '50%':      { transform: 'translate3d(0,-1px,0)' },
        },
      },
      animation: {
        'fade-in':     'fadeIn 0.25s ease-out both',
        'slide-up':    'slideUp 0.3s ease-out both',
        'glow':        'glow 2s ease-in-out infinite',
        'liquid-shift':'liquidShift 7s ease-in-out infinite',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 12px 0 rgba(0,0,0,0.10)',
        // Liquid Glass: ambient drop + inner specular highlight in one cascade
        'liquid-glass':
          '0 8px 32px rgba(0,0,0,0.10), inset 0 2px 4px rgba(255,255,255,0.40), inset 0 -1px 2px rgba(0,0,0,0.05)',
        'liquid-glass-strong':
          '0 12px 40px rgba(0,0,0,0.18), inset 0 2px 6px rgba(255,255,255,0.55), inset 0 -1px 3px rgba(0,0,0,0.08)',
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
    // contrast on the floating Liquid Glass pill.
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
