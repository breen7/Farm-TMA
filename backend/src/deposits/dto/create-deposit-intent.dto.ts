import { IsIn } from 'class-validator';
import { SUPPORTED_DEPOSIT_NETWORKS, SUPPORTED_DEPOSIT_PURPOSES, SupportedDepositNetwork, SupportedDepositPurpose } from '../deposits.constants';

export class CreateDepositIntentDto {
  @IsIn(SUPPORTED_DEPOSIT_NETWORKS)
  network: SupportedDepositNetwork;

  @IsIn(SUPPORTED_DEPOSIT_PURPOSES)
  purpose: SupportedDepositPurpose;
}
