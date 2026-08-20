import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class AdWebhookDto {
  @IsNumber()
  telegramUserId: number;

  // Opcional: Adsgram no manda un id de evento en su postback de reward (solo
  // `userid`) - sin esto, ads.service genera una idempotencyKey propia
  // acotada por ventana de tiempo. Otras redes que si manden un id unico
  // real deberian seguir mandandolo aca para una idempotencia mas precisa.
  @IsOptional()
  @IsString()
  eventId?: string;

  // Opcional por el mismo motivo: Adsgram no reporta el eCPM efectivo en el
  // postback. El payout siempre prioriza el rate de EcpmRate/DEFAULT_ECPM_USD
  // server-side (ver ads.service.creditAdReward) - esto es solo un fallback
  // informativo para redes que si lo manden.
  @IsOptional()
  @IsNumber()
  ecpm?: number;

  @IsIn(['adsgram', 'monetag'])
  network: 'adsgram' | 'monetag';

  @IsNumber()
  timestamp: number; // epoch ms, para ventana anti-replay

  placementId?: string;
}
