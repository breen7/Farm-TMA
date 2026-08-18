#!/usr/bin/env node
'use strict';

/**
 * Genera un X-Telegram-Init-Data valido (firmado con BOT_TOKEN) para probar
 * en local los endpoints protegidos por TelegramAuthGuard sin tener que abrir
 * la app desde dentro de Telegram. Reproduce exactamente el mismo algoritmo
 * HMAC-SHA256 que valida src/common/utils/telegram.util.ts — si ese archivo
 * cambia el formato del data-check-string, este script debe actualizarse
 * junto con el.
 *
 * Uso:
 *   node scripts/generate-test-init-data.js [telegramUserId]
 *
 * Requiere BOT_TOKEN en el entorno o en backend/.env.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function loadBotToken() {
  if (process.env.BOT_TOKEN) {
    return process.env.BOT_TOKEN;
  }
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const match = fs.readFileSync(envPath, 'utf8').match(/^BOT_TOKEN=(.+)$/m);
    if (match) {
      return match[1].trim();
    }
  }
  throw new Error('BOT_TOKEN no encontrado. Definilo en backend/.env o como variable de entorno.');
}

function buildInitData(botToken, { userId, firstName, username }) {
  const user = JSON.stringify({ id: userId, first_name: firstName, username, language_code: 'es' });
  const authDate = Math.floor(Date.now() / 1000);

  // El backend (TelegramAuthGuard) no exige 'signature', pero el schema de
  // launch params de @telegram-apps/sdk-react si — sin este campo, el SDK
  // del frontend rechaza el initData antes de que llegue a pedirle nada al
  // backend. Se incluye en el hash para que la firma siga siendo consistente
  // con lo que el backend recalcula (usa todos los campos presentes).
  const params = new URLSearchParams({ user, auth_date: String(authDate), signature: 'dev-mock-signature' });

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  params.set('hash', hash);
  return params.toString();
}

const userId = Number(process.argv[2] ?? 111111);
const botToken = loadBotToken();
const initData = buildInitData(botToken, { userId, firstName: 'Dev', username: 'dev_user' });

console.log(initData);
