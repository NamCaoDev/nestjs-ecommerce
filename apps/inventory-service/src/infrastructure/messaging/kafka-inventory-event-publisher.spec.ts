import { IntegrationEventEnvelope } from '@org/contracts';
import { KafkaProducerService } from '@org/shared-messaging';
import { KafkaInventoryEventPublisher } from './kafka-inventory-event-publisher';

const INPUT_EVENT: IntegrationEventEnvelope<object> = {
  eventId: 'e1',
  eventType: 'stock.reservation_failed',
  aggregateId: '0199a7c0-0000-7000-8000-000000000001',
  occurredAt: 1_792_843_000_000,
  payload: { orderId: '0199a7c0-0000-7000-8000-000000000001' },
};

describe('KafkaInventoryEventPublisher', () => {
  describe('publish', () => {
    it('should send the envelope to inventory.events keyed by order', async () => {
      // Arrange
      const mockProducer: { readonly send: jest.Mock } = {
        send: jest.fn().mockResolvedValue(undefined),
      };
      const publisher: KafkaInventoryEventPublisher =
        new KafkaInventoryEventPublisher(
          mockProducer as unknown as KafkaProducerService,
        );
      // Act
      await publisher.publish(INPUT_EVENT);
      // Assert
      const actualInput: {
        topic: string;
        numPartitions: number;
        messages: { key: string; value: string; headers: object }[];
      } = mockProducer.send.mock.calls[0][0];
      expect(actualInput.topic).toBe('inventory.events');
      expect(actualInput.numPartitions).toBe(3);
      expect(actualInput.messages[0].key).toBe(INPUT_EVENT.aggregateId);
      expect(JSON.parse(actualInput.messages[0].value)).toEqual(INPUT_EVENT);
      expect(actualInput.messages[0].headers).toEqual({
        'event-type': 'stock.reservation_failed',
        'event-id': 'e1',
        'x-correlation-id': INPUT_EVENT.aggregateId,
      });
    });
  });
});
