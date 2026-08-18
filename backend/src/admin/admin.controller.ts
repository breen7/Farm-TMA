import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WithdrawalStatus } from '@prisma/client';
import { AdminGuard } from '../common/guards/admin.guard';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { WithdrawalsService } from '../withdrawals/withdrawals.service';
import { RejectWithdrawalDto } from './dto/reject-withdrawal.dto';

const VALID_WITHDRAWAL_STATUSES: WithdrawalStatus[] = [
  'PENDING',
  'QUEUED',
  'RISK_REVIEW',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'REJECTED',
];

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly withdrawalsService: WithdrawalsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get('withdrawals')
  async listWithdrawals(@Query('status') status?: string) {
    if (status && !VALID_WITHDRAWAL_STATUSES.includes(status as WithdrawalStatus)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }

    return this.prisma.withdrawalRequest.findMany({
      where: status ? { status: status as WithdrawalStatus } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, telegramId: true, username: true, riskScore: true, isBanned: true } },
      },
    });
  }

  @Post('withdrawals/:id/approve')
  async approveWithdrawal(@Param('id', ParseBigIntPipe) id: bigint) {
    await this.withdrawalsService.approveRiskReview(id);
    return { id: id.toString(), status: 'QUEUED' };
  }

  @Post('withdrawals/:id/reject')
  async rejectWithdrawal(@Param('id', ParseBigIntPipe) id: bigint, @Body() dto: RejectWithdrawalDto) {
    await this.withdrawalsService.rejectRiskReview(id, dto.reason);
    return { id: id.toString(), status: 'REJECTED' };
  }

  /** Usuarios con riesgo por encima del umbral de auto-aprobacion de retiros, o ya baneados. */
  @Get('users/suspicious')
  async listSuspiciousUsers(@Query('minRiskScore') minRiskScore?: string) {
    const threshold =
      minRiskScore !== undefined
        ? Number(minRiskScore)
        : Number(this.config.get('WITHDRAWAL_AUTO_APPROVE_MAX_RISK_SCORE') ?? 50);

    return this.prisma.user.findMany({
      where: { OR: [{ riskScore: { gt: threshold } }, { isBanned: true }] },
      orderBy: { riskScore: 'desc' },
      select: {
        id: true,
        telegramId: true,
        username: true,
        riskScore: true,
        isBanned: true,
        ipHash: true,
        deviceFpHash: true,
        tonWallet: true,
        bucksBalance: true,
        coinsBalance: true,
        createdAt: true,
      },
    });
  }
}
