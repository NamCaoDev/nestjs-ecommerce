import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  emitNxReadySignal,
  readBooleanEnv,
  readEnv,
  setupSwagger,
} from '@org/shared-infrastructure';
import { AppModule } from './app.module';

/** HTTP port used when `PORT` is not set. */
const DEFAULT_PORT = '3300';

/** Prefix of every HTTP route. */
const GLOBAL_PREFIX = 'api';

/**
 * Starts the payment service. The raw request body is kept (`rawBody`) because webhook signatures are
 * computed over the exact bytes the gateway sent. With `HTTP_ENABLED=false` it runs as a worker only:
 * the `orders.events` consumer and the outbox relay run according to their own flags.
 */
async function bootstrap(): Promise<void> {
  const app: INestApplication = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  app.enableShutdownHooks();
  if (!readBooleanEnv({ name: 'HTTP_ENABLED', defaultValue: true })) {
    await app.init();
    Logger.log(
      'HTTP disabled by HTTP_ENABLED: running background workers only',
    );
    return;
  }
  app.setGlobalPrefix(GLOBAL_PREFIX);
  setupSwagger({
    app,
    title: 'Payment Service API',
    description:
      'Payments of placed orders through a hosted checkout. The gateway reports results to the signed webhook (HMAC-SHA256); the mock gateway endpoint simulates it in development.',
    version: '1.0',
    globalPrefix: GLOBAL_PREFIX,
  });
  const port: string = readEnv({ name: 'PORT', defaultValue: DEFAULT_PORT });
  await app.listen(port);
  await emitNxReadySignal(app.getHttpServer());
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${GLOBAL_PREFIX}`,
  );
}

void bootstrap();
