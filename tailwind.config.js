/** @type {import('tailwind').Config} */
module.exports = {
  content: [
    "./index.html",
    "./app.html",
    "./app.js",
    "./main.js",
    "./src/**/*.{js,ts}",
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
        // tailwindcss-animate extras
        'fade-in': 'fade-in 0.2s ease-out',
        'fade-out': 'fade-out 0.15s ease-in',
        'slide-in-up': 'slide-in-up 0.25s cubic-bezier(0.16,1,0.3,1)',
        'slide-out-down': 'slide-out-down 0.2s ease-in',
        'scale-in': 'scale-in 0.18s cubic-bezier(0.16,1,0.3,1)',
        'spin-slow': 'spin 2s linear infinite',
      },
      keyframes: {
        'gradient-shift': {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%': { 'background-position': '100% 50%' },
        },
        'cyan-glow': {
          '0%, 100%': { 'box-shadow': '0 0 10px rgba(0, 240, 255, 0.2)' },
          '50%': { 'box-shadow': '0 0 25px rgba(0, 240, 255, 0.6)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'slide-in-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-out-down': {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(16px)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    require('daisyui'),
  ],
  daisyui: {
    // Solo habilitamos los componentes que usaremos — evita colisiones con el diseño existente
    themes: false,          // NO sobreescribir el tema visual de Nexus
    base: false,            // NO resetear estilos base (ya tenemos los nuestros)
    styled: true,           // Sí generar estilos de componentes
    utils: true,            // Sí generar utilidades
    logs: false,
  },
}
