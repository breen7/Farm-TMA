import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Worker } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RESOURCE_SELL_PRICES } from '../farm/farm.constants';
import { computeProduction, HOUR_MS } from '../farm/farm-production.util';
import { WORKER_HANDLING_TIME_SEC, WORKER_MAX_OFFLINE_HOURS, WORKER_ROUND_TRIP_DISTANCE_M, WORKER_TIERS } from './worker.constants';

export interface WorkerPayout {
  coinsEarned: number;
  cycles: number;
}

export interface WorkerState {
  unlocked: boolean;
  enabled: boolean;
  level: number;
  walkSpeedMPerSec: number | null;
  inventoryCapacity: number | null;
  cycleDurationSec: number | null;
  nextUpgradeCost: number | null;
  lifetimeCoinsEarned: Prisma.Decimal | number;
  lastPayout: WorkerPayout | null;
}

@Injectable()
export class WorkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private cycleDurationMs(level: number): number {
    const tier = WORKER_TIERS[level - 1];
    return ((WORKER_ROUND_TRIP_DISTANCE_M / tier.walkSpeedMPerSec) + WORKER_HANDLING_TIME_SEC) * 1000;
  }

  private toWorkerState(worker: Worker | null, lastPayout: WorkerPayout | null = null): WorkerState {
    const level = worker?.level ?? 0;
    const tier = level > 0 ? WORKER_TIERS[level - 1] : null;
    const nextTier = WORKER_TIERS[level]; // undefined si ya esta en el tier maximo

    return {
      unlocked: level > 0,
      enabled: worker?.enabled ?? false,
      level,
      walkSpeedMPerSec: tier?.walkSpeedMPerSec ?? null,
      inventoryCapacity: tier?.inventoryCapacity ?? null,
      cycleDurationSec: level > 0 ? this.cycleDurationMs(level) / 1000 : null,
      nextUpgradeCost: nextTier?.upgradeCostCoins ?? null,
      lifetimeCoinsEarned: worker?.lifetimeCoinsEarned ?? 0,
      lastPayout,
    };
  }

  /**
   * Simula, para cada viaje completo que entra en el tiempo transcurrido
   * desde `worker.lastProcessedAt`, una cosecha+venta automatica: reusa
   * computeProduction (misma formula que FarmService.collect) con
   * timestamps virtuales por ciclo, recorta por la capacidad de carga del
   * tier actual, y vende todo lo cargado a los mismos precios de
   * RESOURCE_SELL_PRICES. Se ejecuta de forma perezosa (no hay cron): la
   * llaman getState() y, por extension, GET /worker y MeController.
   *
   * Si el resto no completa un ciclo entero, no se toca nada — el remanente
   * queda para la proxima vez que se calcule, nunca se pierde.
   */
  async processOfflineEarnings(userId: bigint): Promise<WorkerPayout | null> {
    const [farm, worker] = await Promise.all([
      this.prisma.farm.findUnique({ where: { userId } }),
      this.prisma.worker.findUnique({ where: { userId } }),
    ]);
    if (!farm || !worker || !worker.enabled || worker.level === 0) return null;

    const tier = WORKER_TIERS[worker.level - 1];
    const cycleMs = this.cycleDurationMs(worker.level);

    const now = new Date();
    const cappedNow = new Date(
      Math.min(now.getTime(), worker.lastProcessedAt.getTime() + WORKER_MAX_OFFLINE_HOURS * HOUR_MS),
    );
    const elapsedMs = Math.max(0, cappedNow.getTime() - worker.lastProcessedAt.getTime());
    const numCycles = Math.floor(elapsedMs / cycleMs);
    if (numCycles === 0) return null;

    const boostMultiplier = Number(this.config.get('BOOST_MULTIPLIER') ?? 2);
    const rates = farm.productionRate as unknown as Record<string, number>;
    const capacity = Number(farm.storageCapacity);

    let farmCursor = farm.lastCollectedAt;
    const resourcesSold: Record<string, number> = {};
    let totalCoinsEarned = 0;

    for (let i = 1; i <= numCycles; i++) {
      const cycleEndTime = new Date(worker.lastProcessedAt.getTime() + i * cycleMs);
      const { produced } = computeProduction({
        productionRate: rates,
        storageCapacity: capacity,
        lastCollectedAt: farmCursor,
        boostExpiresAt: farm.boostExpiresAt,
        boostMultiplier,
        atTime: cycleEndTime,
      });

      // Ademas del cap del silo (ya aplicado por computeProduction), el peon
      // no puede cargar mas de lo que le permite su capacidad de inventario
      // en un solo viaje.
      const totalProduced = Object.values(produced).reduce((a, b) => a + b, 0);
      const loadScale = totalProduced > tier.inventoryCapacity && totalProduced > 0 ? tier.inventoryCapacity / totalProduced : 1;

      for (const [resource, amount] of Object.entries(produced)) {
        const loaded = amount * loadScale;
        const price = RESOURCE_SELL_PRICES[resource];
        if (loaded <= 0 || price === undefined) continue;
        resourcesSold[resource] = (resourcesSold[resource] ?? 0) + loaded;
        totalCoinsEarned += loaded * price;
      }

      farmCursor = cycleEndTime;
    }

    const lastCycleTime = new Date(worker.lastProcessedAt.getTime() + numCycles * cycleMs);

    return this.prisma.$transaction(async (tx) => {
      await tx.farm.update({ where: { userId }, data: { lastCollectedAt: lastCycleTime } });
      await tx.worker.update({
        where: { userId },
        data: { lastProcessedAt: lastCycleTime, lifetimeCoinsEarned: { increment: totalCoinsEarned } },
      });
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { coinsBalance: { increment: totalCoinsEarned } },
      });
      await tx.transaction.create({
        data: {
          userId,
          type: 'WORKER_AUTO_SELL',
          currency: 'COINS',
          amount: totalCoinsEarned,
          balanceAfter: updatedUser.coinsBalance,
          metadata: { cycles: numCycles, resourcesSold } as Prisma.InputJsonValue,
        },
      });

      return { coinsEarned: totalCoinsEarned, cycles: numCycles };
    });
  }

  async getState(userId: bigint): Promise<WorkerState> {
    const payout = await this.processOfflineEarnings(userId);
    const worker = await this.prisma.worker.findUnique({ where: { userId } });
    return this.toWorkerState(worker, payout);
  }

  /** Desbloquea el nivel 1, pagado en Coins, mismo patron de sink que upgradeStorage/upgradeAnimal. */
  async unlock(userId: bigint): Promise<WorkerState> {
    const existing = await this.prisma.worker.findUnique({ where: { userId } });
    if (existing && existing.level > 0) {
      throw new BadRequestException('Worker already unlocked');
    }

    const cost = WORKER_TIERS[0].upgradeCostCoins;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (Number(user.coinsBalance) < cost) {
        throw new BadRequestException('Insufficient coins balance to unlock the worker');
      }

      const updatedUser = await tx.user.update({ where: { id: userId }, data: { coinsBalance: { decrement: cost } } });

      await tx.transaction.create({
        data: {
          userId,
          type: 'SINK_WORKER',
          currency: 'COINS',
          amount: -cost,
          balanceAfter: updatedUser.coinsBalance,
          metadata: { action: 'unlock', level: 1 } as Prisma.InputJsonValue,
        },
      });

      const updatedWorker = await tx.worker.upsert({
        where: { userId },
        create: { userId, level: 1, enabled: true, lastProcessedAt: new Date() },
        update: { level: 1, enabled: true, lastProcessedAt: new Date() },
      });

      return this.toWorkerState(updatedWorker);
    });
  }

  /** Sube al siguiente tier de WORKER_TIERS, pagado en Coins. */
  async upgrade(userId: bigint): Promise<WorkerState> {
    const worker = await this.prisma.worker.findUnique({ where: { userId } });
    if (!worker || worker.level === 0) {
      throw new BadRequestException('Worker not unlocked yet');
    }
    if (worker.level >= WORKER_TIERS.length) {
      throw new BadRequestException('Worker is already at max level');
    }

    const nextLevel = worker.level + 1;
    const cost = WORKER_TIERS[nextLevel - 1].upgradeCostCoins;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (Number(user.coinsBalance) < cost) {
        throw new BadRequestException('Insufficient coins balance for worker upgrade');
      }

      const updatedUser = await tx.user.update({ where: { id: userId }, data: { coinsBalance: { decrement: cost } } });

      await tx.transaction.create({
        data: {
          userId,
          type: 'SINK_WORKER',
          currency: 'COINS',
          amount: -cost,
          balanceAfter: updatedUser.coinsBalance,
          metadata: { action: 'upgrade', level: nextLevel } as Prisma.InputJsonValue,
        },
      });

      const updatedWorker = await tx.worker.update({ where: { userId }, data: { level: nextLevel } });

      return this.toWorkerState(updatedWorker);
    });
  }

  /**
   * Activa/desactiva el peon, sin costo. Al desactivar, primero se liquida
   * cualquier ganancia offline pendiente con el estado actual (el peon
   * "vuelve con lo que junto" antes de parar); al activar, el reloj arranca
   * de cero — el tiempo que estuvo apagado nunca genera ciclos.
   */
  async setEnabled(userId: bigint, enabled: boolean): Promise<WorkerState> {
    const worker = await this.prisma.worker.findUnique({ where: { userId } });
    if (!worker || worker.level === 0) {
      throw new BadRequestException('Worker not unlocked yet');
    }

    const payout = enabled ? null : await this.processOfflineEarnings(userId);

    const updatedWorker = await this.prisma.worker.update({
      where: { userId },
      data: {
        enabled,
        ...(enabled ? { lastProcessedAt: new Date() } : {}),
      },
    });

    return this.toWorkerState(updatedWorker, payout);
  }
}
