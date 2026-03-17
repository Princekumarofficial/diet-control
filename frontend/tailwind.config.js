/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        shred: {
          bg: '#000000',
          card: '#1C1C1E',
          blue: '#0A84FF',
          green: '#32D74B',
          red: '#FF453A',
        },
      },
    },
  },
  plugins: [],
};

