import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FarmService } from '../farm/farm.service';
import { TasksService } from '../tasks/tasks.service';
import { ReferralsService } from '../referrals/referrals.service';
import { WithdrawalsService } from '../withdrawals/withdrawals.service';
import { WorkerService } from '../worker/worker.service';
import { TelegramAuthGuard } from '../common/guards/telegram-auth.guard';
import { CurrentTelegramUser, VerifiedTelegramUser } from '../common/decorators/current-user.decorator';

/**
 * Bootstrap consolidado: unifica en una sola request todo lo que el
 * frontend necesita para pintar las 4 pestañas (Granja, Almacen, Tareas,
 * Retirar) sin un round-trip por vista. Antes de esto cada vista pedia sus
 * propios datos al montarse (hasta 5 GET distintas repartidas entre tabs),
 * lo que se sentia especialmente lento sobre el WebView de Telegram. La
 * vista Granja sigue teniendo su propio polling liviano de `GET /farm` para
 * la produccion en tiempo real — este endpoint es solo para la carga
 * inicial y los resyncs despues de una accion.
 */
@Controller('me')
@UseGuards(TelegramAuthGuard)
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly farmService: FarmService,
    private readonly tasksService: TasksService,
    private readonly referralsService: ReferralsService,
    private readonly withdrawalsService: WithdrawalsService,
    private readonly workerService: WorkerService,
  ) {}

  @Get('state')
  async getState(@CurrentTelegramUser() tgUser: VerifiedTelegramUser) {
    const initialUser = await this.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(tgUser.id) } });

    // El peon puede acreditar coins y adelantar farm.lastCollectedAt (cosecha
    // automatica) — se procesa antes y por separado del resto para que
    // user/farm ya reflejen el resultado cuando se leen abajo. Si corriera
    // dentro del mismo Promise.all que farmService.getState, el orden de
    // ejecucion no estaria garantizado y podriamos devolver un farm/balance
    // desactualizado.
    const worker = await this.workerService.getState(initialUser.id);

    const [user, farm, inventory, tasks, referrals, withdrawals] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: initialUser.id } }),
      this.farmService.getState(initialUser.id),
      this.farmService.getInventory(initialUser.id),
      this.tasksService.getTasksForUser(initialUser.id),
      this.referralsService.getTree(initialUser.id),
      this.withdrawalsService.listForUser(initialUser.id),
    ]);

    return {
      user: {
        id: user.id.toString(),
        telegramId: user.telegramId.toString(),
        coinsBalance: user.coinsBalance,
        bucksBalance: user.bucksBalance,
      },
      farm,
      inventory,
      tasks,
      referrals,
      withdrawals,
      worker,
    };
  }
}
