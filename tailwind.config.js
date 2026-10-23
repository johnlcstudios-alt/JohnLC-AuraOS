/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'var(--surface)',
        panel: 'var(--panel)',
        glass: 'var(--glass)',
        glassStrong: 'var(--glass-strong)',
        ink: 'var(--text)',
        muted: 'var(--text-muted)',
        faint: 'var(--text-faint)',
        line: 'var(--line)',
        accent: 'var(--accent)',
        danger: 'var(--danger)',
        success: 'var(--success)',
        warn: 'var(--warn)',
      },
      borderRadius: {
        xl2: '14px',
      },
      boxShadow: {
        glass: 'var(--shadow-glass)',
        win: 'var(--shadow-window)',
        pop: 'var(--shadow-pop)',
      },
      fontFamily: {
        ui: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI Variable Text"',
          '"Segoe UI"',
          'Inter',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: ['"Cascadia Code"', '"JetBrains Mono"', 'Consolas', '"SF Mono"', 'Menlo', 'monospace'],
      },
      keyframes: {
        'dock-bounce': {
          '0%,100%': { transform: 'translateY(0)' },
          '40%': { transform: 'translateY(-22px)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'dock-bounce': 'dock-bounce 620ms ease-in-out 2',
        'fade-in': 'fade-in 180ms ease-out',
      },
    },
  },
  plugins: [],
}
