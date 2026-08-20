import { IsIn } from 'class-validator';

export class UpgradeAnimalDto {
  @IsIn(['eggs', 'milk'])
  resource: string;
}
