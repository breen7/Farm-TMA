import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

// Los ids de Prisma son BigInt (columnas bigserial) y JSON.stringify no sabe
// serializarlos de forma nativa; sin esto cualquier response que incluya un
// BigInt (ids, userId en filas crudas) lanza "Do not know how to serialize
// a BigInt" y cae en un 500.
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

bootstrap();
