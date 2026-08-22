import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Farm, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { ANIMAL_TIERS, RESOURCE_SELL_PRICES } from './farm.constants';
import { computeProduction, HOUR_MS, ProductionRates, ProductionResult } from './farm-production.util';

const INITIAL_STORAGE_CAPACITY = 1000; // debe coincidir con el @default() de Farm.storageCapacity en schema.prisma

interface PendingProduction extends ProductionResult {
  now: Date;
}

@Injectable()
export class FarmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tasks: TasksService,
  ) {}

  private async getFarmOrThrow(userId: bigint): Promise<Farm> {
    const farm = await this.prisma.farm.findUnique({ where: { userId } });
    if (!farm) {
      throw new NotFoundException('Farm not found');
    }
    return farm;
  }

  /**
   * Produccion offline desde la ultima cosecha. Wrapper delgado sobre
   * computeProduction (farm-production.util.ts) — la formula en si vive ahi
   * para que WorkerService pueda reusarla tal cual al simular las cosechas
   * virtuales del calculo de ganancias offline del peon.
   */
  private computePendingProduction(farm: Farm): PendingProduction {
    const now = new Date();
    const boostMultiplier = Number(this.config.get('BOOST_MULTIPLIER') ?? 2);
    const { produced, wasCapped } = computeProduction({
      productionRate: farm.productionRate as unknown as ProductionRates,
      storageCapacity: Number(farm.storageCapacity),
      lastCollectedAt: farm.lastCollectedAt,
      boostExpiresAt: farm.boostExpiresAt,
      boostMultiplier,
      atTime: now,
    });
    return { produced, now, wasCapped };
  }

  async getInventory(userId: bigint) {
    return this.prisma.inventory.findMany({ where: { userId } });
  }

  /** Vista de solo lectura: no persiste nada, solo estima lo acumulado hasta ahora. */
  async getState(userId: bigint) {
    const farm = await this.getFarmOrThrow(userId);
    const { produced, wasCapped } = this.computePendingProduction(farm);

    const tiers = farm.animalTiers as unknown as Record<string, number>;
    const nextAnimalUpgradeCosts: Record<string, number | null> = {};
    for (const [resource, config] of Object.entries(ANIMAL_TIERS)) {
      const tier = tiers[resource] ?? 1;
      nextAnimalUpgradeCosts[resource] = tier < config.ratesPerHour.length ? config.upgradeCostsCoins[tier - 1] : null;
    }

    return {
      level: farm.level,
      storageCapacity: farm.storageCapacity,
      productionRate: farm.productionRate,
      animalTiers: farm.animalTiers,
      nextAnimalUpgradeCosts,
      boostExpiresAt: farm.boostExpiresAt,
      lastCollectedAt: farm.lastCollectedAt,
      pendingProduction: produced,
      pendingIsCapped: wasCapped,
    };
  }

  /** Mueve la produccion acumulada al inventario y reinicia el temporizador de cosecha. */
  async collect(userId: bigint) {
    const farm = await this.getFarmOrThrow(userId);
    const { produced, now } = this.computePendingProduction(farm);

    return this.prisma.$transaction(async (tx) => {
      for (const [resource, amount] of Object.entries(produced)) {
        if (amount <= 0) continue;
        await tx.inventory.upsert({
          where: { userId_resource: { userId, resource } },
          create: { userId, resource, quantity: amount },
          update: { quantity: { increment: amount } },
        });
      }

      await tx.farm.update({ where: { userId }, data: { lastCollectedAt: now } });
      await this.tasks.incrementProgress(tx, userId, 'collect_5_times');

      const inventory = await tx.inventory.findMany({ where: { userId } });
      return { collected: produced, inventory };
    });
  }

  /** Aplica el efecto del boost (sin cobrar nada) — el pago se resuelve en cada caller. */
  private async applyBoostEffect(tx: Prisma.TransactionClient, userId: bigint, farm: Farm, durationHours: number) {
    const now = new Date();
    const base = farm.boostExpiresAt && farm.boostExpiresAt.getTime() > now.getTime() ? farm.boostExpiresAt : now;
    const newExpiry = new Date(base.getTime() + durationHours * HOUR_MS);
    return tx.farm.update({ where: { userId }, data: { boostExpiresAt: newExpiry } });
  }

  /** Activa (o extiende) el boost de produccion, cobrando en bucks como sink de la economia. */
  async activateBoost(userId: bigint) {
    const farm = await this.getFarmOrThrow(userId);
    const durationHours = Number(this.config.get('BOOST_DURATION_HOURS') ?? 2);
    const costBucks = Number(this.config.get('BOOST_COST_BUCKS') ?? 50);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (Number(user.bucksBalance) < costBucks) {
        throw new BadRequestException('Insufficient bucks balance for boost');
      }

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { bucksBalance: { decrement: costBucks } },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: 'SINK_BOOST',
          currency: 'BUCKS',
          amount: -costBucks,
          balanceAfter: updatedUser.bucksBalance,
          metadata: { durationHours } as Prisma.InputJsonValue,
        },
      });

      const updatedFarm = await this.applyBoostEffect(tx, userId, farm, durationHours);

      return { boostExpiresAt: updatedFarm.boostExpiresAt, bucksBalance: updatedUser.bucksBalance };
    });
  }

  /**
   * Otorga el boost sin cobrar nada acá — para cuando el pago ya se verifico
   * por otro medio (ej. un deposito TON confirmado on-chain, ver
   * DepositsService). El caller es responsable de haber verificado el pago
   * antes de llamar esto.
   */
  async grantBoost(userId: bigint, durationHours?: number) {
    const farm = await this.getFarmOrThrow(userId);
    const hours = durationHours ?? Number(this.config.get('BOOST_DURATION_HOURS') ?? 2);
    const updatedFarm = await this.applyBoostEffect(this.prisma, userId, farm, hours);
    return { boostExpiresAt: updatedFarm.boostExpiresAt };
  }

  /**
   * Vende recursos del inventario a cambio de Coins (nunca Bucks: Bucks solo
   * puede emitirse respaldado por ingresos reales de anuncios, ver
   * PoolService — vender cosecha por Bucks romperia esa invariante de
   * solvencia y permitiria retirar TON sin respaldo real).
   */
  async sell(userId: bigint, resource: string, quantity: number) {
    const price = RESOURCE_SELL_PRICES[resource];
    if (price === undefined) {
      throw new BadRequestException(`Unknown sellable resource: ${resource}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({ where: { userId_resource: { userId, resource } } });
      if (!inventory || Number(inventory.quantity) < quantity) {
        throw new BadRequestException('Insufficient inventory');
      }

      const coinsEarned = price * quantity;

      const updatedInventory = await tx.inventory.update({
        where: { userId_resource: { userId, resource } },
        data: { quantity: { decrement: quantity } },
      });

      const user = await tx.user.update({
        where: { id: userId },
        data: { coinsBalance: { increment: coinsEarned } },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: 'RESOURCE_SALE',
          currency: 'COINS',
          amount: coinsEarned,
          balanceAfter: user.coinsBalance,
          metadata: { resource, quantity } as Prisma.InputJsonValue,
        },
      });

      return {
        resource,
        quantitySold: quantity,
        coinsEarned,
        coinsBalance: user.coinsBalance,
        inventory: updatedInventory,
      };
    });
  }

  /**
   * Sube storageCapacity en un incremento fijo, con costo en Coins creciente
   * por upgrade. El numero de upgrade se deriva de la capacidad actual
   * (asume que storageCapacity solo crece via este metodo, siempre en pasos
   * de STORAGE_UPGRADE_AMOUNT — si en el futuro se ajusta manualmente desde
   * un panel admin, este calculo dejaria de ser exacto).
   */
  async upgradeStorage(userId: bigint) {
    const farm = await this.getFarmOrThrow(userId);
    const upgradeAmount = Number(this.config.get('STORAGE_UPGRADE_AMOUNT') ?? 500);
    const baseCost = Number(this.config.get('STORAGE_UPGRADE_BASE_COST_COINS') ?? 200);
    const multiplier = Number(this.config.get('STORAGE_UPGRADE_COST_MULTIPLIER') ?? 1.5);

    const currentCapacity = Number(farm.storageCapacity);
    const upgradeCount = Math.max(0, Math.round((currentCapacity - INITIAL_STORAGE_CAPACITY) / upgradeAmount));
    const cost = Math.round(baseCost * multiplier ** upgradeCount);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (Number(user.coinsBalance) < cost) {
        throw new BadRequestException('Insufficient coins balance for storage upgrade');
      }

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { coinsBalance: { decrement: cost } },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: 'SINK_STORAGE',
          currency: 'COINS',
          amount: -cost,
          balanceAfter: updatedUser.coinsBalance,
          metadata: { upgradeAmount, newCapacity: currentCapacity + upgradeAmount } as Prisma.InputJsonValue,
        },
      });

      const updatedFarm = await tx.farm.update({
        where: { userId },
        data: { storageCapacity: { increment: upgradeAmount } },
      });

      return {
        storageCapacity: updatedFarm.storageCapacity,
        coinsBalance: updatedUser.coinsBalance,
        nextUpgradeCost: Math.round(cost * multiplier),
      };
    });
  }

  /**
   * Sube el tier de un animal (eggs/milk), subiendo permanentemente su tasa
   * de produccion en productionRate - a diferencia del boost, que es
   * temporal y se aplica como multiplicador en tiempo de cosecha, esto
   * cambia la tasa base guardada. Pagado en Coins, mismo patron de sink que
   * upgradeStorage.
   */
  async upgradeAnimal(userId: bigint, resource: string) {
    const config = ANIMAL_TIERS[resource];
    if (!config) {
      throw new BadRequestException(`Unknown animal resource: ${resource}`);
    }

    const farm = await this.getFarmOrThrow(userId);
    const tiers = farm.animalTiers as unknown as Record<string, number>;
    const currentTier = tiers[resource] ?? 1;

    if (currentTier >= config.ratesPerHour.length) {
      throw new BadRequestException(`${resource} is already at max tier`);
    }

    const cost = config.upgradeCostsCoins[currentTier - 1];
    const newTier = currentTier + 1;
    const newRate = config.ratesPerHour[newTier - 1];

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (Number(user.coinsBalance) < cost) {
        throw new BadRequestException('Insufficient coins balance for animal upgrade');
      }

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { coinsBalance: { decrement: cost } },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: 'SINK_ANIMAL_UPGRADE',
          currency: 'COINS',
          amount: -cost,
          balanceAfter: updatedUser.coinsBalance,
          metadata: { resource, newTier, newRate } as Prisma.InputJsonValue,
        },
      });

      const rates = farm.productionRate as unknown as ProductionRates;
      const updatedFarm = await tx.farm.update({
        where: { userId },
        data: {
          animalTiers: { ...tiers, [resource]: newTier },
          productionRate: { ...rates, [resource]: newRate },
        },
      });

      const nextCost =
        newTier < config.ratesPerHour.length ? config.upgradeCostsCoins[newTier - 1] : null;

      return {
        resource,
        tier: newTier,
        productionRate: updatedFarm.productionRate,
        coinsBalance: updatedUser.coinsBalance,
        nextUpgradeCost: nextCost,
      };
    });
  }
}
