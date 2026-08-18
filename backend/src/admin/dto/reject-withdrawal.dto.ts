import { IsOptional, IsString } from 'class-validator';

export class RejectWithdrawalDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
