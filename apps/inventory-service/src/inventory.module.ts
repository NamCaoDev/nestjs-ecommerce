import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { RedisModule } from '@org/shared-infrastructure';
import { KafkaModule } from '@org/shared-messaging';
import { CommitStockHandler } from './application/commands/commit-stock/commit-stock.handler';
import { ReleaseExpiredReservationsHandler } from './application/commands/release-expired-reservations/release-expired-reservations.handler';
import { ReleaseStockHandler } from './application/commands/release-stock/release-stock.handler';
import { ReserveStockHandler } from './application/commands/reserve-stock/reserve-stock.handler';
import { INVENTORY_EVENT_PUBLISHER_PORT } from './application/ports/inventory-event-publisher.token';
import { STOCK_LEDGER_REPOSITORY_PORT } from './domain/ports/stock-ledger-repository.token';
import { STOCK_RESERVATION_STORE_PORT } from './domain/ports/stock-reservation-store.token';
import { StockLedgerPrismaRepository } from './infrastructure/persistence/ledger/stock-ledger.prisma.repository';
import { KafkaInventoryEventPublisher } from './infrastructure/messaging/kafka-inventory-event-publisher';
import { PrismaModule } from './infrastructure/persistence/prisma/prisma.module';
import { RedisInventoryRepository } from './infrastructure/redis/redis-inventory.repository';
import { InventoryGrpcController } from './presentation/grpc/inventory-grpc.controller';
import { OrderEventsConsumer } from './presentation/messaging/order-events.consumer';
import { ReservationSweeperService } from './presentation/workers/reservation-sweeper.service';

/**
 * Inventory bounded context: binds the domain ports to Redis and Prisma, registers the
 * command handlers and exposes the gRPC controller, the `orders.events` consumer and the
 * expired-reservation sweeper.
 */
@Module({
  imports: [
    CqrsModule,
    PrismaModule,
    RedisModule,
    KafkaModule.register({ clientId: 'inventory-service' }),
  ],
  controllers: [InventoryGrpcController],
  providers: [
    {
      provide: STOCK_RESERVATION_STORE_PORT,
      useClass: RedisInventoryRepository,
    },
    {
      provide: STOCK_LEDGER_REPOSITORY_PORT,
      useClass: StockLedgerPrismaRepository,
    },
    {
      provide: INVENTORY_EVENT_PUBLISHER_PORT,
      useClass: KafkaInventoryEventPublisher,
    },
    ReserveStockHandler,
    ReleaseStockHandler,
    CommitStockHandler,
    ReleaseExpiredReservationsHandler,
    OrderEventsConsumer,
    ReservationSweeperService,
  ],
})
export class InventoryModule {}
