import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';
import Redis from 'ioredis';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ReferralsModule } from './referrals/referrals.module';
import { PoolModule } from './pool/pool.module';
import { AdsModule } from './ads/ads.module';
import { FarmModule } from './farm/farm.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';
import { AdminModule } from './admin/admin.module';
import { TasksModule } from './tasks/tasks.module';
import { DepositsModule } from './deposits/deposits.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => {
        // REDIS_URL (soporta rediss:// para TLS, ej. Upstash) tiene
        // prioridad; si no esta, arma la conexion desde HOST/PORT/PASSWORD
        // (caso tipico de un Redis local sin auth, ej. docker-compose.yml).
        // maxRetriesPerRequest debe ser null: BullMQ lo exige para sus
        // comandos bloqueantes, si no lo pierde en runtime con un error poco
        // claro.
        const redisUrl = config.get<string>('REDIS_URL');
        const connection = redisUrl
          ? new Redis(redisUrl, { maxRetriesPerRequest: null })
          : new Redis({
              host: config.get<string>('REDIS_HOST') ?? 'localhost',
              port: Number(config.get('REDIS_PORT') ?? 6379),
              password: config.get<string>('REDIS_PASSWORD') || undefined,
              maxRetriesPerRequest: null,
            });
        return { connection };
      },
      inject: [ConfigService],
    }),
    PrismaModule,
    AuthModule,
    ReferralsModule,
    PoolModule,
    AdsModule,
    FarmModule,
    WithdrawalsModule,
    AdminModule,
    TasksModule,
    DepositsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
