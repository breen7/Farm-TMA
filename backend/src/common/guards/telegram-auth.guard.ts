import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { isInitDataFresh, parseInitData, validateTelegramInitData } from '../utils/telegram.util';

/**
 * Autentica cada request validando el header X-Telegram-Init-Data contra el
 * bot token. Nunca confiar en un userId enviado en el body/query: el unico
 * userId valido es el que sale de este initData verificado.
 */
@Injectable()
export class TelegramAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const initData = req.headers['x-telegram-init-data'] as string | undefined;

    if (!initData) {
      throw new UnauthorizedException('Missing X-Telegram-Init-Data header');
    }

    const botToken = this.config.getOrThrow<string>('BOT_TOKEN');
    if (!validateTelegramInitData(initData, botToken)) {
      throw new UnauthorizedException('Invalid Telegram initData signature');
    }

    const parsed = parseInitData(initData);
    if (!isInitDataFresh(parsed.authDate)) {
      throw new UnauthorizedException('Telegram initData expired');
    }
    if (!parsed.user) {
      throw new UnauthorizedException('initData missing user payload');
    }

    // Adjuntamos el usuario verificado al request para los controllers/services.
    (req as Request & { telegramUser: typeof parsed.user }).telegramUser = parsed.user;
    return true;
  }
}
