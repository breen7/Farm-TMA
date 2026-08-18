import {
  expandViewport,
  init,
  isTMA,
  miniAppReady,
  mockTelegramEnv,
  mountMiniAppSync,
  mountViewport,
  retrieveLaunchParams,
} from '@telegram-apps/sdk-react';

/**
 * Fuera de Telegram (navegador normal en desarrollo) el SDK no encuentra
 * launch params y lanzaria al inicializar. Si VITE_DEV_INIT_DATA tiene un
 * initData real (generado con `node scripts/generate-test-init-data.js` en
 * backend/, firmado con el mismo BOT_TOKEN que usa el backend), lo usamos tal
 * cual — las requests autenticadas van a funcionar de verdad, no solo el
 * layout. Sin esa variable, armamos uno con un hash invalido solo para que el
 * SDK no crashee al inicializar: alcanza para ver el layout, pero el backend
 * va a rechazar cualquier request autenticada con 401.
 */
function mockDevEnvironment(): void {
  const devInitData = import.meta.env.VITE_DEV_INIT_DATA;

  if (!devInitData) {
    console.warn(
      '[dev] VITE_DEV_INIT_DATA no esta seteada: el initData simulado no tiene firma valida, ' +
        'las requests autenticadas van a fallar con 401. Generá uno con ' +
        '"node scripts/generate-test-init-data.js" en backend/ y pegalo en frontend/.env.',
    );
  }

  // tgWebAppData tiene que ir como URLSearchParams ya parseado, no como
  // string crudo: si se le pasa un string, mockTelegramEnv lo trata como un
  // valor opaco y lo vuelve a percent-encodear entero (incluidos los `%`
  // internos de un initData ya codificado), rompiendo la firma.
  const tgWebAppData = devInitData
    ? new URLSearchParams(devInitData)
    : new URLSearchParams([
        ['user', JSON.stringify({ id: 1, first_name: 'Dev', last_name: 'User', username: 'dev', language_code: 'es' })],
        ['auth_date', String(Math.floor(Date.now() / 1000))],
        ['signature', 'dev-mock'],
        ['hash', 'dev-mock-hash-not-valid'],
      ]);

  mockTelegramEnv({
    launchParams: {
      tgWebAppData,
      tgWebAppVersion: '8',
      tgWebAppPlatform: 'tdesktop',
      tgWebAppThemeParams: {},
    },
  });
}

/**
 * El `start_param` que Telegram pasa cuando la app se abre via un link
 * `https://t.me/<bot>/<app>?startapp=<valor>` (usado para el deep link de
 * referidos: `ref_<telegramId>`). `retrieveLaunchParams` tira si no hay
 * launch params en absoluto, de ahi el try/catch.
 */
export function getStartParam(): string | undefined {
  try {
    return retrieveLaunchParams().tgWebAppStartParam;
  } catch {
    return undefined;
  }
}

export async function bootstrapTelegram(): Promise<void> {
  if (import.meta.env.DEV && !isTMA()) {
    mockDevEnvironment();
  }

  init();

  if (mountMiniAppSync.isAvailable()) {
    mountMiniAppSync();
  }
  if (mountViewport.isAvailable()) {
    await mountViewport();
    if (expandViewport.isAvailable()) {
      expandViewport();
    }
  }
  if (miniAppReady.isAvailable()) {
    miniAppReady();
  }
}
