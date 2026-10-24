import { Inject, Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  IntegrationEventEnvelope,
  PAYMENT_EVENT_TYPES,
  PAYMENTS_EVENTS_PARTITIONS,
  PAYMENTS_EVENTS_TOPIC,
} from '@org/contracts';
import {
  IntegrationEventContext,
  KAFKA_CLIENT,
  KafkaConsumerService,
  KafkaProducerService,
  KafkaTopicManager,
} from '@org/shared-messaging';
import { DomainError, Result } from '@org/shared-domain';
import type { Kafka } from 'kafkajs';
import { ProcessPaymentFailedCommand } from '../../application/commands/process-payment-failed/process-payment-failed.command';
import { ProcessPaymentSucceededCommand } from '../../application/commands/process-payment-succeeded/process-payment-succeeded.command';
import { PaymentOutcome } from '../../application/services/payment-outcome.type';

/**
 * Consumer group of the order service on `payments.events`. Distinct from the `inventory.events`
 * group: members of one group must subscribe to the same topics.
 */
const CONSUMER_GROUP_ID = 'order-payment-consumer-group';

/**
 * Inbound adapter for `payments.events` (saga choreography): `payment.succeeded` →
 * {@link ProcessPaymentSucceededCommand}, `payment.failed` → {@link ProcessPaymentFailedCommand}, both
 * applied exactly once through the transactional inbox (key: event id). The offset is committed only once
 * the database transaction succeeded; business refusals are logged and committed; infrastructure errors
 * are retried, then parked in `payments.events.dlq` (see KafkaConsumerService).
 */
@Injectable()
export class PaymentEventsConsumer extends KafkaConsumerService {
  /**
   * @param kafka - Shared Kafka client.
   * @param topicManager - Topic provisioning.
   * @param producer - Publishes unprocessable messages to the dead-letter topic.
   * @param commandBus - CQRS command bus.
   */
  public constructor(
    @Inject(KAFKA_CLIENT) kafka: Kafka,
    topicManager: KafkaTopicManager,
    producer: KafkaProducerService,
    private readonly commandBus: CommandBus,
  ) {
    super({
      kafka,
      topicManager,
      producer,
      subscription: {
        topic: PAYMENTS_EVENTS_TOPIC,
        numPartitions: PAYMENTS_EVENTS_PARTITIONS,
        groupId: CONSUMER_GROUP_ID,
      },
    });
  }

  /**
   * @param envelope - Decoded `payments.events` message.
   * @param context - Event id (inbox key) and saga correlation id.
   */
  protected async handleEnvelope(
    envelope: IntegrationEventEnvelope<Record<string, unknown>>,
    context: IntegrationEventContext,
  ): Promise<void> {
    const command:
      ProcessPaymentSucceededCommand | ProcessPaymentFailedCommand | undefined =
      PaymentEventsConsumer.toCommand({ envelope, context });
    if (command === undefined) {
      return;
    }
    const result: Result<PaymentOutcome, DomainError> =
      await this.commandBus.execute(command);
    if (result.isFailure) {
      this.logger.warn(
        `Skipping event ${context.eventId} (correlation ${context.correlationId}): ${result.getError().message}`,
      );
    }
  }

  /**
   * @returns The order command for a payment outcome, or `undefined` for other events.
   */
  private static toCommand({
    envelope,
    context,
  }: {
    readonly envelope: IntegrationEventEnvelope<Record<string, unknown>>;
    readonly context: IntegrationEventContext;
  }): ProcessPaymentSucceededCommand | ProcessPaymentFailedCommand | undefined {
    const props: {
      eventId: string;
      correlationId: string;
      orderId: string;
      payload: Record<string, unknown>;
    } = {
      eventId: context.eventId,
      correlationId: context.correlationId,
      orderId: String(envelope.payload['orderId']),
      payload: envelope.payload,
    };
    if (envelope.eventType === PAYMENT_EVENT_TYPES.SUCCEEDED) {
      return new ProcessPaymentSucceededCommand(props);
    }
    if (envelope.eventType === PAYMENT_EVENT_TYPES.FAILED) {
      return new ProcessPaymentFailedCommand({
        ...props,
        reason: String(envelope.payload['reason']),
      });
    }
    return undefined;
  }
}
