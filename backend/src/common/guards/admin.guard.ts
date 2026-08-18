import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

/**
 * Gate para el backoffice interno (no para el Mini App de Telegram): un
 * secreto compartido via header, igual que AdsWebhookGuard. No hay concepto
 * de "usuario admin" en el dominio todavia, asi que no se apoya en
 * TelegramAuthGuard.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.headers['x-admin-secret'] as string | undefined;
    if (!provided) {
      throw new UnauthorizedException('Missing X-Admin-Secret header');
    }

    const expected = this.config.getOrThrow<string>('ADMIN_API_SECRET');
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid admin secret');
    }

    return true;
  }
}
