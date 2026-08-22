#!/usr/bin/env node
'use strict';

/**
 * Ejercita TonService.findRecentPayment('USDT', ...) -- el metodo real que
 * usa el sweep de reconciliacion (WithdrawalsService.reconcileOne) para
 * decidir si un retiro atascado en PROCESSING realmente salio -- contra una
 * transferencia USDT/jetton real ya confirmada en testnet. Nunca se habia
 * ejercitado la rama USDT de este metodo (solo la rama TON, en la sesion del
 * 2026-08-17).
 *
 * Uso: node scripts/verify-find-recent-payment.js <destinationWallet> <expectedAmountUnits> <sinceUnixSeconds>
 */

require('reflect-metadata');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { TonService } = require('../dist/ton/ton.service');

const fakeConfig = {
  get: (key) => process.env[key],
  getOrThrow: (key) => {
    const value = process.env[key];
    if (value === undefined) throw new Error(`Missing env var ${key}`);
    return value;
  },
};

async function main() {
  const [destinationWallet, expectedAmountStr, sinceUnixSecondsStr] = process.argv.slice(2);
  if (!destinationWallet || !expectedAmountStr || !sinceUnixSecondsStr) {
    throw new Error('Uso: node verify-find-recent-payment.js <destinationWallet> <expectedAmountUnits> <sinceUnixSeconds>');
  }

  const tonService = new TonService(fakeConfig);
  const txHash = await tonService.findRecentPayment(
    'USDT',
    destinationWallet,
    BigInt(expectedAmountStr),
    Number(sinceUnixSecondsStr),
  );

  console.log('findRecentPayment result:', txHash);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
