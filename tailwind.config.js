/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#08080A',
          secondary: '#101013',
          surface: '#17171C',
          elevated: '#202027',
        },
        gold: {
          DEFAULT: '#E9B44C',
          bright: '#F5C96B',
          dim: '#9C7428',
        },
        accent: {
          DEFAULT: '#E50914',
          bright: '#FF2A36',
        },
        text: {
          primary: '#F5F5F7',
          white: '#FFFFFF',
          muted: '#A3A3AD',
          subtle: '#6B6B76',
        },
        line: 'rgba(255,255,255,0.08)',
        entertainment: {
          DEFAULT: '#E50914',
          bright: '#FF2A36',
        },
      },
      fontFamily: {
        display: ['Anton', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
