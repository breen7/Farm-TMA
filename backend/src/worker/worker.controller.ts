import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAuthGuard } from '../common/guards/telegram-auth.guard';
import { CurrentTelegramUser, VerifiedTelegramUser } from '../common/decorators/current-user.decorator';
import { SetWorkerEnabledDto } from './dto/set-worker-enabled.dto';

@Controller('worker')
@UseGuards(TelegramAuthGuard)
export class WorkerController {
  constructor(
    private readonly workerService: WorkerService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async getState(@CurrentTelegramUser() tgUser: VerifiedTelegramUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });
    return this.workerService.getState(user.id);
  }

  @Post('unlock')
  async unlock(@CurrentTelegramUser() tgUser: VerifiedTelegramUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });
    return this.workerService.unlock(user.id);
  }

  @Post('upgrade')
  async upgrade(@CurrentTelegramUser() tgUser: VerifiedTelegramUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });
    return this.workerService.upgrade(user.id);
  }

  @Patch()
  async setEnabled(@CurrentTelegramUser() tgUser: VerifiedTelegramUser, @Body() dto: SetWorkerEnabledDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });
    return this.workerService.setEnabled(user.id, dto.enabled);
  }
}
