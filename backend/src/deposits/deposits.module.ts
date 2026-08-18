import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DepositsController } from './deposits.controller';
import { DepositsService } from './deposits.service';
import { DepositsSweepProcessor } from './deposits-sweep.processor';
import { DepositsSweepScheduler } from './deposits-sweep.scheduler';
import { TonModule } from '../ton/ton.module';
import { FarmModule } from '../farm/farm.module';
import { DEPOSITS_SWEEP_QUEUE } from './deposits.constants';

@Module({
  imports: [BullModule.registerQueue({ name: DEPOSITS_SWEEP_QUEUE }), TonModule, FarmModule],
  controllers: [DepositsController],
  providers: [DepositsService, DepositsSweepProcessor, DepositsSweepScheduler],
})
export class DepositsModule {}
