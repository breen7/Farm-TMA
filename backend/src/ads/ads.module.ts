import { Module } from '@nestjs/common';
import { AdsController } from './ads.controller';
import { AdsService } from './ads.service';
import { ReferralsModule } from '../referrals/referrals.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [ReferralsModule, TasksModule],
  controllers: [AdsController],
  providers: [AdsService],
})
export class AdsModule {}
