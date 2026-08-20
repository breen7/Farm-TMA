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
  define: {
    // Constantes horneadas en build time (no en runtime) para el panel de
    // debug temporal — permiten confirmar desde la app misma que build esta
    // corriendo realmente un cliente, sin depender de lo que devuelva curl
    // contra el servidor (que puede diferir de lo que el WebView de Telegram
    // sirve si hay cache de por medio).
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local'),
  },
})
