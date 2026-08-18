import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import './index.css';
import App from './App.tsx';
import { bootstrapTelegram } from './lib/telegram';
import { AuthProvider } from './lib/auth';

// || (no ??): una VITE_TONCONNECT_MANIFEST_URL vacia en .env llega aca como
// string vacio, no como undefined, y "" ?? fallback sigue siendo "" — eso es
// justamente lo que provoca el error de TonConnectUIProvider sin fallback.
const manifestUrl = import.meta.env.VITE_TONCONNECT_MANIFEST_URL || `${window.location.origin}/tonconnect-manifest.json`;

// El render nunca debe depender de que esto resuelva: mountViewport() puede
// quedarse colgado indefinidamente fuera de un cliente Telegram real (incluso
// con el entorno mockeado en dev), y no hay razon para dejar al usuario ante
// una pantalla en blanco por eso.
bootstrapTelegram().catch((error) => console.error('No se pudo inicializar el SDK de Telegram:', error));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </TonConnectUIProvider>
  </StrictMode>,
);
