import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main:           resolve(__dirname, 'index.html'),
        app:            resolve(__dirname, 'app.html'),
        privacy:        resolve(__dirname, 'privacy.html'),
        terms:          resolve(__dirname, 'terms.html'),
        resetPassword:  resolve(__dirname, 'reset-password.html'),
      },
    },
  },
})
