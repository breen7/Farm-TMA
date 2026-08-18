import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { WithdrawalsService } from './withdrawals.service';
import { RECONCILIATION_QUEUE } from './withdrawals.constants';

@Processor(RECONCILIATION_QUEUE)
export class ReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReconciliationProcessor.name);

  constructor(private readonly withdrawalsService: WithdrawalsService) {
    super();
  }

  async process(): Promise<void> {
    this.logger.debug('Running stuck-PROCESSING withdrawals sweep');
    await this.withdrawalsService.reconcileStuckProcessing();
  }
}
