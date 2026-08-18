const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME || '';
const MINI_APP_SHORT_NAME = import.meta.env.VITE_MINI_APP_SHORT_NAME || '';

/**
 * Link de invitacion en formato de apertura directa de Mini App
 * (`t.me/<bot>/<app>?startapp=<valor>`), no el de inicio de chat comun
 * (`t.me/<bot>?start=`). El backend espera que el valor sea `ref_<id>`
 * (ver AuthController.login).
 */
export function buildReferralLink(telegramId: string): string | null {
  if (!BOT_USERNAME || !MINI_APP_SHORT_NAME) return null;
  return `https://t.me/${BOT_USERNAME}/${MINI_APP_SHORT_NAME}?startapp=ref_${telegramId}`;
}
