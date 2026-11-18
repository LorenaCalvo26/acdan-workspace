import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// El puerto del backend se puede mover si Windows reserva el rango (Docker).
const BACKEND = process.env.BACKEND_PORT || '8090'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // Necesario para exponer la demo con túneles de Cloudflare: Vite rechaza
    // las peticiones cuyo Host no esté en la lista.
    allowedHosts: ['trycloudflare.com'],
    proxy: {
      '/api': {
        target: `http://localhost:${BACKEND}`,
        changeOrigin: true,
      },
      // PDFs del backend (staticFiles /pdfs): también por el mismo origen
      // para que el visor funcione detrás de túneles sin CORS.
      '/pdfs': {
        target: `http://localhost:${BACKEND}`,
        changeOrigin: true,
      },
    },
  },
})
