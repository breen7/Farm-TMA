import { Controller, Get, UseGuards } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { TelegramAuthGuard } from '../common/guards/telegram-auth.guard';
import { CurrentTelegramUser, VerifiedTelegramUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('referrals')
@UseGuards(TelegramAuthGuard)
export class ReferralsController {
  constructor(
    private readonly referrals: ReferralsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('tree')
  async getTree(@CurrentTelegramUser() tgUser: VerifiedTelegramUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });
    return this.referrals.getTree(user.id);
  }
}
