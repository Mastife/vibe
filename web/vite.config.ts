import path from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    // With VITE_API_URL empty the panel calls `/api` on its own origin, so it works through a tunnel
    // (e.g. `tailscale serve`) from another device; the dev server forwards those calls to the backend.
    proxy: {
      '/api': process.env.DEV_API_PROXY_TARGET ?? 'http://localhost:3000',
    },
    allowedHosts: ['.ts.net'],
  },
})
