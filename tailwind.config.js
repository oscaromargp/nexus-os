/** @type {import('tailwind').Config} */
module.exports = {
  content: [
    "./index.html",
    "./app.html",
    "./app.js",
    "./main.js",
  ],
  theme: {
    extend: {
      colors: {
        'nexus-cyan': '#00F0FF',
        'nexus-dark': '#0B132B',
      },
      animation: {
        'gradient-shift': 'gradient-shift 4s ease infinite',
        'nexus-glow': 'cyan-glow 2s ease-in-out infinite',
      },
      keyframes: {
        'gradient-shift': {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%': { 'background-position': '100% 50%' },
        },
        'cyan-glow': {
          '0%, 100%': { 'box-shadow': '0 0 10px rgba(0, 240, 255, 0.2)' },
          '50%': { 'box-shadow': '0 0 25px rgba(0, 240, 255, 0.6)' },
        }
      }
    },
  },
  plugins: [],
}
