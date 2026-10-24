import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { InventoryModule } from './inventory.module';
import { SmokeTestController } from './presentation/http/smoke-test.controller';

/**
 * Root module of the inventory service.
 */
@Module({
  imports: [CqrsModule.forRoot(), InventoryModule],
  controllers: [SmokeTestController],
  providers: [],
})
export class AppModule {}
