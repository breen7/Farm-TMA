#!/usr/bin/env node
'use strict';

/**
 * Despliega y premintea un jetton de prueba (6 decimales, como USDT real) en
 * TON testnet, usando la misma wallet de tesoreria que TonService (misma
 * TON_HOT_WALLET_MNEMONIC de backend/.env) como admin y destinataria del
 * preminteo -- asi TonService.sendUsdt puede enviarlo de verdad en la prueba
 * de retiros. No existe un jetton USDT real en testnet (Tether solo lo
 * desplego en mainnet); este es el unico camino para ejercitar el flujo de
 * retiro con asset:'USDT' de punta a punta sin tocar mainnet.
 *
 * Uso: node scripts/deploy-test-usdt-jetton.js
 * Requiere en backend/.env: TON_RPC_ENDPOINT (debe contener "testnet", por
 * seguridad), TON_RPC_API_KEY, TON_HOT_WALLET_MNEMONIC.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { TonClient, WalletContractV4 } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');
const { AssetsSDK } = require('@ton-community/assets-sdk');

const PREMINT_AMOUNT_UNITS = 1_000n * 1_000_000n; // 1000 "USDT" de prueba, 6 decimales

async function main() {
  const endpoint = process.env.TON_RPC_ENDPOINT;
  const apiKey = process.env.TON_RPC_API_KEY;
  const mnemonic = process.env.TON_HOT_WALLET_MNEMONIC;

  if (!endpoint || !mnemonic) {
    throw new Error('Faltan TON_RPC_ENDPOINT o TON_HOT_WALLET_MNEMONIC en backend/.env');
  }
  if (!endpoint.includes('testnet')) {
    throw new Error('TON_RPC_ENDPOINT no apunta a testnet — abortando (este script nunca debe correr contra mainnet)');
  }

  const keyPair = await mnemonicToPrivateKey(mnemonic.trim().split(/\s+/));
  const client = new TonClient({ endpoint, apiKey });
  const walletContract = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const wallet = client.open(walletContract);
  const sender = wallet.sender(keyPair.secretKey);

  console.log('Tesoreria (admin + destinataria del preminteo):', walletContract.address.toString({ testOnly: true }));

  const sdk = AssetsSDK.create({ api: client, sender });

  const jetton = await sdk.deployJetton(
    {
      name: 'Farm TMA Test USDT',
      symbol: 'tUSDT',
      description: 'Jetton de prueba (6 decimales) para validar el flujo de retiros USDT de farm-tma en testnet. Sin valor real.',
      decimals: 6,
    },
    {
      onchainContent: true,
      adminAddress: walletContract.address,
      premintAmount: PREMINT_AMOUNT_UNITS,
    },
  );

  console.log('Jetton master desplegado:', jetton.address.toString({ testOnly: true }));
  console.log('\nAgregar/actualizar en backend/.env:');
  console.log(`USDT_JETTON_MASTER_ADDRESS=${jetton.address.toString({ testOnly: true })}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
