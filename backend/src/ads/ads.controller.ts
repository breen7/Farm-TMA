import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AdsService } from './ads.service';
import { AdWebhookDto } from './dto/ad-webhook.dto';
import { SimulateAdDto } from './dto/simulate-ad.dto';
import { AdsWebhookGuard } from '../common/guards/ads-webhook.guard';
import { TelegramAuthGuard } from '../common/guards/telegram-auth.guard';
import { CurrentTelegramUser, VerifiedTelegramUser } from '../common/decorators/current-user.decorator';

@Controller('ads')
export class AdsController {
  constructor(
    private readonly adsService: AdsService,
    private readonly config: ConfigService,
  ) {}

  @Post('webhook')
  @UseGuards(AdsWebhookGuard)
  async webhook(@Body() dto: AdWebhookDto) {
    return this.adsService.creditAdReward(dto);
  }

  /**
   * Adsgram (y en general redes que confirman el reward con un simple GET a
   * una URL que nosotros configuramos en su dashboard, sin poder mandar
   * headers custom) llaman aca. La URL a cargar en Adsgram es:
   *   .../ads/webhook?userid=[userId]&network=adsgram&secret=<ADSGRAM_WEBHOOK_SECRET>
   * `[userId]` lo reemplaza Adsgram por el Telegram ID real; `network` y
   * `secret` son estaticos, los agregamos nosotros al configurar la URL.
   */
  @Get('webhook')
  @UseGuards(AdsWebhookGuard)
  async webhookGet(@Query('userid') userid: string, @Query('network') network: 'adsgram' | 'monetag') {
    const telegramUserId = Number(userid);
    if (!Number.isFinite(telegramUserId)) {
      throw new BadRequestException('Invalid userid');
    }

    return this.adsService.creditAdReward({
      telegramUserId,
      network,
      timestamp: Date.now(),
    });
  }

  /**
   * Stand-in para el SDK real de Adsgram/Monetag mientras no tenemos cuentas
   * de esas redes: el frontend simula la reproduccion del anuncio y llama
   * aca, autenticado como el usuario actual (no con el secreto del webhook,
   * que nunca debe llegar al navegador). Bloqueado en produccion a proposito
   * — en integracion real, la recompensa la confirma el servidor de la red
   * de anuncios llamando a /ads/webhook, no el cliente.
   */
  @Post('simulate')
  @UseGuards(TelegramAuthGuard)
  async simulate(@CurrentTelegramUser() tgUser: VerifiedTelegramUser, @Body() dto: SimulateAdDto) {
    if (this.config.get('NODE_ENV') === 'production') {
      throw new ForbiddenException('Ad simulation is disabled in production');
    }

    const simulatedEcpm = Number(this.config.get('AD_SIMULATOR_ECPM_USD') ?? 5);

    return this.adsService.creditAdReward({
      telegramUserId: tgUser.id,
      eventId: randomUUID(),
      ecpm: simulatedEcpm,
      network: dto.network,
      placementId: dto.placementId,
      timestamp: Date.now(),
    });
  }
}
