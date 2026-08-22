#!/usr/bin/env node
'use strict';

/**
 * Genera una wallet TON nueva para ser la tesoreria de MAINNET. No hace
 * ninguna llamada de red -- toda la derivacion (mnemonic -> keypair ->
 * address) es local, asi que este script se puede (y se deberia) correr con
 * la maquina desconectada de internet.
 *
 * COMO USAR ESTO DE FORMA SEGURA:
 *   1. Cerra cualquier sesion de screen-share, grabacion de pantalla, o
 *      asistente de IA con acceso a esta terminal (incluido Claude Code).
 *   2. Desconectate de internet (wifi/ethernet) antes de correr esto.
 *   3. Corre: node scripts/generate-mainnet-treasury-wallet.js
 *   4. Anota las 24 palabras A MANO, en papel. No las tipees en ningun
 *      archivo, nota, chat, gestor de contraseñas del navegador, ni se las
 *      pegues a ninguna IA (incluida esta sesion).
 *   5. Reconectate a internet recien despues de tener el papel guardado en
 *      un lugar seguro.
 *   6. La UNICA salida de este script que es segura de compartir o pegar en
 *      cualquier lado (Railway, un chat, esta misma conversacion) es la
 *      DIRECCION PUBLICA que imprime al final -- nunca las 24 palabras.
 *
 * Si en algun momento las 24 palabras quedan expuestas (pegadas en un chat,
 * en una captura de pantalla, en un repositorio) hay que tratar esa wallet
 * como comprometida: generar una nueva y mover cualquier fondo que ya
 * tuviera cargado antes de que alguien mas lo haga.
 */

const { mnemonicNew, mnemonicToPrivateKey } = require('@ton/crypto');
const { WalletContractV4 } = require('@ton/ton');

async function main() {
  console.log('Generando mnemonic nueva (24 palabras), sin tocar la red...\n');
  const mnemonic = await mnemonicNew(24);
  const keyPair = await mnemonicToPrivateKey(mnemonic);
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });

  console.log('================ MNEMONIC (24 PALABRAS) ================');
  console.log(mnemonic.join(' '));
  console.log('==========================================================');
  console.log('Anotala en papel AHORA. No la copies a ningun archivo ni chat.\n');

  console.log('================ DIRECCION PUBLICA (MAINNET) ================');
  console.log('Bounceable (usar esta, en Railway/Tonscan/etc.):');
  console.log(' ', wallet.address.toString({ testOnly: false }));
  console.log('Raw (formato interno, normalmente no hace falta):');
  console.log(' ', wallet.address.toRawString());
  console.log('===============================================================');
  console.log('\nEsta direccion (la bounceable) SI es segura de compartir/pegar en Railway,');
  console.log('Tonscan, esta conversacion, etc. La mnemonic de arriba, nunca.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
