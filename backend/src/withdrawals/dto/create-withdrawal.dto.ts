import { IsIn, IsNumber, IsPositive, IsString } from 'class-validator';

export class CreateWithdrawalDto {
  @IsNumber()
  @IsPositive()
  amountBucks: number;

  @IsIn(['TON', 'USDT'])
  asset: 'TON' | 'USDT';

  @IsString()
  destinationWallet: string;
}
