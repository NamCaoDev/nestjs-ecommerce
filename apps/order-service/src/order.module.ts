import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { KafkaModule } from '@org/shared-messaging';
import { CancelOrderHandler } from './application/commands/cancel-order/cancel-order.handler';
import { CreateOrderHandler } from './application/commands/create-order/create-order.handler';
import { RelayOutboxHandler } from './application/commands/relay-outbox/relay-outbox.handler';
import { EVENT_PUBLISHER_PORT } from './application/ports/event-publisher.token';
import { OUTBOX_EVENT_REPOSITORY_PORT } from './application/ports/outbox-event-repository.token';
import { ORDER_REPOSITORY_PORT } from './domain/ports/order-repository.token';
import { InventoryGrpcModule } from './infrastructure/grpc/inventory/inventory-grpc.module';
import { IdempotencyModule } from './infrastructure/idempotency/idempotency.module';
import { KafkaEventPublisher } from './infrastructure/messaging/kafka-event-publisher';
import { OrderPrismaRepository } from './infrastructure/persistence/order/order-prisma.repository';
import { OutboxEventPrismaRepository } from './infrastructure/persistence/outbox/outbox-event.prisma.repository';
import { PrismaModule } from './infrastructure/persistence/prisma/prisma.module';
import { OrderController } from './presentation/http/order.controller';
import { InventoryEventsConsumer } from './presentation/messaging/inventory-events.consumer';
import { OutboxRelayService } from './presentation/workers/outbox-relay.service';

/**
 * Order bounded context: binds the domain and application ports to their adapters,
 * registers the command handlers, exposes the REST controller, runs the outbox relay and consumes
 * `inventory.events`.
 * `ORDER_REPOSITORY_PORT` is provided here; `IDEMPOTENCY_PORT` and `INVENTORY_RPC_PORT`
 * come from their infrastructure modules.
 */
@Module({
  imports: [
    CqrsModule,
    PrismaModule,
    IdempotencyModule,
    InventoryGrpcModule,
    KafkaModule.register({ clientId: 'order-service' }),
  ],
  controllers: [OrderController],
  providers: [
    { provide: ORDER_REPOSITORY_PORT, useClass: OrderPrismaRepository },
    {
      provide: OUTBOX_EVENT_REPOSITORY_PORT,
      useClass: OutboxEventPrismaRepository,
    },
    { provide: EVENT_PUBLISHER_PORT, useClass: KafkaEventPublisher },
    CreateOrderHandler,
    CancelOrderHandler,
    InventoryEventsConsumer,
    RelayOutboxHandler,
    OutboxRelayService,
  ],
})
export class OrderModule {}
