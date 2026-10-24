import { Injectable } from '@nestjs/common';
import {
  IntegrationEventEnvelope,
  ORDERS_EVENTS_PARTITIONS,
  ORDERS_EVENTS_TOPIC,
} from '@org/contracts';
import { KafkaProducerService } from '@org/shared-messaging';
import type { Message } from 'kafkajs';
import { EventPublisherPort } from '../../application/ports/event-publisher.port';
import { OutboxMessage } from '../../application/ports/outbox-message.type';

/**
 * Kafka implementation of {@link EventPublisherPort}: maps outbox messages to integration-event
 * envelopes on {@link ORDERS_EVENTS_TOPIC}, keyed by `orderId`, through the shared
 * {@link KafkaProducerService} (idempotent, `acks=all`, Snappy).
 */
@Injectable()
export class KafkaEventPublisher implements EventPublisherPort {
  /**
   * @param producer - Shared Kafka producer.
   */
  public constructor(private readonly producer: KafkaProducerService) {}

  /**
   * @param messages - Outbox messages, published in order under their aggregate id.
   */
  public async publish(messages: readonly OutboxMessage[]): Promise<void> {
    await this.producer.send({
      topic: ORDERS_EVENTS_TOPIC,
      numPartitions: ORDERS_EVENTS_PARTITIONS,
      messages: messages.map(KafkaEventPublisher.toKafkaMessage),
    });
  }

  /**
   * @returns The Kafka message: key `orderId`, value the event envelope; type, id and saga
   *   correlation id (`orderId`) in the headers.
   */
  private static toKafkaMessage(message: OutboxMessage): Message {
    const envelope: IntegrationEventEnvelope<Record<string, unknown>> = {
      eventId: message.id,
      eventType: message.eventType,
      aggregateId: message.aggregateId,
      occurredAt: message.occurredAt,
      payload: message.payload,
    };
    return {
      key: message.aggregateId,
      value: JSON.stringify(envelope),
      headers: {
        'event-type': message.eventType,
        'event-id': message.id,
        'x-correlation-id': message.aggregateId,
      },
    };
  }
}
