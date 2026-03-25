/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0A0E17',
        panel: '#111827',
        card: '#0F172A',
        primary: '#7b39fc', // Updated to Datacore Primary
        secondary: '#2b2344', // Updated to Datacore Secondary
        quantum: '#A855F7',
        success: '#10B981',
        error: '#EF4444',
        textPrimary: '#E2E8F0',
        textSecondary: '#94A3B8',
        wireInactive: '#334155',
        wireActiveLow: '#1E3A5F',
        gateBody: '#1E293B'
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['Inter', 'sans-serif'],
        manrope: ['Manrope', 'sans-serif'],
        cabin: ['Cabin', 'sans-serif'],
        serif: ['"Instrument Serif"', 'serif'],
        inter: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
