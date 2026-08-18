import { IsIn, IsOptional, IsString } from 'class-validator';

export class SimulateAdDto {
  @IsIn(['adsgram', 'monetag'])
  network: 'adsgram' | 'monetag';

  @IsOptional()
  @IsString()
  placementId?: string;
}
