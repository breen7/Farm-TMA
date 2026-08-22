import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { FarmModule } from '../farm/farm.module';
import { TasksModule } from '../tasks/tasks.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { WithdrawalsModule } from '../withdrawals/withdrawals.module';
import { WorkerModule } from '../worker/worker.module';

@Module({
  imports: [FarmModule, TasksModule, ReferralsModule, WithdrawalsModule, WorkerModule],
  controllers: [MeController],
})
export class MeModule {}
