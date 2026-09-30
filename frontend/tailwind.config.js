/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        marino: '#0F2A44',
        dorado: '#C9A86A',
        hueso: '#FAF7F2',
        line: '#E7E0D4'
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,42,68,0.04), 0 8px 24px rgba(15,42,68,0.06)',
        pop: '0 12px 40px rgba(15,42,68,0.14)'
      }
    }
  },
  plugins: []
}
