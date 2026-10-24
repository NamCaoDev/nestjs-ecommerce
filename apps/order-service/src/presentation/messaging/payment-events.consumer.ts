import { Inject, Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  IntegrationEventEnvelope,
  PAYMENT_EVENT_TYPES,
  PAYMENTS_EVENTS_PARTITIONS,
  PAYMENTS_EVENTS_TOPIC,
} from '@org/contracts';
import {
  KAFKA_CLIENT,
  KafkaConsumerService,
  KafkaTopicManager,
} from '@org/shared-messaging';
import { DomainError, Result } from '@org/shared-domain';
import type { Kafka } from 'kafkajs';
import { CancelOrderCommand } from '../../application/commands/cancel-order/cancel-order.command';
import { ConfirmOrderCommand } from '../../application/commands/confirm-order/confirm-order.command';

/**
 * Consumer group of the order service on `payments.events`. Distinct from the `inventory.events`
 * group: members of one group must subscribe to the same topics.
 */
const CONSUMER_GROUP_ID = 'order-payment-consumer-group';

/** Prefix of the cancellation reason of an unpaid order. */
const PAYMENT_FAILED_REASON_PREFIX = 'PAYMENT_FAILED';

/**
 * Inbound adapter for `payments.events` (saga choreography): `payment.succeeded` confirms the order,
 * `payment.failed` cancels it. Business refusals are logged and skipped; unexpected errors (e.g. a
 * concurrency conflict) propagate so Kafka redelivers the message.
 */
@Injectable()
export class PaymentEventsConsumer extends KafkaConsumerService {
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
        topic: PAYMENTS_EVENTS_TOPIC,
        numPartitions: PAYMENTS_EVENTS_PARTITIONS,
        groupId: CONSUMER_GROUP_ID,
      },
    });
  }

  /**
   * @param envelope - Decoded `payments.events` message.
   */
  protected async handleEnvelope(
    envelope: IntegrationEventEnvelope<Record<string, unknown>>,
  ): Promise<void> {
    const command: ConfirmOrderCommand | CancelOrderCommand | undefined =
      PaymentEventsConsumer.toCommand(envelope);
    if (command === undefined) {
      return;
    }
    const result: Result<void, DomainError> =
      await this.commandBus.execute(command);
    if (result.isFailure) {
      this.logger.warn(
        `Skipping event ${envelope.eventId}: ${result.getError().message}`,
      );
    }
  }

  /**
   * @returns The order command for a payment outcome, or `undefined` for other events.
   */
  private static toCommand({
    eventType,
    payload,
  }: IntegrationEventEnvelope<Record<string, unknown>>):
    ConfirmOrderCommand | CancelOrderCommand | undefined {
    const orderId: string = String(payload['orderId']);
    if (eventType === PAYMENT_EVENT_TYPES.SUCCEEDED) {
      return new ConfirmOrderCommand({ orderId });
    }
    if (eventType === PAYMENT_EVENT_TYPES.FAILED) {
      return new CancelOrderCommand({
        orderId,
        reason: `${PAYMENT_FAILED_REASON_PREFIX}: ${String(payload['reason'])}`,
      });
    }
    return undefined;
  }
}
