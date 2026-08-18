import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { DepositRequest } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TonService } from '../ton/ton.service';
import { FarmService } from '../farm/farm.service';
import { CreateDepositIntentDto } from './dto/create-deposit-intent.dto';

const NANO_PER_TON = 1_000_000_000;

@Injectable()
export class DepositsService {
  private readonly logger = new Logger(DepositsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tonService: TonService,
    private readonly farmService: FarmService,
  ) {}

  /**
   * Crea una intencion de deposito PENDING con una referencia unica: el
   * frontend le pide a la wallet (via TonConnect) que mande exactamente este
   * monto a esta wallet con esta referencia como comentario, y el backend
   * despues verifica esa transaccion en cadena antes de otorgar nada — nunca
   * se confia en que el frontend "diga" que el pago se hizo.
   */
  async createIntent(userId: bigint, dto: CreateDepositIntentDto) {
    if (dto.purpose === 'FARM_BOOST' && dto.network !== 'TON') {
      throw new BadRequestException(`FARM_BOOST solo soporta network TON por ahora`);
    }

    const amountTon = Number(this.config.get('BOOST_COST_TON') ?? 0.02);
    const tonUsdRate = Number(this.config.getOrThrow('TON_USD_RATE'));
    const amountUsd = amountTon * tonUsdRate;
    const expiryMinutes = Number(this.config.get('DEPOSIT_EXPIRY_MINUTES') ?? 30);
    const treasuryWallet = await this.tonService.getTreasuryAddress();
    const depositReference = `dep_${randomBytes(6).toString('hex')}`;

    return this.prisma.depositRequest.create({
      data: {
        userId,
        network: dto.network,
        asset: 'TON',
        amount: amountTon,
        amountUsd,
        purpose: dto.purpose,
        depositReference,
        treasuryWallet,
        expiresAt: new Date(Date.now() + expiryMinutes * 60_000),
      },
    });
  }

  async listForUser(userId: bigint) {
    return this.prisma.depositRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async getForUser(userId: bigint, depositId: bigint): Promise<DepositRequest> {
    const deposit = await this.prisma.depositRequest.findUnique({ where: { id: depositId } });
    if (!deposit || deposit.userId !== userId) {
      throw new NotFoundException('Deposit not found');
    }
    return this.checkDeposit(deposit);
  }

  /**
   * Chequeo bajo demanda de un deposito: lo llama tanto el polling del
   * frontend (`GET /deposits/:id`, para feedback rapido) como el sweep
   * periodico (backstop si el usuario cierra la app antes de que confirme).
   */
  async checkDeposit(deposit: DepositRequest): Promise<DepositRequest> {
    if (deposit.status !== 'PENDING') {
      return deposit;
    }

    if (deposit.expiresAt.getTime() < Date.now()) {
      const claimed = await this.prisma.depositRequest.updateMany({
        where: { id: deposit.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      return claimed.count > 0 ? { ...deposit, status: 'EXPIRED' } : deposit;
    }

    if (deposit.network !== 'TON') {
      return deposit; // otras redes: verificacion todavia no implementada
    }

    const expectedAmountNano = BigInt(Math.round(Number(deposit.amount) * NANO_PER_TON));
    const sinceUnixSeconds = Math.floor(deposit.createdAt.getTime() / 1000) - 60;

    let txHash: string | null;
    try {
      txHash = await this.tonService.findIncomingDeposit(deposit.depositReference, expectedAmountNano, sinceUnixSeconds);
    } catch (error) {
      this.logger.error(`No se pudo verificar el deposito ${deposit.id}: ${(error as Error).message}`);
      return deposit;
    }

    if (!txHash) {
      return deposit;
    }

    const claimed = await this.prisma.depositRequest.updateMany({
      where: { id: deposit.id, status: 'PENDING' },
      data: { status: 'CONFIRMED', txHash, confirmedAt: new Date() },
    });
    const updated = await this.prisma.depositRequest.findUniqueOrThrow({ where: { id: deposit.id } });

    if (claimed.count > 0) {
      await this.applyEffect(updated);
    }

    return updated;
  }

  /** Barre todos los depositos PENDING — job periodico de BullMQ (backstop, no el camino principal). */
  async sweepPending(): Promise<void> {
    const pending = await this.prisma.depositRequest.findMany({ where: { status: 'PENDING' } });
    for (const deposit of pending) {
      try {
        await this.checkDeposit(deposit);
      } catch (error) {
        this.logger.error(`Error en sweep del deposito ${deposit.id}: ${(error as Error).message}`);
      }
    }
  }

  private async applyEffect(deposit: DepositRequest): Promise<void> {
    if (deposit.purpose !== 'FARM_BOOST') return;

    try {
      await this.farmService.grantBoost(deposit.userId);
    } catch (error) {
      // El deposito ya quedo CONFIRMED (el dinero llego) pero el efecto no
      // se pudo otorgar — no deberia pasar nunca en la practica (grantBoost
      // solo falla si el usuario no tiene Farm, y esta se crea en el
      // registro). No se baja a FAILED porque eso sugeriria que el pago no
      // se recibio, cuando si se recibio: queda para resolucion manual.
      this.logger.error(
        `Deposito ${deposit.id} confirmado pero fallo al otorgar el efecto (${deposit.purpose}): ${(error as Error).message}`,
      );
    }
  }
}
