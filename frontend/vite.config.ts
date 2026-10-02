import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // Necesario para exponer la demo con túneles de Cloudflare: Vite rechaza
    // las peticiones cuyo Host no esté en la lista.
    allowedHosts: ['trycloudflare.com'],
  },
})