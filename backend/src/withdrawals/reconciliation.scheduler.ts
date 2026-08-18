import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RECONCILIATION_QUEUE } from './withdrawals.constants';

/**
 * Registra el job repetible de reconciliacion al arrancar la app. BullMQ
 * deduplica jobs repetibles por su combinacion de cola + patron de repeticion
 * + jobId, asi que registrar esto en cada boot es idempotente (no crea
 * sweeps duplicados en cada deploy/restart).
 */
@Injectable()
export class ReconciliationScheduler implements OnModuleInit {
  private readonly logger = new Logger(ReconciliationScheduler.name);

  constructor(
    @InjectQueue(RECONCILIATION_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const everyMinutes = Number(this.config.get('RECONCILE_SWEEP_INTERVAL_MINUTES') ?? 5);

    await this.queue.add(
      'sweep',
      {},
      {
        repeat: { every: everyMinutes * 60_000 },
        jobId: 'reconcile-stuck-processing',
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );

    this.logger.log(`Reconciliation sweep scheduled every ${everyMinutes} minute(s)`);
  }
}
