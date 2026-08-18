import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { FarmService } from './farm.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAuthGuard } from '../common/guards/telegram-auth.guard';
import { CurrentTelegramUser, VerifiedTelegramUser } from '../common/decorators/current-user.decorator';
import { SellResourceDto } from './dto/sell-resource.dto';

@Controller('farm')
@UseGuards(TelegramAuthGuard)
export class FarmController {
  constructor(
    private readonly farmService: FarmService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async getState(@CurrentTelegramUser() tgUser: VerifiedTelegramUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });
    return this.farmService.getState(user.id);
  }

  @Get('inventory')
  async getInventory(@CurrentTelegramUser() tgUser: VerifiedTelegramUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });
    return this.farmService.getInventory(user.id);
  }

  @Post('collect')
  async collect(@CurrentTelegramUser() tgUser: VerifiedTelegramUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });
    return this.farmService.collect(user.id);
  }

  @Post('boost')
  async boost(@CurrentTelegramUser() tgUser: VerifiedTelegramUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });
    return this.farmService.activateBoost(user.id);
  }

  @Post('sell')
  async sell(@CurrentTelegramUser() tgUser: VerifiedTelegramUser, @Body() dto: SellResourceDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });
    return this.farmService.sell(user.id, dto.resource, dto.quantity);
  }

  @Post('upgrade-storage')
  async upgradeStorage(@CurrentTelegramUser() tgUser: VerifiedTelegramUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });
    return this.farmService.upgradeStorage(user.id);
  }
}
