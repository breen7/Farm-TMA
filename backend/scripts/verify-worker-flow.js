#!/usr/bin/env node
'use strict';

/**
 * Verifica el flujo completo del Peon (unlock -> upgrade -> ganancias
 * offline -> toggle) contra la base real de Supabase, instanciando
 * WorkerService directamente desde dist/ en vez de bootstrapear todo Nest.
 * WorkerService no depende de Redis/BullMQ para nada — esto evita el
 * bloqueo actual de `node dist/main.js` (cuota de requests de Upstash
 * agotada, ver logs de arranque) y verifica igual la parte que de verdad
 * importa: la migracion aplicada y la logica real contra Postgres.
 *
 * Uso: node scripts/verify-worker-flow.js [telegramUserId=111111]
 * Requiere que ese usuario ya exista (POST /auth/telegram alguna vez).
 */

const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^"(.*)"$/, '$1');
  }
}

loadEnvFile();

const { PrismaService } = require('../dist/prisma/prisma.service');
const { WorkerService } = require('../dist/worker/worker.service');

const TEST_TELEGRAM_ID = process.argv[2] || '111111';
const configStub = { get: (key) => process.env[key] };

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const worker = new WorkerService(prisma, configStub);

  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(TEST_TELEGRAM_ID) } });
  if (!user) {
    throw new Error(
      `No existe un usuario con telegramId ${TEST_TELEGRAM_ID}. Generar uno primero con ` +
        `POST /auth/telegram (ver README) o correr el backend una vez con ese usuario.`,
    );
  }
  console.log('Usuario id:', user.id.toString(), '| coinsBalance inicial:', user.coinsBalance.toString());

  // Reset para que la corrida sea repetible.
  await prisma.worker.deleteMany({ where: { userId: user.id } });
  await prisma.user.update({ where: { id: user.id }, data: { coinsBalance: 5000 } });

  console.log('\n[1] getState() antes de desbloquear (deberia ser unlocked:false, level:0)');
  console.log(await worker.getState(user.id));

  console.log('\n[2] unlock() — deberia cobrar 150 coins y devolver level:1, enabled:true');
  console.log(await worker.unlock(user.id));
  console.log('coinsBalance tras unlock:', (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).coinsBalance.toString());

  console.log('\n[2b] unlock() de nuevo — debe rechazar con "already unlocked"');
  try {
    await worker.unlock(user.id);
    console.error('FALLO: deberia haber lanzado BadRequestException');
  } catch (err) {
    console.log('OK, rechazado:', err.message);
  }

  console.log('\n[3] upgrade() — deberia cobrar 400 coins y devolver level:2');
  console.log(await worker.upgrade(user.id));

  // Simular tiempo transcurrido retrocediendo los timestamps de farm/worker.
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await prisma.farm.update({ where: { userId: user.id }, data: { lastCollectedAt: twoHoursAgo } });
  await prisma.worker.update({ where: { userId: user.id }, data: { lastProcessedAt: twoHoursAgo } });
  const beforeOffline = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  console.log('\n[4] Retrocedido lastProcessedAt 2h. coinsBalance antes de procesar:', beforeOffline.coinsBalance.toString());

  console.log('\n[5] getState() — deberia disparar processOfflineEarnings y devolver lastPayout con cycles>0');
  const stateWithPayout = await worker.getState(user.id);
  console.log(stateWithPayout);

  const afterOffline = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const farmAfter = await prisma.farm.findUniqueOrThrow({ where: { userId: user.id } });
  console.log('coinsBalance despues:', afterOffline.coinsBalance.toString());
  console.log('farm.lastCollectedAt avanzo a:', farmAfter.lastCollectedAt.toISOString(), '(arranco en', twoHoursAgo.toISOString(), ')');

  console.log('\n[6] getState() de nuevo inmediatamente — lastPayout deberia ser null (no paso un ciclo completo todavia)');
  console.log(await worker.getState(user.id));

  console.log('\n[7] setEnabled(false) — apaga el peon');
  console.log(await worker.setEnabled(user.id, false));

  console.log('\n[8] setEnabled(true) — reactiva, reinicia el reloj');
  console.log(await worker.setEnabled(user.id, true));

  const txs = await prisma.transaction.findMany({
    where: { userId: user.id, type: { in: ['SINK_WORKER', 'WORKER_AUTO_SELL'] } },
    orderBy: { createdAt: 'asc' },
  });
  console.log('\n[9] Transacciones registradas (SINK_WORKER / WORKER_AUTO_SELL):');
  for (const tx of txs) {
    console.log(` - ${tx.type} ${tx.amount.toString()} coins | balanceAfter=${tx.balanceAfter.toString()} | metadata=${JSON.stringify(tx.metadata)}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
