import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { WithdrawalsService } from './withdrawals.service';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAuthGuard } from '../common/guards/telegram-auth.guard';
import { CurrentTelegramUser, VerifiedTelegramUser } from '../common/decorators/current-user.decorator';

@Controller('withdrawals')
@UseGuards(TelegramAuthGuard)
export class WithdrawalsController {
  constructor(
    private readonly withdrawalsService: WithdrawalsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(@CurrentTelegramUser() tgUser: VerifiedTelegramUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });
    return this.withdrawalsService.listForUser(user.id);
  }

  @Post()
  async create(@CurrentTelegramUser() tgUser: VerifiedTelegramUser, @Body() dto: CreateWithdrawalDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });
    return this.withdrawalsService.requestWithdrawal(user.id, dto);
  }
}
