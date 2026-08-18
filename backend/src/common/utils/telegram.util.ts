import * as crypto from 'crypto';

const INIT_DATA_MAX_AGE_SECONDS = 86400; // 24h

export interface ParsedInitData {
  authDate: number;
  user?: { id: number; username?: string; first_name?: string; language_code?: string };
  raw: URLSearchParams;
}

/**
 * Valida la firma HMAC-SHA256 de initData segun el algoritmo oficial de Telegram:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateTelegramInitData(initData: string, botToken: string): boolean {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return false;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(computedHash, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function parseInitData(initData: string): ParsedInitData {
  const params = new URLSearchParams(initData);
  const authDate = Number(params.get('auth_date') ?? 0);
  const userRaw = params.get('user');
  return {
    authDate,
    user: userRaw ? JSON.parse(userRaw) : undefined,
    raw: params,
  };
}

export function isInitDataFresh(authDate: number, maxAgeSeconds = INIT_DATA_MAX_AGE_SECONDS): boolean {
  return Date.now() / 1000 - authDate <= maxAgeSeconds;
}
