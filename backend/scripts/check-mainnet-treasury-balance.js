#!/usr/bin/env node
'use strict';

/**
 * Consulta el balance de TON nativo y del jetton USDT de una direccion
 * MAINNET dada -- solo lectura, no toca ninguna mnemonic ni firma nada, asi
 * que a diferencia del generador de wallet este script es seguro de correr
 * a traves de cualquier sesion (solo recibe una direccion PUBLICA).
 *
 * Uso: node scripts/check-mainnet-treasury-balance.js <direccion-publica> [jetton-master]
 *   jetton-master es opcional, default: el USDT oficial de Tether en TON
 *   (EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs) -- volve a verificarlo
 *   vos mismo contra tether.to/en/supported-protocols antes de confiar en
 *   este default si pasa mucho tiempo entre que se escribio este script y
 *   cuando lo corres.
 *
 * No requiere TON_RPC_API_KEY (usa el limite publico de 1 req/s de
 * toncenter, de sobra para una consulta puntual).
 */

const { TonClient, JettonMaster } = require('@ton/ton');
const { Address } = require('@ton/core');

const DEFAULT_USDT_MASTER = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';
const MAINNET_ENDPOINT = 'https://toncenter.com/api/v2/jsonRPC';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const ownerAddressStr = process.argv[2];
  const jettonMasterStr = process.argv[3] || DEFAULT_USDT_MASTER;
  if (!ownerAddressStr) {
    throw new Error('Uso: node check-mainnet-treasury-balance.js <direccion-publica> [jetton-master]');
  }

  const client = new TonClient({ endpoint: MAINNET_ENDPOINT });
  const ownerAddress = Address.parse(ownerAddressStr);

  const tonBalanceNano = await client.getBalance(ownerAddress);
  console.log('Direccion:', ownerAddress.toString({ testOnly: false }));
  console.log('Balance TON nativo:', (Number(tonBalanceNano) / 1e9).toFixed(4), 'TON');

  // Sin API key, toncenter mainnet limita a 1 req/s -- este margen evita
  // pisar el limite entre la consulta de TON y la de USDT.
  await sleep(1500);

  const jettonMaster = client.open(JettonMaster.create(Address.parse(jettonMasterStr)));
  const jettonWalletAddress = await jettonMaster.getWalletAddress(ownerAddress);
  console.log('\nJetton wallet USDT derivada:', jettonWalletAddress.toString({ testOnly: false }));

  await sleep(1500);

  const state = await client.getContractState(jettonWalletAddress);
  if (state.state !== 'active') {
    console.log('Estado: no desplegada todavia -> balance USDT = 0 (normal si todavia no le enviaron nada)');
    return;
  }

  await sleep(1500);

  const result = await client.runMethod(jettonWalletAddress, 'get_wallet_data');
  const balance = result.stack.readBigNumber();
  console.log('Balance USDT:', (Number(balance) / 1_000_000).toFixed(2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
