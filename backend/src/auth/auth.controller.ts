import { Controller, Headers, Ip, Post, Query, UseGuards } from '@nestjs/common';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { TelegramAuthGuard } from '../common/guards/telegram-auth.guard';
import { CurrentTelegramUser, VerifiedTelegramUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('telegram')
  @UseGuards(TelegramAuthGuard)
  async login(
    @CurrentTelegramUser() tgUser: VerifiedTelegramUser,
    @Ip() ip: string,
    @Query('startapp') startapp?: string,
  ) {
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex');
    const referrerTelegramId = startapp?.startsWith('ref_') ? Number(startapp.slice(4)) : undefined;

    const user = await this.authService.loginOrRegister(tgUser, ipHash, referrerTelegramId);
    return {
      id: user.id.toString(),
      telegramId: user.telegramId.toString(),
      coinsBalance: user.coinsBalance,
      bucksBalance: user.bucksBalance,
    };
  }
}
