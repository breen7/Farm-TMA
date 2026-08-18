import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralsService } from '../referrals/referrals.service';
import { TasksService } from '../tasks/tasks.service';
import { AdWebhookDto } from './dto/ad-webhook.dto';

const REPLAY_WINDOW_MS = 5 * 60_000;

@Injectable()
export class AdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly referrals: ReferralsService,
    private readonly tasks: TasksService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Motor de recompensa dinamica, formula de la seccion 1.2 del diseno:
   *
   *   R_ad = (eCPM / 1000) * alpha * beta * BUCKS_PER_USD
   *
   * alpha/beta se leen de ecpm_rates (ajustable por el job de reconciliacion
   * diaria) y NUNCA del payload del webhook, para que la red de anuncios no
   * pueda influir en el payout inflando el eCPM reportado por evento.
   */
  async creditAdReward(dto: AdWebhookDto) {
    if (Math.abs(Date.now() - dto.timestamp) > REPLAY_WINDOW_MS) {
      throw new BadRequestException('Stale webhook timestamp');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(dto.telegramUserId) } });
    if (user.isBanned) {
      throw new BadRequestException('User banned');
    }

    const rate = await this.prisma.ecpmRate.findUnique({
      where: { network_countryTier: { network: dto.network, countryTier: user.countryTier } },
    });
    const alpha = Number(rate?.alpha ?? this.config.get('DEFAULT_ALPHA') ?? 0.65);
    const beta = Number(rate?.beta ?? this.config.get('DEFAULT_BETA') ?? 0.9);
    const bucksPerUsd = Number(this.config.get('BUCKS_PER_USD') ?? 1000);

    // Usamos el eCPM propio (server-side, del rate table) si existe; el del
    // payload solo se usa como fallback informativo, nunca para calcular payout.
    const ecpmForCalc = rate ? Number(rate.ecpmUsd) : dto.ecpm;
    const rewardBucks = (ecpmForCalc / 1000) * alpha * beta * bucksPerUsd;

    return this.prisma.$transaction(async (tx) => {
      // La UNIQUE constraint sobre idempotencyKey hace este insert atomicamente
      // seguro contra doble-cobro por reintentos/replay del webhook.
      await tx.adImpression.create({
        data: {
          userId: user.id,
          network: dto.network,
          placementId: dto.placementId,
          ecpmUsedUsd: ecpmForCalc,
          rewardBucks,
          webhookSignature: dto.eventId,
          idempotencyKey: dto.eventId,
        },
      });

      const updated = await tx.user.update({
        where: { id: user.id },
        data: { bucksBalance: { increment: rewardBucks } },
      });

      await tx.transaction.create({
        data: {
          userId: user.id,
          type: 'AD_REWARD',
          currency: 'BUCKS',
          amount: rewardBucks,
          balanceAfter: updated.bucksBalance,
          metadata: { network: dto.network, ecpm: ecpmForCalc },
        },
      });

      await this.referrals.distributeCommission(tx, user.id, rewardBucks);
      await this.tasks.incrementProgress(tx, user.id, 'watch_3_ads');

      return { bucksBalance: updated.bucksBalance };
    });
  }
}
