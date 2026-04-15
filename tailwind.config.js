/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./app.html",
    "./main.js",
    "./app.js",
  ],
  theme: {
    extend: {
      colors: {
        "ocean-dark": "#0B132B",
        "ocean-mid": "#0B1D3A",
        "cyan-neon": "#00F0FF",
        "cyan-muted": "#4A9EBF",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Courier New'", "monospace"],
      },
    },
  },
  plugins: [],
}
