import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAuthGuard } from '../common/guards/telegram-auth.guard';
import { CurrentTelegramUser, VerifiedTelegramUser } from '../common/decorators/current-user.decorator';

@Controller('tasks')
@UseGuards(TelegramAuthGuard)
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(@CurrentTelegramUser() tgUser: VerifiedTelegramUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });
    return this.tasksService.getTasksForUser(user.id);
  }

  @Post(':code/claim')
  async claim(@CurrentTelegramUser() tgUser: VerifiedTelegramUser, @Param('code') code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });
    return this.tasksService.claimReward(user.id, code);
  }
}
