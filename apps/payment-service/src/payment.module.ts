import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { KafkaModule } from '@org/shared-messaging';
import { PaymentAuditService } from './application/audit/payment-audit.service';
import { PaymentDomainEventAuditor } from './application/audit/payment-domain-event-auditor';
import { PaymentInitiatedAuditHandler } from './application/audit/payment-initiated.audit-handler';
import { PaymentStatusChangedAuditHandler } from './application/audit/payment-status-changed.audit-handler';
import { PaymentTransactionFinalizedAuditHandler } from './application/audit/payment-transaction-finalized.audit-handler';
import { InitiatePaymentHandler } from './application/commands/initiate-payment/initiate-payment.handler';
import { ProcessWebhookHandler } from './application/commands/process-webhook/process-webhook.handler';
import { RefundPaymentHandler } from './application/commands/refund-payment/refund-payment.handler';
import { RelayOutboxHandler } from './application/commands/relay-outbox/relay-outbox.handler';
import { SimulateGatewayPaymentHandler } from './application/commands/simulate-gateway-payment/simulate-gateway-payment.handler';
import { AUDIT_LOG_PORT } from './application/ports/audit-log.token';
import { EVENT_PUBLISHER_PORT } from './application/ports/event-publisher.token';
import { MOCK_GATEWAY_SIMULATOR_PORT } from './application/ports/mock-gateway-simulator.token';
import { OUTBOX_EVENT_REPOSITORY_PORT } from './application/ports/outbox-event-repository.token';
import { PAYMENT_GATEWAY_REGISTRY_PORT } from './application/ports/payment-gateway-registry.token';
import { PAYMENT_READ_PORT } from './application/ports/payment-read.token';
import { GetPaymentActivitiesHandler } from './application/queries/get-payment-activities/get-payment-activities.handler';
import { GetPaymentByOrderIdHandler } from './application/queries/get-payment-by-order-id/get-payment-by-order-id.handler';
import { PAYMENT_REPOSITORY_PORT } from './domain/ports/payment-repository.token';
import { MockGatewayAdapter } from './infrastructure/gateways/mock/mock-gateway.adapter';
import { PaymentGatewayRegistry } from './infrastructure/gateways/payment-gateway.registry';
import { VietqrVaGatewayAdapter } from './infrastructure/gateways/vietqr-va/vietqr-va-gateway.adapter';
import { VnpayGatewayAdapter } from './infrastructure/gateways/vnpay/vnpay-gateway.adapter';
import { KafkaEventPublisher } from './infrastructure/messaging/kafka-event-publisher';
import { AuditLogPrismaRepository } from './infrastructure/persistence/audit/audit-log.prisma.repository';
import { OutboxEventPrismaRepository } from './infrastructure/persistence/outbox/outbox-event.prisma.repository';
import { PaymentPrismaRepository } from './infrastructure/persistence/payment/payment-prisma.repository';
import { PaymentReadPrismaRepository } from './infrastructure/persistence/payment/payment-read.prisma.repository';
import { PrismaModule } from './infrastructure/persistence/prisma/prisma.module';
import { MockGatewayController } from './presentation/http/mock-gateway.controller';
import { PaymentController } from './presentation/http/payment.controller';
import { OrderEventsConsumer } from './presentation/messaging/order-events.consumer';
import { OutboxRelayService } from './presentation/workers/outbox-relay.service';

/**
 * Payment bounded context: binds the ports to Prisma, the gateway adapters (registry), the audit log
 * and Kafka; consumes `orders.events`, exposes webhooks, queries and refunds, and relays the outbox to
 * `payments.events`.
 */
@Module({
  imports: [
    CqrsModule,
    PrismaModule,
    KafkaModule.register({ clientId: 'payment-service' }),
  ],
  controllers: [PaymentController, MockGatewayController],
  providers: [
    { provide: PAYMENT_REPOSITORY_PORT, useClass: PaymentPrismaRepository },
    { provide: PAYMENT_READ_PORT, useClass: PaymentReadPrismaRepository },
    { provide: AUDIT_LOG_PORT, useClass: AuditLogPrismaRepository },
    {
      provide: OUTBOX_EVENT_REPOSITORY_PORT,
      useClass: OutboxEventPrismaRepository,
    },
    { provide: EVENT_PUBLISHER_PORT, useClass: KafkaEventPublisher },
    MockGatewayAdapter,
    VnpayGatewayAdapter,
    VietqrVaGatewayAdapter,
    {
      provide: PAYMENT_GATEWAY_REGISTRY_PORT,
      useClass: PaymentGatewayRegistry,
    },
    { provide: MOCK_GATEWAY_SIMULATOR_PORT, useExisting: MockGatewayAdapter },
    PaymentInitiatedAuditHandler,
    PaymentTransactionFinalizedAuditHandler,
    PaymentStatusChangedAuditHandler,
    PaymentDomainEventAuditor,
    PaymentAuditService,
    InitiatePaymentHandler,
    ProcessWebhookHandler,
    SimulateGatewayPaymentHandler,
    RefundPaymentHandler,
    GetPaymentByOrderIdHandler,
    GetPaymentActivitiesHandler,
    RelayOutboxHandler,
    OrderEventsConsumer,
    OutboxRelayService,
  ],
})
export class PaymentModule {}
