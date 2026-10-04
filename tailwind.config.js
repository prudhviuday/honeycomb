/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#090A10',
          secondary: '#0E1018',
          surface: '#141722',
          elevated: '#1B1E2B',
        },
        gold: {
          DEFAULT: '#FFB84A',
          bright: '#FFD166',
          dim: '#B97822',
        },
        accent: {
          DEFAULT: '#8B5CF6',
          bright: '#A78BFA',
        },
        text: {
          primary: '#F7F4EC',
          white: '#FFFFFF',
          muted: '#9A9EAE',
          subtle: '#696E80',
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
