import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GrpcOptions } from '@nestjs/microservices';
import {
  emitNxReadySignal,
  readBooleanEnv,
  readEnv,
  setupSwagger,
} from '@org/shared-infrastructure';
import { AppModule } from './app.module';
import { buildInventoryGrpcServerOptions } from './infrastructure/grpc/build-inventory-grpc-server-options.factory';

/** HTTP port used when `PORT` is not set. */
const DEFAULT_PORT = '3200';

/** Prefix of every HTTP route. */
const GLOBAL_PREFIX = 'api';

/**
 * Starts the inventory service: gRPC (ReserveStock/ReleaseStock) and HTTP. With `HTTP_ENABLED=false`
 * neither server is opened and it runs as a worker only: the Kafka consumer and the reservation
 * sweeper run according to their own flags.
 */
async function bootstrap(): Promise<void> {
  const app: INestApplication = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  if (!readBooleanEnv({ name: 'HTTP_ENABLED', defaultValue: true })) {
    await app.init();
    Logger.log(
      'HTTP and gRPC disabled by HTTP_ENABLED: running background workers only',
    );
    return;
  }
  app.setGlobalPrefix(GLOBAL_PREFIX);
  setupSwagger({
    app,
    title: 'Inventory Service API',
    description:
      'Read side of the inventory: stock levels (Redis hot path) and the stock ledger. Reservations are gRPC-only.',
    version: '1.0',
    globalPrefix: GLOBAL_PREFIX,
  });
  app.connectMicroservice<GrpcOptions>(buildInventoryGrpcServerOptions(), {
    inheritAppConfig: true,
  });
  await app.startAllMicroservices();
  const port: string = readEnv({ name: 'PORT', defaultValue: DEFAULT_PORT });
  await app.listen(port);
  await emitNxReadySignal(app.getHttpServer());
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${GLOBAL_PREFIX}`,
  );
}

void bootstrap();
