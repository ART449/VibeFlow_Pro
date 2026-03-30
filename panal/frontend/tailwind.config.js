/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#090b0f',
        amber: '#f2b94b',
        ember: '#ff7a18',
        cyan: '#7ae6ff',
        steel: '#7f8ca5',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,255,255,0.04), 0 24px 80px rgba(0,0,0,0.35)',
      },
      animation: {
        drift: 'drift 14s ease-in-out infinite',
        pulsegrid: 'pulsegrid 7s linear infinite',
      },
      keyframes: {
        drift: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0)' },
          '50%': { transform: 'translate3d(0, -10px, 0)' },
        },
        pulsegrid: {
          '0%': { opacity: '0.35' },
          '50%': { opacity: '0.9' },
          '100%': { opacity: '0.35' },
        },
      },
    },
  },
  plugins: [],
};

