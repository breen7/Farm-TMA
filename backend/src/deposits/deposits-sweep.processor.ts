import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { DepositsService } from './deposits.service';
import { DEPOSITS_SWEEP_QUEUE } from './deposits.constants';

@Processor(DEPOSITS_SWEEP_QUEUE)
export class DepositsSweepProcessor extends WorkerHost {
  private readonly logger = new Logger(DepositsSweepProcessor.name);

  constructor(private readonly depositsService: DepositsService) {
    super();
  }

  async process(): Promise<void> {
    this.logger.debug('Running pending deposits sweep');
    await this.depositsService.sweepPending();
  }
}
