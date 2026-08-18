import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { DepositsService } from './deposits.service';
import { CreateDepositIntentDto } from './dto/create-deposit-intent.dto';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAuthGuard } from '../common/guards/telegram-auth.guard';
import { CurrentTelegramUser, VerifiedTelegramUser } from '../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../common/pipes/parse-bigint.pipe';

@Controller('deposits')
@UseGuards(TelegramAuthGuard)
export class DepositsController {
  constructor(
    private readonly depositsService: DepositsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('intent')
  async createIntent(@CurrentTelegramUser() tgUser: VerifiedTelegramUser, @Body() dto: CreateDepositIntentDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });
    return this.depositsService.createIntent(user.id, dto);
  }

  @Get()
  async list(@CurrentTelegramUser() tgUser: VerifiedTelegramUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });
    return this.depositsService.listForUser(user.id);
  }

  @Get(':id')
  async getOne(@CurrentTelegramUser() tgUser: VerifiedTelegramUser, @Param('id', ParseBigIntPipe) id: bigint) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });
    return this.depositsService.getForUser(user.id, id);
  }
}
