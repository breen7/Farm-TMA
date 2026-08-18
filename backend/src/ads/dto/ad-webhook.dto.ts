import { IsIn, IsNumber, IsString } from 'class-validator';

export class AdWebhookDto {
  @IsNumber()
  telegramUserId: number;

  @IsString()
  eventId: string; // idempotency key provisto por la red de anuncios

  @IsNumber()
  ecpm: number; // eCPM efectivo reportado para esta impresion (USD)

  @IsIn(['adsgram', 'monetag'])
  network: 'adsgram' | 'monetag';

  @IsNumber()
  timestamp: number; // epoch ms, para ventana anti-replay

  placementId?: string;
}
