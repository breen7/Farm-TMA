import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WithdrawalsService } from './withdrawals.service';
import { WITHDRAWALS_QUEUE } from './withdrawals.constants';

@Processor(WITHDRAWALS_QUEUE)
export class WithdrawalsProcessor extends WorkerHost {
  private readonly logger = new Logger(WithdrawalsProcessor.name);

  constructor(private readonly withdrawalsService: WithdrawalsService) {
    super();
  }

  async process(job: Job<{ withdrawalId: string }>): Promise<void> {
    this.logger.log(`Processing withdrawal ${job.data.withdrawalId} (attempt ${job.attemptsMade + 1})`);
    await this.withdrawalsService.processWithdrawal(BigInt(job.data.withdrawalId));
  }
}
