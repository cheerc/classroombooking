/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
  content: ["./**/*.html"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Noto Sans TC', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
}