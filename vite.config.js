import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.js'],
  },
  build: {
    rollupOptions: {
      input: {
        main:           resolve(__dirname, 'index.html'),
        app:            resolve(__dirname, 'app.html'),
        propiedad:      resolve(__dirname, 'propiedad.html'),
        privacy:        resolve(__dirname, 'privacy.html'),
        terms:          resolve(__dirname, 'terms.html'),
        resetPassword:  resolve(__dirname, 'reset-password.html'),
        reporte:        resolve(__dirname, 'reporte.html'),
      },
      output: {
        // Separar vendors pesados en chunks independientes que el browser cachea por separado.
        // Reduce el bundle inicial de app.js en ~40-50% (de ~2.1MB a ~900KB estimado).
        manualChunks: {
          // PDF engine — solo se descarga cuando el usuario genera un PDF (~500KB)
          'vendor-pdf':      ['jspdf', 'jspdf-autotable', 'qrcode'],
          // Charts — solo en vistas con gráficas (~204KB)
          'vendor-charts':   ['chart.js'],
          // Búsqueda fuzzy — solo al abrir búsqueda global (~25KB)
          'vendor-fuse':     ['fuse.js'],
          // Drag & drop kanban (~50KB)
          'vendor-sortable': ['sortablejs'],
          // Supabase SDK — siempre necesario, pero separado para cache independiente (~150KB)
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
})
