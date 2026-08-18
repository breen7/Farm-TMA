import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WithdrawalsController } from './withdrawals.controller';
import { WithdrawalsService } from './withdrawals.service';
import { WithdrawalsProcessor } from './withdrawals.processor';
import { ReconciliationProcessor } from './reconciliation.processor';
import { ReconciliationScheduler } from './reconciliation.scheduler';
import { TonModule } from '../ton/ton.module';
import { PoolModule } from '../pool/pool.module';
import { WITHDRAWALS_QUEUE, RECONCILIATION_QUEUE } from './withdrawals.constants';

@Module({
  imports: [BullModule.registerQueue({ name: WITHDRAWALS_QUEUE }, { name: RECONCILIATION_QUEUE }), PoolModule, TonModule],
  controllers: [WithdrawalsController],
  providers: [WithdrawalsService, WithdrawalsProcessor, ReconciliationProcessor, ReconciliationScheduler],
  exports: [WithdrawalsService],
})
export class WithdrawalsModule {}
