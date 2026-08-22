#!/usr/bin/env node
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { TonClient } = require('@ton/ton');
const { Address } = require('@ton/core');

async function main() {
  const endpoint = process.env.TON_RPC_ENDPOINT;
  const apiKey = process.env.TON_RPC_API_KEY;
  const address = Address.parse(process.argv[2]);

  const client = new TonClient({ endpoint, apiKey });
  const txs = await client.getTransactions(address, { limit: 10 });
  for (const tx of txs) {
    console.log('--- tx', tx.hash().toString('hex').slice(0, 16), 'lt', tx.lt.toString(), 'now', new Date(tx.now * 1000).toISOString());
    console.log('  description:', JSON.stringify(tx.description, (k, v) => typeof v === 'bigint' ? v.toString() : v));
    if (tx.inMessage) {
      console.log('  inMessage from:', tx.inMessage.info.type === 'internal' ? tx.inMessage.info.src?.toString() : tx.inMessage.info.type, 'value:', tx.inMessage.info.type === 'internal' ? tx.inMessage.info.value.coins.toString() : '');
      try {
        const slice = tx.inMessage.body.beginParse();
        const op = slice.loadUint(32);
        console.log('  inMessage op:', '0x' + op.toString(16));
      } catch (e) { console.log('  inMessage body unparseable:', e.message); }
    }
    for (const [, m] of tx.outMessages) {
      console.log('  outMessage to:', m.info.type === 'internal' ? m.info.dest?.toString() : m.info.type, 'value:', m.info.type === 'internal' ? m.info.value.coins.toString() : '');
      try {
        const slice = m.body.beginParse();
        const op = slice.loadUint(32);
        console.log('    outMessage op:', '0x' + op.toString(16));
      } catch (e) { console.log('    outMessage body unparseable:', e.message); }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
