#!/usr/bin/env node
'use strict';

/** Utilidad puntual: consulta el saldo del jetton de prueba para cualquier owner address dado. */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { TonClient, JettonMaster } = require('@ton/ton');
const { Address } = require('@ton/core');

async function main() {
  const endpoint = process.env.TON_RPC_ENDPOINT;
  const apiKey = process.env.TON_RPC_API_KEY;
  const jettonMasterAddress = process.env.USDT_JETTON_MASTER_ADDRESS;
  const ownerAddress = process.argv[2];
  if (!ownerAddress) {
    throw new Error('Uso: node check-address-jetton-balance.js <owner-address>');
  }

  const client = new TonClient({ endpoint, apiKey });
  const jettonMaster = client.open(JettonMaster.create(Address.parse(jettonMasterAddress)));
  const jettonWalletAddress = await jettonMaster.getWalletAddress(Address.parse(ownerAddress));
  console.log('Jetton wallet de', ownerAddress, ':', jettonWalletAddress.toString({ testOnly: true }));

  const state = await client.getContractState(jettonWalletAddress);
  if (state.state !== 'active') {
    console.log('Estado:', state.state, '(sin jetton wallet desplegada todavia -> balance 0)');
    return;
  }

  const result = await client.runMethod(jettonWalletAddress, 'get_wallet_data');
  const balance = result.stack.readBigNumber();
  console.log('Balance:', balance.toString(), 'unidades minimas (', Number(balance) / 1_000_000, 'tUSDT )');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
