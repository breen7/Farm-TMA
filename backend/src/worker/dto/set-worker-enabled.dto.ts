import { IsBoolean } from 'class-validator';

export class SetWorkerEnabledDto {
  @IsBoolean()
  enabled: boolean;
}
