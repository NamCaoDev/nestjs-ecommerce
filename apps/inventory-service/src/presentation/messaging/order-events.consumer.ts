import { Inject, Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  IntegrationEventEnvelope,
  ORDER_EVENT_TYPES,
  ORDERS_EVENTS_PARTITIONS,
  ORDERS_EVENTS_TOPIC,
} from '@org/contracts';
import { DomainError, Result } from '@org/shared-domain';
import {
  KAFKA_CLIENT,
  KafkaConsumerService,
  KafkaTopicManager,
} from '@org/shared-messaging';
import type { Kafka } from 'kafkajs';
import { CommitStockCommand } from '../../application/commands/commit-stock/commit-stock.command';
import { ReservationLine } from '../../domain/value-objects/reservation-line.type';

/** Consumer group shared by every inventory instance; Kafka assigns each partition to one of them. */
const CONSUMER_GROUP_ID = 'inventory-consumer-group';

/**
 * Inbound adapter for `orders.events`: on `order.placed`, dispatches {@link CommitStockCommand}
 * with the ordered lines (used when the reservation has expired). Business refusals are logged and
 * skipped; unexpected errors propagate so Kafka redelivers the message (the commit is idempotent).
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
   * @param envelope - Decoded order event.
   */
  protected async handleEnvelope(
    envelope: IntegrationEventEnvelope<Record<string, unknown>>,
  ): Promise<void> {
    if (envelope.eventType !== ORDER_EVENT_TYPES.PLACED) {
      return;
    }
    const result: Result<void, DomainError> = await this.commandBus.execute(
      new CommitStockCommand({
        orderId: String(envelope.payload['orderId']),
        items: OrderEventsConsumer.toReservationLines(
          envelope.payload['items'],
        ),
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
   * passed through as is and rejected by the domain validation of the command.
   */
  private static toReservationLines(items: unknown): ReservationLine[] {
    if (!Array.isArray(items)) {
      return [];
    }
    return items.map(
      (item: {
        readonly skuId?: unknown;
        readonly quantity?: unknown;
      }): ReservationLine => ({
        skuId: String(item?.skuId),
        quantity: Number(item?.quantity),
      }),
    );
  }
}
