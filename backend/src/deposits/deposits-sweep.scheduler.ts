import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DEPOSITS_SWEEP_QUEUE } from './deposits.constants';

/** Mismo patron que ReconciliationScheduler: jobId fijo => idempotente entre restarts. */
@Injectable()
export class DepositsSweepScheduler implements OnModuleInit {
  private readonly logger = new Logger(DepositsSweepScheduler.name);

  constructor(
    @InjectQueue(DEPOSITS_SWEEP_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const everyMinutes = Number(this.config.get('DEPOSIT_SWEEP_INTERVAL_MINUTES') ?? 2);

    await this.queue.add(
      'sweep',
      {},
      {
        repeat: { every: everyMinutes * 60_000 },
        jobId: 'sweep-pending-deposits',
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );

    this.logger.log(`Deposits sweep scheduled every ${everyMinutes} minute(s)`);
  }
}
