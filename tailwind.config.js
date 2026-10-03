/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0B0B0B',
          secondary: '#111111',
          surface: '#151515',
          elevated: '#1A1A1A',
        },
        gold: {
          DEFAULT: '#D4AF37',
          bright: '#E8B34D',
          dim: '#9E8327',
        },
        text: {
          primary: '#F5F1E8',
          white: '#FFFFFF',
          muted: '#8A8A8A',
          subtle: '#666666',
        },
        line: 'rgba(255,255,255,0.08)',
      },
      fontFamily: {
        display: ['Anton', 'sans-serif'],
        body: ['Work Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
