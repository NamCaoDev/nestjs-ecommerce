import { Injectable } from '@nestjs/common';
import {
  INVENTORY_EVENTS_PARTITIONS,
  INVENTORY_EVENTS_TOPIC,
  IntegrationEventEnvelope,
} from '@org/contracts';
import { KafkaProducerService } from '@org/shared-messaging';
import { InventoryEventPublisherPort } from '../../application/ports/inventory-event-publisher.port';

/**
 * Kafka implementation of {@link InventoryEventPublisherPort} on {@link INVENTORY_EVENTS_TOPIC},
 * keyed by aggregate id, through the shared {@link KafkaProducerService} (idempotent, `acks=all`, Snappy).
 */
@Injectable()
export class KafkaInventoryEventPublisher implements InventoryEventPublisherPort {
  /**
   * @param producer - Shared Kafka producer.
   */
  public constructor(private readonly producer: KafkaProducerService) {}

  /**
   * @param event - Envelope to publish, keyed by its aggregate id.
   */
  public async publish(event: IntegrationEventEnvelope<object>): Promise<void> {
    await this.producer.send({
      topic: INVENTORY_EVENTS_TOPIC,
      numPartitions: INVENTORY_EVENTS_PARTITIONS,
      messages: [
        {
          key: event.aggregateId,
          value: JSON.stringify(event),
          headers: {
            'event-type': event.eventType,
            'event-id': event.eventId,
            'x-correlation-id': event.aggregateId,
          },
        },
      ],
    });
  }
}
