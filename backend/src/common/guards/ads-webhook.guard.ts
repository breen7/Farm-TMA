import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

const NETWORK_SECRET_ENV: Record<string, string> = {
  adsgram: 'ADSGRAM_WEBHOOK_SECRET',
  monetag: 'MONETAG_WEBHOOK_SECRET',
};

/**
 * Verifica el secreto configurado para la red de anuncios indicada, contra
 * el header X-Webhook-Secret (redes que llaman con POST + headers custom) o
 * el query param `secret` (redes como Adsgram, que confirman el reward con
 * un GET simple a una URL que nosotros mismos armamos en su dashboard, sin
 * poder mandar headers propios - el secreto viaja embebido en esa URL).
 * Comparacion en tiempo constante para evitar timing attacks.
 */
@Injectable()
export class AdsWebhookGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const network = (req.body?.network ?? req.query?.network) as string | undefined;
    const provided = (req.headers['x-webhook-secret'] ?? req.query?.secret) as string | undefined;

    if (!network || !NETWORK_SECRET_ENV[network]) {
      throw new UnauthorizedException('Unknown or missing ad network');
    }
    if (!provided) {
      throw new UnauthorizedException('Missing webhook secret (X-Webhook-Secret header or secret query param)');
    }

    const expected = this.config.getOrThrow<string>(NETWORK_SECRET_ENV[network]);
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    return true;
  }
}
