import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CoreModule } from './core/core.module';
import { PaymentModule } from './payment.module';
import { SmokeTestController } from './presentation/http/smoke-test.controller';

/**
 * Root module of the payment service.
 */
@Module({
  imports: [CqrsModule.forRoot(), CoreModule, PaymentModule],
  controllers: [SmokeTestController],
  providers: [],
})
export class AppModule {}
