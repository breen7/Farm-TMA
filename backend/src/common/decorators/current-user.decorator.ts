import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface VerifiedTelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  language_code?: string;
}

/**
 * Solo utilizable en rutas protegidas por TelegramAuthGuard: expone el
 * usuario ya verificado via HMAC, nunca un dato crudo del cliente.
 */
export const CurrentTelegramUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): VerifiedTelegramUser => {
    const req = ctx.switchToHttp().getRequest<Request & { telegramUser: VerifiedTelegramUser }>();
    return req.telegramUser;
  },
);
