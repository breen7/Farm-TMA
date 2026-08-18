import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { WithdrawalsModule } from '../withdrawals/withdrawals.module';

@Module({
  imports: [WithdrawalsModule],
  controllers: [AdminController],
})
export class AdminModule {}
