import { Injectable } from '@nestjs/common';
import {
  IntegrationEventEnvelope,
  PAYMENTS_EVENTS_PARTITIONS,
  PAYMENTS_EVENTS_TOPIC,
} from '@org/contracts';
import { KafkaProducerService } from '@org/shared-messaging';
import type { Message } from 'kafkajs';
import { EventPublisherPort } from '../../application/ports/event-publisher.port';
import { OutboxMessage } from '../../application/ports/outbox-message.type';

/**
 * Kafka implementation of {@link EventPublisherPort}: maps outbox messages to integration-event
 * envelopes on {@link PAYMENTS_EVENTS_TOPIC} through the shared {@link KafkaProducerService}
 * (idempotent, `acks=all`, Snappy). Messages are keyed by `orderId`, like every saga topic, so the
 * events of one order stay ordered on one partition.
 */
@Injectable()
export class KafkaEventPublisher implements EventPublisherPort {
  /**
   * @param producer - Shared Kafka producer.
   */
  public constructor(private readonly producer: KafkaProducerService) {}

  /**
   * @param messages - Outbox messages, published in order.
   */
  public async publish(messages: readonly OutboxMessage[]): Promise<void> {
    await this.producer.send({
      topic: PAYMENTS_EVENTS_TOPIC,
      numPartitions: PAYMENTS_EVENTS_PARTITIONS,
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
      key: String(message.payload['orderId']),
      value: JSON.stringify(envelope),
      headers: {
        'event-type': message.eventType,
        'event-id': message.id,
        'x-correlation-id': String(message.payload['orderId']),
      },
    };
  }
}
