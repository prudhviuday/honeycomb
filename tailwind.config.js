/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#140A12',
          secondary: '#1C0B16',
          surface: '#24111C',
          elevated: '#2D1422',
        },
        gold: {
          DEFAULT: '#FFC857',
          bright: '#FFD978',
          dim: '#B77A24',
        },
        accent: {
          DEFAULT: '#E83E8C',
          bright: '#F04F9B',
        },
        text: {
          primary: '#FFF7FA',
          white: '#FFFFFF',
          muted: '#B9A6B1',
          subtle: '#806A76',
        },
        line: 'rgba(255,255,255,0.08)',
        entertainment: {
          DEFAULT: '#FF6B4A',
          bright: '#FF8A5B',
        },
      },
      fontFamily: {
        display: ['Anton', 'sans-serif'],
        body: ['Work Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
