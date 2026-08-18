import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

const NETWORK_SECRET_ENV: Record<string, string> = {
  adsgram: 'ADSGRAM_WEBHOOK_SECRET',
  monetag: 'MONETAG_WEBHOOK_SECRET',
};

/**
 * Verifica el header X-Webhook-Secret contra el secreto configurado para la
 * red de anuncios indicada en el body. Comparacion en tiempo constante para
 * evitar timing attacks sobre el secreto.
 */
@Injectable()
export class AdsWebhookGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const network = req.body?.network as string | undefined;
    const provided = req.headers['x-webhook-secret'] as string | undefined;

    if (!network || !NETWORK_SECRET_ENV[network]) {
      throw new UnauthorizedException('Unknown or missing ad network');
    }
    if (!provided) {
      throw new UnauthorizedException('Missing X-Webhook-Secret header');
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
