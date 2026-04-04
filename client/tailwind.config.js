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
      },
      animation: {
        'fade-in':  'fadeIn 0.25s ease-out both',
        'slide-up': 'slideUp 0.3s ease-out both',
        'glow':     'glow 2s ease-in-out infinite',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 12px 0 rgba(0,0,0,0.10)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
