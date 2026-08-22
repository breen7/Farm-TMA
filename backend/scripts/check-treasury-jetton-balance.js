#!/usr/bin/env node
'use strict';

/** Utilidad puntual: consulta el saldo del jetton de prueba en la wallet de tesoreria. */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { TonClient, WalletContractV4, JettonMaster } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');

async function main() {
  const endpoint = process.env.TON_RPC_ENDPOINT;
  const apiKey = process.env.TON_RPC_API_KEY;
  const mnemonic = process.env.TON_HOT_WALLET_MNEMONIC;
  const jettonMasterAddress = process.env.USDT_JETTON_MASTER_ADDRESS;

  const keyPair = await mnemonicToPrivateKey(mnemonic.trim().split(/\s+/));
  const client = new TonClient({ endpoint, apiKey });
  const walletContract = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const wallet = client.open(walletContract);

  const jettonMaster = client.open(JettonMaster.create(require('@ton/core').Address.parse(jettonMasterAddress)));
  const jettonWalletAddress = await jettonMaster.getWalletAddress(wallet.address);
  console.log('Jetton wallet de la tesoreria:', jettonWalletAddress.toString({ testOnly: true }));

  const state = await client.getContractState(jettonWalletAddress);
  if (state.state !== 'active') {
    console.log('Estado:', state.state, '(todavia no se confirmo el mint on-chain)');
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
