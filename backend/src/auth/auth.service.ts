import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { VerifiedTelegramUser } from '../common/decorators/current-user.decorator';
import { TasksService } from '../tasks/tasks.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  /**
   * Login idempotente: crea el usuario + granja inicial en el primer acceso.
   * countryTier se resuelve aparte (geo-IP/servicio externo) y se actualiza
   * de forma asincrona; nace en T3 por defecto para no sobre-pagar antes de resolverlo.
   */
  async loginOrRegister(tgUser: VerifiedTelegramUser, ipHash: string, referrerTelegramId?: number) {
    const existing = await this.prisma.user.findUnique({ where: { telegramId: BigInt(tgUser.id) } });
    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: { ipHash, username: tgUser.username, firstName: tgUser.first_name },
      });
    }

    const referrer = referrerTelegramId
      ? await this.prisma.user.findUnique({ where: { telegramId: BigInt(referrerTelegramId) } })
      : null;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          telegramId: BigInt(tgUser.id),
          username: tgUser.username,
          firstName: tgUser.first_name,
          languageCode: tgUser.language_code,
          ipHash,
          referredBy: referrer?.id,
        },
      });

      await tx.farm.create({
        data: {
          userId: user.id,
          serverSeed: crypto.randomBytes(16).toString('hex'),
        },
      });

      if (referrer) {
        await this.buildReferralTree(tx, user.id, referrer.id);
        await this.tasks.incrementProgress(tx, referrer.id, 'invite_friend');
      }

      return user;
    });
  }

  /** Materializa el arbol de referidos hasta profundidad 3 (L1/L2/L3). */
  private async buildReferralTree(tx: Prisma.TransactionClient, userId: bigint, directReferrerId: bigint) {
    await tx.referralTree.create({ data: { userId, ancestorId: directReferrerId, depth: 1 } });

    const ancestorsOfReferrer = await tx.referralTree.findMany({
      where: { userId: directReferrerId, depth: { lt: 3 } },
    });

    for (const link of ancestorsOfReferrer) {
      await tx.referralTree.create({
        data: { userId, ancestorId: link.ancestorId, depth: link.depth + 1 },
      });
    }
  }
}
