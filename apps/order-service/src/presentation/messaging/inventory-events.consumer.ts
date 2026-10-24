import { Inject, Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  INVENTORY_EVENT_TYPES,
  INVENTORY_EVENTS_PARTITIONS,
  INVENTORY_EVENTS_TOPIC,
  IntegrationEventEnvelope,
} from '@org/contracts';
import {
  KAFKA_CLIENT,
  IntegrationEventContext,
  KafkaConsumerService,
  KafkaProducerService,
  KafkaTopicManager,
} from '@org/shared-messaging';
import { DomainError, Result } from '@org/shared-domain';
import type { Kafka } from 'kafkajs';
import { CancelOrderCommand } from '../../application/commands/cancel-order/cancel-order.command';

/** Consumer group shared by every order-service instance. */
const CONSUMER_GROUP_ID = 'order-consumer-group';

/**
 * Inbound adapter for `inventory.events`: on `stock.reservation_failed`, dispatches
 * {@link CancelOrderCommand}. Business refusals are logged and skipped; unexpected errors
 * (e.g. a concurrency conflict) are retried, then parked in the dead-letter topic.
 */
@Injectable()
export class InventoryEventsConsumer extends KafkaConsumerService {
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
        topic: INVENTORY_EVENTS_TOPIC,
        numPartitions: INVENTORY_EVENTS_PARTITIONS,
        groupId: CONSUMER_GROUP_ID,
      },
    });
  }

  /**
   * @param envelope - Decoded inventory event.
   * @param context - Event id and saga correlation id.
   */
  protected async handleEnvelope(
    envelope: IntegrationEventEnvelope<Record<string, unknown>>,
    context: IntegrationEventContext,
  ): Promise<void> {
    if (envelope.eventType !== INVENTORY_EVENT_TYPES.RESERVATION_FAILED) {
      return;
    }
    const result: Result<void, DomainError> = await this.commandBus.execute(
      new CancelOrderCommand({
        orderId: String(envelope.payload['orderId']),
        reason: String(envelope.payload['reason']),
      }),
    );
    if (result.isFailure) {
      this.logger.warn(
        `Skipping event ${context.eventId} (correlation ${context.correlationId}): ${result.getError().message}`,
      );
    }
  }
}
