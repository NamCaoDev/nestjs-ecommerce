import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CoreModule } from './core/core.module';
import { OrderModule } from './order.module';
import { SmokeTestController } from './presentation/http/smoke-test.controller';

/**
 * Root module of the order service.
 */
@Module({
  imports: [CqrsModule.forRoot(), CoreModule, OrderModule],
  controllers: [SmokeTestController],
  providers: [],
})
export class AppModule {}
