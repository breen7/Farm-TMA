import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  // @ton/core (para armar el comentario de los depositos TON) usa `Buffer`
  // de Node internamente, que no existe en el navegador por defecto — sin
  // este polyfill, la app entera crashea al cargar el modulo.
  plugins: [react(), tailwindcss(), nodePolyfills({ include: ['buffer'] })],
  server: {
    // Necesario para abrir la app dentro del webview de Telegram via un tunel (ngrok/cloudflared).
    allowedHosts: true,
  },
})
