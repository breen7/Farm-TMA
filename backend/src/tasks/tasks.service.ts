import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { findTaskDefinition, TASK_DEFINITIONS } from './tasks.constants';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getTasksForUser(userId: bigint) {
    const progressRows = await this.prisma.userTaskProgress.findMany({ where: { userId } });
    const byCode = new Map(progressRows.map((row) => [row.taskCode, row]));

    return TASK_DEFINITIONS.map((definition) => {
      const progress = byCode.get(definition.code);
      return {
        code: definition.code,
        title: definition.title,
        description: definition.description,
        rewardBucks: definition.rewardBucks,
        targetCount: definition.targetCount,
        progress: progress?.progress ?? 0,
        completed: Boolean(progress?.completedAt),
        claimed: Boolean(progress?.claimedAt),
      };
    });
  }

  /**
   * Suma progreso a una tarea dentro de la transaccion del caller (ads,
   * auth, farm), para que quede atomicamente ligado al evento que lo genera.
   * Un `taskCode` desconocido es un no-op silencioso: evita que un typo en
   * un caller tire la transaccion de negocio que lo envuelve.
   */
  async incrementProgress(tx: Prisma.TransactionClient, userId: bigint, taskCode: string, amount = 1): Promise<void> {
    const definition = findTaskDefinition(taskCode);
    if (!definition) {
      this.logger.warn(`Unknown task code: ${taskCode}`);
      return;
    }

    const existing = await tx.userTaskProgress.findUnique({ where: { userId_taskCode: { userId, taskCode } } });
    if (existing?.completedAt) {
      return;
    }

    const newProgress = Math.min((existing?.progress ?? 0) + amount, definition.targetCount);
    const completedAt = newProgress >= definition.targetCount ? new Date() : null;

    await tx.userTaskProgress.upsert({
      where: { userId_taskCode: { userId, taskCode } },
      create: { userId, taskCode, progress: newProgress, completedAt },
      update: { progress: newProgress, completedAt },
    });
  }

  /** Acredita la recompensa de una tarea completada y no reclamada todavia. */
  async claimReward(userId: bigint, taskCode: string) {
    const definition = findTaskDefinition(taskCode);
    if (!definition) {
      throw new NotFoundException(`Unknown task: ${taskCode}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const progress = await tx.userTaskProgress.findUnique({ where: { userId_taskCode: { userId, taskCode } } });
      if (!progress?.completedAt) {
        throw new BadRequestException('Task is not completed yet');
      }
      if (progress.claimedAt) {
        throw new BadRequestException('Task reward already claimed');
      }

      const user = await tx.user.update({
        where: { id: userId },
        data: { bucksBalance: { increment: definition.rewardBucks } },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: 'TASK_REWARD',
          currency: 'BUCKS',
          amount: definition.rewardBucks,
          balanceAfter: user.bucksBalance,
          metadata: { taskCode } as Prisma.InputJsonValue,
        },
      });

      await tx.userTaskProgress.update({ where: { id: progress.id }, data: { claimedAt: new Date() } });

      return { taskCode, rewardBucks: definition.rewardBucks, bucksBalance: user.bucksBalance };
    });
  }
}
