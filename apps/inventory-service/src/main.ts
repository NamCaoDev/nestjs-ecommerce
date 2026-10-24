/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GrpcOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { buildInventoryGrpcServerOptions } from './infrastructure/grpc/build-inventory-grpc-server-options.factory';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.connectMicroservice<GrpcOptions>(buildInventoryGrpcServerOptions(), {
    inheritAppConfig: true,
  });
  await app.startAllMicroservices();
  const port = process.env.PORT || 3200;
  await app.listen(port);
  // Set when Nx waits for this server to be ready
  if (process.env.NX_READY_SIGNAL_SOCKET) {
    try {
      // Function keeps TypeScript and bundlers from rewriting or bundling the import
      const load = new Function('s', 'return import(s)') as (
        s: string,
      ) => Promise<{ emitReadySignal(server: unknown): boolean }>;
      (await load('@nx/js/ready-signal')).emitReadySignal(app.getHttpServer());
    } catch {
      // @nx/js isn't installed
    }
  }
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
