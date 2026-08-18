import { IsNumber, IsPositive, IsString } from 'class-validator';

export class SellResourceDto {
  @IsString()
  resource: string;

  @IsNumber()
  @IsPositive()
  quantity: number;
}
