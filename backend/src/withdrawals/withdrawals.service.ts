import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Address } from '@ton/ton';
import { Prisma, WithdrawalRequest, WithdrawalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PoolService } from '../pool/pool.service';
import { TonService } from '../ton/ton.service';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { WITHDRAWALS_QUEUE } from './withdrawals.constants';

const USDT_DECIMALS = 1_000_000;

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly pool: PoolService,
    private readonly tonService: TonService,
    @InjectQueue(WITHDRAWALS_QUEUE) private readonly queue: Queue,
  ) {}

  async listForUser(userId: bigint) {
    return this.prisma.withdrawalRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Valida fondos, umbral minimo, solvencia del pool y riesgo del usuario; si
   * pasa esas validaciones y es de bajo riesgo la encola de inmediato, si no
   * queda en RISK_REVIEW a la espera de revision manual (modulo admin,
   * todavia no implementado).
   */
  async requestWithdrawal(userId: bigint, dto: CreateWithdrawalDto) {
    try {
      Address.parse(dto.destinationWallet);
    } catch {
      throw new BadRequestException('Invalid TON destination wallet address');
    }

    const bucksPerUsd = Number(this.config.get('BUCKS_PER_USD') ?? 1000);
    const amountUsd = dto.amountBucks / bucksPerUsd;
    const minUsd = Number(this.config.get('WITHDRAWAL_MIN_USD') ?? 1);
    if (amountUsd < minUsd) {
      throw new BadRequestException(`Minimum withdrawal is ${minUsd} USD`);
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.isBanned) {
      throw new BadRequestException('User is banned');
    }
    if (Number(user.bucksBalance) < dto.amountBucks) {
      throw new BadRequestException('Insufficient bucks balance');
    }

    const hasLiquidity = await this.pool.hasSufficientLiquidity(amountUsd);
    if (!hasLiquidity) {
      throw new BadRequestException('Ad-pool has insufficient liquidity for this amount right now');
    }

    const autoApproveUsdLimit = Number(this.config.get('WITHDRAWAL_AUTO_APPROVE_USD_LIMIT') ?? 10);
    const autoApproveMaxRisk = Number(this.config.get('WITHDRAWAL_AUTO_APPROVE_MAX_RISK_SCORE') ?? 50);
    const isLowRisk = amountUsd <= autoApproveUsdLimit && user.riskScore <= autoApproveMaxRisk;
    const status: WithdrawalStatus = isLowRisk ? 'QUEUED' : 'RISK_REVIEW';

    const withdrawal = await this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { bucksBalance: { decrement: dto.amountBucks } },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: 'WITHDRAWAL',
          currency: 'BUCKS',
          amount: -dto.amountBucks,
          balanceAfter: updatedUser.bucksBalance,
          metadata: { asset: dto.asset, destinationWallet: dto.destinationWallet } as Prisma.InputJsonValue,
        },
      });

      return tx.withdrawalRequest.create({
        data: {
          userId,
          amountBucks: dto.amountBucks,
          amountUsd,
          asset: dto.asset,
          destinationWallet: dto.destinationWallet,
          status,
          riskScoreSnapshot: user.riskScore,
        },
      });
    });

    if (status === 'QUEUED') {
      await this.enqueue(withdrawal.id);
    }

    return withdrawal;
  }

  /**
   * Mueve un retiro de RISK_REVIEW a QUEUED tras revision manual (modulo
   * admin) y lo encola para procesamiento. `updateMany` con guard de estado
   * evita aprobar dos veces un retiro que ya avanzo de estado.
   */
  async approveRiskReview(withdrawalId: bigint) {
    const claimed = await this.prisma.withdrawalRequest.updateMany({
      where: { id: withdrawalId, status: 'RISK_REVIEW' },
      data: { status: 'QUEUED' },
    });
    if (claimed.count === 0) {
      throw new BadRequestException(`Withdrawal ${withdrawalId} is not in RISK_REVIEW`);
    }
    await this.enqueue(withdrawalId);
  }

  /** Rechaza un retiro en RISK_REVIEW y reembolsa los bucks debitados al solicitarlo. */
  async rejectRiskReview(withdrawalId: bigint, reason?: string) {
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal) {
      throw new NotFoundException(`Withdrawal ${withdrawalId} not found`);
    }
    if (withdrawal.status !== 'RISK_REVIEW') {
      throw new BadRequestException(`Withdrawal ${withdrawalId} is not in RISK_REVIEW (status=${withdrawal.status})`);
    }

    await this.prisma.$transaction(async (tx) => {
      await this.creditRefund(tx, withdrawal, reason ? `rejected_by_admin: ${reason}` : 'rejected_by_admin');
      await tx.withdrawalRequest.update({ where: { id: withdrawal.id }, data: { status: 'REJECTED' } });
    });
  }

  async enqueue(withdrawalId: bigint) {
    await this.queue.add(
      'process-withdrawal',
      { withdrawalId: withdrawalId.toString() },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  /**
   * Ejecuta el payout on-chain. Solo procesa si el registro sigue en QUEUED:
   * eso hace la operacion idempotente frente a reintentos de BullMQ o dos
   * workers tomando el mismo job. Si el pool se queda sin liquidez entre el
   * request y el procesamiento, lanza para que BullMQ reintente mas tarde
   * (con backoff) en vez de fallar el retiro definitivamente.
   */
  async processWithdrawal(withdrawalId: bigint) {
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal) {
      throw new NotFoundException(`Withdrawal ${withdrawalId} not found`);
    }
    if (withdrawal.status !== 'QUEUED') {
      this.logger.warn(`Withdrawal ${withdrawalId} is not QUEUED (status=${withdrawal.status}), skipping`);
      return;
    }

    const amountUsd = Number(withdrawal.amountUsd);
    const hasLiquidity = await this.pool.hasSufficientLiquidity(amountUsd);
    if (!hasLiquidity) {
      throw new Error(`Pool insufficient liquidity for withdrawal ${withdrawalId}, will retry`);
    }

    const poolBalanceUsd = await this.pool.getCurrentBalanceUsd();
    const claimed = await this.prisma.withdrawalRequest.updateMany({
      where: { id: withdrawalId, status: 'QUEUED' },
      data: { status: 'PROCESSING', poolBalanceSnapshot: poolBalanceUsd, processingStartedAt: new Date() },
    });
    if (claimed.count === 0) {
      this.logger.warn(`Withdrawal ${withdrawalId} was already claimed by another worker, skipping`);
      return;
    }

    try {
      const txHash = await this.sendPayout(withdrawal.asset, withdrawal.destinationWallet, amountUsd);
      await this.prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: { status: 'COMPLETED', txHash, processedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(`Payout failed for withdrawal ${withdrawalId}: ${(error as Error).message}`);
      // Best-effort: si el reembolso tambien fallara aqui, el registro queda
      // atascado en PROCESSING — lo recoge el sweep de reconciliacion
      // (reconcileStuckProcessing), que primero verifica en TON si el pago
      // salio de verdad antes de reembolsar.
      await this.refundAndFail(withdrawal);
      throw error;
    }
  }

  /**
   * Barre retiros atascados en PROCESSING (crash entre "enviar" y "marcar
   * COMPLETED") y los resuelve: si el pago realmente salio de la wallet, los
   * completa con el hash real; si no hay rastro on-chain, reembolsa y marca
   * FAILED. Se ejecuta periodicamente via ReconciliationScheduler/Processor.
   */
  async reconcileStuckProcessing(): Promise<void> {
    const staleMinutes = Number(this.config.get('RECONCILE_STUCK_PROCESSING_MINUTES') ?? 15);
    const cutoff = new Date(Date.now() - staleMinutes * 60_000);

    const stuck = await this.prisma.withdrawalRequest.findMany({
      where: { status: 'PROCESSING', processingStartedAt: { lt: cutoff } },
    });

    if (stuck.length === 0) {
      return;
    }
    this.logger.warn(`Reconciling ${stuck.length} withdrawal(s) stuck in PROCESSING`);

    for (const withdrawal of stuck) {
      try {
        await this.reconcileOne(withdrawal);
      } catch (error) {
        this.logger.error(`Reconciliation failed for withdrawal ${withdrawal.id}: ${(error as Error).message}`);
      }
    }
  }

  private async reconcileOne(withdrawal: WithdrawalRequest): Promise<void> {
    const amountUsd = Number(withdrawal.amountUsd);
    const expectedAmount = this.computePayoutAmount(withdrawal.asset, amountUsd);
    // Margen de 60s para cubrir desfases de reloj/latencia entre el momento
    // en que se marco PROCESSING y el createdAt real del mensaje en TON.
    const sinceUnixSeconds = Math.floor((withdrawal.processingStartedAt ?? withdrawal.createdAt).getTime() / 1000) - 60;

    let txHash: string | null;
    try {
      txHash = await this.tonService.findRecentPayment(
        withdrawal.asset as 'TON' | 'USDT',
        withdrawal.destinationWallet,
        expectedAmount,
        sinceUnixSeconds,
      );
    } catch (error) {
      // Si ni siquiera pudimos consultar TON, mejor dejarlo para el proximo
      // sweep que arriesgar un reembolso indebido de un pago que si salio.
      this.logger.error(`Could not verify on-chain state for withdrawal ${withdrawal.id}: ${(error as Error).message}`);
      return;
    }

    if (txHash) {
      const claimed = await this.prisma.withdrawalRequest.updateMany({
        where: { id: withdrawal.id, status: 'PROCESSING' },
        data: { status: 'COMPLETED', txHash, processedAt: new Date() },
      });
      if (claimed.count > 0) {
        this.logger.log(`Withdrawal ${withdrawal.id} was already sent on-chain (${txHash}); marked COMPLETED`);
      }
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.withdrawalRequest.updateMany({
        where: { id: withdrawal.id, status: 'PROCESSING' },
        data: { status: 'FAILED' },
      });
      if (claimed.count === 0) {
        return;
      }
      await this.creditRefund(tx, withdrawal, 'reconciliation_no_onchain_payment_found');
    });
    this.logger.warn(`Withdrawal ${withdrawal.id}: no matching on-chain payment found, refunded and marked FAILED`);
  }

  private computePayoutAmount(asset: string, amountUsd: number): bigint {
    if (asset === 'USDT') {
      return BigInt(Math.round(amountUsd * USDT_DECIMALS));
    }
    if (asset === 'TON') {
      const tonUsdRate = Number(this.config.getOrThrow('TON_USD_RATE'));
      return BigInt(Math.round((amountUsd / tonUsdRate) * 1e9));
    }
    throw new BadRequestException(`Unsupported withdrawal asset: ${asset}`);
  }

  private async sendPayout(asset: string, destinationWallet: string, amountUsd: number): Promise<string> {
    const amount = this.computePayoutAmount(asset, amountUsd);
    return asset === 'USDT' ? this.tonService.sendUsdt(destinationWallet, amount) : this.tonService.sendTon(destinationWallet, amount);
  }

  /** Revierte el debito de bucks cuando el payout on-chain falla definitivamente. */
  private async refundAndFail(withdrawal: { id: bigint; userId: bigint; amountBucks: Prisma.Decimal }) {
    await this.prisma.$transaction(async (tx) => {
      await this.creditRefund(tx, withdrawal, 'withdrawal_payout_failed');
      await tx.withdrawalRequest.update({ where: { id: withdrawal.id }, data: { status: 'FAILED' } });
    });
  }

  /** Acredita de vuelta los bucks debitados al solicitar un retiro que no se concreto. */
  private async creditRefund(
    tx: Prisma.TransactionClient,
    withdrawal: { id: bigint; userId: bigint; amountBucks: Prisma.Decimal },
    reason: string,
  ) {
    const user = await tx.user.update({
      where: { id: withdrawal.userId },
      data: { bucksBalance: { increment: withdrawal.amountBucks } },
    });

    await tx.transaction.create({
      data: {
        userId: withdrawal.userId,
        type: 'ADMIN_ADJUSTMENT',
        currency: 'BUCKS',
        amount: withdrawal.amountBucks,
        balanceAfter: user.bucksBalance,
        refId: withdrawal.id,
        metadata: { reason } as Prisma.InputJsonValue,
      },
    });
  }
}
