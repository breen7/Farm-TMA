import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Split de alpha_referral entre L1/L2/L3, ver seccion 1.2 del diseno. */
const DEPTH_SHARE: Record<number, number> = {
  1: 0.10,
  2: 0.03,
  3: 0.02,
};

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Distribuye la comision de referidos sobre un evento de recompensa ya
   * calculado. Debe llamarse SIEMPRE dentro de la misma transaccion que
   * acredita la recompensa directa, para preservar la invariante de
   * solvencia (la comision sale del mismo alpha, no es presupuesto extra).
   */
  async distributeCommission(tx: Prisma.TransactionClient, sourceUserId: bigint, baseRewardBucks: number) {
    const ancestors = await tx.referralTree.findMany({
      where: { userId: sourceUserId },
      orderBy: { depth: 'asc' },
    });

    for (const link of ancestors) {
      const share = DEPTH_SHARE[link.depth];
      if (!share) continue;

      const commission = baseRewardBucks * share;
      const ancestor = await tx.user.update({
        where: { id: link.ancestorId },
        data: { bucksBalance: { increment: commission } },
      });

      await tx.transaction.create({
        data: {
          userId: link.ancestorId,
          type: 'REFERRAL_COMMISSION',
          currency: 'BUCKS',
          amount: commission,
          balanceAfter: ancestor.bucksBalance,
          metadata: { sourceUserId: sourceUserId.toString(), depth: link.depth },
        },
      });
    }
  }

  async getTree(userId: bigint) {
    const [asAncestor] = await Promise.all([
      this.prisma.referralTree.findMany({
        where: { ancestorId: userId },
        include: { descendant: { select: { id: true, username: true, createdAt: true } } },
      }),
    ]);

    const byDepth: Record<number, unknown[]> = { 1: [], 2: [], 3: [] };
    for (const link of asAncestor) {
      byDepth[link.depth].push(link.descendant);
    }
    return byDepth;
  }
}
