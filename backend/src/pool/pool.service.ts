import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Implementa la invariante de solvencia descrita en la seccion 1.3 del diseno:
 *
 *   P(t) = P(t-1) + sum(alpha * revenue_i) - sum(withdrawals_j)
 *
 * El pool nunca se materializa como una fila mutable: se deriva siempre del
 * ledger inmutable de `transactions` + `withdrawal_requests` para que no
 * pueda desincronizarse ni ser manipulado directamente.
 */
@Injectable()
export class PoolService {
  constructor(private readonly prisma: PrismaService) {}

  /** Balance actual del pool en USD, derivado del ledger. */
  async getCurrentBalanceUsd(): Promise<number> {
    const [rewardsIssued, withdrawalsCompleted] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { currency: 'BUCKS', type: { in: ['AD_REWARD', 'REFERRAL_COMMISSION'] } },
        _sum: { amount: true },
      }),
      this.prisma.withdrawalRequest.aggregate({
        where: { status: { in: ['PROCESSING', 'COMPLETED'] } },
        _sum: { amountUsd: true },
      }),
    ]);

    // Los Bucks emitidos ya representan alpha*beta*revenue (ver AdsService),
    // por lo que el "ingreso disponible" es 1:1 con lo emitido, menos lo ya retirado.
    const bucksPerUsd = Number(process.env.BUCKS_PER_USD ?? 1000);
    const issuedUsd = Number(rewardsIssued._sum.amount ?? 0) / bucksPerUsd;
    const withdrawnUsd = Number(withdrawalsCompleted._sum.amountUsd ?? 0);

    return issuedUsd - withdrawnUsd;
  }

  async hasSufficientLiquidity(amountUsd: number): Promise<boolean> {
    const balance = await this.getCurrentBalanceUsd();
    return balance >= amountUsd;
  }

  /** Metricas de salud para el panel admin (GET /admin/pool-health). */
  async getHealthSnapshot() {
    const balanceUsd = await this.getCurrentBalanceUsd();
    const last24hRevenue = await this.prisma.adImpression.aggregate({
      where: { createdAt: { gte: new Date(Date.now() - 86_400_000) }, status: 'CONFIRMED' },
      _sum: { ecpmUsedUsd: true },
    });

    return {
      poolBalanceUsd: balanceUsd,
      last24hAdImpressionsEcpmSum: Number(last24hRevenue._sum.ecpmUsedUsd ?? 0),
      generatedAt: new Date().toISOString(),
    };
  }
}
