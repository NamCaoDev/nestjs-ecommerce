import { Inject, Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  IntegrationEventEnvelope,
  ORDER_EVENT_TYPES,
  ORDERS_EVENTS_PARTITIONS,
  ORDERS_EVENTS_TOPIC,
} from '@org/contracts';
import {
  KAFKA_CLIENT,
  KafkaConsumerService,
  KafkaTopicManager,
} from '@org/shared-messaging';
import { DomainError, Result } from '@org/shared-domain';
import type { Kafka } from 'kafkajs';
import { InitiatePaymentCommand } from '../../application/commands/initiate-payment/initiate-payment.command';
import { InitiatePaymentOutput } from '../../application/commands/initiate-payment/initiate-payment.output';
import { PaymentLine } from '../../domain/value-objects/payment-line.type';

/** Consumer group shared by every payment-service instance. */
const CONSUMER_GROUP_ID = 'payment-consumer-group';

/**
 * Inbound adapter for `orders.events`: on `order.placed`, dispatches {@link InitiatePaymentCommand}
 * keyed by the event id, so a redelivery opens no second payment. Malformed orders are logged and
 * skipped; unexpected errors propagate so Kafka redelivers the message.
 */
@Injectable()
export class OrderEventsConsumer extends KafkaConsumerService {
  /**
   * @param kafka - Shared Kafka client.
   * @param topicManager - Topic provisioning.
   * @param commandBus - CQRS command bus.
   */
  public constructor(
    @Inject(KAFKA_CLIENT) kafka: Kafka,
    topicManager: KafkaTopicManager,
    private readonly commandBus: CommandBus,
  ) {
    super({
      kafka,
      topicManager,
      subscription: {
        topic: ORDERS_EVENTS_TOPIC,
        numPartitions: ORDERS_EVENTS_PARTITIONS,
        groupId: CONSUMER_GROUP_ID,
      },
    });
  }

  /**
   * @param envelope - Decoded `orders.events` message.
   */
  protected async handleEnvelope(
    envelope: IntegrationEventEnvelope<Record<string, unknown>>,
  ): Promise<void> {
    if (envelope.eventType !== ORDER_EVENT_TYPES.PLACED) {
      return;
    }
    const { payload }: IntegrationEventEnvelope<Record<string, unknown>> =
      envelope;
    const result: Result<InitiatePaymentOutput, DomainError> =
      await this.commandBus.execute(
        new InitiatePaymentCommand({
          orderId: String(payload['orderId']),
          customerId: String(payload['customerId']),
          amount: Number(payload['finalAmount']),
          currency: String(payload['currency']),
          items: OrderEventsConsumer.toPaymentLines(payload['items']),
          idempotencyKey: envelope.eventId,
        }),
      );
    if (result.isFailure) {
      this.logger.warn(
        `Skipping event ${envelope.eventId}: ${result.getError().message}`,
      );
    }
  }

  /**
   * Extracts `{ skuId, quantity }` lines from the `order.placed` payload; anything malformed is
   * passed through as is and rejected by the domain validation.
   */
  private static toPaymentLines(items: unknown): PaymentLine[] {
    if (!Array.isArray(items)) {
      return [];
    }
    return items.map(
      (item: {
        readonly skuId?: unknown;
        readonly quantity?: unknown;
      }): PaymentLine => ({
        skuId: String(item?.skuId),
        quantity: Number(item?.quantity),
      }),
    );
  }
}
